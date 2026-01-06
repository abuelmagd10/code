// =====================================================
// التحقق من أرصدة الحسابات بعد تنظيف القيود
// Check Account Balances After Cleanup
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
  console.log('🔍 التحقق من أرصدة الحسابات...\n')

  try {
    // جلب جميع الحسابات المصرفية والنقدية
    const { data: accounts, error: accountsErr } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .in('sub_type', ['cash', 'bank'])

    if (accountsErr) throw accountsErr

    console.log(`✅ تم العثور على ${accounts?.length || 0} حساب نقد/بنك\n`)

    for (const account of accounts || []) {
      console.log(`📊 حساب: ${account.account_name} (${account.account_code})`)

      // جلب جميع القيود المرتبطة بهذا الحساب
      const { data: lines, error: linesErr } = await supabase
        .from('journal_entry_lines')
        .select(`
          *,
          journal_entries!inner (
            id,
            entry_date,
            description,
            reference_type,
            reference_id
          )
        `)
        .eq('account_id', account.id)

      if (linesErr) throw linesErr

      // حساب الرصيد
      let balance = 0
      const entries = []

      for (const line of lines || []) {
        const entry = line.journal_entries
        const debit = Number(line.debit_amount || 0)
        const credit = Number(line.credit_amount || 0)
        balance += (debit - credit)

        entries.push({
          date: entry.entry_date,
          description: entry.description,
          reference_type: entry.reference_type,
          debit,
          credit,
          balance,
        })
      }

      // ترتيب حسب التاريخ
      entries.sort((a, b) => new Date(b.date) - new Date(a.date))

      console.log(`   الرصيد الحالي: ${balance.toFixed(2)}`)
      console.log(`   عدد القيود: ${entries.length}`)
      
      // عرض آخر 5 قيود
      console.log(`   آخر 5 قيود:`)
      entries.slice(0, 5).forEach((e, i) => {
        console.log(`      ${i + 1}. ${e.date} | ${e.description} | مدين: ${e.debit.toFixed(2)} | دائن: ${e.credit.toFixed(2)} | رصيد: ${e.balance.toFixed(2)}`)
      })
      
      console.log('')
    }

    console.log('✅ تم الانتهاء من التحقق')
  } catch (err) {
    console.error('❌ خطأ:', err)
    process.exit(1)
  }
}

main()

