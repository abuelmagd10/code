/**
 * 🔧 تنفيذ Migration: إضافة حقول العملات لجدول journal_entry_lines
 * Script: execute-migration-201.js
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// تحميل المتغيرات البيئية من .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function executeMigration() {
  try {
    console.log('🔄 بدء تنفيذ Migration: إضافة حقول العملات لجدول journal_entry_lines...\n')

    // قراءة ملف SQL
    const sqlPath = path.join(__dirname, '201_add_currency_fields_to_journal_entry_lines.sql')
    const sqlContent = fs.readFileSync(sqlPath, 'utf8')

    // تنفيذ SQL مباشرة (يحتاج إلى Supabase SQL Editor أو استخدام RPC)
    // بدلاً من ذلك، سنستخدم Supabase REST API لإضافة الأعمدة
    
    console.log('📝 إضافة الأعمدة إلى جدول journal_entry_lines...\n')

    // ملاحظة: Supabase REST API لا يدعم ALTER TABLE مباشرة
    // يجب تنفيذ SQL مباشرة من Supabase Dashboard أو استخدام Supabase CLI
    // أو استخدام Supabase RPC function

    console.log('⚠️  هذا السكربت يحتاج إلى تنفيذ SQL مباشرة من Supabase Dashboard')
    console.log('📋 يرجى تنفيذ محتوى ملف scripts/201_add_currency_fields_to_journal_entry_lines.sql')
    console.log('   من Supabase Dashboard > SQL Editor\n')

    console.log('✅ تم إعداد Migration script')
    console.log('📝 يرجى تنفيذ SQL من Supabase Dashboard')

  } catch (error) {
    console.error('❌ خطأ في تنفيذ Migration:', error)
    process.exit(1)
  }
}

// تشغيل Migration
executeMigration()
  .then(() => {
    console.log('\n✅ اكتمل الإعداد')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ فشل الإعداد:', error)
    process.exit(1)
  })

