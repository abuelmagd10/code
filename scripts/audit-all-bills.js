#!/usr/bin/env node

/**
 * مراجعة شاملة لجميع فواتير الشراء
 * Comprehensive Audit of All Bills
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

async function auditCompany(companyName) {
  log(`\n${'='.repeat(80)}`, 'cyan')
  log(`🏢 الشركة: ${companyName}`, 'cyan')
  log('='.repeat(80), 'cyan')

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .ilike('name', `%${companyName}%`)
    .single()

  if (!company) {
    log('❌ الشركة غير موجودة', 'red')
    return
  }

  // 1. جلب جميع فواتير الشراء
  const { data: bills } = await supabase
    .from('bills')
    .select('id, bill_number, bill_date, status, total_amount')
    .eq('company_id', company.id)
    .order('bill_date', { ascending: true })

  log(`\n📊 عدد فواتير الشراء: ${bills?.length || 0}\n`, 'yellow')

  if (!bills || bills.length === 0) {
    log('✅ لا توجد فواتير شراء', 'green')
    return
  }

  // 2. جلب حساب المخزون الصحيح
  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .eq('sub_type', 'inventory')
    .single()

  if (!inventoryAccount) {
    log('❌ حساب المخزون غير موجود', 'red')
    return
  }

  log(`✅ حساب المخزون الصحيح: ${inventoryAccount.account_code} - ${inventoryAccount.account_name}\n`, 'green')

  // 3. فحص كل فاتورة
  let totalBillAmount = 0
  let totalJournalOnInventory = 0
  let totalJournalOnOtherAccounts = 0
  let billsWithoutJournal = 0
  let billsWithWrongAccount = 0

  const wrongAccountBills = []

  for (const bill of bills) {
    totalBillAmount += Number(bill.total_amount || 0)

    // جلب القيد المحاسبي
    const { data: journalEntry } = await supabase
      .from('journal_entries')
      .select(`
        id,
        journal_entry_lines!inner(
          debit_amount,
          credit_amount,
          account_id,
          chart_of_accounts!inner(account_code, account_name, sub_type)
        )
      `)
      .eq('company_id', company.id)
      .eq('reference_type', 'bill')
      .eq('reference_id', bill.id)
      .eq('is_deleted', false)
      .single()

    if (!journalEntry) {
      billsWithoutJournal++
      log(`❌ ${bill.bill_number} - لا يوجد قيد محاسبي`, 'red')
      continue
    }

    // فحص الحسابات المستخدمة
    let hasInventoryAccount = false
    let hasOtherAccount = false
    let debitAmount = 0

    for (const line of journalEntry.journal_entry_lines) {
      if (Number(line.debit_amount || 0) > 0) {
        debitAmount = Number(line.debit_amount || 0)
        
        if (line.account_id === inventoryAccount.id) {
          hasInventoryAccount = true
          totalJournalOnInventory += debitAmount
        } else {
          hasOtherAccount = true
          totalJournalOnOtherAccounts += debitAmount
          wrongAccountBills.push({
            bill,
            account: line.chart_of_accounts,
            amount: debitAmount
          })
        }
      }
    }

    if (hasOtherAccount && !hasInventoryAccount) {
      billsWithWrongAccount++
      log(`⚠️  ${bill.bill_number} - يستخدم حساب خاطئ: ${wrongAccountBills[wrongAccountBills.length - 1].account.account_code} - ${wrongAccountBills[wrongAccountBills.length - 1].account.account_name}`, 'yellow')
    } else if (hasInventoryAccount) {
      log(`✅ ${bill.bill_number} - ${bill.total_amount.toFixed(2)} جنيه`, 'green')
    }
  }

  // 4. الملخص
  log(`\n${'─'.repeat(80)}`, 'white')
  log('📊 الملخص:', 'cyan')
  log(`   إجمالي قيمة الفواتير: ${totalBillAmount.toFixed(2)} جنيه`, 'white')
  log(`   قيود على حساب المخزون الصحيح: ${totalJournalOnInventory.toFixed(2)} جنيه`, 'green')
  log(`   قيود على حسابات أخرى: ${totalJournalOnOtherAccounts.toFixed(2)} جنيه`, totalJournalOnOtherAccounts > 0 ? 'red' : 'green')
  log(`   فواتير بدون قيود: ${billsWithoutJournal}`, billsWithoutJournal > 0 ? 'red' : 'green')
  log(`   فواتير بحسابات خاطئة: ${billsWithWrongAccount}`, billsWithWrongAccount > 0 ? 'red' : 'green')

  if (wrongAccountBills.length > 0) {
    log(`\n⚠️  الفواتير التي تحتاج تصحيح:`, 'yellow')
    for (const item of wrongAccountBills) {
      log(`   ${item.bill.bill_number} - ${item.amount.toFixed(2)} جنيه`, 'white')
      log(`   الحساب الحالي: ${item.account.account_code} - ${item.account.account_name}`, 'red')
      log(`   الحساب الصحيح: ${inventoryAccount.account_code} - ${inventoryAccount.account_name}`, 'green')
    }
  }

  return {
    companyName: company.name,
    totalBills: bills.length,
    totalBillAmount,
    totalJournalOnInventory,
    totalJournalOnOtherAccounts,
    billsWithWrongAccount,
    wrongAccountBills,
    inventoryAccount
  }
}

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('🔍 مراجعة شاملة لجميع فواتير الشراء', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  const companyNames = process.argv.slice(2)
  
  if (companyNames.length === 0) {
    companyNames.push('VitaSlims', 'FOODCAN')
  }

  const results = []

  for (const companyName of companyNames) {
    const result = await auditCompany(companyName)
    if (result) results.push(result)
  }

  // ملخص نهائي
  log('\n' + '='.repeat(80), 'cyan')
  log('📊 الملخص النهائي', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  for (const result of results) {
    log(`🏢 ${result.companyName}:`, 'cyan')
    log(`   عدد الفواتير: ${result.totalBills}`, 'white')
    log(`   إجمالي المبلغ: ${result.totalBillAmount.toFixed(2)}`, 'white')
    log(`   على حساب المخزون: ${result.totalJournalOnInventory.toFixed(2)}`, 'green')
    log(`   على حسابات أخرى: ${result.totalJournalOnOtherAccounts.toFixed(2)}`, result.totalJournalOnOtherAccounts > 0 ? 'red' : 'green')
    log(`   فواتير تحتاج تصحيح: ${result.billsWithWrongAccount}`, result.billsWithWrongAccount > 0 ? 'red' : 'green')
    log('', 'white')
  }
}

main()

