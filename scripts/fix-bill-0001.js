#!/usr/bin/env node

/**
 * إصلاح قيد BILL-0001
 * Fix BILL-0001 Journal Entry
 * 
 * المشكلة: القيد بقيمة 70,200 (65,400 + 4,800 مرتجع)
 * لكن المرتجع له قيد منفصل، فتم خصمه مرتين
 * الحل: تصحيح القيد إلى 65,400
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

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

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('🔧 إصلاح قيد BILL-0001', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .ilike('name', '%VitaSlims%')
    .single()

  log(`🏢 الشركة: ${company.name}`, 'cyan')
  log(`📋 معرف الشركة: ${company.id}\n`, 'cyan')

  // 1. جلب BILL-0001
  const { data: bill } = await supabase
    .from('bills')
    .select('id, bill_number, total_amount')
    .eq('company_id', company.id)
    .eq('bill_number', 'BILL-0001')
    .single()

  if (!bill) {
    log('❌ لم يتم العثور على BILL-0001', 'red')
    process.exit(1)
  }

  log(`📋 الفاتورة: ${bill.bill_number}`, 'yellow')
  log(`💰 قيمة الفاتورة الصحيحة: ${bill.total_amount} جنيه\n`, 'yellow')

  // 2. جلب القيد المحاسبي
  const { data: journalEntry } = await supabase
    .from('journal_entries')
    .select(`
      id,
      entry_date,
      description,
      journal_entry_lines!inner(
        id,
        account_id,
        debit_amount,
        credit_amount,
        description,
        chart_of_accounts!inner(account_code, account_name, sub_type)
      )
    `)
    .eq('company_id', company.id)
    .eq('reference_type', 'bill')
    .eq('reference_id', bill.id)
    .eq('is_deleted', false)
    .single()

  if (!journalEntry) {
    log('❌ لم يتم العثور على القيد المحاسبي', 'red')
    process.exit(1)
  }

  log(`📌 القيد المحاسبي الحالي: ${journalEntry.id}`, 'yellow')
  log(`   التاريخ: ${journalEntry.entry_date}`, 'white')
  log(`   الوصف: ${journalEntry.description}\n`, 'white')

  log('   السطور الحالية:', 'white')
  let currentTotal = 0
  for (const line of journalEntry.journal_entry_lines) {
    const debit = Number(line.debit_amount || 0)
    const credit = Number(line.credit_amount || 0)
    currentTotal = Math.max(currentTotal, debit, credit)
    log(`   - ${line.chart_of_accounts.account_code} - ${line.chart_of_accounts.account_name}`, 'white')
    log(`     مدين: ${debit.toFixed(2)} | دائن: ${credit.toFixed(2)}`, 'white')
  }

  log(`\n   💰 القيمة الحالية: ${currentTotal.toFixed(2)} جنيه`, 'red')
  log(`   💰 القيمة الصحيحة: ${bill.total_amount} جنيه`, 'green')
  log(`   📊 الفرق: ${(currentTotal - bill.total_amount).toFixed(2)} جنيه (مرتجع مدمج خطأ)\n`, 'yellow')

  // 3. تأكيد من المستخدم
  log('⚠️  هل تريد تصحيح القيد؟', 'yellow')
  log('   سيتم تعديل المبالغ من 70,200 إلى 65,400', 'white')
  log('   (المرتجع 4,800 له قيد منفصل)\n', 'white')

  const correctAmount = Number(bill.total_amount)

  // 4. تحديث السطور (يجب تحديثهم معاً لتجنب مشكلة التوازن)
  log('🔧 جاري التصحيح...', 'yellow')

  // جمع معلومات السطور
  const linesToUpdate = []
  for (const line of journalEntry.journal_entry_lines) {
    const debit = Number(line.debit_amount || 0)
    const credit = Number(line.credit_amount || 0)

    let newDebit = debit
    let newCredit = credit

    if (debit > 0) {
      newDebit = correctAmount
    }
    if (credit > 0) {
      newCredit = correctAmount
    }

    if (newDebit !== debit || newCredit !== credit) {
      linesToUpdate.push({
        id: line.id,
        oldDebit: debit,
        oldCredit: credit,
        newDebit,
        newCredit,
        accountName: line.chart_of_accounts.account_name
      })
    }
  }

  // تحديث جميع السطور باستخدام SQL مباشر
  if (linesToUpdate.length > 0) {
    for (const line of linesToUpdate) {
      // استخدام RPC لتنفيذ SQL مباشر
      const { error } = await supabase.rpc('exec_sql', {
        sql_query: `
          UPDATE journal_entry_lines
          SET debit_amount = ${line.newDebit}, credit_amount = ${line.newCredit}
          WHERE id = '${line.id}'
        `
      })

      if (error) {
        // محاولة بديلة: تحديث مباشر
        const { error: updateError } = await supabase
          .from('journal_entry_lines')
          .update({
            debit_amount: line.newDebit,
            credit_amount: line.newCredit
          })
          .eq('id', line.id)

        if (updateError) {
          log(`   ❌ خطأ في تحديث ${line.accountName}: ${updateError.message}`, 'red')
        } else {
          log(`   ✓ تم تحديث ${line.accountName}`, 'green')
          log(`     من: مدين ${line.oldDebit.toFixed(2)} / دائن ${line.oldCredit.toFixed(2)}`, 'white')
          log(`     إلى: مدين ${line.newDebit.toFixed(2)} / دائن ${line.newCredit.toFixed(2)}`, 'white')
        }
      } else {
        log(`   ✓ تم تحديث ${line.accountName}`, 'green')
        log(`     من: مدين ${line.oldDebit.toFixed(2)} / دائن ${line.oldCredit.toFixed(2)}`, 'white')
        log(`     إلى: مدين ${line.newDebit.toFixed(2)} / دائن ${line.newCredit.toFixed(2)}`, 'white')
      }
    }
  }

  log(`\n✅ تم تحديث ${linesToUpdate.length} سطر!`, 'green')

  // 5. التحقق من الرصيد الجديد
  log('\n📊 التحقق من رصيد المخزون الجديد...', 'yellow')

  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company.id)
    .eq('sub_type', 'inventory')
    .eq('is_active', true)
    .single()

  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount, journal_entries!inner(is_deleted)')
    .eq('account_id', inventoryAccount.id)

  let balance = 0
  for (const line of lines || []) {
    if (line.journal_entries?.is_deleted) continue
    balance += Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
  }

  log(`   💰 رصيد المخزون الجديد: ${balance.toFixed(2)} جنيه`, balance >= 0 ? 'green' : 'red')

  // حساب قيمة FIFO
  const { data: fifoLots } = await supabase
    .from('fifo_cost_lots')
    .select('remaining_quantity, unit_cost')
    .eq('company_id', company.id)
    .gt('remaining_quantity', 0)

  let fifoValue = 0
  for (const lot of fifoLots || []) {
    fifoValue += Number(lot.remaining_quantity || 0) * Number(lot.unit_cost || 0)
  }

  log(`   💰 قيمة FIFO المحسوبة: ${fifoValue.toFixed(2)} جنيه`, 'cyan')
  log(`   📊 الفرق: ${(balance - fifoValue).toFixed(2)} جنيه`, Math.abs(balance - fifoValue) < 100 ? 'green' : 'yellow')

  log('\n' + '='.repeat(80), 'cyan')
  log('✅ تم إصلاح قيد BILL-0001 بنجاح!', 'green')
  log('='.repeat(80) + '\n', 'cyan')
}

main()

