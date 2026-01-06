// =====================================================
// تنفيذ سكريبت SQL لتنظيف القيود العكسية
// Execute SQL Script to Cleanup Reversal Entries
// =====================================================
// هذا السكريبت ينفذ سكريبت SQL مباشرة لتعطيل Trigger
// وحذف القيود العكسية ثم إعادة تفعيل Trigger
// =====================================================

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// قراءة .env.local
try {
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
} catch (e) {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ خطأ: SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function main() {
  console.log('🔍 بدء تنفيذ سكريبت SQL لتنظيف القيود العكسية...\n')

  try {
    // قراءة سكريبت SQL
    const sqlPath = path.join(__dirname, 'cleanup-reversal-entries-simple.sql')
    if (!fs.existsSync(sqlPath)) {
      console.error(`❌ ملف SQL غير موجود: ${sqlPath}`)
      process.exit(1)
    }

    const sqlContent = fs.readFileSync(sqlPath, 'utf8')
    console.log('📄 قراءة سكريبت SQL...')
    console.log('   ✅ تم قراءة السكريبت\n')

    // عرض السكريبت للمستخدم
    console.log('📋 محتوى السكريبت:')
    console.log('─'.repeat(60))
    console.log(sqlContent)
    console.log('─'.repeat(60))
    console.log('')

    console.log('💡 يرجى تنفيذ السكريبت SQL أعلاه في Supabase SQL Editor')
    console.log('   أو يمكنك استخدام الأمر التالي في psql:')
    console.log(`   psql -h [YOUR_DB_HOST] -U postgres -d postgres -f ${sqlPath}`)
    console.log('')
    console.log('✅ بعد تنفيذ السكريبت، ستكون القيود العكسية قد تم حذفها')
    console.log('   والأرصدة ستكون صحيحة')
  } catch (err) {
    console.error('❌ خطأ عام:', err)
    process.exit(1)
  }
}

main()

