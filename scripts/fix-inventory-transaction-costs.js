#!/usr/bin/env node

/**
 * Fix Inventory Transaction Costs
 * ================================
 * تحديث تكاليف حركات المخزون من bill_items
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

const DRY_RUN = process.argv.includes('--dry-run')

async function processCompany(companyName) {
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

  // Get all bills
  const { data: bills } = await supabase
    .from('bills')
    .select('id, bill_number, status')
    .eq('company_id', company.id)
    .order('bill_number')

  console.log(`\n📄 عدد الفواتير: ${bills?.length || 0}`)

  let updated = 0
  let skipped = 0

  for (const bill of bills || []) {
    // Get bill items
    const { data: items } = await supabase
      .from('bill_items')
      .select('id, product_id, quantity, unit_price, products(sku, name)')
      .eq('bill_id', bill.id)

    if (!items || items.length === 0) {
      console.log(`  ⏭️  ${bill.bill_number} - لا توجد أصناف`)
      skipped++
      continue
    }

    // Get transactions for this bill
    const { data: transactions } = await supabase
      .from('inventory_transactions')
      .select('id, product_id, quantity_change, unit_cost, total_cost')
      .eq('reference_id', bill.id)
      .eq('transaction_type', 'purchase')

    if (!transactions || transactions.length === 0) {
      console.log(`  ⏭️  ${bill.bill_number} - لا توجد حركات مخزون`)
      skipped++
      continue
    }

    console.log(`\n  📦 ${bill.bill_number} - ${items.length} صنف، ${transactions.length} حركة`)

    // Update each transaction with correct cost from bill_items
    for (const trans of transactions) {
      const item = items.find(i => i.product_id === trans.product_id)
      
      if (!item) {
        console.log(`     ⚠️  حركة ${trans.id} - لا يوجد صنف مطابق`)
        continue
      }

      const needsUpdate = !trans.unit_cost || !trans.total_cost
      
      if (needsUpdate) {
        const newUnitCost = item.unit_price
        const newTotalCost = trans.quantity_change * item.unit_price

        if (DRY_RUN) {
          console.log(`     [DRY RUN] ${item.products.sku}: unit_cost ${trans.unit_cost} → ${newUnitCost}, total_cost ${trans.total_cost} → ${newTotalCost}`)
        } else {
          const { error } = await supabase
            .from('inventory_transactions')
            .update({
              unit_cost: newUnitCost,
              total_cost: newTotalCost
            })
            .eq('id', trans.id)

          if (error) {
            console.log(`     ❌ خطأ في تحديث ${item.products.sku}: ${error.message}`)
          } else {
            console.log(`     ✅ ${item.products.sku}: unit_cost → ${newUnitCost}, total_cost → ${newTotalCost}`)
            updated++
          }
        }
      } else {
        console.log(`     ⏭️  ${item.products.sku}: التكاليف موجودة بالفعل`)
      }
    }
  }

  console.log(`\n${'─'.repeat(80)}`)
  console.log(`📊 الملخص:`)
  console.log(`   ✅ تم التحديث: ${updated} حركة`)
  console.log(`   ⏭️  تم التخطي: ${skipped} فاتورة`)
  console.log('─'.repeat(80))
}

async function main() {
  const companies = process.argv.filter(arg => !arg.startsWith('--') && !arg.endsWith('.js'))
  
  if (companies.length === 0) {
    console.log('Usage: node fix-inventory-transaction-costs.js <company1> [company2] ... [--dry-run]')
    console.log('Example: node fix-inventory-transaction-costs.js VitaSlims FOODCAN')
    console.log('         node fix-inventory-transaction-costs.js VitaSlims --dry-run')
    process.exit(1)
  }

  console.log('\n' + '='.repeat(80))
  console.log('🔧 تحديث تكاليف حركات المخزون')
  if (DRY_RUN) {
    console.log('⚠️  وضع التجربة (DRY RUN) - لن يتم حفظ التغييرات')
  }
  console.log('='.repeat(80))

  for (const companyName of companies) {
    await processCompany(companyName)
  }

  console.log('\n' + '='.repeat(80))
  console.log('✅ اكتمل المعالجة')
  console.log('='.repeat(80) + '\n')
}

main()

