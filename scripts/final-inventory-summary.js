#!/usr/bin/env node

/**
 * ملخص نهائي شامل للمخزون
 * Final Comprehensive Inventory Summary
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

  // 1. الرصيد المحاسبي
  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .eq('sub_type', 'inventory')
    .single()

  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select(`
      debit_amount,
      credit_amount,
      journal_entries!inner(reference_type, is_deleted)
    `)
    .eq('account_id', inventoryAccount.id)

  let accountingBalance = 0
  const byType = {}

  for (const line of lines || []) {
    if (line.journal_entries?.is_deleted) continue
    
    const type = line.journal_entries.reference_type
    const debit = Number(line.debit_amount || 0)
    const credit = Number(line.credit_amount || 0)
    const net = debit - credit

    if (!byType[type]) byType[type] = 0
    byType[type] += net
    accountingBalance += net
  }

  log('\n1️⃣  الرصيد المحاسبي:', 'yellow')
  for (const [type, amount] of Object.entries(byType)) {
    log(`   ${type.padEnd(30)}: ${amount.toFixed(2).padStart(12)}`, 'white')
  }
  log(`   ${'─'.repeat(44)}`, 'white')
  log(`   ${'إجمالي'.padEnd(30)}: ${accountingBalance.toFixed(2).padStart(12)}`, 'cyan')

  // 2. قيمة المخزون من المنتجات
  const { data: products } = await supabase
    .from('products')
    .select('sku, name, quantity_on_hand, cost_price')
    .eq('company_id', company.id)
    .or('item_type.is.null,item_type.eq.product')
    .gt('quantity_on_hand', 0)

  let productsValue = 0
  for (const product of products || []) {
    productsValue += Number(product.quantity_on_hand || 0) * Number(product.cost_price || 0)
  }

  log('\n2️⃣  قيمة المخزون من المنتجات:', 'yellow')
  log(`   عدد المنتجات: ${products?.length || 0}`, 'white')
  log(`   القيمة الإجمالية: ${productsValue.toFixed(2)} جنيه`, 'cyan')

  // 3. الفرق
  const gap = productsValue - accountingBalance

  log('\n3️⃣  التحليل:', 'yellow')
  log(`   الرصيد المحاسبي: ${accountingBalance.toFixed(2)} جنيه`, 'white')
  log(`   قيمة المنتجات: ${productsValue.toFixed(2)} جنيه`, 'white')
  log(`   الفرق: ${gap.toFixed(2)} جنيه`, Math.abs(gap) < 100 ? 'green' : 'red')

  // 4. التفسير
  log('\n4️⃣  التفسير:', 'yellow')
  
  if (Math.abs(gap) < 100) {
    log(`   ✅ الرصيد المحاسبي يطابق قيمة المخزون`, 'green')
  } else if (gap > 0) {
    log(`   ⚠️  قيمة المخزون أكبر من الرصيد المحاسبي بـ ${gap.toFixed(2)} جنيه`, 'red')
    log(`   السبب المحتمل:`, 'yellow')
    log(`   - أسعار التكلفة في جدول المنتجات أعلى من الواقع`, 'white')
    log(`   - أو هناك مشتريات لم تُسجل محاسبياً`, 'white')
    log(`   - أو قيود COGS زائدة`, 'white')
  } else {
    log(`   ⚠️  الرصيد المحاسبي أكبر من قيمة المخزون بـ ${Math.abs(gap).toFixed(2)} جنيه`, 'red')
    log(`   السبب المحتمل:`, 'yellow')
    log(`   - أسعار التكلفة في جدول المنتجات أقل من الواقع`, 'white')
    log(`   - أو هناك قيود شراء زائدة`, 'white')
  }

  // 5. الحل المقترح
  log('\n5️⃣  الحل المقترح:', 'yellow')
  
  if (Math.abs(gap) >= 100) {
    log(`   📝 إنشاء قيد تسوية مخزون بقيمة ${gap.toFixed(2)} جنيه`, 'cyan')
    log(`   هذا سيجعل الرصيد المحاسبي يطابق قيمة المخزون الفعلية`, 'white')
    log(``, 'white')
    log(`   لتنفيذ التسوية، استخدم:`, 'yellow')
    log(`   node scripts/create-inventory-adjustment.js ${companyName} --execute`, 'green')
  }

  return {
    companyName: company.name,
    accountingBalance,
    productsValue,
    gap
  }
}

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('📊 ملخص نهائي شامل للمخزون', 'cyan')
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
    log(`   الرصيد المحاسبي: ${result.accountingBalance.toFixed(2)}`, 'white')
    log(`   قيمة المنتجات: ${result.productsValue.toFixed(2)}`, 'white')
    log(`   الفرق: ${result.gap.toFixed(2)}`, Math.abs(result.gap) < 100 ? 'green' : 'red')
    
    if (Math.abs(result.gap) >= 100) {
      log(`   الحالة: يحتاج تسوية ⚠️`, 'yellow')
    } else {
      log(`   الحالة: متوازن ✅`, 'green')
    }
    log('', 'white')
  }
}

main()

