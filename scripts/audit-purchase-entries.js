#!/usr/bin/env node

/**
 * مراجعة قيود الشراء
 * Audit Purchase Journal Entries
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

async function auditCompanyPurchases(companyId, companyName) {
  log(`\n${'─'.repeat(80)}`, 'cyan')
  log(`🏢 الشركة: ${companyName}`, 'cyan')
  log('─'.repeat(80), 'cyan')

  // 1. جلب جميع فواتير الشراء
  const { data: bills } = await supabase
    .from('bills')
    .select('id, bill_number, bill_date, status, total_amount')
    .eq('company_id', companyId)
    .neq('status', 'draft')
    .neq('status', 'cancelled')
    .order('bill_date', { ascending: true })

  log(`\n📊 إجمالي فواتير الشراء: ${bills?.length || 0}`, 'cyan')

  if (!bills || bills.length === 0) {
    log('   ⚠️  لا توجد فواتير شراء', 'yellow')
    return
  }

  // 2. التحقق من القيود المحاسبية
  let billsWithEntries = 0
  let billsWithoutEntries = 0
  let totalWithEntries = 0
  let totalWithoutEntries = 0
  const missingBills = []

  log('\n1️⃣  التحقق من القيود المحاسبية للمشتريات...', 'yellow')

  for (const bill of bills) {
    // البحث عن قيد محاسبي للفاتورة نفسها
    const { data: billEntries } = await supabase
      .from('journal_entries')
      .select('id, entry_date, description')
      .eq('company_id', companyId)
      .eq('reference_type', 'bill')
      .eq('reference_id', bill.id)
      .eq('is_deleted', false)

    // البحث عن قيد محاسبي للدفع
    const { data: paymentEntries } = await supabase
      .from('journal_entries')
      .select('id, entry_date, description')
      .eq('company_id', companyId)
      .eq('reference_type', 'payment')
      .eq('reference_id', bill.id)
      .eq('is_deleted', false)

    const hasEntry = (billEntries && billEntries.length > 0) || (paymentEntries && paymentEntries.length > 0)

    if (hasEntry) {
      billsWithEntries++
      totalWithEntries += Number(bill.total_amount || 0)
    } else {
      billsWithoutEntries++
      totalWithoutEntries += Number(bill.total_amount || 0)
      missingBills.push(bill)
    }
  }

  log(`   ✅ فواتير لديها قيود: ${billsWithEntries} (${totalWithEntries.toFixed(2)} جنيه)`, 'green')
  log(`   ❌ فواتير بدون قيود: ${billsWithoutEntries} (${totalWithoutEntries.toFixed(2)} جنيه)`, 'red')

  // 3. عرض الفواتير المفقودة
  if (missingBills.length > 0) {
    log('\n2️⃣  فواتير الشراء بدون قيود محاسبية:', 'yellow')
    log('   ' + '─'.repeat(76), 'white')
    log('   | رقم الفاتورة | التاريخ | الحالة | المبلغ |', 'white')
    log('   ' + '─'.repeat(76), 'white')
    
    for (const bill of missingBills) {
      const billNum = (bill.bill_number || 'N/A').padEnd(15)
      const date = (bill.bill_date || 'N/A').padEnd(12)
      const status = (bill.status || 'N/A').padEnd(10)
      const amount = Number(bill.total_amount || 0).toFixed(2).padStart(12)
      log(`   | ${billNum} | ${date} | ${status} | ${amount} |`, 'white')
    }
    log('   ' + '─'.repeat(76), 'white')
  }

  // 4. التحقق من حركات المخزون
  log('\n3️⃣  التحقق من حركات المخزون للمشتريات...', 'yellow')

  const { data: purchaseTransactions } = await supabase
    .from('inventory_transactions')
    .select('id, transaction_type, quantity_change, reference_id')
    .eq('company_id', companyId)
    .eq('transaction_type', 'purchase')

  log(`   📦 إجمالي حركات الشراء: ${purchaseTransactions?.length || 0}`, 'cyan')

  // 5. حساب قيمة المخزون من FIFO
  log('\n4️⃣  حساب قيمة المخزون من دفعات FIFO...', 'yellow')

  const { data: fifoLots } = await supabase
    .from('fifo_cost_lots')
    .select('remaining_quantity, unit_cost')
    .eq('company_id', companyId)
    .gt('remaining_quantity', 0)

  let calculatedInventoryValue = 0
  for (const lot of fifoLots || []) {
    calculatedInventoryValue += Number(lot.remaining_quantity || 0) * Number(lot.unit_cost || 0)
  }

  log(`   💰 قيمة المخزون المحسوبة: ${calculatedInventoryValue.toFixed(2)} جنيه`, 'cyan')

  // 6. حساب رصيد المخزون المحاسبي
  log('\n5️⃣  حساب رصيد المخزون المحاسبي...', 'yellow')

  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_name')
    .eq('company_id', companyId)
    .eq('sub_type', 'inventory')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!inventoryAccount) {
    log('   ⚠️  حساب المخزون غير موجود', 'yellow')
  } else {
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount, credit_amount, journal_entries!inner(is_deleted)')
      .eq('account_id', inventoryAccount.id)

    let accountingBalance = 0
    for (const line of lines || []) {
      if (line.journal_entries?.is_deleted) continue
      accountingBalance += Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
    }

    log(`   💰 رصيد المخزون المحاسبي: ${accountingBalance.toFixed(2)} جنيه`, 'cyan')

    const difference = accountingBalance - calculatedInventoryValue
    if (Math.abs(difference) > 0.01) {
      log(`   ⚠️  الفرق: ${difference.toFixed(2)} جنيه`, 'red')
      log(`   📌 السبب المحتمل: قيود شراء ناقصة بقيمة ${Math.abs(difference).toFixed(2)} جنيه`, 'yellow')
    } else {
      log(`   ✅ الرصيد متطابق!`, 'green')
    }
  }

  // الملخص
  log('\n📊 ملخص المراجعة:', 'cyan')
  log(`   • إجمالي فواتير الشراء: ${bills.length}`, 'white')
  log(`   • فواتير لديها قيود: ${billsWithEntries}`, 'white')
  log(`   • فواتير بدون قيود: ${billsWithoutEntries}`, 'white')
  log(`   • قيمة الفواتير المفقودة: ${totalWithoutEntries.toFixed(2)} جنيه`, 'white')
  log(`   • قيمة المخزون المحسوبة: ${calculatedInventoryValue.toFixed(2)} جنيه`, 'white')

  return {
    totalBills: bills.length,
    billsWithEntries,
    billsWithoutEntries,
    totalWithoutEntries,
    missingBills,
    calculatedInventoryValue
  }
}

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('🔍 مراجعة قيود الشراء - Purchase Entries Audit', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  const companyName = process.argv[2]

  if (!companyName) {
    log('❌ يرجى تحديد اسم الشركة', 'red')
    log('مثال: node scripts/audit-purchase-entries.js VitaSlims', 'yellow')
    log('أو: node scripts/audit-purchase-entries.js FOODCAN', 'yellow')
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

  await auditCompanyPurchases(company.id, company.name)

  log('\n' + '='.repeat(80), 'cyan')
  log('✅ اكتملت المراجعة', 'green')
  log('='.repeat(80) + '\n', 'cyan')
}

main()

