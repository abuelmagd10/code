const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(
  'https://hfvsbsizokxontflgdyn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'
)
async function main() {
  // Search for PO-0002 with different patterns
  const { data: pos } = await supabase
    .from('purchase_orders')
    .select('id, po_number, company_id, status')
    .ilike('po_number', '%0002%')
  console.log('POs matching 0002:', JSON.stringify(pos, null, 2))

  // Also check all POs
  const { data: allPos } = await supabase
    .from('purchase_orders')
    .select('id, po_number, company_id, status')
    .order('created_at', { ascending: false })
    .limit(5)
  console.log('\nRecent POs:', JSON.stringify(allPos, null, 2))
}
main().catch(console.error)
