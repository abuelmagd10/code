// =====================================================
// التحقق من القيود العكسية المتبقية
// Check Remaining Reversal Entries
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

async function main() {
  console.log('🔍 التحقق من القيود العكسية المتبقية...\n')

  try {
    // البحث عن جميع القيود العكسية
    const { data: reversalEntries, error: revErr } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .eq('reference_type', 'bill_payment_reversal')
      .order('entry_date', { ascending: false })

    if (revErr) throw revErr

    console.log(`✅ تم العثور على ${reversalEntries?.length || 0} قيد عكسي\n`)

    for (const entry of reversalEntries || []) {
      console.log(`📋 قيد عكسي: ${entry.id}`)
      console.log(`   التاريخ: ${entry.entry_date}`)
      console.log(`   الوصف: ${entry.description}`)
      console.log(`   المرجع: ${entry.reference_id}`)

      // جلب بنود القيد
      const { data: lines, error: linesErr } = await supabase
        .from('journal_entry_lines')
        .select('*')
        .eq('journal_entry_id', entry.id)

      if (linesErr) throw linesErr

      console.log(`   البنود: ${lines?.length || 0}`)
      if (lines && lines.length > 0) {
        lines.forEach((line, i) => {
          console.log(`      ${i + 1}. حساب: ${line.account_id} | مدين: ${line.debit_amount} | دائن: ${line.credit_amount} | ${line.description || ''}`)
        })
      }
      console.log('')
    }

    // البحث عن قيود إعادة التصنيف
    const { data: reclassEntries, error: reclassErr } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .in('reference_type', ['supplier_payment_reclassification', 'supplier_payment_reclassification_reversal'])
      .order('entry_date', { ascending: false })

    if (reclassErr) throw reclassErr

    console.log(`✅ تم العثور على ${reclassEntries?.length || 0} قيد إعادة تصنيف\n`)

    for (const entry of reclassEntries || []) {
      console.log(`📋 قيد إعادة تصنيف: ${entry.id}`)
      console.log(`   التاريخ: ${entry.entry_date}`)
      console.log(`   الوصف: ${entry.description}`)
      console.log(`   المرجع: ${entry.reference_id}`)

      // جلب بنود القيد
      const { data: lines, error: linesErr } = await supabase
        .from('journal_entry_lines')
        .select('*')
        .eq('journal_entry_id', entry.id)

      if (linesErr) throw linesErr

      console.log(`   البنود: ${lines?.length || 0}`)
      if (lines && lines.length > 0) {
        lines.forEach((line, i) => {
          console.log(`      ${i + 1}. حساب: ${line.account_id} | مدين: ${line.debit_amount} | دائن: ${line.credit_amount} | ${line.description || ''}`)
        })
      }
      console.log('')
    }

    console.log('✅ تم الانتهاء من التحقق')
  } catch (err) {
    console.error('❌ خطأ:', err)
    process.exit(1)
  }
}

main()

