#!/usr/bin/env node

/**
 * Verify Inventory Math
 * =====================
 * التحقق من صحة حسابات المخزون: المشتريات - المبيعات = الرصيد
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

const log = (msg, indent = 0) => {
  console.log('  '.repeat(indent) + msg)
}

async function analyzeCompany(companyName) {
  log(`\n${'='.repeat(80)}`)
  log(`🏢 الشركة: ${companyName}`)
  log('='.repeat(80))

  // Get company
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('name', companyName)
    .single()

  if (!company) {
    log('❌ الشركة غير موجودة')
    return
  }

  // Get all products
  const { data: products } = await supabase
    .from('products')
    .select('id, sku, name, quantity_on_hand, cost_price')
    .eq('company_id', company.id)
    .or('item_type.is.null,item_type.eq.product')
    .order('sku')

  log(`\n📦 عدد المنتجات: ${products?.length || 0}\n`)

  let totalIssues = 0

  for (const product of products || []) {
    // Get purchase transactions
    const { data: purchases } = await supabase
      .from('inventory_transactions')
      .select('quantity_change, unit_cost, created_at, bill_id, bills(bill_number)')
      .eq('product_id', product.id)
      .eq('transaction_type', 'purchase')
      .order('created_at')

    // Get sale transactions
    const { data: sales } = await supabase
      .from('inventory_transactions')
      .select('quantity_change, unit_cost, created_at, invoice_id, invoices(invoice_number)')
      .eq('product_id', product.id)
      .eq('transaction_type', 'sale')
      .order('created_at')

    // Get adjustments
    const { data: adjustments } = await supabase
      .from('inventory_transactions')
      .select('quantity_change, unit_cost, created_at, notes')
      .eq('product_id', product.id)
      .eq('transaction_type', 'adjustment')
      .order('created_at')

    const totalPurchased = purchases?.reduce((sum, p) => sum + Number(p.quantity_change || 0), 0) || 0
    const totalSold = Math.abs(sales?.reduce((sum, s) => sum + Number(s.quantity_change || 0), 0) || 0)
    const totalAdjustments = adjustments?.reduce((sum, a) => sum + Number(a.quantity_change || 0), 0) || 0
    
    const calculatedBalance = totalPurchased - totalSold + totalAdjustments
    const actualBalance = Number(product.quantity_on_hand || 0)
    const diff = actualBalance - calculatedBalance

    if (Math.abs(diff) > 0.01) {
      totalIssues++
      log(`\n❌ ${product.sku} - ${product.name}`)
      log(`   المشتريات: ${totalPurchased}`, 1)
      log(`   المبيعات: ${totalSold}`, 1)
      log(`   التسويات: ${totalAdjustments}`, 1)
      log(`   الرصيد المحسوب: ${calculatedBalance}`, 1)
      log(`   الرصيد الفعلي: ${actualBalance}`, 1)
      log(`   الفرق: ${diff} ⚠️`, 1)

      // Show purchase details
      if (purchases && purchases.length > 0) {
        log(`\n   📥 تفاصيل المشتريات:`, 1)
        for (const p of purchases) {
          log(`      • ${p.bills?.bill_number || 'N/A'}: ${p.quantity_change} @ ${p.unit_cost} (${new Date(p.created_at).toLocaleDateString('ar-EG')})`, 1)
        }
      }

      // Show sale details
      if (sales && sales.length > 0) {
        log(`\n   📤 تفاصيل المبيعات:`, 1)
        for (const s of sales) {
          log(`      • ${s.invoices?.invoice_number || 'N/A'}: ${s.quantity_change} @ ${s.unit_cost} (${new Date(s.created_at).toLocaleDateString('ar-EG')})`, 1)
        }
      }

      // Show adjustment details
      if (adjustments && adjustments.length > 0) {
        log(`\n   🔧 تفاصيل التسويات:`, 1)
        for (const a of adjustments) {
          log(`      • ${a.quantity_change} (${a.notes || 'بدون ملاحظات'}) - ${new Date(a.created_at).toLocaleDateString('ar-EG')}`, 1)
        }
      }
    } else {
      log(`✅ ${product.sku} - ${product.name}`)
      log(`   المشتريات: ${totalPurchased} | المبيعات: ${totalSold} | التسويات: ${totalAdjustments} | الرصيد: ${actualBalance}`, 1)
    }
  }

  log(`\n${'─'.repeat(80)}`)
  if (totalIssues === 0) {
    log(`✅ جميع المنتجات صحيحة - لا توجد فروقات`)
  } else {
    log(`⚠️  وجدت ${totalIssues} منتج به فروقات`)
  }
  log('─'.repeat(80))
}

async function main() {
  const companies = process.argv.slice(2)
  
  if (companies.length === 0) {
    console.log('Usage: node verify-inventory-math.js <company1> [company2] ...')
    console.log('Example: node verify-inventory-math.js VitaSlims FOODCAN')
    process.exit(1)
  }

  log('\n' + '='.repeat(80))
  log('🔍 التحقق من صحة حسابات المخزون')
  log('='.repeat(80))

  for (const companyName of companies) {
    await analyzeCompany(companyName)
  }

  log('\n' + '='.repeat(80))
  log('✅ اكتمل التحليل')
  log('='.repeat(80) + '\n')
}

main()

