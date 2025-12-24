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

async function analyzeCompany(companyName) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`🏢 ${companyName}`)
  console.log('='.repeat(80))

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('name', companyName)
    .single()

  if (!company) {
    console.log('❌ الشركة غير موجودة')
    return
  }

  // Get all inventory transactions
  const { data: transactions } = await supabase
    .from('inventory_transactions')
    .select(`
      id,
      transaction_type,
      quantity_change,
      unit_cost,
      created_at,
      bill_id,
      invoice_id,
      reference_id,
      notes,
      products(sku, name)
    `)
    .eq('company_id', company.id)
    .order('created_at')

  console.log(`\n📊 إجمالي حركات المخزون: ${transactions?.length || 0}`)

  // Group by type
  const byType = {}
  for (const trans of transactions || []) {
    if (!byType[trans.transaction_type]) {
      byType[trans.transaction_type] = []
    }
    byType[trans.transaction_type].push(trans)
  }

  for (const [type, items] of Object.entries(byType)) {
    console.log(`\n📦 ${type}: ${items.length} حركة`)
    
    for (const item of items) {
      console.log(`\n  ${item.products?.sku || 'N/A'} - ${item.products?.name || 'N/A'}`)
      console.log(`    الكمية: ${item.quantity_change}`)
      console.log(`    التكلفة: ${item.unit_cost}`)
      console.log(`    التاريخ: ${new Date(item.created_at).toLocaleDateString('ar-EG')}`)
      console.log(`    bill_id: ${item.bill_id || 'NULL'}`)
      console.log(`    invoice_id: ${item.invoice_id || 'NULL'}`)
      console.log(`    reference_id: ${item.reference_id || 'NULL'}`)
      console.log(`    notes: ${item.notes || 'NULL'}`)
    }
  }

  // Check bills without transactions
  const { data: bills } = await supabase
    .from('bills')
    .select('id, bill_number, status')
    .eq('company_id', company.id)
    .order('bill_number')

  console.log(`\n\n📄 الفواتير بدون حركات مخزون:`)
  
  for (const bill of bills || []) {
    const { data: trans } = await supabase
      .from('inventory_transactions')
      .select('id')
      .eq('bill_id', bill.id)

    if (!trans || trans.length === 0) {
      console.log(`  ❌ ${bill.bill_number} (${bill.status}) - لا توجد حركات مخزون`)
    }
  }
}

async function main() {
  const companies = process.argv.slice(2)
  
  if (companies.length === 0) {
    console.log('Usage: node analyze-inventory-transactions.js <company1> [company2] ...')
    console.log('Example: node analyze-inventory-transactions.js VitaSlims FOODCAN')
    process.exit(1)
  }

  console.log('\n' + '='.repeat(80))
  console.log('🔍 تحليل حركات المخزون')
  console.log('='.repeat(80))

  for (const companyName of companies) {
    await analyzeCompany(companyName)
  }

  console.log('\n' + '='.repeat(80))
  console.log('✅ اكتمل التحليل')
  console.log('='.repeat(80) + '\n')
}

main()

