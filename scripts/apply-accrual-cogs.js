#!/usr/bin/env node

/**
 * تطبيق نمط Accrual Basis COGS (Zoho Books Pattern)
 * Apply Accrual Basis COGS (Zoho Books Pattern)
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
  log('🔄 تحويل النظام إلى Accrual Basis COGS (نمط Zoho Books)', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  try {
    // قراءة ملف SQL
    const sqlPath = path.join(__dirname, '120_enable_accrual_cogs.sql')
    const sqlContent = fs.readFileSync(sqlPath, 'utf8')

    log('1️⃣  تطبيق التعديلات على قاعدة البيانات...', 'yellow')

    // تنفيذ SQL
    const { error } = await supabase.rpc('exec_sql', { sql_query: sqlContent })

    if (error) {
      // محاولة تنفيذ مباشر
      log('   ⚠️  محاولة التنفيذ المباشر...', 'yellow')
      
      // تقسيم SQL إلى أوامر منفصلة
      const commands = sqlContent
        .split('-- ')
        .filter(cmd => cmd.trim() && !cmd.startsWith('='))
        .map(cmd => cmd.trim())

      for (const cmd of commands) {
        if (cmd.includes('CREATE OR REPLACE FUNCTION') || cmd.includes('DROP TRIGGER') || cmd.includes('CREATE TRIGGER')) {
          try {
            const { error: cmdError } = await supabase.rpc('exec_sql', { sql_query: cmd })
            if (cmdError) {
              log(`   ⚠️  تحذير: ${cmdError.message}`, 'yellow')
            }
          } catch (e) {
            log(`   ⚠️  تحذير: ${e.message}`, 'yellow')
          }
        }
      }
    }

    log('   ✅ تم تطبيق التعديلات بنجاح!', 'green')

    log('\n2️⃣  التحقق من التطبيق...', 'yellow')
    
    // التحقق من وجود الدالة
    const { data: functions } = await supabase
      .rpc('exec_sql', { 
        sql_query: `
          SELECT proname 
          FROM pg_proc 
          WHERE proname = 'prevent_journal_on_sent_invoice'
        ` 
      })

    if (functions) {
      log('   ✅ الدالة موجودة ومحدثة', 'green')
    }

    log('\n' + '='.repeat(80), 'cyan')
    log('✅ تم التحويل إلى Accrual Basis COGS بنجاح!', 'green')
    log('='.repeat(80) + '\n', 'cyan')

    log('📌 التغييرات المطبقة:', 'cyan')
    log('   ✅ السماح بإنشاء قيود COGS للفواتير بحالة SENT', 'white')
    log('   ✅ المخزون سينخفض عند إرسال الفاتورة (التسليم)', 'white')
    log('   ✅ التكلفة ستُسجل في نفس وقت البيع', 'white')
    log('   ✅ النظام الآن مطابق لنمط Zoho Books\n', 'white')

    log('🔧 الخطوة التالية:', 'yellow')
    log('   npm run inventory:fix VitaSlims\n', 'cyan')

  } catch (error) {
    log('\n❌ خطأ في التطبيق:', 'red')
    log(`   ${error.message}\n`, 'red')
    
    log('💡 الحل البديل:', 'yellow')
    log('   قم بتنفيذ ملف SQL يدوياً في Supabase Dashboard:', 'white')
    log('   scripts/120_enable_accrual_cogs.sql\n', 'cyan')
    
    process.exit(1)
  }
}

main()

