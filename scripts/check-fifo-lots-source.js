#!/usr/bin/env node

/**
 * فحص مصدر دفعات FIFO
 * Check FIFO Lots Source
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

  // جلب جميع دفعات FIFO
  const { data: fifoLots } = await supabase
    .from('fifo_cost_lots')
    .select(`
      id,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      created_at,
      source_type,
      source_id,
      products!inner(sku, name),
      bills(bill_number),
      invoices(invoice_number)
    `)
    .eq('company_id', company.id)
    .gt('remaining_quantity', 0)
    .order('created_at', { ascending: true })

  log(`\n📊 عدد دفعات FIFO النشطة: ${fifoLots?.length || 0}\n`, 'yellow')

  if (!fifoLots || fifoLots.length === 0) {
    log('✅ لا توجد دفعات FIFO', 'green')
    return
  }

  // تجميع حسب المصدر
  const bySource = {}
  let totalValue = 0
  let lotsWithoutSource = 0

  for (const lot of fifoLots) {
    const source = lot.source_type || 'unknown'
    const qty = Number(lot.remaining_quantity || 0)
    const cost = Number(lot.unit_cost || 0)
    const value = qty * cost

    if (!bySource[source]) {
      bySource[source] = { count: 0, totalQty: 0, totalValue: 0, lots: [] }
    }

    bySource[source].count++
    bySource[source].totalQty += qty
    bySource[source].totalValue += value
    bySource[source].lots.push(lot)

    totalValue += value

    if (!lot.source_type || !lot.source_id) {
      lotsWithoutSource++
    }
  }

  log('📋 تجميع حسب المصدر:', 'yellow')
  log('   ' + '─'.repeat(70), 'white')
  log('   المصدر                  | العدد | الكمية | القيمة', 'white')
  log('   ' + '─'.repeat(70), 'white')

  for (const [source, data] of Object.entries(bySource)) {
    log(`   ${source.padEnd(25)}| ${String(data.count).padStart(5)} | ${String(data.totalQty).padStart(6)} | ${data.totalValue.toFixed(2).padStart(10)}`, 'white')
  }

  log('   ' + '─'.repeat(70), 'white')
  log(`   ${'إجمالي'.padEnd(25)}| ${String(fifoLots.length).padStart(5)} |        | ${totalValue.toFixed(2).padStart(10)}`, 'cyan')

  if (lotsWithoutSource > 0) {
    log(`\n⚠️  دفعات بدون مصدر: ${lotsWithoutSource}`, 'red')
  }

  // عرض تفاصيل كل مصدر
  for (const [source, data] of Object.entries(bySource)) {
    log(`\n📦 ${source} (${data.count} دفعة):`, 'yellow')
    
    for (const lot of data.lots.slice(0, 10)) {
      const qty = Number(lot.remaining_quantity || 0)
      const cost = Number(lot.unit_cost || 0)
      const value = qty * cost
      
      log(`   - ${lot.products?.sku || 'N/A'} | ${lot.products?.name || 'N/A'}`, 'white')
      log(`     الكمية: ${qty} | التكلفة: ${cost} | القيمة: ${value.toFixed(2)}`, 'white')
      log(`     التاريخ: ${lot.created_at}`, 'white')
      
      if (lot.bills?.bill_number) {
        log(`     فاتورة الشراء: ${lot.bills.bill_number}`, 'white')
      }
      if (lot.invoices?.invoice_number) {
        log(`     الفاتورة: ${lot.invoices.invoice_number}`, 'white')
      }
      if (!lot.source_type || !lot.source_id) {
        log(`     ⚠️  بدون مصدر!`, 'red')
      }
    }

    if (data.lots.length > 10) {
      log(`   ... و ${data.lots.length - 10} دفعة أخرى`, 'white')
    }
  }

  return {
    companyName: company.name,
    lotsCount: fifoLots.length,
    totalValue,
    lotsWithoutSource,
    bySource
  }
}

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('🔍 فحص مصدر دفعات FIFO', 'cyan')
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
    log(`   عدد الدفعات: ${result.lotsCount}`, 'white')
    log(`   القيمة الإجمالية: ${result.totalValue.toFixed(2)} جنيه`, 'white')
    log(`   دفعات بدون مصدر: ${result.lotsWithoutSource}`, result.lotsWithoutSource > 0 ? 'red' : 'green')
    log('', 'white')
  }
}

main()

