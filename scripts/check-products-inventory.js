#!/usr/bin/env node

/**
 * فحص مخزون المنتجات
 * Check Products Inventory
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

const log = (msg, color = 'white') => {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m'
  }
  console.log(`${colors[color]}${msg}${colors.reset}`)
}

async function analyzeCompany(companyName) {
  log(`\n${'='.repeat(80)}`, 'cyan')
  log(`🏢 الشركة: ${companyName}`, 'cyan')
  log('='.repeat(80), 'cyan')

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .ilike('name', `%${companyName}%`)
    .single()

  if (!company) {
    log('❌ الشركة غير موجودة', 'red')
    return
  }

  // جلب جميع المنتجات
  const { data: products } = await supabase
    .from('products')
    .select('sku, name, quantity_on_hand, cost_price, item_type')
    .eq('company_id', company.id)
    .or('item_type.is.null,item_type.eq.product')
    .gt('quantity_on_hand', 0)
    .order('sku', { ascending: true })

  log(`\n📊 عدد المنتجات في المخزون: ${products?.length || 0}\n`, 'yellow')

  if (!products || products.length === 0) {
    log('✅ لا توجد منتجات في المخزون', 'green')
    return
  }

  let totalQty = 0
  let totalValue = 0

  log('📋 المنتجات:', 'yellow')
  log('   ' + '─'.repeat(80), 'white')
  log('   SKU          | المنتج                    | الكمية | التكلفة | القيمة', 'white')
  log('   ' + '─'.repeat(80), 'white')

  for (const product of products) {
    const qty = Number(product.quantity_on_hand || 0)
    const cost = Number(product.cost_price || 0)
    const value = qty * cost

    totalQty += qty
    totalValue += value

    const sku = (product.sku || 'N/A').padEnd(12)
    const name = (product.name || 'N/A').substring(0, 25).padEnd(25)
    const qtyStr = String(qty).padStart(6)
    const costStr = cost.toFixed(2).padStart(8)
    const valueStr = value.toFixed(2).padStart(10)

    log(`   ${sku} | ${name} | ${qtyStr} | ${costStr} | ${valueStr}`, 'white')
  }

  log('   ' + '─'.repeat(80), 'white')
  log(`   ${'إجمالي'.padEnd(40)} | ${String(totalQty).padStart(6)} |          | ${totalValue.toFixed(2).padStart(10)}`, 'cyan')

  return {
    companyName: company.name,
    productsCount: products.length,
    totalQty,
    totalValue
  }
}

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('🔍 فحص مخزون المنتجات', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  const companyNames = process.argv.slice(2)
  
  if (companyNames.length === 0) {
    companyNames.push('VitaSlims', 'FOODCAN')
  }

  const results = []

  for (const companyName of companyNames) {
    const result = await analyzeCompany(companyName)
    if (result) results.push(result)
  }

  // ملخص نهائي
  log('\n' + '='.repeat(80), 'cyan')
  log('📊 الملخص النهائي', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  for (const result of results) {
    log(`🏢 ${result.companyName}:`, 'cyan')
    log(`   عدد المنتجات: ${result.productsCount}`, 'white')
    log(`   إجمالي الكمية: ${result.totalQty}`, 'white')
    log(`   إجمالي القيمة: ${result.totalValue.toFixed(2)} جنيه`, 'white')
    log('', 'white')
  }
}

main()

