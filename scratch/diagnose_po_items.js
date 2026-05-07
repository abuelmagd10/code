const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(
  'https://hfvsbsizokxontflgdyn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'
)
const COMPANY_ID = '8ef6338c-1713-4202-98ac-863633b76526'

async function main() {
  // 1. Get material issue approvals
  const { data: approvals } = await supabase
    .from('manufacturing_material_issue_approvals')
    .select('id, status, production_order_id')
    .eq('company_id', COMPANY_ID)
  console.log('Approvals:', JSON.stringify(approvals, null, 2))

  // 2. Get material requirements for each approval
  for (const apv of (approvals || [])) {
    const { data: reqs } = await supabase
      .from('manufacturing_material_requirements')
      .select('id, product_id, required_qty, available_qty, approved_qty, shortage_qty')
      .eq('approval_id', apv.id)
    console.log(`\nRequirements for ${apv.id} (${apv.status}):`)
    for (const r of (reqs || [])) {
      // Get product name
      const { data: prod } = await supabase
        .from('products')
        .select('id, name, branch_id')
        .eq('id', r.product_id)
        .maybeSingle()
      console.log(`  product: ${prod?.name || 'NOT FOUND'} (${r.product_id})`)
      console.log(`    branch: ${prod?.branch_id || 'NULL'}`)
      console.log(`    required: ${r.required_qty}, available: ${r.available_qty}, shortage: ${r.shortage_qty}`)
    }
  }

  // 3. Check what product_ids the handleCreatePO would send
  console.log('\n=== Product IDs that would be in shortage_items URL param ===')
  for (const apv of (approvals || [])) {
    const { data: reqs } = await supabase
      .from('manufacturing_material_requirements')
      .select('id, product_id, required_qty, available_qty, shortage_qty')
      .eq('approval_id', apv.id)
    const shortages = (reqs || []).filter(r => r.shortage_qty > 0)
    if (shortages.length > 0) {
      console.log(`Approval ${apv.id} shortages:`)
      shortages.forEach(s => console.log(`  product_id: ${s.product_id}, shortage: ${s.shortage_qty}`))
    }
  }

  // 4. Verify those product_ids exist in products table
  console.log('\n=== All products in company ===')
  const { data: allProds } = await supabase
    .from('products')
    .select('id, name, branch_id, product_type, sku')
    .eq('company_id', COMPANY_ID)
  allProds?.forEach(p => console.log(`  ${p.name} (${p.id}) | branch: ${p.branch_id} | type: ${p.product_type}`))
}

main().catch(console.error)
