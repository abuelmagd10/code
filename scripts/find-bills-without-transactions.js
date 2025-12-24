#!/usr/bin/env node

/**
 * البحث عن فواتير شراء بدون حركات مخزون
 * Find Bills Without Inventory Transactions
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

  // جلب جميع فواتير الشراء
  const { data: bills } = await supabase
    .from('bills')
    .select(`
      id,
      bill_number,
      bill_date,
      status,
      total_amount,
      bill_items!inner(
        id,
        quantity,
        unit_price,
        products!inner(sku, name)
      )
    `)
    .eq('company_id', company.id)
    .order('bill_date', { ascending: true })

  log(`\n📊 عدد فواتير الشراء: ${bills?.length || 0}\n`, 'yellow')

  let billsWithoutTransactions = []
  let totalMissingValue = 0

  for (const bill of bills || []) {
    // التحقق من وجود حركات مخزون لهذه الفاتورة
    const { data: transactions } = await supabase
      .from('inventory_transactions')
      .select('id, quantity_change, unit_cost')
      .eq('company_id', company.id)
      .eq('bill_id', bill.id)

    if (!transactions || transactions.length === 0) {
      // حساب قيمة الفاتورة من الأصناف
      let billValue = 0
      for (const item of bill.bill_items) {
        billValue += Number(item.quantity || 0) * Number(item.unit_price || 0)
      }

      billsWithoutTransactions.push({
        bill,
        billValue,
        itemsCount: bill.bill_items.length
      })

      totalMissingValue += billValue

      log(`❌ ${bill.bill_number} - ${bill.bill_date} - ${billValue.toFixed(2)} جنيه`, 'red')
      log(`   الحالة: ${bill.status}`, 'white')
      log(`   عدد الأصناف: ${bill.bill_items.length}`, 'white')
      
      for (const item of bill.bill_items.slice(0, 3)) {
        log(`   - ${item.products.sku}: ${item.quantity} × ${item.unit_price} = ${(item.quantity * item.unit_price).toFixed(2)}`, 'white')
      }
      
      if (bill.bill_items.length > 3) {
        log(`   ... و ${bill.bill_items.length - 3} صنف آخر`, 'white')
      }
      log('', 'white')
    } else {
      log(`✅ ${bill.bill_number} - ${bill.total_amount.toFixed(2)} جنيه - ${transactions.length} حركة`, 'green')
    }
  }

  log(`\n${'─'.repeat(80)}`, 'white')
  log(`📊 الملخص:`, 'cyan')
  log(`   إجمالي الفواتير: ${bills?.length || 0}`, 'white')
  log(`   فواتير بدون حركات: ${billsWithoutTransactions.length}`, billsWithoutTransactions.length > 0 ? 'red' : 'green')
  log(`   القيمة المفقودة: ${totalMissingValue.toFixed(2)} جنيه`, totalMissingValue > 0 ? 'red' : 'green')

  return {
    companyName: company.name,
    totalBills: bills?.length || 0,
    billsWithoutTransactions: billsWithoutTransactions.length,
    totalMissingValue,
    bills: billsWithoutTransactions
  }
}

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('🔍 البحث عن فواتير شراء بدون حركات مخزون', 'cyan')
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
    log(`   إجمالي الفواتير: ${result.totalBills}`, 'white')
    log(`   فواتير بدون حركات: ${result.billsWithoutTransactions}`, result.billsWithoutTransactions > 0 ? 'red' : 'green')
    log(`   القيمة المفقودة: ${result.totalMissingValue.toFixed(2)} جنيه`, result.totalMissingValue > 0 ? 'red' : 'green')
    log('', 'white')
  }

  if (results.some(r => r.billsWithoutTransactions > 0)) {
    log('⚠️  يجب إنشاء حركات مخزون لهذه الفواتير!', 'yellow')
    log('   هذا سيصلح الفرق بين الرصيد المحاسبي وقيمة المخزون', 'yellow')
  }
}

main()

