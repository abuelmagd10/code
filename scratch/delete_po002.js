const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(
  'https://hfvsbsizokxontflgdyn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'
)

const PO_ID = 'd47c3404-d09d-4ec4-a7e9-48192621f014'
const COMPANY_ID = '8ef6338c-1713-4202-98ac-863633b76526'

async function main() {
  console.log('=== Deleting PO-0002 from test company ===\n')

  // 1. Check for linked bills
  const { data: bills } = await supabase
    .from('bills')
    .select('id, bill_number, status')
    .eq('purchase_order_id', PO_ID)
  console.log('Linked bills:', bills)

  if (bills && bills.length > 0) {
    for (const bill of bills) {
      // Delete bill items
      const { error: e1 } = await supabase.from('bill_items').delete().eq('bill_id', bill.id)
      console.log(`  bill_items (${bill.bill_number}):`, e1?.message || '✅')

      // Delete bill payments
      const { error: e2 } = await supabase.from('bill_payments').delete().eq('bill_id', bill.id)
      console.log(`  bill_payments (${bill.bill_number}):`, e2?.message || '✅')

      // Delete journal entries linked to bill
      const { data: journals } = await supabase.from('journal_entries').select('id').eq('reference_id', bill.id)
      if (journals && journals.length > 0) {
        for (const j of journals) {
          await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', j.id)
          await supabase.from('journal_entries').delete().eq('id', j.id)
        }
        console.log(`  journal_entries (${bill.bill_number}): ✅`)
      }

      // Delete bill
      const { error: e3 } = await supabase.from('bills').delete().eq('id', bill.id)
      console.log(`  bill (${bill.bill_number}):`, e3?.message || '✅')
    }
  }

  // 2. Delete PO items
  const { error: e4 } = await supabase.from('purchase_order_items').delete().eq('purchase_order_id', PO_ID)
  console.log('PO items:', e4?.message || '✅')

  // 3. Delete PO journal entries
  const { data: poJournals } = await supabase.from('journal_entries').select('id').eq('reference_id', PO_ID)
  if (poJournals && poJournals.length > 0) {
    for (const j of poJournals) {
      await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', j.id)
      await supabase.from('journal_entries').delete().eq('id', j.id)
    }
    console.log('PO journal entries: ✅')
  }

  // 4. Delete PO
  const { error: e5 } = await supabase.from('purchase_orders').delete().eq('id', PO_ID)
  console.log('PO-0002:', e5?.message || '✅')

  console.log('\n✅ Done!')
}

main().catch(console.error)
