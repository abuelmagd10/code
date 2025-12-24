#!/usr/bin/env node

/**
 * إصلاح حساب COGS في VitaSlims
 * Fix COGS Account in VitaSlims
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
  log('🔧 إصلاح حساب COGS في VitaSlims', 'cyan')
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

  // البحث عن حساب COGS غير نشط
  const { data: inactiveCogsAccount } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('company_id', company.id)
    .eq('account_code', '5000')
    .eq('is_active', false)
    .single()

  if (inactiveCogsAccount) {
    log('1️⃣  وجدت حساب COGS غير نشط (5000 - تكلفة البضائع المباعة)', 'yellow')
    log('   سأقوم بتفعيله...', 'yellow')

    // تفعيل الحساب
    const { error } = await supabase
      .from('chart_of_accounts')
      .update({ 
        is_active: true,
        sub_type: 'cogs'
      })
      .eq('id', inactiveCogsAccount.id)

    if (error) {
      log(`   ❌ خطأ في تفعيل الحساب: ${error.message}`, 'red')
      return
    }

    log('   ✅ تم تفعيل حساب COGS بنجاح!', 'green')
    log(`      - الكود: ${inactiveCogsAccount.account_code}`, 'white')
    log(`      - الاسم: ${inactiveCogsAccount.account_name}`, 'white')
    log(`      - المعرف: ${inactiveCogsAccount.id}`, 'white')
  } else {
    // البحث عن أي حساب COGS نشط
    const { data: activeCogsAccount } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('company_id', company.id)
      .eq('sub_type', 'cogs')
      .eq('is_active', true)
      .single()

    if (activeCogsAccount) {
      log('✅ حساب COGS نشط موجود بالفعل!', 'green')
      log(`   - الكود: ${activeCogsAccount.account_code}`, 'white')
      log(`   - الاسم: ${activeCogsAccount.account_name}`, 'white')
      log(`   - المعرف: ${activeCogsAccount.id}`, 'white')
    } else {
      log('1️⃣  لم يتم العثور على حساب COGS', 'yellow')
      log('   سأقوم بإنشاء حساب جديد...', 'yellow')

      // إنشاء حساب COGS جديد
      const { data: newAccount, error } = await supabase
        .from('chart_of_accounts')
        .insert({
          company_id: company.id,
          account_code: '5001',
          account_name: 'تكلفة البضاعة المباعة',
          account_type: 'expense',
          sub_type: 'cogs',
          is_active: true,
          is_system: false
        })
        .select()
        .single()

      if (error) {
        log(`   ❌ خطأ في إنشاء الحساب: ${error.message}`, 'red')
        return
      }

      log('   ✅ تم إنشاء حساب COGS بنجاح!', 'green')
      log(`      - الكود: ${newAccount.account_code}`, 'white')
      log(`      - الاسم: ${newAccount.account_name}`, 'white')
      log(`      - المعرف: ${newAccount.id}`, 'white')
    }
  }

  log('\n' + '='.repeat(80), 'cyan')
  log('✅ اكتمل الإصلاح بنجاح!', 'green')
  log('='.repeat(80), 'cyan')
  log('\n💡 الخطوة التالية:', 'yellow')
  log('   npm run inventory:fix VitaSlims\n', 'cyan')
}

main()

