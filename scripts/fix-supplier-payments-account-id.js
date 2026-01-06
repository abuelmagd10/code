// =====================================================
// إصلاح account_id في مدفوعات الموردين لشركة "تست"
// Fix account_id in Supplier Payments for Test Company
// =====================================================
// هذا السكريبت يصلح account_id في جدول payments
// ليطابق الحساب الفعلي المستخدم في القيود المحاسبية
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
  console.log('🔍 بدء فحص وإصلاح account_id في مدفوعات الموردين...\n')

  try {
    // 1. جلب جميع مدفوعات الموردين لشركة "تست"
    console.log('1️⃣ جلب مدفوعات الموردين...')
    const { data: payments, error: paymentsErr } = await supabase
      .from('payments')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .not('supplier_id', 'is', null)
      .order('payment_date', { ascending: false })

    if (paymentsErr) throw paymentsErr

    console.log(`   ✅ تم العثور على ${payments?.length || 0} دفعة مورد\n`)

    if (!payments || payments.length === 0) {
      console.log('   ℹ️  لا توجد مدفوعات مورد لإصلاحها')
      return
    }

    // 2. فحص كل دفعة وإصلاح account_id
    let fixedCount = 0
    let errorCount = 0
    let skippedCount = 0

    for (const payment of payments) {
      try {
        console.log(`   🔧 معالجة الدفعة ${payment.id}...`)
        console.log(`      المبلغ: ${payment.amount}`)
        console.log(`      account_id الحالي: ${payment.account_id || 'غير محدد'}`)

        // البحث عن القيد المحاسبي المرتبط بالدفعة
        let actualAccountId = null

        // البحث عن قيود bill_payment المرتبطة بفاتورة المورد
        if (payment.bill_id) {
          const { data: billPaymentEntries, error: billPayErr } = await supabase
            .from('journal_entries')
            .select('id')
            .eq('company_id', TEST_COMPANY_ID)
            .eq('reference_type', 'bill_payment')
            .eq('reference_id', payment.bill_id)
            .order('entry_date', { ascending: false })

          if (billPayErr) throw billPayErr

          if (billPaymentEntries && billPaymentEntries.length > 0) {
            // جلب بنود القيد للبحث عن حساب النقد/البنك
            const { data: lines, error: linesErr } = await supabase
              .from('journal_entry_lines')
              .select('account_id, debit_amount, credit_amount, description')
              .eq('journal_entry_id', billPaymentEntries[0].id)

            if (linesErr) throw linesErr

            if (lines && lines.length > 0) {
              // البحث عن حساب النقد/البنك (الذي له credit_amount > 0 للدفعات للموردين)
              const cashBankLine = lines.find((line) => 
                (line.description?.includes('نقد') || 
                 line.description?.includes('بنك') || 
                 line.description?.includes('Cash') || 
                 line.description?.includes('Bank')) &&
                line.credit_amount > 0
              )

              if (cashBankLine) {
                actualAccountId = cashBankLine.account_id
                console.log(`      ✅ تم العثور على حساب من قيد bill_payment: ${actualAccountId}`)
              }
            }
          }
        }

        // إذا لم نجد من bill_payment، نبحث في قيود supplier_payment
        if (!actualAccountId) {
          const { data: suppPaymentEntries, error: suppPayErr } = await supabase
            .from('journal_entries')
            .select('id')
            .eq('company_id', TEST_COMPANY_ID)
            .eq('reference_type', 'supplier_payment')
            .eq('reference_id', payment.id)
            .order('entry_date', { ascending: false })

          if (suppPayErr) throw suppPayErr

          if (suppPaymentEntries && suppPaymentEntries.length > 0) {
            const { data: lines, error: linesErr } = await supabase
              .from('journal_entry_lines')
              .select('account_id, debit_amount, credit_amount, description')
              .eq('journal_entry_id', suppPaymentEntries[0].id)

            if (linesErr) throw linesErr

            if (lines && lines.length > 0) {
              const cashBankLine = lines.find((line) => 
                (line.description?.includes('نقد') || 
                 line.description?.includes('بنك') || 
                 line.description?.includes('Cash') || 
                 line.description?.includes('Bank')) &&
                line.credit_amount > 0
              )

              if (cashBankLine) {
                actualAccountId = cashBankLine.account_id
                console.log(`      ✅ تم العثور على حساب من قيد supplier_payment: ${actualAccountId}`)
              }
            }
          }
        }

        // إذا لم نجد حساب من القيود، نتخطى هذه الدفعة
        if (!actualAccountId) {
          console.log(`      ⚠️  لم يتم العثور على قيد محاسبي مرتبط - تخطي`)
          skippedCount++
          continue
        }

        // التحقق من أن account_id يحتاج إلى تحديث
        if (payment.account_id === actualAccountId) {
          console.log(`      ℹ️  account_id صحيح بالفعل - لا حاجة للتحديث`)
          skippedCount++
          continue
        }

        // تحديث account_id
        console.log(`      🔄 تحديث account_id من "${payment.account_id || 'null'}" إلى "${actualAccountId}"`)
        const { error: updateErr } = await supabase
          .from('payments')
          .update({ account_id: actualAccountId })
          .eq('id', payment.id)

        if (updateErr) throw updateErr

        console.log(`      ✅ تم تحديث account_id بنجاح`)
        fixedCount++
      } catch (err) {
        console.error(`      ❌ خطأ في معالجة الدفعة ${payment.id}:`, err.message)
        errorCount++
      }
    }

    console.log('\n📊 ملخص الإصلاح:')
    console.log(`   ✅ تم إصلاح ${fixedCount} دفعة`)
    console.log(`   ⏭️  تم تخطي ${skippedCount} دفعة`)
    console.log(`   ❌ فشل إصلاح ${errorCount} دفعة`)

    console.log('\n✅ تم الانتهاء من إصلاح account_id في مدفوعات الموردين')
  } catch (err) {
    console.error('❌ خطأ عام:', err)
    process.exit(1)
  }
}

main()

