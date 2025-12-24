#!/usr/bin/env node

/**
 * إصلاح حساب المخزون الخاطئ
 * Fix Wrong Inventory Account
 * 
 * المشكلة: BILL-0008, BILL-0009, BILL-0010 تستخدم حساب 1140 (vat_input)
 * بدلاً من حساب 1200 (inventory)
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

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('🔧 إصلاح حساب المخزون الخاطئ', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .ilike('name', '%VitaSlims%')
    .single()

  log(`🏢 الشركة: ${company.name}\n`, 'cyan')

  // 1. جلب الحسابين
  const { data: correctAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .eq('account_code', '1200')
    .single()

  const { data: wrongAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .eq('account_code', '1140')
    .single()

  if (!correctAccount || !wrongAccount) {
    log('❌ لم يتم العثور على الحسابات', 'red')
    process.exit(1)
  }

  log(`✅ الحساب الصحيح: ${correctAccount.account_code} - ${correctAccount.account_name}`, 'green')
  log(`❌ الحساب الخاطئ: ${wrongAccount.account_code} - ${wrongAccount.account_name}\n`, 'red')

  // 2. جلب السطور التي تستخدم الحساب الخاطئ
  const { data: wrongLines } = await supabase
    .from('journal_entry_lines')
    .select(`
      id,
      debit_amount,
      credit_amount,
      description,
      journal_entries!inner(
        id,
        reference_type,
        reference_id,
        description,
        is_deleted
      )
    `)
    .eq('account_id', wrongAccount.id)
    .eq('journal_entries.reference_type', 'bill')
    .eq('journal_entries.is_deleted', false)

  log(`📊 عدد السطور التي تحتاج إصلاح: ${wrongLines?.length || 0}\n`, 'yellow')

  if (!wrongLines || wrongLines.length === 0) {
    log('✅ لا توجد سطور تحتاج إصلاح', 'green')
    return
  }

  // 3. عرض السطور
  log('📋 السطور التي سيتم إصلاحها:', 'yellow')
  for (const line of wrongLines) {
    const debit = Number(line.debit_amount || 0)
    const credit = Number(line.credit_amount || 0)
    log(`   - ${line.journal_entries.description}`, 'white')
    log(`     مدين: ${debit.toFixed(2)} | دائن: ${credit.toFixed(2)}`, 'white')
  }

  // 4. التصحيح
  log('\n🔧 جاري التصحيح...', 'yellow')

  let updated = 0
  for (const line of wrongLines) {
    const { error } = await supabase
      .from('journal_entry_lines')
      .update({ account_id: correctAccount.id })
      .eq('id', line.id)

    if (error) {
      log(`   ❌ خطأ في تحديث السطر: ${error.message}`, 'red')
    } else {
      log(`   ✓ تم تحديث: ${line.journal_entries.description}`, 'green')
      updated++
    }
  }

  log(`\n✅ تم تحديث ${updated} سطر بنجاح!`, 'green')

  // 5. التحقق من الرصيد الجديد
  log('\n📊 التحقق من رصيد المخزون الجديد...', 'yellow')

  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount, journal_entries!inner(is_deleted)')
    .eq('account_id', correctAccount.id)

  let balance = 0
  for (const line of lines || []) {
    if (line.journal_entries?.is_deleted) continue
    balance += Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
  }

  log(`   💰 رصيد المخزون الجديد: ${balance.toFixed(2)} جنيه`, balance >= 0 ? 'green' : 'red')

  // حساب قيمة FIFO
  const { data: fifoLots } = await supabase
    .from('fifo_cost_lots')
    .select('remaining_quantity, unit_cost')
    .eq('company_id', company.id)
    .gt('remaining_quantity', 0)

  let fifoValue = 0
  for (const lot of fifoLots || []) {
    fifoValue += Number(lot.remaining_quantity || 0) * Number(lot.unit_cost || 0)
  }

  log(`   💰 قيمة FIFO المحسوبة: ${fifoValue.toFixed(2)} جنيه`, 'cyan')
  log(`   📊 الفرق: ${(balance - fifoValue).toFixed(2)} جنيه`, Math.abs(balance - fifoValue) < 100 ? 'green' : 'yellow')

  log('\n' + '='.repeat(80), 'cyan')
  log('✅ تم إصلاح حساب المخزون بنجاح!', 'green')
  log('='.repeat(80) + '\n', 'cyan')
}

main()

