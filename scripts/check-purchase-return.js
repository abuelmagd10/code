#!/usr/bin/env node

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

async function main() {
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .ilike('name', '%VitaSlims%')
    .single()

  console.log('\n🔍 فحص مرتجعات الشراء - Purchase Returns\n')

  // 1. فحص قيود مرتجعات الشراء
  const { data: returnEntries } = await supabase
    .from('journal_entries')
    .select(`
      id,
      entry_date,
      reference_type,
      reference_id,
      description,
      journal_entry_lines!inner(
        account_id,
        debit_amount,
        credit_amount,
        description
      )
    `)
    .eq('company_id', company.id)
    .eq('reference_type', 'purchase_return')
    .eq('is_deleted', false)

  console.log(`📊 إجمالي قيود مرتجعات الشراء: ${returnEntries?.length || 0}\n`)

  if (returnEntries && returnEntries.length > 0) {
    for (const entry of returnEntries) {
      console.log(`\n📌 قيد مرتجع: ${entry.id}`)
      console.log(`   التاريخ: ${entry.entry_date}`)
      console.log(`   الوصف: ${entry.description}`)
      console.log(`   Reference ID: ${entry.reference_id}`)
      console.log(`\n   السطور:`)
      
      for (const line of entry.journal_entry_lines) {
        const debit = Number(line.debit_amount || 0)
        const credit = Number(line.credit_amount || 0)
        console.log(`   - Account: ${line.account_id}`)
        console.log(`     مدين: ${debit.toFixed(2)} | دائن: ${credit.toFixed(2)}`)
        console.log(`     الوصف: ${line.description}`)
      }
    }
  }

  // 2. فحص BILL-0001 بالتفصيل
  console.log('\n\n🔍 فحص BILL-0001 بالتفصيل:\n')

  const { data: bill1 } = await supabase
    .from('bills')
    .select('id, bill_number, total_amount')
    .eq('company_id', company.id)
    .eq('bill_number', 'BILL-0001')
    .single()

  if (bill1) {
    console.log(`📋 الفاتورة: ${bill1.bill_number}`)
    console.log(`💰 المبلغ: ${bill1.total_amount}\n`)

    // جلب القيد المحاسبي
    const { data: billEntry } = await supabase
      .from('journal_entries')
      .select(`
        id,
        entry_date,
        description,
        journal_entry_lines!inner(
          account_id,
          debit_amount,
          credit_amount,
          description,
          chart_of_accounts!inner(account_code, account_name)
        )
      `)
      .eq('company_id', company.id)
      .eq('reference_type', 'bill')
      .eq('reference_id', bill1.id)
      .eq('is_deleted', false)
      .single()

    if (billEntry) {
      console.log(`📌 القيد المحاسبي: ${billEntry.id}`)
      console.log(`   التاريخ: ${billEntry.entry_date}`)
      console.log(`   الوصف: ${billEntry.description}\n`)
      console.log(`   السطور:`)

      let totalDebit = 0
      let totalCredit = 0

      for (const line of billEntry.journal_entry_lines) {
        const debit = Number(line.debit_amount || 0)
        const credit = Number(line.credit_amount || 0)
        totalDebit += debit
        totalCredit += credit

        console.log(`   - ${line.chart_of_accounts.account_code} - ${line.chart_of_accounts.account_name}`)
        console.log(`     مدين: ${debit.toFixed(2)} | دائن: ${credit.toFixed(2)}`)
        console.log(`     الوصف: ${line.description}`)
      }

      console.log(`\n   إجمالي المدين: ${totalDebit.toFixed(2)}`)
      console.log(`   إجمالي الدائن: ${totalCredit.toFixed(2)}`)
      console.log(`   الفرق: ${(totalDebit - totalCredit).toFixed(2)}`)

      if (totalDebit === 70200) {
        console.log(`\n   ✅ القيد يحتوي على 70,200 (65,400 + 4,800 مرتجع)`)
        console.log(`   📌 هذا صحيح! المرتجع مدمج في قيد الفاتورة`)
      }
    }
  }

  // 3. فحص جميع القيود على حساب المخزون
  console.log('\n\n📊 ملخص جميع القيود على حساب المخزون:\n')

  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .eq('sub_type', 'inventory')
    .eq('is_active', true)
    .single()

  if (inventoryAccount) {
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select(`
        debit_amount,
        credit_amount,
        journal_entries!inner(
          reference_type,
          is_deleted
        )
      `)
      .eq('account_id', inventoryAccount.id)

    const summary = {}
    let totalDebit = 0
    let totalCredit = 0

    for (const line of lines || []) {
      if (line.journal_entries?.is_deleted) continue

      const type = line.journal_entries?.reference_type || 'unknown'
      const debit = Number(line.debit_amount || 0)
      const credit = Number(line.credit_amount || 0)

      if (!summary[type]) {
        summary[type] = { count: 0, debit: 0, credit: 0 }
      }

      summary[type].count++
      summary[type].debit += debit
      summary[type].credit += credit

      totalDebit += debit
      totalCredit += credit
    }

    console.log('   ' + '─'.repeat(70))
    console.log('   | النوع | العدد | مدين | دائن | الصافي |')
    console.log('   ' + '─'.repeat(70))

    for (const [type, data] of Object.entries(summary)) {
      const net = data.debit - data.credit
      console.log(`   | ${type.padEnd(20)} | ${String(data.count).padStart(5)} | ${data.debit.toFixed(2).padStart(10)} | ${data.credit.toFixed(2).padStart(10)} | ${net.toFixed(2).padStart(10)} |`)
    }

    console.log('   ' + '─'.repeat(70))
    const balance = totalDebit - totalCredit
    console.log(`   | ${'إجمالي'.padEnd(20)} | ${String(lines?.length || 0).padStart(5)} | ${totalDebit.toFixed(2).padStart(10)} | ${totalCredit.toFixed(2).padStart(10)} | ${balance.toFixed(2).padStart(10)} |`)
    console.log('   ' + '─'.repeat(70))
  }
}

main()

