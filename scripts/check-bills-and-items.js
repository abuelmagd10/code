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

  // Get bills
  const { data: bills } = await supabase
    .from('bills')
    .select('id, bill_number, status, total_amount, bill_date')
    .eq('company_id', company.id)
    .order('bill_number')

  console.log(`\n📄 عدد الفواتير: ${bills?.length || 0}`)

  for (const bill of bills || []) {
    const { data: items } = await supabase
      .from('bill_items')
      .select('id, product_id, quantity, unit_price, products(sku, name)')
      .eq('bill_id', bill.id)

    console.log(`\n  ${bill.bill_number} (${bill.status}) - ${bill.bill_date}`)
    console.log(`    المبلغ: ${bill.total_amount} جنيه`)
    console.log(`    الأصناف: ${items?.length || 0}`)
    
    if (items && items.length > 0) {
      for (const item of items) {
        console.log(`      • ${item.products?.sku}: ${item.quantity} × ${item.unit_price} = ${item.quantity * item.unit_price}`)
      }
    } else {
      console.log(`      ⚠️  لا توجد أصناف!`)
    }

    // Check inventory transactions
    const { data: transactions } = await supabase
      .from('inventory_transactions')
      .select('id, product_id, quantity_change, transaction_type')
      .eq('bill_id', bill.id)

    console.log(`    حركات المخزون: ${transactions?.length || 0}`)
    if (transactions && transactions.length > 0) {
      for (const trans of transactions) {
        console.log(`      • ${trans.transaction_type}: ${trans.quantity_change}`)
      }
    }
  }

  // Check products with quantities but no transactions
  const { data: products } = await supabase
    .from('products')
    .select('id, sku, name, quantity_on_hand, cost_price')
    .eq('company_id', company.id)
    .gt('quantity_on_hand', 0)
    .or('item_type.is.null,item_type.eq.product')

  console.log(`\n📦 المنتجات التي لها كميات: ${products?.length || 0}`)

  for (const product of products || []) {
    const { data: transactions } = await supabase
      .from('inventory_transactions')
      .select('id, transaction_type, quantity_change')
      .eq('product_id', product.id)

    console.log(`\n  ${product.sku} - ${product.name}`)
    console.log(`    الكمية: ${product.quantity_on_hand}`)
    console.log(`    التكلفة: ${product.cost_price}`)
    console.log(`    حركات المخزون: ${transactions?.length || 0}`)
    
    if (!transactions || transactions.length === 0) {
      console.log(`    ⚠️  لا توجد حركات مخزون لهذا المنتج!`)
    }
  }
}

async function main() {
  const companies = process.argv.slice(2)
  
  if (companies.length === 0) {
    console.log('Usage: node check-bills-and-items.js <company1> [company2] ...')
    console.log('Example: node check-bills-and-items.js VitaSlims FOODCAN')
    process.exit(1)
  }

  console.log('\n' + '='.repeat(80))
  console.log('🔍 فحص الفواتير والأصناف')
  console.log('='.repeat(80))

  for (const companyName of companies) {
    await checkCompany(companyName)
  }

  console.log('\n' + '='.repeat(80))
  console.log('✅ اكتمل الفحص')
  console.log('='.repeat(80) + '\n')
}

main()

