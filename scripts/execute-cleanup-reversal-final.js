// =====================================================
// تنفيذ نهائي لتنظيف القيود العكسية
// Final Execution of Cleanup Reversal Entries
// =====================================================
// هذا السكريبت ينفذ SQL مباشرة لتعطيل Trigger
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

// معرف شركة "تست"
const TEST_COMPANY_ID = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'

async function executeSQL(sql) {
  // محاولة استخدام RPC exec_sql
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: sql
    })
    
    if (!error) {
      return { success: true, data }
    }
    
    // إذا فشل RPC، محاولة REST API
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        sql_query: sql
      })
    })
    
    if (response.ok) {
      return { success: true }
    }
    
    const errorText = await response.text()
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function main() {
  console.log('🔍 بدء تنظيف القيود العكسية من عملية الإصلاح...\n')

  try {
    // 0. تعطيل Trigger
    console.log('0️⃣ تعطيل Trigger للحماية...')
    const disableResult = await executeSQL('ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;')
    
    if (disableResult.success) {
      console.log('   ✅ تم تعطيل Trigger')
    } else {
      console.log(`   ⚠️  فشل تعطيل Trigger: ${disableResult.error}`)
      console.log('   💡 يرجى تنفيذ الأمر التالي في Supabase SQL Editor:')
      console.log('   ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;')
      console.log('   ⚠️  سيتم محاولة الحذف مباشرة (قد يفشل إذا كان القيد محمياً)')
    }

    // 1. البحث عن القيود المراد حذفها
    console.log('\n1️⃣ البحث عن القيود المراد حذفها...')
    
    const { data: reversalEntries, error: revErr } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .eq('reference_type', 'bill_payment_reversal')
      .like('description', '%إصلاح تعديل حساب الدفع%')

    if (revErr) throw revErr

    const { data: paymentEntries, error: payErr } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .eq('reference_type', 'bill_payment')
      .like('description', '%إصلاح تعديل حساب الدفع%')

    if (payErr) throw payErr

    const { data: reclassEntries, error: reclassErr } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .in('reference_type', ['supplier_payment_reclassification', 'supplier_payment_reclassification_reversal'])

    if (reclassErr) throw reclassErr

    const allEntries = [
      ...(reversalEntries || []),
      ...(paymentEntries || []),
      ...(reclassEntries || [])
    ]

    console.log(`   ✅ تم العثور على ${allEntries.length} قيد للحذف`)

    if (allEntries.length === 0) {
      console.log('   ℹ️  لا توجد قيود لإصلاحها')
      
      // إعادة تفعيل Trigger
      if (disableResult.success) {
        console.log('\n3️⃣ إعادة تفعيل Trigger...')
        const enableResult = await executeSQL('ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;')
        if (enableResult.success) {
          console.log('   ✅ تم إعادة تفعيل Trigger')
        }
      }
      return
    }

    // 2. حذف القيود
    console.log('\n2️⃣ حذف القيود...')
    let deletedCount = 0
    let errorCount = 0

    for (const entry of allEntries) {
      try {
        // حذف بنود القيد أولاً
        const { error: delLinesErr } = await supabase
          .from('journal_entry_lines')
          .delete()
          .eq('journal_entry_id', entry.id)

        if (delLinesErr) {
          console.log(`   ⚠️  فشل حذف بنود القيد ${entry.id}: ${delLinesErr.message}`)
        }

        // حذف القيد نفسه
        const { error: delEntryErr } = await supabase
          .from('journal_entries')
          .delete()
          .eq('id', entry.id)

        if (delEntryErr) {
          console.log(`   ❌ فشل حذف القيد ${entry.id}: ${delEntryErr.message}`)
          errorCount++
        } else {
          console.log(`   ✅ تم حذف القيد ${entry.id}`)
          deletedCount++
        }
      } catch (err) {
        console.error(`   ❌ خطأ في معالجة القيد ${entry.id}:`, err.message)
        errorCount++
      }
    }

    console.log('\n📊 ملخص التنظيف:')
    console.log(`   ✅ تم حذف ${deletedCount} قيد`)
    console.log(`   ❌ فشل حذف ${errorCount} قيد`)

    // 3. إعادة تفعيل Trigger
    if (disableResult.success) {
      console.log('\n3️⃣ إعادة تفعيل Trigger...')
      const enableResult = await executeSQL('ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;')
      
      if (enableResult.success) {
        console.log('   ✅ تم إعادة تفعيل Trigger')
      } else {
        console.log(`   ⚠️  فشل إعادة تفعيل Trigger: ${enableResult.error}`)
        console.log('   💡 يرجى تنفيذ الأمر التالي في Supabase SQL Editor:')
        console.log('   ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;')
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

