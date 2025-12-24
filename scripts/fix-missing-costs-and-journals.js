#!/usr/bin/env node

/**
 * Fix Missing Costs and Journal Entries
 * ======================================
 * إصلاح التكاليف المفقودة والقيود المحاسبية
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

async function fixCompany(companyName) {
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

  let fixed = 0

  // 1. Fix purchase_return costs
  console.log('\n1️⃣ إصلاح تكاليف مرتجعات الشراء...')
  
  const { data: purchaseReturns } = await supabase
    .from('inventory_transactions')
    .select('*')
    .eq('company_id', company.id)
    .eq('transaction_type', 'purchase_return')
    .or('unit_cost.is.null,total_cost.is.null')

  for (const trans of purchaseReturns || []) {
    // Get the bill
    const { data: bill } = await supabase
      .from('bills')
      .select('id, bill_number')
      .eq('id', trans.reference_id)
      .single()

    if (!bill) {
      console.log(`  ⚠️  لا توجد فاتورة للمرجع ${trans.reference_id}`)
      continue
    }

    // Get bill item for this product
    const { data: billItem } = await supabase
      .from('bill_items')
      .select('*')
      .eq('bill_id', bill.id)
      .eq('product_id', trans.product_id)
      .single()

    if (!billItem) {
      console.log(`  ⚠️  لا يوجد صنف في ${bill.bill_number} للمنتج ${trans.product_id}`)
      continue
    }

    const unitCost = billItem.unit_price
    const totalCost = Math.abs(trans.quantity_change) * unitCost

    if (DRY_RUN) {
      console.log(`  [DRY RUN] ${bill.bill_number}: ${trans.quantity_change} @ ${unitCost} = ${totalCost}`)
    } else {
      const { error } = await supabase
        .from('inventory_transactions')
        .update({
          unit_cost: unitCost,
          total_cost: totalCost
        })
        .eq('id', trans.id)

      if (error) {
        console.log(`  ❌ خطأ: ${error.message}`)
      } else {
        console.log(`  ✅ ${bill.bill_number}: ${trans.quantity_change} @ ${unitCost} = ${totalCost}`)
        fixed++
      }
    }
  }

  // 2. Fix write_off costs
  console.log('\n2️⃣ إصلاح تكاليف الإهلاك...')
  
  const { data: writeOffs } = await supabase
    .from('inventory_transactions')
    .select('*')
    .eq('company_id', company.id)
    .eq('transaction_type', 'write_off')
    .or('unit_cost.is.null,total_cost.is.null')

  for (const trans of writeOffs || []) {
    // Get product cost
    const { data: product } = await supabase
      .from('products')
      .select('sku, cost_price')
      .eq('id', trans.product_id)
      .single()

    if (!product) {
      console.log(`  ⚠️  لا يوجد منتج ${trans.product_id}`)
      continue
    }

    const unitCost = product.cost_price || 0
    const totalCost = Math.abs(trans.quantity_change) * unitCost

    if (DRY_RUN) {
      console.log(`  [DRY RUN] ${product.sku}: ${trans.quantity_change} @ ${unitCost} = ${totalCost}`)
    } else {
      const { error } = await supabase
        .from('inventory_transactions')
        .update({
          unit_cost: unitCost,
          total_cost: totalCost
        })
        .eq('id', trans.id)

      if (error) {
        console.log(`  ❌ خطأ: ${error.message}`)
      } else {
        console.log(`  ✅ ${product.sku}: ${trans.quantity_change} @ ${unitCost} = ${totalCost}`)
        fixed++
      }
    }
  }

  // 3. Fix sale_return costs
  console.log('\n3️⃣ إصلاح تكاليف مرتجعات البيع...')
  
  const { data: saleReturns } = await supabase
    .from('inventory_transactions')
    .select('*')
    .eq('company_id', company.id)
    .eq('transaction_type', 'sale_return')
    .or('unit_cost.is.null,total_cost.is.null')

  for (const trans of saleReturns || []) {
    // Get product cost
    const { data: product } = await supabase
      .from('products')
      .select('sku, cost_price')
      .eq('id', trans.product_id)
      .single()

    if (!product) {
      console.log(`  ⚠️  لا يوجد منتج ${trans.product_id}`)
      continue
    }

    const unitCost = product.cost_price || 0
    const totalCost = trans.quantity_change * unitCost

    if (DRY_RUN) {
      console.log(`  [DRY RUN] ${product.sku}: ${trans.quantity_change} @ ${unitCost} = ${totalCost}`)
    } else {
      const { error } = await supabase
        .from('inventory_transactions')
        .update({
          unit_cost: unitCost,
          total_cost: totalCost
        })
        .eq('id', trans.id)

      if (error) {
        console.log(`  ❌ خطأ: ${error.message}`)
      } else {
        console.log(`  ✅ ${product.sku}: ${trans.quantity_change} @ ${unitCost} = ${totalCost}`)
        fixed++
      }
    }
  }

  console.log(`\n${'─'.repeat(80)}`)
  console.log(`📊 الملخص: تم إصلاح ${fixed} حركة`)
  console.log('─'.repeat(80))
}

async function main() {
  const companies = process.argv.filter(arg => !arg.startsWith('--') && !arg.endsWith('.js'))
  
  if (companies.length === 0) {
    console.log('Usage: node fix-missing-costs-and-journals.js <company1> [company2] ... [--dry-run]')
    console.log('Example: node fix-missing-costs-and-journals.js VitaSlims FOODCAN')
    process.exit(1)
  }

  console.log('\n' + '='.repeat(80))
  console.log('🔧 إصلاح التكاليف المفقودة')
  if (DRY_RUN) {
    console.log('⚠️  وضع التجربة (DRY RUN)')
  }
  console.log('='.repeat(80))

  for (const companyName of companies) {
    await fixCompany(companyName)
  }

  console.log('\n' + '='.repeat(80))
  console.log('✅ اكتمل المعالجة')
  console.log('='.repeat(80) + '\n')
}

main()

