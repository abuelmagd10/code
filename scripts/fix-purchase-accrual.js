#!/usr/bin/env node

/**
 * إصلاح قيود الشراء - تحويل إلى Accrual Basis
 * Fix Purchase Entries - Convert to Accrual Basis
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// قراءة متغيرات البيئة
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=')
  if (key && valueParts.length) {
    envVars[key.trim()] = valueParts.join('=').trim()
  }
})

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
)

const log = (msg, color = 'white') => {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m'
  }
  console.log(`${colors[color]}${msg}${colors.reset}`)
}

async function fixCompanyPurchases(companyId, companyName) {
  log(`\n${'─'.repeat(80)}`, 'cyan')
  log(`🏢 الشركة: ${companyName}`, 'cyan')
  log('─'.repeat(80), 'cyan')

  // 1. جلب جميع فواتير الشراء (received أو paid)
  const { data: bills } = await supabase
    .from('bills')
    .select('id, bill_number, bill_date, status, total_amount, due_date')
    .eq('company_id', companyId)
    .in('status', ['received', 'paid'])
    .order('bill_date', { ascending: true })

  log(`\n📊 إجمالي فواتير الشراء (received/paid): ${bills?.length || 0}`, 'cyan')

  if (!bills || bills.length === 0) {
    log('   ⚠️  لا توجد فواتير شراء مدفوعة', 'yellow')
    return
  }

  // 2. التحقق من الفواتير التي ليس لها قيد bill
  const billsNeedingEntry = []

  for (const bill of bills) {
    const { data: billEntries } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('company_id', companyId)
      .eq('reference_type', 'bill')
      .eq('reference_id', bill.id)
      .eq('is_deleted', false)

    if (!billEntries || billEntries.length === 0) {
      billsNeedingEntry.push(bill)
    }
  }

  log(`\n1️⃣  فواتير تحتاج قيد محاسبي: ${billsNeedingEntry.length}`, 'yellow')

  if (billsNeedingEntry.length === 0) {
    log('   ✅ جميع الفواتير لديها قيود محاسبية', 'green')
    return
  }

  // 3. جلب الحسابات المطلوبة
  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_name')
    .eq('company_id', companyId)
    .eq('sub_type', 'inventory')
    .eq('is_active', true)
    .limit(1)
    .single()

  const { data: apAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_name')
    .eq('company_id', companyId)
    .eq('sub_type', 'accounts_payable')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!inventoryAccount || !apAccount) {
    log('   ❌ الحسابات المطلوبة غير موجودة', 'red')
    return
  }

  log(`\n2️⃣  إنشاء القيود المحاسبية...`, 'yellow')

  let created = 0

  for (const bill of billsNeedingEntry) {
    // جلب تفاصيل الفاتورة
    const { data: billLines } = await supabase
      .from('bill_lines')
      .select('product_id, quantity, unit_price, total_price')
      .eq('bill_id', bill.id)

    if (!billLines || billLines.length === 0) continue

    const totalAmount = billLines.reduce((sum, line) => sum + Number(line.total_price || 0), 0)

    // إنشاء قيد محاسبي
    const { data: journalEntry, error: jeError } = await supabase
      .from('journal_entries')
      .insert({
        company_id: companyId,
        entry_date: bill.bill_date,
        reference_type: 'bill',
        reference_id: bill.id,
        description: `فاتورة شراء ${bill.bill_number}`,
        is_deleted: false
      })
      .select()
      .single()

    if (jeError) {
      log(`   ❌ خطأ في إنشاء قيد للفاتورة ${bill.bill_number}: ${jeError.message}`, 'red')
      continue
    }

    // إنشاء سطور القيد
    const lines = [
      {
        journal_entry_id: journalEntry.id,
        account_id: inventoryAccount.id,
        debit_amount: totalAmount,
        credit_amount: 0,
        description: 'إضافة إلى المخزون'
      },
      {
        journal_entry_id: journalEntry.id,
        account_id: apAccount.id,
        debit_amount: 0,
        credit_amount: totalAmount,
        description: 'ذمم دائنة'
      }
    ]

    const { error: linesError } = await supabase
      .from('journal_entry_lines')
      .insert(lines)

    if (linesError) {
      log(`   ❌ خطأ في إنشاء سطور القيد للفاتورة ${bill.bill_number}: ${linesError.message}`, 'red')
      // حذف القيد
      await supabase.from('journal_entries').delete().eq('id', journalEntry.id)
      continue
    }

    log(`   ✓ تم إنشاء قيد للفاتورة ${bill.bill_number} (${totalAmount.toFixed(2)})`, 'green')
    created++
  }

  log(`\n✅ تم إنشاء ${created} قيد محاسبي`, 'green')

  return created
}

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('🔄 إصلاح قيود الشراء - Accrual Basis', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  const companyName = process.argv[2]

  if (!companyName) {
    log('❌ يرجى تحديد اسم الشركة', 'red')
    log('مثال: node scripts/fix-purchase-accrual.js VitaSlims', 'yellow')
    process.exit(1)
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .ilike('name', `%${companyName}%`)
    .limit(1)
    .single()

  if (!company) {
    log(`❌ لم يتم العثور على الشركة: ${companyName}`, 'red')
    process.exit(1)
  }

  const created = await fixCompanyPurchases(company.id, company.name)

  log('\n' + '='.repeat(80), 'cyan')
  log(`✅ تم إصلاح ${created || 0} قيد شراء`, 'green')
  log('='.repeat(80) + '\n', 'cyan')
}

main()

