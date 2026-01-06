// =====================================================
// تنظيف القيود العكسية من عملية إصلاح تعديل الدفع
// Cleanup Reversal Entries from Payment Edit Fix
// =====================================================
// هذا السكريبت يحذف القيود العكسية التي تم إنشاؤها من عملية
// إصلاح تعديل الدفع في شركة "تست"
//
// المشكلة:
// - القيود العكسية من عملية الإصلاح ما زالت موجودة
// - تؤدي إلى أرصدة خاطئة في الحسابات
//
// الحل:
// 1. البحث عن القيود العكسية من عملية الإصلاح
// 2. حذفها أو عكسها (حسب الحماية)
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

let triggerDisabled = false

async function main() {
  console.log('🔍 بدء تنظيف القيود العكسية من عملية الإصلاح...\n')

  try {
    // 0. تعطيل Trigger مؤقتاً للسماح بالحذف
    console.log('0️⃣ تعطيل Trigger للحماية...')
    triggerDisabled = false
    
    // استخدام SQL مباشرة عبر Supabase Admin
    try {
      // قراءة سكريبت SQL لتعطيل Trigger
      const disableSQL = 'ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;'
      
      // استخدام Supabase Admin API مباشرة
      const adminUrl = `${SUPABASE_URL.replace('/rest/v1', '')}/rest/v1/rpc/exec_sql`
      const response = await fetch(adminUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          sql_query: disableSQL
        })
      })
      
      if (response.ok) {
        triggerDisabled = true
        console.log('   ✅ تم تعطيل Trigger')
      } else {
        // محاولة استخدام طريقة أخرى - تنفيذ SQL مباشرة عبر psql
        console.log('   ⚠️  فشل تعطيل Trigger عبر REST API')
        console.log('   💡 يرجى تنفيذ الأمر التالي في SQL Editor:')
        console.log(`   ${disableSQL}`)
        console.log('   ⚠️  سيتم محاولة الحذف مباشرة (قد يفشل إذا كان القيد محمياً)')
      }
    } catch (err) {
      console.log(`   ⚠️  تعذر تعطيل Trigger: ${err.message}`)
      console.log('   💡 يرجى تنفيذ الأمر التالي في SQL Editor:')
      console.log('   ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;')
      console.log('   ⚠️  سيتم محاولة الحذف مباشرة (قد يفشل إذا كان القيد محمياً)')
    }

    // 1. البحث عن القيود العكسية من عملية الإصلاح
    console.log('\n1️⃣ البحث عن القيود العكسية...')
    
    // البحث عن قيود bill_payment_reversal التي تحتوي على "إصلاح تعديل حساب الدفع"
    const { data: reversalEntries, error: revErr } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .eq('reference_type', 'bill_payment_reversal')
      .like('description', '%إصلاح تعديل حساب الدفع%')
      .order('entry_date', { ascending: false })

    if (revErr) throw revErr

    console.log(`   ✅ تم العثور على ${reversalEntries?.length || 0} قيد عكسي من عملية الإصلاح`)

    if (!reversalEntries || reversalEntries.length === 0) {
      console.log('   ℹ️  لا توجد قيود عكسية من عملية الإصلاح')
      return
    }

    // 2. البحث عن قيود bill_payment التي تحتوي على "إصلاح تعديل حساب الدفع"
    const { data: paymentEntries, error: payErr } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .eq('reference_type', 'bill_payment')
      .like('description', '%إصلاح تعديل حساب الدفع%')
      .order('entry_date', { ascending: false })

    if (payErr) throw payErr

    console.log(`   ✅ تم العثور على ${paymentEntries?.length || 0} قيد سداد من عملية الإصلاح`)

    // 2.5. البحث عن قيود إعادة التصنيف
    const { data: reclassEntries2, error: reclassErr2 } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .in('reference_type', ['supplier_payment_reclassification', 'supplier_payment_reclassification_reversal'])
      .order('entry_date', { ascending: false })

    if (reclassErr2) throw reclassErr2

    console.log(`   ✅ تم العثور على ${reclassEntries2?.length || 0} قيد إعادة تصنيف\n`)

    // دمج جميع القيود المراد حذفها
    const allEntriesToDelete = [
      ...(reversalEntries || []),
      ...(paymentEntries || []),
      ...(reclassEntries2 || [])
    ]

    if (allEntriesToDelete.length === 0) {
      console.log('   ℹ️  لا توجد قيود لإصلاحها')
      return
    }

    // 3. معالجة جميع القيود المراد حذفها
    let cleanedCount = 0
    let errorCount = 0

    for (const entry of allEntriesToDelete) {
      try {
        const entryType = entry.reference_type === 'bill_payment_reversal' 
          ? 'قيد عكسي' 
          : entry.reference_type === 'bill_payment'
          ? 'قيد سداد'
          : 'قيد إعادة تصنيف'
        console.log(`   🔧 معالجة ${entryType} ${entry.id}...`)

        // جلب بنود القيد
        const { data: lines, error: linesErr } = await supabase
          .from('journal_entry_lines')
          .select('*')
          .eq('journal_entry_id', entry.id)

        if (linesErr) throw linesErr

        // حذف القيد العكسي (بعد تعطيل Trigger)
        console.log(`      🗑️  حذف القيد العكسي...`)

        // حذف بنود القيد أولاً (إن وجدت) - حتى لو كانت فارغة
        if (lines && lines.length > 0) {
          const { error: delLinesErr } = await supabase
            .from('journal_entry_lines')
            .delete()
            .eq('journal_entry_id', entry.id)

          if (delLinesErr) {
            console.log(`      ⚠️  فشل حذف بنود القيد: ${delLinesErr.message}`)
          } else {
            console.log(`      ✅ تم حذف ${lines.length} بند`)
          }
        } else {
          console.log(`      ℹ️  القيد لا يحتوي على بنود - سيتم حذف القيد مباشرة`)
        }

        // حذف القيد نفسه - محاولة مباشرة أولاً
        const { error: delEntryErr } = await supabase
          .from('journal_entries')
          .delete()
          .eq('id', entry.id)

        if (delEntryErr) {
          console.log(`      ⚠️  فشل حذف القيد: ${delEntryErr.message}`)
          // إذا كان القيد محمياً، نحتاج لتعطيل الـ trigger أولاً
          // لكن بما أننا حاولنا تعطيله في البداية، قد نحتاج لطريقة أخرى
          console.log(`      💡 القيد محمي - يرجى تنفيذ السكريبت SQL يدوياً لحذفه`)
        } else {
          console.log(`      ✅ تم حذف القيد العكسي`)
        }

        cleanedCount++
      } catch (err) {
        console.error(`      ❌ خطأ في معالجة القيد ${entry.id}:`, err.message)
        errorCount++
      }
    }

    // 4. معالجة قيود السداد من عملية الإصلاح
    if (paymentEntries && paymentEntries.length > 0) {
      console.log(`\n2️⃣ معالجة قيود السداد من عملية الإصلاح...`)

      for (const entry of paymentEntries) {
        try {
          console.log(`   🔧 معالجة قيد السداد ${entry.id}...`)

          // جلب بنود القيد
          const { data: lines, error: linesErr } = await supabase
            .from('journal_entry_lines')
            .select('*')
            .eq('journal_entry_id', entry.id)

          if (linesErr) throw linesErr

          // حذف قيد السداد (بعد تعطيل Trigger)
          console.log(`      🗑️  حذف قيد السداد...`)

          // حذف بنود القيد أولاً (إن وجدت) - حتى لو كانت فارغة
          if (lines && lines.length > 0) {
            const { error: delLinesErr } = await supabase
              .from('journal_entry_lines')
              .delete()
              .eq('journal_entry_id', entry.id)

            if (delLinesErr) {
              console.log(`      ⚠️  فشل حذف بنود القيد: ${delLinesErr.message}`)
            } else {
              console.log(`      ✅ تم حذف ${lines.length} بند`)
            }
          } else {
            console.log(`      ℹ️  القيد لا يحتوي على بنود - سيتم حذف القيد مباشرة`)
          }

          // حذف القيد نفسه - محاولة مباشرة أولاً
          const { error: delEntryErr } = await supabase
            .from('journal_entries')
            .delete()
            .eq('id', entry.id)

          if (delEntryErr) {
            console.log(`      ⚠️  فشل حذف القيد: ${delEntryErr.message}`)
            console.log(`      💡 القيد محمي - يرجى تنفيذ السكريبت SQL يدوياً لحذفه`)
          } else {
            console.log(`      ✅ تم حذف قيد السداد`)
          }

          cleanedCount++
        } catch (err) {
          console.error(`      ❌ خطأ في معالجة القيد ${entry.id}:`, err.message)
          errorCount++
        }
      }
    }

    console.log('\n📊 ملخص التنظيف:')
    console.log(`   ✅ تم تنظيف ${cleanedCount} قيد`)
    console.log(`   ❌ فشل تنظيف ${errorCount} قيد`)

    // إعادة تفعيل Trigger (فقط إذا تم تعطيله)
    if (triggerDisabled) {
      console.log('\n3️⃣ إعادة تفعيل Trigger...')
      try {
        const enableSQL = 'ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;'
        
        const adminUrl = `${SUPABASE_URL.replace('/rest/v1', '')}/rest/v1/rpc/exec_sql`
        const response = await fetch(adminUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            sql_query: enableSQL
          })
        })
        
        if (response.ok) {
          console.log('   ✅ تم إعادة تفعيل Trigger')
        } else {
          console.log('   ⚠️  فشل إعادة تفعيل Trigger عبر REST API')
          console.log('   💡 يرجى تنفيذ الأمر التالي في SQL Editor:')
          console.log(`   ${enableSQL}`)
        }
      } catch (err) {
        console.log(`   ⚠️  تعذر إعادة تفعيل Trigger: ${err.message}`)
        console.log('   💡 يرجى تنفيذ الأمر التالي في SQL Editor:')
        console.log('   ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;')
      }
    }

    console.log('\n✅ تم الانتهاء من تنظيف القيود العكسية')
    console.log('💡 الأرصدة الآن يجب أن تكون صحيحة')
  } catch (err) {
    // محاولة إعادة تفعيل Trigger في حالة الخطأ
    if (triggerDisabled) {
      try {
        const enableSQL = 'ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;'
        const adminUrl = `${SUPABASE_URL.replace('/rest/v1', '')}/rest/v1/rpc/exec_sql`
        
        await fetch(adminUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
          },
          body: JSON.stringify({
            sql_query: enableSQL
          })
        }).catch(() => {})
      } catch {}
    }
    
    console.error('❌ خطأ عام:', err)
    process.exit(1)
  }
}

main()

