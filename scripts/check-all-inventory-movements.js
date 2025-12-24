#!/usr/bin/env node

/**
 * Check All Inventory Movements
 * ==============================
 * التحقق من جميع حركات المخزون (مشتريات، مبيعات، مرتجعات، تسويات، إهلاك)
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

async function checkCompany(companyName) {
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
    .select('*')
    .eq('company_id', company.id)
    .order('created_at')

  console.log(`\n📊 إجمالي حركات المخزون: ${transactions?.length || 0}`)

  // Group by transaction type
  const byType = {}
  for (const trans of transactions || []) {
    const type = trans.transaction_type || 'unknown'
    if (!byType[type]) {
      byType[type] = []
    }
    byType[type].push(trans)
  }

  console.log('\n📈 حسب النوع:')
  for (const [type, items] of Object.entries(byType)) {
    const totalQty = items.reduce((sum, t) => sum + Number(t.quantity_change || 0), 0)
    const totalCost = items.reduce((sum, t) => sum + Number(t.total_cost || 0), 0)
    console.log(`  ${type}: ${items.length} حركة، الكمية: ${totalQty}، التكلفة: ${totalCost.toFixed(2)}`)
  }

  // Check for transactions without costs
  const noCost = transactions?.filter(t => !t.unit_cost || !t.total_cost) || []
  if (noCost.length > 0) {
    console.log(`\n⚠️  حركات بدون تكلفة: ${noCost.length}`)
    for (const t of noCost.slice(0, 5)) {
      console.log(`    - ${t.transaction_type}: ${t.quantity_change} (${t.reference_id})`)
    }
  }

  // Check for transactions without journal entries
  const noJournal = transactions?.filter(t => !t.journal_entry_id) || []
  if (noJournal.length > 0) {
    console.log(`\n⚠️  حركات بدون قيد محاسبي: ${noJournal.length}`)
    for (const t of noJournal.slice(0, 5)) {
      console.log(`    - ${t.transaction_type}: ${t.quantity_change} (${t.reference_id})`)
    }
  }

  // Check bills with returned_amount
  const { data: billsWithReturns } = await supabase
    .from('bills')
    .select('*')
    .eq('company_id', company.id)
    .gt('returned_amount', 0)

  if (billsWithReturns && billsWithReturns.length > 0) {
    console.log(`\n📦 فواتير شراء بها مرتجعات: ${billsWithReturns.length}`)
    for (const bill of billsWithReturns) {
      console.log(`  ${bill.bill_number}: مرتجع ${bill.returned_amount} جنيه (${bill.return_status})`)
    }
  }

  // Check invoices with returned_amount
  const { data: invoicesWithReturns } = await supabase
    .from('invoices')
    .select('*')
    .eq('company_id', company.id)
    .gt('returned_amount', 0)

  if (invoicesWithReturns && invoicesWithReturns.length > 0) {
    console.log(`\n📄 فواتير بيع بها مرتجعات: ${invoicesWithReturns.length}`)
    for (const inv of invoicesWithReturns) {
      console.log(`  ${inv.invoice_number}: مرتجع ${inv.returned_amount} جنيه (${inv.return_status})`)
    }
  }

  // Check write-offs
  const { data: writeOffs } = await supabase
    .from('inventory_write_offs')
    .select('*')
    .eq('company_id', company.id)

  if (writeOffs && writeOffs.length > 0) {
    console.log(`\n🗑️  إهلاكات المخزون: ${writeOffs.length}`)
    for (const wo of writeOffs) {
      console.log(`  ${wo.write_off_number}: ${wo.total_cost} جنيه (${wo.status}) - ${wo.reason}`)
    }
  }
}

async function main() {
  const companies = process.argv.slice(2)
  
  if (companies.length === 0) {
    console.log('Usage: node check-all-inventory-movements.js <company1> [company2] ...')
    console.log('Example: node check-all-inventory-movements.js VitaSlims FOODCAN')
    process.exit(1)
  }

  console.log('\n' + '='.repeat(80))
  console.log('🔍 فحص جميع حركات المخزون')
  console.log('='.repeat(80))

  for (const companyName of companies) {
    await checkCompany(companyName)
  }

  console.log('\n' + '='.repeat(80))
  console.log('✅ اكتمل الفحص')
  console.log('='.repeat(80) + '\n')
}

main()

