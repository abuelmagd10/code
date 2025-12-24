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

  const { data: bills } = await supabase
    .from('bills')
    .select('id, bill_number, status, total_amount')
    .eq('company_id', company.id)
    .order('bill_number')

  console.log(`\nTotal bills: ${bills.length}\n`)

  let totalBillAmount = 0
  let totalJournalAmount = 0

  for (const bill of bills) {
    totalBillAmount += Number(bill.total_amount || 0)

    // Check for bill entry (active)
    const { data: billEntry } = await supabase
      .from('journal_entries')
      .select(`
        id,
        journal_entry_lines!inner(debit_amount, credit_amount)
      `)
      .eq('reference_type', 'bill')
      .eq('reference_id', bill.id)
      .eq('is_deleted', false)
      .single()

    let journalAmount = 0
    if (billEntry && billEntry.journal_entry_lines) {
      for (const line of billEntry.journal_entry_lines) {
        journalAmount += Number(line.debit_amount || 0)
      }
      totalJournalAmount += journalAmount
    }

    const diff = Number(bill.total_amount || 0) - journalAmount
    const diffStr = diff !== 0 ? ` (diff: ${diff.toFixed(2)})` : ''

    console.log(`${bill.bill_number.padEnd(15)} | ${bill.status.padEnd(15)} | Bill: ${String(bill.total_amount).padStart(10)} | Journal: ${journalAmount.toFixed(2).padStart(10)}${diffStr}`)
  }

  console.log(`\n${'─'.repeat(80)}`)
  console.log(`Total Bill Amount:    ${totalBillAmount.toFixed(2)}`)
  console.log(`Total Journal Amount: ${totalJournalAmount.toFixed(2)}`)
  console.log(`Difference:           ${(totalBillAmount - totalJournalAmount).toFixed(2)}`)
}

main()

