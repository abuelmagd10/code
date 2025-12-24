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
    .eq('name', 'VitaSlims')
    .single()

  const sku = process.argv[2] || 'vita-1001'

  const { data: product } = await supabase
    .from('products')
    .select('id, sku, name, quantity_on_hand')
    .eq('sku', sku)
    .eq('company_id', company.id)
    .single()

  console.log('\nProduct:', product.sku, '-', product.name)
  console.log('Quantity on hand:', product.quantity_on_hand)

  const { data: trans } = await supabase
    .from('inventory_transactions')
    .select('*')
    .eq('product_id', product.id)
    .order('created_at')

  console.log('\nTotal transactions:', trans?.length || 0)

  let totalPurchase = 0
  let totalSale = 0
  let totalAdjustment = 0
  let totalPurchaseReturn = 0
  let totalSaleReturn = 0
  let totalWriteOff = 0

  for (const t of trans || []) {
    console.log(`\n  ${t.transaction_type}: ${t.quantity_change} @ ${t.unit_cost} = ${t.total_cost}`)
    console.log(`    reference_id: ${t.reference_id}`)
    console.log(`    created_at: ${t.created_at}`)

    if (t.transaction_type === 'purchase') {
      totalPurchase += Number(t.quantity_change || 0)
    } else if (t.transaction_type === 'sale') {
      totalSale += Math.abs(Number(t.quantity_change || 0))
    } else if (t.transaction_type === 'adjustment') {
      totalAdjustment += Number(t.quantity_change || 0)
    } else if (t.transaction_type === 'purchase_return') {
      totalPurchaseReturn += Number(t.quantity_change || 0)
    } else if (t.transaction_type === 'sale_return') {
      totalSaleReturn += Number(t.quantity_change || 0)
    } else if (t.transaction_type === 'write_off') {
      totalWriteOff += Number(t.quantity_change || 0)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('Summary:')
  console.log('  Total Purchase:', totalPurchase)
  console.log('  Total Purchase Return:', totalPurchaseReturn)
  console.log('  Total Sale:', totalSale)
  console.log('  Total Sale Return:', totalSaleReturn)
  console.log('  Total Write-off:', totalWriteOff)
  console.log('  Total Adjustment:', totalAdjustment)
  const calculated = totalPurchase + totalPurchaseReturn - totalSale + totalSaleReturn + totalWriteOff + totalAdjustment
  console.log('  Calculated Balance:', calculated)
  console.log('  Actual Balance:', product.quantity_on_hand)
  console.log('  Difference:', product.quantity_on_hand - calculated)
  console.log('='.repeat(60))
}

main()

