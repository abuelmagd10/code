#!/usr/bin/env node

/**
 * تحليل رصيد المخزون المحاسبي
 * Analyze Inventory Account Balance
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// قراءة متغيرات البيئة
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

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('📊 تحليل رصيد المخزون المحاسبي', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  const companyName = process.argv[2] || 'VitaSlims'

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .ilike('name', `%${companyName}%`)
    .limit(1)
    .single()

  if (!company) {
    log(`❌ لم يتم العثور على الشركة: ${companyName}`, 'red')
    process.exit(1)
  }

  log(`🏢 الشركة: ${company.name}`, 'cyan')
  log(`📋 معرف الشركة: ${company.id}\n`, 'cyan')

  // 1. جلب حساب المخزون
  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .eq('sub_type', 'inventory')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!inventoryAccount) {
    log('❌ حساب المخزون غير موجود', 'red')
    process.exit(1)
  }

  log(`📌 حساب المخزون: ${inventoryAccount.account_code} - ${inventoryAccount.account_name}\n`, 'cyan')

  // 2. جلب جميع سطور القيود المرتبطة بالمخزون
  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select(`
      id,
      debit_amount,
      credit_amount,
      description,
      journal_entries!inner(
        id,
        entry_date,
        reference_type,
        reference_id,
        description,
        is_deleted
      )
    `)
    .eq('account_id', inventoryAccount.id)
    .order('journal_entries(entry_date)', { ascending: true })

  log(`📊 إجمالي سطور القيود: ${lines?.length || 0}\n`, 'cyan')

  // 3. تحليل القيود حسب النوع
  const byType = {}
  let totalDebit = 0
  let totalCredit = 0
  let balance = 0

  for (const line of lines || []) {
    if (line.journal_entries?.is_deleted) continue

    const type = line.journal_entries?.reference_type || 'unknown'
    const debit = Number(line.debit_amount || 0)
    const credit = Number(line.credit_amount || 0)

    if (!byType[type]) {
      byType[type] = { count: 0, debit: 0, credit: 0, net: 0 }
    }

    byType[type].count++
    byType[type].debit += debit
    byType[type].credit += credit
    byType[type].net += debit - credit

    totalDebit += debit
    totalCredit += credit
    balance += debit - credit
  }

  log('1️⃣  تحليل القيود حسب النوع:', 'yellow')
  log('   ' + '─'.repeat(76), 'white')
  log('   | النوع | العدد | مدين | دائن | الصافي |', 'white')
  log('   ' + '─'.repeat(76), 'white')

  for (const [type, data] of Object.entries(byType)) {
    const typeStr = type.padEnd(20)
    const count = String(data.count).padStart(6)
    const debit = data.debit.toFixed(2).padStart(12)
    const credit = data.credit.toFixed(2).padStart(12)
    const net = data.net.toFixed(2).padStart(12)
    log(`   | ${typeStr} | ${count} | ${debit} | ${credit} | ${net} |`, 'white')
  }

  log('   ' + '─'.repeat(76), 'white')
  log(`   | ${'إجمالي'.padEnd(20)} | ${String(lines?.length || 0).padStart(6)} | ${totalDebit.toFixed(2).padStart(12)} | ${totalCredit.toFixed(2).padStart(12)} | ${balance.toFixed(2).padStart(12)} |`, 'cyan')
  log('   ' + '─'.repeat(76), 'white')

  // 4. عرض أحدث 10 قيود
  log('\n2️⃣  أحدث 10 قيود على حساب المخزون:', 'yellow')
  log('   ' + '─'.repeat(76), 'white')

  const recentLines = lines?.filter(l => !l.journal_entries?.is_deleted).slice(-10) || []
  for (const line of recentLines) {
    const date = line.journal_entries?.entry_date || 'N/A'
    const type = (line.journal_entries?.reference_type || 'unknown').padEnd(20)
    const debit = Number(line.debit_amount || 0).toFixed(2).padStart(10)
    const credit = Number(line.credit_amount || 0).toFixed(2).padStart(10)
    const desc = (line.description || line.journal_entries?.description || '').substring(0, 30)
    log(`   ${date} | ${type} | مدين: ${debit} | دائن: ${credit}`, 'white')
    log(`      ${desc}`, 'white')
  }

  // 5. حساب قيمة المخزون من FIFO
  log('\n3️⃣  مقارنة مع قيمة FIFO:', 'yellow')

  const { data: fifoLots } = await supabase
    .from('fifo_cost_lots')
    .select('remaining_quantity, unit_cost')
    .eq('company_id', company.id)
    .gt('remaining_quantity', 0)

  let fifoValue = 0
  for (const lot of fifoLots || []) {
    fifoValue += Number(lot.remaining_quantity || 0) * Number(lot.unit_cost || 0)
  }

  log(`   💰 رصيد المخزون المحاسبي: ${balance.toFixed(2)} جنيه`, 'cyan')
  log(`   💰 قيمة المخزون من FIFO: ${fifoValue.toFixed(2)} جنيه`, 'cyan')
  log(`   📊 الفرق: ${(balance - fifoValue).toFixed(2)} جنيه`, balance >= fifoValue ? 'green' : 'red')

  if (balance < 0) {
    log('\n⚠️  رصيد المخزون سالب!', 'red')
    log('   السبب المحتمل:', 'yellow')
    log('   1. قيود COGS أكثر من قيود الشراء', 'white')
    log('   2. قيود شراء لم يتم إنشاؤها بشكل صحيح', 'white')
    log('   3. قيود COGS تم إنشاؤها بمبالغ خاطئة', 'white')
  }

  log('\n' + '='.repeat(80), 'cyan')
  log('✅ اكتمل التحليل', 'green')
  log('='.repeat(80) + '\n', 'cyan')
}

main()

