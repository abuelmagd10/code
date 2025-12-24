#!/usr/bin/env node

/**
 * تحليل المشتريات مقابل دفعات FIFO
 * Analyze Purchases vs FIFO Lots
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

  // 1. حساب إجمالي المشتريات من حركات المخزون
  const { data: purchaseTransactions } = await supabase
    .from('inventory_transactions')
    .select('quantity_change, unit_cost')
    .eq('company_id', company.id)
    .eq('transaction_type', 'purchase')

  let totalPurchaseQty = 0
  let totalPurchaseValue = 0

  for (const trans of purchaseTransactions || []) {
    const qty = Number(trans.quantity_change || 0)
    const cost = Number(trans.unit_cost || 0)
    totalPurchaseQty += qty
    totalPurchaseValue += qty * cost
  }

  log('\n1️⃣  إجمالي المشتريات من حركات المخزون:', 'yellow')
  log(`   📦 الكمية: ${totalPurchaseQty}`, 'white')
  log(`   💰 القيمة: ${totalPurchaseValue.toFixed(2)} جنيه`, 'white')

  // 2. حساب إجمالي المبيعات من حركات المخزون
  const { data: salesTransactions } = await supabase
    .from('inventory_transactions')
    .select('quantity_change, unit_cost')
    .eq('company_id', company.id)
    .eq('transaction_type', 'sale')

  let totalSalesQty = 0
  let totalSalesValue = 0

  for (const trans of salesTransactions || []) {
    const qty = Math.abs(Number(trans.quantity_change || 0))
    const cost = Number(trans.unit_cost || 0)
    totalSalesQty += qty
    totalSalesValue += qty * cost
  }

  log('\n2️⃣  إجمالي المبيعات من حركات المخزون:', 'yellow')
  log(`   📦 الكمية: ${totalSalesQty}`, 'white')
  log(`   💰 القيمة (COGS): ${totalSalesValue.toFixed(2)} جنيه`, 'white')

  // 3. حساب المخزون المتبقي من الحركات
  const expectedRemainingQty = totalPurchaseQty - totalSalesQty
  const expectedRemainingValue = totalPurchaseValue - totalSalesValue

  log('\n3️⃣  المخزون المتوقع من الحركات:', 'yellow')
  log(`   📦 الكمية: ${expectedRemainingQty}`, 'white')
  log(`   💰 القيمة: ${expectedRemainingValue.toFixed(2)} جنيه`, 'white')

  // 4. حساب المخزون الفعلي من FIFO
  const { data: fifoLots } = await supabase
    .from('fifo_cost_lots')
    .select('remaining_quantity, unit_cost')
    .eq('company_id', company.id)
    .gt('remaining_quantity', 0)

  let actualQty = 0
  let actualValue = 0

  for (const lot of fifoLots || []) {
    const qty = Number(lot.remaining_quantity || 0)
    const cost = Number(lot.unit_cost || 0)
    actualQty += qty
    actualValue += qty * cost
  }

  log('\n4️⃣  المخزون الفعلي من FIFO:', 'yellow')
  log(`   📦 الكمية: ${actualQty}`, 'white')
  log(`   💰 القيمة: ${actualValue.toFixed(2)} جنيه`, 'white')

  // 5. المقارنة
  log('\n5️⃣  المقارنة:', 'yellow')
  log(`   📊 فرق الكمية: ${(actualQty - expectedRemainingQty).toFixed(2)}`, 'white')
  log(`   📊 فرق القيمة: ${(actualValue - expectedRemainingValue).toFixed(2)}`, actualValue === expectedRemainingValue ? 'green' : 'red')

  // 6. حساب قيود المخزون المحاسبية
  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company.id)
    .eq('sub_type', 'inventory')
    .single()

  if (inventoryAccount) {
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount, credit_amount, journal_entries!inner(is_deleted)')
      .eq('account_id', inventoryAccount.id)

    let accountingBalance = 0
    for (const line of lines || []) {
      if (line.journal_entries?.is_deleted) continue
      accountingBalance += Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
    }

    log('\n6️⃣  الرصيد المحاسبي:', 'yellow')
    log(`   💰 الرصيد: ${accountingBalance.toFixed(2)} جنيه`, 'white')
    log(`   📊 الفرق مع FIFO: ${(accountingBalance - actualValue).toFixed(2)}`, accountingBalance === actualValue ? 'green' : 'red')
    log(`   📊 الفرق مع المتوقع: ${(accountingBalance - expectedRemainingValue).toFixed(2)}`, accountingBalance === expectedRemainingValue ? 'green' : 'red')
  }

  return {
    companyName: company.name,
    totalPurchaseValue,
    totalSalesValue,
    expectedRemainingValue,
    actualValue,
    gap: actualValue - expectedRemainingValue
  }
}

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('🔍 تحليل المشتريات مقابل دفعات FIFO', 'cyan')
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
    log(`   إجمالي المشتريات: ${result.totalPurchaseValue.toFixed(2)}`, 'white')
    log(`   إجمالي المبيعات (COGS): ${result.totalSalesValue.toFixed(2)}`, 'white')
    log(`   المتوقع: ${result.expectedRemainingValue.toFixed(2)}`, 'white')
    log(`   الفعلي (FIFO): ${result.actualValue.toFixed(2)}`, 'white')
    log(`   الفرق: ${result.gap.toFixed(2)}`, result.gap === 0 ? 'green' : 'red')
    log('', 'white')
  }
}

main()

