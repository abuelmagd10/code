#!/usr/bin/env node

/**
 * إنشاء قيد افتتاحي للمخزون
 * Create Opening Balance for Inventory
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

async function createOpeningBalance(companyName) {
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

  // 1. حساب قيمة المخزون من المنتجات
  const { data: products } = await supabase
    .from('products')
    .select('quantity_on_hand, cost_price')
    .eq('company_id', company.id)
    .or('item_type.is.null,item_type.eq.product')
    .gt('quantity_on_hand', 0)

  let inventoryValue = 0
  for (const product of products || []) {
    const qty = Number(product.quantity_on_hand || 0)
    const cost = Number(product.cost_price || 0)
    inventoryValue += qty * cost
  }

  log(`\n💰 قيمة المخزون من المنتجات: ${inventoryValue.toFixed(2)} جنيه`, 'cyan')

  // 2. حساب الرصيد المحاسبي الحالي
  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .eq('sub_type', 'inventory')
    .single()

  if (!inventoryAccount) {
    log('❌ حساب المخزون غير موجود', 'red')
    return
  }

  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount, journal_entries!inner(is_deleted)')
    .eq('account_id', inventoryAccount.id)

  let accountingBalance = 0
  for (const line of lines || []) {
    if (line.journal_entries?.is_deleted) continue
    accountingBalance += Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
  }

  log(`💰 الرصيد المحاسبي الحالي: ${accountingBalance.toFixed(2)} جنيه`, 'cyan')

  // 3. حساب الفرق
  const gap = inventoryValue - accountingBalance

  log(`📊 الفرق (الرصيد الافتتاحي المطلوب): ${gap.toFixed(2)} جنيه`, gap > 0 ? 'yellow' : 'green')

  if (Math.abs(gap) < 100) {
    log('\n✅ الفرق صغير جداً - لا حاجة لقيد افتتاحي', 'green')
    return
  }

  // 4. البحث عن حساب رأس المال أو الأرباح المحتجزة
  const { data: equityAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .or('sub_type.eq.retained_earnings,sub_type.eq.owner_equity')
    .limit(1)
    .single()

  if (!equityAccount) {
    log('❌ حساب رأس المال/الأرباح المحتجزة غير موجود', 'red')
    return
  }

  log(`\n📋 سيتم إنشاء قيد افتتاحي:`, 'yellow')
  log(`   مدين: ${inventoryAccount.account_code} - ${inventoryAccount.account_name}: ${gap.toFixed(2)}`, 'white')
  log(`   دائن: ${equityAccount.account_code} - ${equityAccount.account_name}: ${gap.toFixed(2)}`, 'white')

  log(`\n⚠️  هل تريد إنشاء القيد الافتتاحي؟ (y/n)`, 'yellow')
  log(`   هذا سيضيف ${gap.toFixed(2)} جنيه إلى رصيد المخزون`, 'white')

  // في بيئة الإنتاج، يجب طلب تأكيد المستخدم
  // هنا سنعرض فقط ما سيتم فعله

  log(`\n📝 القيد المقترح:`, 'cyan')
  log(`   التاريخ: 2025-01-01 (أول السنة)`, 'white')
  log(`   الوصف: رصيد افتتاحي للمخزون`, 'white')
  log(`   النوع: opening_balance`, 'white')

  return {
    companyName: company.name,
    inventoryValue,
    accountingBalance,
    gap,
    inventoryAccount,
    equityAccount
  }
}

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('🔧 إنشاء قيد افتتاحي للمخزون', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  const companyNames = process.argv.slice(2)
  
  if (companyNames.length === 0) {
    companyNames.push('VitaSlims', 'FOODCAN')
  }

  const results = []

  for (const companyName of companyNames) {
    const result = await createOpeningBalance(companyName)
    if (result) results.push(result)
  }

  // ملخص نهائي
  log('\n' + '='.repeat(80), 'cyan')
  log('📊 الملخص النهائي', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  for (const result of results) {
    log(`🏢 ${result.companyName}:`, 'cyan')
    log(`   قيمة المخزون: ${result.inventoryValue.toFixed(2)}`, 'white')
    log(`   الرصيد المحاسبي: ${result.accountingBalance.toFixed(2)}`, 'white')
    log(`   الرصيد الافتتاحي المطلوب: ${result.gap.toFixed(2)}`, result.gap > 0 ? 'yellow' : 'green')
    log('', 'white')
  }

  log('\n⚠️  ملاحظة: هذا السكربت يعرض فقط ما سيتم فعله', 'yellow')
  log('   لإنشاء القيود فعلياً، يجب تأكيد المستخدم', 'yellow')
}

main()

