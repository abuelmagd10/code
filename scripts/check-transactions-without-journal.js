#!/usr/bin/env node

/**
 * فحص حركات المخزون بدون قيود محاسبية
 * Check Inventory Transactions Without Journal Entries
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

  // جلب حركات المخزون بدون قيود
  const { data: transactions } = await supabase
    .from('inventory_transactions')
    .select(`
      id,
      transaction_type,
      quantity_change,
      unit_cost,
      transaction_date,
      journal_entry_id,
      products!inner(sku, name),
      invoices(invoice_number),
      bills(bill_number)
    `)
    .eq('company_id', company.id)
    .is('journal_entry_id', null)
    .order('transaction_date', { ascending: true })

  log(`\n📊 عدد الحركات بدون قيود: ${transactions?.length || 0}\n`, 'yellow')

  if (!transactions || transactions.length === 0) {
    log('✅ جميع الحركات لها قيود محاسبية', 'green')
    return
  }

  // تجميع حسب النوع
  const byType = {}
  let totalValue = 0

  for (const trans of transactions) {
    const type = trans.transaction_type
    const qty = Number(trans.quantity_change || 0)
    const cost = Number(trans.unit_cost || 0)
    const value = qty * cost

    if (!byType[type]) {
      byType[type] = { count: 0, totalQty: 0, totalValue: 0, transactions: [] }
    }

    byType[type].count++
    byType[type].totalQty += qty
    byType[type].totalValue += value
    byType[type].transactions.push(trans)

    totalValue += value
  }

  log('📋 تجميع حسب النوع:', 'yellow')
  log('   ' + '─'.repeat(70), 'white')
  log('   النوع                    | العدد | الكمية | القيمة', 'white')
  log('   ' + '─'.repeat(70), 'white')

  for (const [type, data] of Object.entries(byType)) {
    log(`   ${type.padEnd(25)}| ${String(data.count).padStart(5)} | ${String(data.totalQty).padStart(6)} | ${data.totalValue.toFixed(2).padStart(10)}`, 'white')
  }

  log('   ' + '─'.repeat(70), 'white')
  log(`   ${'إجمالي'.padEnd(25)}| ${String(transactions.length).padStart(5)} |        | ${totalValue.toFixed(2).padStart(10)}`, 'cyan')

  // عرض تفاصيل كل نوع
  for (const [type, data] of Object.entries(byType)) {
    log(`\n📦 ${type} (${data.count} حركة):`, 'yellow')
    
    for (const trans of data.transactions.slice(0, 10)) {
      const qty = Number(trans.quantity_change || 0)
      const cost = Number(trans.unit_cost || 0)
      const value = qty * cost
      
      log(`   - ${trans.transaction_date} | ${trans.products?.sku || 'N/A'} | ${trans.products?.name || 'N/A'}`, 'white')
      log(`     الكمية: ${qty} | التكلفة: ${cost} | القيمة: ${value.toFixed(2)}`, 'white')
      
      if (trans.invoices?.invoice_number) {
        log(`     الفاتورة: ${trans.invoices.invoice_number}`, 'white')
      }
      if (trans.bills?.bill_number) {
        log(`     فاتورة الشراء: ${trans.bills.bill_number}`, 'white')
      }
    }

    if (data.transactions.length > 10) {
      log(`   ... و ${data.transactions.length - 10} حركة أخرى`, 'white')
    }
  }

  return {
    companyName: company.name,
    transactionsCount: transactions.length,
    totalValue,
    byType
  }
}

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('🔍 فحص حركات المخزون بدون قيود محاسبية', 'cyan')
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
    log(`   عدد الحركات بدون قيود: ${result.transactionsCount}`, 'white')
    log(`   القيمة الإجمالية: ${result.totalValue.toFixed(2)} جنيه`, 'white')
    log('', 'white')
  }
}

main()

