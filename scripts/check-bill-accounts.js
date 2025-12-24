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

  console.log('\n🔍 فحص حسابات قيود الفواتير\n')

  const billNumbers = ['BILL-0008', 'BILL-0009', 'BILL-0010']

  for (const billNum of billNumbers) {
    const { data: bill } = await supabase
      .from('bills')
      .select('id, bill_number, status, total_amount')
      .eq('company_id', company.id)
      .eq('bill_number', billNum)
      .single()

    if (!bill) continue

    console.log(`\n${'─'.repeat(70)}`)
    console.log(`📋 ${bill.bill_number} - ${bill.status} - ${bill.total_amount} جنيه`)
    console.log('─'.repeat(70))

    const { data: journalEntry } = await supabase
      .from('journal_entries')
      .select(`
        id,
        entry_date,
        description,
        journal_entry_lines!inner(
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

    if (journalEntry) {
      console.log(`\n📌 القيد المحاسبي: ${journalEntry.id}`)
      console.log(`   التاريخ: ${journalEntry.entry_date}`)
      console.log(`   الوصف: ${journalEntry.description}\n`)

      for (const line of journalEntry.journal_entry_lines) {
        const debit = Number(line.debit_amount || 0)
        const credit = Number(line.credit_amount || 0)
        console.log(`   ${line.chart_of_accounts.account_code} - ${line.chart_of_accounts.account_name}`)
        console.log(`   النوع: ${line.chart_of_accounts.sub_type}`)
        console.log(`   مدين: ${debit.toFixed(2)} | دائن: ${credit.toFixed(2)}`)
        console.log(`   الوصف: ${line.description}\n`)
      }
    } else {
      console.log('   ❌ لا يوجد قيد محاسبي')
    }
  }
}

main()

