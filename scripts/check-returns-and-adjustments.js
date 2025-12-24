#!/usr/bin/env node

/**
 * Check Purchase Returns and Inventory Adjustments
 * =================================================
 * التحقق من المرتجعات والإهلاك
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

async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('🔍 التحقق من المرتجعات والإهلاك')
  console.log('='.repeat(80))

  // Get all companies
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .order('name')

  for (const company of companies || []) {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`🏢 ${company.name}`)
    console.log('='.repeat(80))

    // Check purchase returns
    const { data: returns } = await supabase
      .from('purchase_returns')
      .select('*')
      .eq('company_id', company.id)
      .order('return_number')

    console.log(`\n📦 مرتجعات المشتريات: ${returns?.length || 0}`)
    
    for (const ret of returns || []) {
      console.log(`\n  ${ret.return_number} (${ret.status})`)
      console.log(`    التاريخ: ${ret.return_date}`)
      console.log(`    المبلغ: ${ret.total_amount} جنيه`)
      
      // Get return items
      const { data: items } = await supabase
        .from('purchase_return_items')
        .select('*, products(sku, name)')
        .eq('purchase_return_id', ret.id)

      console.log(`    الأصناف: ${items?.length || 0}`)
      for (const item of items || []) {
        console.log(`      - ${item.products.sku}: ${item.quantity} × ${item.unit_price} = ${item.total_price}`)
      }

      // Check inventory transactions
      const { data: trans } = await supabase
        .from('inventory_transactions')
        .select('*')
        .eq('reference_id', ret.id)
        .eq('transaction_type', 'purchase_reversal')

      console.log(`    حركات المخزون: ${trans?.length || 0}`)
      if (trans && trans.length > 0) {
        for (const t of trans) {
          console.log(`      - ${t.quantity_change} @ ${t.unit_cost}`)
        }
      } else if (ret.status === 'approved') {
        console.log(`      ⚠️  لا توجد حركات مخزون للمرتجع المعتمد!`)
      }

      // Check journal entries
      const { data: journal } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('reference_id', ret.id)
        .eq('reference_type', 'purchase_return')

      console.log(`    القيود المحاسبية: ${journal?.length || 0}`)
      if (!journal || journal.length === 0) {
        if (ret.status === 'approved') {
          console.log(`      ⚠️  لا توجد قيود محاسبية للمرتجع المعتمد!`)
        }
      }
    }

    // Check inventory adjustments
    const { data: adjustments } = await supabase
      .from('inventory_adjustments')
      .select('*')
      .eq('company_id', company.id)
      .order('adjustment_number')

    console.log(`\n📊 تسويات المخزون: ${adjustments?.length || 0}`)
    
    for (const adj of adjustments || []) {
      console.log(`\n  ${adj.adjustment_number} (${adj.status})`)
      console.log(`    التاريخ: ${adj.adjustment_date}`)
      console.log(`    النوع: ${adj.adjustment_type}`)
      console.log(`    السبب: ${adj.reason || 'غير محدد'}`)
      
      // Get adjustment items
      const { data: items } = await supabase
        .from('inventory_adjustment_items')
        .select('*, products(sku, name)')
        .eq('inventory_adjustment_id', adj.id)

      console.log(`    الأصناف: ${items?.length || 0}`)
      for (const item of items || []) {
        console.log(`      - ${item.products.sku}: ${item.quantity_change} @ ${item.unit_cost}`)
      }

      // Check inventory transactions
      const { data: trans } = await supabase
        .from('inventory_transactions')
        .select('*')
        .eq('reference_id', adj.id)
        .eq('transaction_type', 'adjustment')

      console.log(`    حركات المخزون: ${trans?.length || 0}`)
      if (trans && trans.length > 0) {
        for (const t of trans) {
          console.log(`      - ${t.quantity_change} @ ${t.unit_cost}`)
        }
      } else if (adj.status === 'approved') {
        console.log(`      ⚠️  لا توجد حركات مخزون للتسوية المعتمدة!`)
      }

      // Check journal entries
      const { data: journal } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('reference_id', adj.id)
        .eq('reference_type', 'inventory_adjustment')

      console.log(`    القيود المحاسبية: ${journal?.length || 0}`)
      if (!journal || journal.length === 0) {
        if (adj.status === 'approved') {
          console.log(`      ⚠️  لا توجد قيود محاسبية للتسوية المعتمدة!`)
        }
      }
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('✅ اكتمل الفحص')
  console.log('='.repeat(80) + '\n')
}

main()

