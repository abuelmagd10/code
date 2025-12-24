#!/usr/bin/env node

/**
 * Create Missing Inventory Transactions
 * ======================================
 * إنشاء حركات المخزون المفقودة للفواتير الموجودة
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
    .select('id, bill_number, status, bill_date')
    .eq('company_id', company.id)
    .in('status', ['received', 'paid', 'partially_paid'])
    .order('bill_number')

  console.log(`\n📄 عدد الفواتير المستلمة/المدفوعة: ${bills?.length || 0}`)

  let created = 0
  let skipped = 0

  for (const bill of bills || []) {
    // Check if transactions already exist
    const { data: existingTrans } = await supabase
      .from('inventory_transactions')
      .select('id')
      .eq('reference_id', bill.id)
      .eq('transaction_type', 'purchase')

    if (existingTrans && existingTrans.length > 0) {
      console.log(`  ⏭️  ${bill.bill_number} - حركات موجودة بالفعل (${existingTrans.length})`)
      skipped++
      continue
    }

    // Get bill items
    const { data: items } = await supabase
      .from('bill_items')
      .select('id, product_id, quantity, unit_price, products(sku, name)')
      .eq('bill_id', bill.id)

    if (!items || items.length === 0) {
      console.log(`  ⚠️  ${bill.bill_number} - لا توجد أصناف`)
      skipped++
      continue
    }

    console.log(`\n  📦 ${bill.bill_number} (${bill.status}) - ${items.length} صنف`)

    // Create transactions
    const transactions = items.map(item => ({
      company_id: company.id,
      product_id: item.product_id,
      transaction_type: 'purchase',
      quantity_change: item.quantity,
      unit_cost: item.unit_price,
      total_cost: item.quantity * item.unit_price,
      reference_id: bill.id,
      notes: `فاتورة شراء ${bill.bill_number} (تم إنشاؤها تلقائياً)`
    }))

    if (DRY_RUN) {
      console.log(`     [DRY RUN] سيتم إنشاء ${transactions.length} حركة مخزون`)
      for (const trans of transactions) {
        const item = items.find(i => i.product_id === trans.product_id)
        console.log(`       • ${item.products.sku}: +${trans.quantity_change} @ ${trans.unit_cost}`)
      }
    } else {
      const { data, error } = await supabase
        .from('inventory_transactions')
        .insert(transactions)
        .select()

      if (error) {
        console.log(`     ❌ خطأ: ${error.message}`)
      } else {
        console.log(`     ✅ تم إنشاء ${data.length} حركة مخزون`)
        for (const trans of transactions) {
          const item = items.find(i => i.product_id === trans.product_id)
          console.log(`       • ${item.products.sku}: +${trans.quantity_change} @ ${trans.unit_cost}`)
        }
        created += data.length
      }
    }
  }

  console.log(`\n${'─'.repeat(80)}`)
  console.log(`📊 الملخص:`)
  console.log(`   ✅ تم الإنشاء: ${created} حركة`)
  console.log(`   ⏭️  تم التخطي: ${skipped} فاتورة`)
  console.log('─'.repeat(80))
}

async function main() {
  const companies = process.argv.filter(arg => !arg.startsWith('--') && !arg.endsWith('.js'))
  
  if (companies.length === 0) {
    console.log('Usage: node create-missing-inventory-transactions.js <company1> [company2] ... [--dry-run]')
    console.log('Example: node create-missing-inventory-transactions.js VitaSlims FOODCAN')
    console.log('         node create-missing-inventory-transactions.js VitaSlims --dry-run')
    process.exit(1)
  }

  console.log('\n' + '='.repeat(80))
  console.log('🔧 إنشاء حركات المخزون المفقودة')
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

