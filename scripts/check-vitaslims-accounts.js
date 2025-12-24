#!/usr/bin/env node

/**
 * التحقق من حسابات VitaSlims
 * Check VitaSlims Accounts
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
  log('🔍 التحقق من حسابات VitaSlims', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  // جلب شركة VitaSlims
  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('name', 'VitaSlims')
    .single()

  if (!company) {
    log('❌ شركة VitaSlims غير موجودة', 'red')
    return
  }

  log(`🏢 الشركة: ${company.name}`, 'cyan')
  log(`📋 معرف الشركة: ${company.id}\n`, 'cyan')

  // جلب جميع الحسابات
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type, sub_type, is_active')
    .eq('company_id', company.id)
    .order('account_code')

  log(`📊 إجمالي الحسابات: ${accounts?.length || 0}\n`, 'cyan')

  // البحث عن حساب المخزون
  log('1️⃣  البحث عن حساب المخزون...', 'yellow')
  const inventoryAccount = accounts?.find(a => 
    a.sub_type === 'inventory' && a.is_active
  )

  if (inventoryAccount) {
    log(`   ✅ حساب المخزون موجود:`, 'green')
    log(`      - الكود: ${inventoryAccount.account_code}`, 'white')
    log(`      - الاسم: ${inventoryAccount.account_name}`, 'white')
    log(`      - المعرف: ${inventoryAccount.id}`, 'white')
  } else {
    log(`   ❌ حساب المخزون غير موجود`, 'red')
    log(`   💡 يجب إنشاء حساب بـ sub_type = 'inventory'`, 'yellow')
  }

  // البحث عن حساب COGS
  log('\n2️⃣  البحث عن حساب COGS...', 'yellow')
  const cogsAccount = accounts?.find(a => 
    (a.sub_type === 'cogs' || a.sub_type === 'cost_of_goods_sold') && a.is_active
  )

  if (cogsAccount) {
    log(`   ✅ حساب COGS موجود:`, 'green')
    log(`      - الكود: ${cogsAccount.account_code}`, 'white')
    log(`      - الاسم: ${cogsAccount.account_name}`, 'white')
    log(`      - المعرف: ${cogsAccount.id}`, 'white')
  } else {
    log(`   ❌ حساب COGS غير موجود`, 'red')
    log(`   💡 يجب إنشاء حساب بـ sub_type = 'cogs' أو 'cost_of_goods_sold'`, 'yellow')
  }

  // عرض جميع الحسابات حسب النوع
  log('\n3️⃣  جميع الحسابات حسب النوع:', 'yellow')
  
  const accountsByType = {}
  accounts?.forEach(acc => {
    const type = acc.account_type || 'unknown'
    if (!accountsByType[type]) accountsByType[type] = []
    accountsByType[type].push(acc)
  })

  for (const [type, accs] of Object.entries(accountsByType)) {
    log(`\n   📁 ${type.toUpperCase()} (${accs.length} حساب):`, 'cyan')
    accs.forEach(acc => {
      const status = acc.is_active ? '✅' : '❌'
      log(`      ${status} ${acc.account_code} - ${acc.account_name} [${acc.sub_type || 'no sub_type'}]`, 'white')
    })
  }

  // التوصيات
  log('\n' + '='.repeat(80), 'cyan')
  log('💡 التوصيات:', 'yellow')
  log('='.repeat(80), 'cyan')

  if (!inventoryAccount) {
    log('\n1. إنشاء حساب المخزون:', 'yellow')
    log('   - account_code: 1300', 'white')
    log('   - account_name: المخزون', 'white')
    log('   - account_type: asset', 'white')
    log('   - sub_type: inventory', 'white')
  }

  if (!cogsAccount) {
    log('\n2. إنشاء حساب COGS:', 'yellow')
    log('   - account_code: 5100', 'white')
    log('   - account_name: تكلفة البضاعة المباعة', 'white')
    log('   - account_type: expense', 'white')
    log('   - sub_type: cogs', 'white')
  }

  if (!inventoryAccount || !cogsAccount) {
    log('\n3. بعد إنشاء الحسابات، شغل:', 'yellow')
    log('   npm run inventory:fix VitaSlims', 'cyan')
  } else {
    log('\n✅ جميع الحسابات المطلوبة موجودة!', 'green')
    log('   يمكنك تشغيل: npm run inventory:fix VitaSlims', 'cyan')
  }

  log('\n' + '='.repeat(80) + '\n', 'cyan')
}

main()

