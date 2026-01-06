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
    const sqlPath = path.join(__dirname, 'cleanup-payment-edit-reversal-entries.sql')
    if (!fs.existsSync(sqlPath)) {
      console.error(`❌ ملف SQL غير موجود: ${sqlPath}`)
      process.exit(1)
    }

    const sqlContent = fs.readFileSync(sqlPath, 'utf8')
    console.log('📄 قراءة سكريبت SQL...')

    // تنفيذ SQL مباشرة عبر RPC
    console.log('🚀 تنفيذ سكريبت SQL...')
    
    // تقسيم SQL إلى أوامر منفصلة
    const sqlStatements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'))

    for (const statement of sqlStatements) {
      if (statement.includes('DO $$')) {
        // تنفيذ كتلة DO كاملة
        const { error } = await supabase.rpc('exec_sql', {
          sql_query: sqlContent
        })
        
        if (error) {
          console.error('❌ خطأ في تنفيذ SQL:', error.message)
          // محاولة تنفيذ مباشرة عبر REST API
          try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Prefer': 'return=representation'
              },
              body: JSON.stringify({
                sql_query: sqlContent
              })
            })
            
            if (!response.ok) {
              const errorText = await response.text()
              throw new Error(`HTTP ${response.status}: ${errorText}`)
            }
            
            console.log('✅ تم تنفيذ سكريبت SQL بنجاح')
          } catch (fetchErr) {
            console.error('❌ فشل تنفيذ SQL:', fetchErr.message)
            console.log('\n💡 يرجى تنفيذ السكريبت SQL يدوياً:')
            console.log('   scripts/cleanup-payment-edit-reversal-entries.sql')
            process.exit(1)
          }
        } else {
          console.log('✅ تم تنفيذ سكريبت SQL بنجاح')
        }
        break
      }
    }

    console.log('\n✅ تم الانتهاء من تنظيف القيود العكسية')
    console.log('💡 الأرصدة الآن يجب أن تكون صحيحة')
  } catch (err) {
    console.error('❌ خطأ عام:', err)
    process.exit(1)
  }
}

main()
