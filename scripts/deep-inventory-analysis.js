#!/usr/bin/env node

/**
 * تحليل عميق للفرق بين الرصيد المحاسبي وقيمة FIFO
 * Deep Analysis of Inventory Balance vs FIFO Value Gap
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

async function analyzeCompany(companyId, companyName) {
  log(`\n${'='.repeat(80)}`, 'cyan')
  log(`🏢 الشركة: ${companyName}`, 'cyan')
  log('='.repeat(80), 'cyan')

  // 1. حساب رصيد المخزون المحاسبي
  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', companyId)
    .eq('sub_type', 'inventory')
    .eq('is_active', true)
    .single()

  if (!inventoryAccount) {
    log('\n❌ حساب المخزون غير موجود', 'red')
    return
  }

  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select(`
      debit_amount,
      credit_amount,
      journal_entries!inner(
        reference_type,
        is_deleted
      )
    `)
    .eq('account_id', inventoryAccount.id)

  let accountingBalance = 0
  const byType = {}

  for (const line of lines || []) {
    if (line.journal_entries?.is_deleted) continue

    const type = line.journal_entries?.reference_type || 'unknown'
    const debit = Number(line.debit_amount || 0)
    const credit = Number(line.credit_amount || 0)

    if (!byType[type]) {
      byType[type] = { debit: 0, credit: 0, net: 0 }
    }

    byType[type].debit += debit
    byType[type].credit += credit
    byType[type].net += debit - credit

    accountingBalance += debit - credit
  }

  log('\n1️⃣  رصيد المخزون المحاسبي:', 'yellow')
  log('   ' + '─'.repeat(70), 'white')
  for (const [type, data] of Object.entries(byType)) {
    log(`   ${type.padEnd(25)}: ${data.net.toFixed(2).padStart(12)}`, 'white')
  }
  log('   ' + '─'.repeat(70), 'white')
  log(`   ${'إجمالي'.padEnd(25)}: ${accountingBalance.toFixed(2).padStart(12)}`, 'cyan')

  // 2. حساب قيمة FIFO
  const { data: fifoLots } = await supabase
    .from('fifo_cost_lots')
    .select('product_id, remaining_quantity, unit_cost, products!inner(sku, name)')
    .eq('company_id', companyId)
    .gt('remaining_quantity', 0)

  let fifoValue = 0
  const productValues = []

  for (const lot of fifoLots || []) {
    const value = Number(lot.remaining_quantity || 0) * Number(lot.unit_cost || 0)
    fifoValue += value
    
    const existing = productValues.find(p => p.product_id === lot.product_id)
    if (existing) {
      existing.quantity += Number(lot.remaining_quantity || 0)
      existing.value += value
    } else {
      productValues.push({
        product_id: lot.product_id,
        sku: lot.products?.sku,
        name: lot.products?.name,
        quantity: Number(lot.remaining_quantity || 0),
        value: value
      })
    }
  }

  log('\n2️⃣  قيمة المخزون من FIFO:', 'yellow')
  log(`   💰 إجمالي قيمة FIFO: ${fifoValue.toFixed(2)} جنيه`, 'cyan')
  log(`   📦 عدد المنتجات: ${productValues.length}`, 'white')

  // 3. الفرق
  const gap = accountingBalance - fifoValue
  log('\n3️⃣  الفرق:', 'yellow')
  log(`   📊 الرصيد المحاسبي: ${accountingBalance.toFixed(2)}`, 'cyan')
  log(`   📊 قيمة FIFO: ${fifoValue.toFixed(2)}`, 'cyan')
  log(`   📊 الفرق: ${gap.toFixed(2)}`, gap >= 0 ? 'green' : 'red')

  if (Math.abs(gap) > 100) {
    log('\n4️⃣  تحليل الفرق:', 'yellow')
    
    // التحقق من الرصيد الافتتاحي
    const { data: openingBalance } = await supabase
      .from('journal_entries')
      .select(`
        id,
        journal_entry_lines!inner(
          debit_amount,
          credit_amount,
          account_id
        )
      `)
      .eq('company_id', companyId)
      .eq('reference_type', 'opening_balance')
      .eq('is_deleted', false)

    let openingValue = 0
    for (const entry of openingBalance || []) {
      for (const line of entry.journal_entry_lines || []) {
        if (line.account_id === inventoryAccount.id) {
          openingValue += Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
        }
      }
    }

    log(`   💰 الرصيد الافتتاحي: ${openingValue.toFixed(2)}`, openingValue > 0 ? 'green' : 'white')

    // حساب صافي الحركات
    const netMovements = accountingBalance - openingValue
    log(`   📊 صافي الحركات: ${netMovements.toFixed(2)}`, 'white')
    log(`   📊 قيمة FIFO الحالية: ${fifoValue.toFixed(2)}`, 'white')
    log(`   📊 الفرق بعد الافتتاحي: ${(netMovements - fifoValue).toFixed(2)}`, 'white')

    // التحقق من حركات المخزون بدون قيود
    const { data: transactions } = await supabase
      .from('inventory_transactions')
      .select('id, transaction_type, quantity_change, journal_entry_id')
      .eq('company_id', companyId)

    let transactionsWithoutJournal = 0
    for (const trans of transactions || []) {
      if (!trans.journal_entry_id) {
        transactionsWithoutJournal++
      }
    }

    if (transactionsWithoutJournal > 0) {
      log(`   ⚠️  حركات مخزون بدون قيود: ${transactionsWithoutJournal}`, 'red')
    }
  }

  return {
    companyName,
    accountingBalance,
    fifoValue,
    gap,
    productCount: productValues.length
  }
}

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('🔍 تحليل عميق للفرق بين الرصيد المحاسبي وقيمة FIFO', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  const companyNames = process.argv.slice(2)
  
  if (companyNames.length === 0) {
    companyNames.push('VitaSlims', 'FOODCAN')
  }

  const results = []

  for (const companyName of companyNames) {
    const { data: company } = await supabase
      .from('companies')
      .select('id, name')
      .ilike('name', `%${companyName}%`)
      .limit(1)
      .single()

    if (company) {
      const result = await analyzeCompany(company.id, company.name)
      if (result) results.push(result)
    }
  }

  // ملخص نهائي
  log('\n' + '='.repeat(80), 'cyan')
  log('📊 الملخص النهائي', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  for (const result of results) {
    log(`🏢 ${result.companyName}:`, 'cyan')
    log(`   الرصيد المحاسبي: ${result.accountingBalance.toFixed(2)}`, 'white')
    log(`   قيمة FIFO: ${result.fifoValue.toFixed(2)}`, 'white')
    log(`   الفرق: ${result.gap.toFixed(2)}`, result.gap >= -100 && result.gap <= 100 ? 'green' : 'red')
    log('', 'white')
  }
}

main()

