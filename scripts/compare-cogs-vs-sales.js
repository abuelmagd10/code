#!/usr/bin/env node

/**
 * مقارنة قيود COGS مع حركات البيع الفعلية
 * Compare COGS Entries vs Actual Sales Transactions
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

  // 1. حساب COGS من القيود المحاسبية
  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company.id)
    .eq('sub_type', 'inventory')
    .single()

  const { data: cogsLines } = await supabase
    .from('journal_entry_lines')
    .select(`
      credit_amount,
      journal_entries!inner(
        reference_type,
        reference_id,
        is_deleted
      )
    `)
    .eq('account_id', inventoryAccount.id)
    .in('journal_entries.reference_type', ['invoice_cogs', 'invoice_cogs_reversal'])
    .eq('journal_entries.is_deleted', false)

  let totalCogsFromJournal = 0
  for (const line of cogsLines || []) {
    if (line.journal_entries.reference_type === 'invoice_cogs') {
      totalCogsFromJournal += Number(line.credit_amount || 0)
    } else if (line.journal_entries.reference_type === 'invoice_cogs_reversal') {
      totalCogsFromJournal -= Number(line.credit_amount || 0)
    }
  }

  log(`\n1️⃣  COGS من القيود المحاسبية: ${totalCogsFromJournal.toFixed(2)} جنيه`, 'yellow')

  // 2. حساب COGS من حركات المخزون
  const { data: salesTransactions } = await supabase
    .from('inventory_transactions')
    .select('quantity_change, unit_cost')
    .eq('company_id', company.id)
    .eq('transaction_type', 'sale')

  let totalCogsFromTransactions = 0
  for (const trans of salesTransactions || []) {
    const qty = Math.abs(Number(trans.quantity_change || 0))
    const cost = Number(trans.unit_cost || 0)
    totalCogsFromTransactions += qty * cost
  }

  log(`2️⃣  COGS من حركات المخزون: ${totalCogsFromTransactions.toFixed(2)} جنيه`, 'yellow')

  // 3. المقارنة
  const cogsDiff = totalCogsFromJournal - totalCogsFromTransactions

  log(`\n3️⃣  المقارنة:`, 'yellow')
  log(`   📊 COGS من القيود: ${totalCogsFromJournal.toFixed(2)}`, 'white')
  log(`   📊 COGS من الحركات: ${totalCogsFromTransactions.toFixed(2)}`, 'white')
  log(`   📊 الفرق: ${cogsDiff.toFixed(2)}`, Math.abs(cogsDiff) < 100 ? 'green' : 'red')

  // 4. حساب المشتريات من حركات المخزون
  const { data: purchaseTransactions } = await supabase
    .from('inventory_transactions')
    .select('quantity_change, unit_cost')
    .eq('company_id', company.id)
    .eq('transaction_type', 'purchase')

  let totalPurchasesFromTransactions = 0
  for (const trans of purchaseTransactions || []) {
    const qty = Number(trans.quantity_change || 0)
    const cost = Number(trans.unit_cost || 0)
    totalPurchasesFromTransactions += qty * cost
  }

  log(`\n4️⃣  المشتريات من حركات المخزون: ${totalPurchasesFromTransactions.toFixed(2)} جنيه`, 'yellow')

  // 5. حساب المخزون المتوقع
  const expectedInventory = totalPurchasesFromTransactions - totalCogsFromTransactions

  log(`\n5️⃣  المخزون المتوقع من الحركات:`, 'yellow')
  log(`   📦 المشتريات: ${totalPurchasesFromTransactions.toFixed(2)}`, 'white')
  log(`   📦 المبيعات (COGS): ${totalCogsFromTransactions.toFixed(2)}`, 'white')
  log(`   📦 المتبقي: ${expectedInventory.toFixed(2)}`, 'white')

  // 6. قيمة المخزون الفعلية
  const { data: products } = await supabase
    .from('products')
    .select('quantity_on_hand, cost_price')
    .eq('company_id', company.id)
    .or('item_type.is.null,item_type.eq.product')

  let actualInventoryValue = 0
  for (const product of products || []) {
    const qty = Number(product.quantity_on_hand || 0)
    const cost = Number(product.cost_price || 0)
    actualInventoryValue += qty * cost
  }

  log(`\n6️⃣  قيمة المخزون الفعلية: ${actualInventoryValue.toFixed(2)} جنيه`, 'yellow')

  log(`\n7️⃣  التحليل النهائي:`, 'yellow')
  log(`   📊 الفرق بين المتوقع والفعلي: ${(actualInventoryValue - expectedInventory).toFixed(2)}`, 'red')
  
  // هذا الفرق يمثل المشتريات التي لم تُسجل كحركات مخزون
  const missingPurchases = actualInventoryValue - expectedInventory
  log(`   ⚠️  مشتريات لم تُسجل كحركات: ${missingPurchases.toFixed(2)} جنيه`, 'red')

  return {
    companyName: company.name,
    totalCogsFromJournal,
    totalCogsFromTransactions,
    totalPurchasesFromTransactions,
    expectedInventory,
    actualInventoryValue,
    missingPurchases
  }
}

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('🔍 مقارنة قيود COGS مع حركات البيع الفعلية', 'cyan')
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
    log(`   COGS من القيود: ${result.totalCogsFromJournal.toFixed(2)}`, 'white')
    log(`   COGS من الحركات: ${result.totalCogsFromTransactions.toFixed(2)}`, 'white')
    log(`   المشتريات من الحركات: ${result.totalPurchasesFromTransactions.toFixed(2)}`, 'white')
    log(`   المخزون المتوقع: ${result.expectedInventory.toFixed(2)}`, 'white')
    log(`   المخزون الفعلي: ${result.actualInventoryValue.toFixed(2)}`, 'white')
    log(`   مشتريات لم تُسجل: ${result.missingPurchases.toFixed(2)}`, result.missingPurchases > 100 ? 'red' : 'green')
    log('', 'white')
  }
}

main()

