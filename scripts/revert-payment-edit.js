// =====================================================
// إلغاء عملية التعديل على الدفع في فاتورة مشتريات
// Revert Payment Edit for Purchase Bill
// =====================================================
// هذا السكريبت يلغي عملية التعديل على الدفع في فاتورة مشتريات
// شركة "تست" لإعادة الحالة إلى ما قبل التعديل للاختبار
//
// الخطوات:
// 1. البحث عن الدفعة المرتبطة بفاتورة مشتريات في شركة "تست"
// 2. حذف القيود المحاسبية التي تم إنشاؤها من التعديل
// 3. إعادة القيد الأصلي إذا كان موجوداً
// 4. إعادة حساب الدفع إلى الحالة الأصلية
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
  console.log('🔍 بدء إلغاء عملية التعديل على الدفع...\n')

  try {
    // 1. البحث عن فواتير المشتريات في شركة "تست"
    console.log('1️⃣ البحث عن فواتير المشتريات...')
    const { data: bills, error: billsErr } = await supabase
      .from('bills')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .in('status', ['paid', 'partially_paid'])
      .order('bill_date', { ascending: false })
      .limit(10)

    if (billsErr) throw billsErr

    console.log(`   ✅ تم العثور على ${bills?.length || 0} فاتورة مشتريات`)

    if (!bills || bills.length === 0) {
      console.log('   ℹ️  لا توجد فواتير مشتريات لإلغاء التعديل عليها')
      return
    }

    // 2. البحث عن الدفعات المرتبطة بهذه الفواتير
    const billIds = bills.map(b => b.id)
    const { data: payments, error: paymentsErr } = await supabase
      .from('payments')
      .select('*')
      .in('bill_id', billIds)
      .eq('company_id', TEST_COMPANY_ID)
      .order('payment_date', { ascending: false })

    if (paymentsErr) throw paymentsErr

    console.log(`   ✅ تم العثور على ${payments?.length || 0} دفعة مرتبطة\n`)

    if (!payments || payments.length === 0) {
      console.log('   ℹ️  لا توجد دفعات مرتبطة بفواتير المشتريات')
      return
    }

    // 3. معالجة كل دفعة
    let revertedCount = 0
    let errorCount = 0

    for (const payment of payments) {
      try {
        console.log(`   🔧 معالجة الدفعة ${payment.id}...`)

        // البحث عن جميع القيود المرتبطة بهذه الدفعة/الفاتورة
        const billId = payment.bill_id

        if (!billId) {
          console.log(`      ⏭️  الدفعة غير مرتبطة بفاتورة - تخطي`)
          continue
        }

        // البحث عن قيود bill_payment
        const { data: billPaymentEntries, error: billPayErr } = await supabase
          .from('journal_entries')
          .select('*')
          .eq('company_id', TEST_COMPANY_ID)
          .eq('reference_type', 'bill_payment')
          .eq('reference_id', billId)
          .order('entry_date', { ascending: false })

        if (billPayErr) throw billPayErr

        // البحث عن قيود bill_payment_reversal
        const { data: reversalEntries, error: revErr } = await supabase
          .from('journal_entries')
          .select('*')
          .eq('company_id', TEST_COMPANY_ID)
          .eq('reference_type', 'bill_payment_reversal')
          .eq('reference_id', billId)
          .order('entry_date', { ascending: false })

        if (revErr) throw revErr

        // البحث عن قيود إعادة التصنيف
        const { data: reclassEntries, error: reclassErr } = await supabase
          .from('journal_entries')
          .select('*')
          .eq('company_id', TEST_COMPANY_ID)
          .in('reference_type', ['supplier_payment_reclassification', 'supplier_payment_reclassification_reversal'])
          .eq('reference_id', payment.id)
          .order('entry_date', { ascending: false })

        if (reclassErr) throw reclassErr

        console.log(`      📋 القيود الموجودة:`)
        console.log(`         - قيود bill_payment: ${billPaymentEntries?.length || 0}`)
        console.log(`         - قيود bill_payment_reversal: ${reversalEntries?.length || 0}`)
        console.log(`         - قيود إعادة التصنيف: ${reclassEntries?.length || 0}`)

        // تحديد القيد الأصلي (الأقدم) والقيد الجديد (الأحدث)
        const allBillPaymentEntries = (billPaymentEntries || []).sort((a, b) => 
          new Date(a.entry_date) - new Date(b.entry_date)
        )

        if (allBillPaymentEntries.length < 2) {
          console.log(`      ℹ️  لا يوجد قيدان أو أكثر - لا حاجة للإلغاء`)
          continue
        }

        // القيد الأصلي هو الأقدم
        const originalEntry = allBillPaymentEntries[0]
        // القيد الجديد هو الأحدث (من التعديل)
        const newEntry = allBillPaymentEntries[allBillPaymentEntries.length - 1]

        console.log(`      🔍 القيد الأصلي: ${originalEntry.id} (${originalEntry.entry_date})`)
        console.log(`      🔍 القيد الجديد: ${newEntry.id} (${newEntry.entry_date})`)

        // 4. عكس القيد الجديد (من التعديل) - القيود محمية من الحذف
        console.log(`      🔄 عكس القيد الجديد...`)
        
        // التحقق من وجود قيد عكسي للقيد الجديد
        const { data: existingRevNew, error: checkRevErr } = await supabase
          .from('journal_entries')
          .select('*')
          .eq('company_id', TEST_COMPANY_ID)
          .eq('reference_type', 'bill_payment_reversal')
          .eq('reference_id', billId)
          .like('description', '%عكس قيد تعديل حساب الدفع%')
          .maybeSingle()

        if (checkRevErr) throw checkRevErr

        if (existingRevNew) {
          console.log(`      ℹ️  القيد العكسي موجود بالفعل`)
        } else {
          // جلب بنود القيد الجديد
          const { data: newLines, error: newLinesErr } = await supabase
            .from('journal_entry_lines')
            .select('*')
            .eq('journal_entry_id', newEntry.id)

          if (newLinesErr) throw newLinesErr

          if (newLines && newLines.length > 0) {
            // إنشاء قيد عكسي للقيد الجديد
            const { data: revNewEntry, error: revNewEntryErr } = await supabase
              .from('journal_entries')
              .insert({
                company_id: TEST_COMPANY_ID,
                reference_type: 'bill_payment_reversal',
                reference_id: billId,
                entry_date: new Date().toISOString().slice(0, 10),
                description: 'عكس قيد تعديل حساب الدفع (إلغاء التعديل)',
                branch_id: newEntry.branch_id || null,
                cost_center_id: newEntry.cost_center_id || null,
              })
              .select()
              .single()

            if (revNewEntryErr) throw revNewEntryErr

            // عكس جميع بنود القيد الجديد
            const reversedNewLines = newLines.map((line) => ({
              journal_entry_id: revNewEntry.id,
              account_id: line.account_id,
              debit_amount: line.credit_amount,
              credit_amount: line.debit_amount,
              description: `عكس: ${line.description || ''}`,
              original_debit: line.original_credit || 0,
              original_credit: line.original_debit || 0,
              original_currency: line.original_currency || 'EGP',
              exchange_rate_used: line.exchange_rate_used || 1,
              branch_id: line.branch_id || null,
              cost_center_id: line.cost_center_id || null,
            }))

            const { error: revNewLinesErr } = await supabase
              .from('journal_entry_lines')
              .insert(reversedNewLines)

            if (revNewLinesErr) throw revNewLinesErr

            console.log(`      ✅ تم عكس القيد الجديد`)
          }
        }

        // 5. عكس قيود إعادة التصنيف (إن وجدت) - القيود محمية من الحذف
        if (reclassEntries && reclassEntries.length > 0) {
          console.log(`      🔄 عكس قيود إعادة التصنيف...`)
          
          for (const reclassEntry of reclassEntries) {
            // التحقق من نوع القيد
            const isReversal = reclassEntry.reference_type === 'supplier_payment_reclassification_reversal'
            
            if (isReversal) {
              // إذا كان قيد عكسي، نتخطاه (تم عكسه بالفعل)
              console.log(`      ℹ️  قيد إعادة التصنيف ${reclassEntry.id} هو قيد عكسي - تخطي`)
              continue
            }

            // التحقق من وجود قيد عكسي
            const { data: existingRevReclass, error: checkRevReclassErr } = await supabase
              .from('journal_entries')
              .select('*')
              .eq('company_id', TEST_COMPANY_ID)
              .eq('reference_type', 'supplier_payment_reclassification_reversal')
              .eq('reference_id', payment.id)
              .maybeSingle()

            if (checkRevReclassErr) throw checkRevReclassErr

            if (existingRevReclass) {
              console.log(`      ℹ️  قيد عكس إعادة التصنيف موجود بالفعل`)
            } else {
              // جلب بنود قيد إعادة التصنيف
              const { data: reclassLines, error: reclassLinesErr } = await supabase
                .from('journal_entry_lines')
                .select('*')
                .eq('journal_entry_id', reclassEntry.id)

              if (reclassLinesErr) throw reclassLinesErr

              if (reclassLines && reclassLines.length > 0) {
                // إنشاء قيد عكسي لإعادة التصنيف
                const { data: revReclassEntry, error: revReclassEntryErr } = await supabase
                  .from('journal_entries')
                  .insert({
                    company_id: TEST_COMPANY_ID,
                    reference_type: 'supplier_payment_reclassification_reversal',
                    reference_id: payment.id,
                    entry_date: new Date().toISOString().slice(0, 10),
                    description: 'عكس قيد إعادة تصنيف (إلغاء التعديل)',
                    branch_id: reclassEntry.branch_id || null,
                    cost_center_id: reclassEntry.cost_center_id || null,
                  })
                  .select()
                  .single()

                if (revReclassEntryErr) throw revReclassEntryErr

                // عكس جميع بنود قيد إعادة التصنيف
                const reversedReclassLines = reclassLines.map((line) => ({
                  journal_entry_id: revReclassEntry.id,
                  account_id: line.account_id,
                  debit_amount: line.credit_amount,
                  credit_amount: line.debit_amount,
                  description: `عكس: ${line.description || ''}`,
                  original_debit: line.original_credit || 0,
                  original_credit: line.original_debit || 0,
                  original_currency: line.original_currency || 'EGP',
                  exchange_rate_used: line.exchange_rate_used || 1,
                  branch_id: line.branch_id || null,
                  cost_center_id: line.cost_center_id || null,
                }))

                const { error: revReclassLinesErr } = await supabase
                  .from('journal_entry_lines')
                  .insert(reversedReclassLines)

                if (revReclassLinesErr) throw revReclassLinesErr

                console.log(`      ✅ تم عكس قيد إعادة التصنيف ${reclassEntry.id}`)
              }
            }
          }

          console.log(`      ✅ تم عكس قيود إعادة التصنيف`)
        }

        // 6. عكس القيد العكسي (إن وجد) إذا كان من التعديل - القيود محمية من الحذف
        // ملاحظة: القيد العكسي الأصلي يجب أن يبقى، لكن إذا كان هناك قيد عكسي من التعديل
        // فيجب عكسه (أي إنشاء قيد إعادة للقيد العكسي)
        if (reversalEntries && reversalEntries.length > 1) {
          // إذا كان هناك أكثر من قيد عكسي، القيد الأحدث هو من التعديل
          const latestReversal = reversalEntries[reversalEntries.length - 1]
          
          // التحقق من أن القيد العكسي أحدث من القيد الأصلي
          if (new Date(latestReversal.entry_date) > new Date(originalEntry.entry_date)) {
            console.log(`      🔄 عكس القيد العكسي من التعديل...`)
            
            // التحقق من وجود قيد إعادة للقيد العكسي
            const { data: existingRevRev, error: checkRevRevErr } = await supabase
              .from('journal_entries')
              .select('*')
              .eq('company_id', TEST_COMPANY_ID)
              .eq('reference_type', 'bill_payment')
              .eq('reference_id', billId)
              .like('description', '%إعادة للقيد العكسي%')
              .maybeSingle()

            if (checkRevRevErr) throw checkRevRevErr

            if (existingRevRev) {
              console.log(`      ℹ️  قيد إعادة القيد العكسي موجود بالفعل`)
            } else {
              // جلب بنود القيد العكسي
              const { data: revLines, error: revLinesErr } = await supabase
                .from('journal_entry_lines')
                .select('*')
                .eq('journal_entry_id', latestReversal.id)

              if (revLinesErr) throw revLinesErr

              if (revLines && revLines.length > 0) {
                // إنشاء قيد إعادة للقيد العكسي (عكس العكس = إعادة)
                const { data: revRevEntry, error: revRevEntryErr } = await supabase
                  .from('journal_entries')
                  .insert({
                    company_id: TEST_COMPANY_ID,
                    reference_type: 'bill_payment',
                    reference_id: billId,
                    entry_date: new Date().toISOString().slice(0, 10),
                    description: 'إعادة للقيد العكسي (إلغاء التعديل)',
                    branch_id: latestReversal.branch_id || null,
                    cost_center_id: latestReversal.cost_center_id || null,
                  })
                  .select()
                  .single()

                if (revRevEntryErr) throw revRevEntryErr

                // عكس جميع بنود القيد العكسي (عكس العكس = إعادة)
                const reversedRevLines = revLines.map((line) => ({
                  journal_entry_id: revRevEntry.id,
                  account_id: line.account_id,
                  debit_amount: line.credit_amount,
                  credit_amount: line.debit_amount,
                  description: `إعادة: ${line.description || ''}`,
                  original_debit: line.original_credit || 0,
                  original_credit: line.original_debit || 0,
                  original_currency: line.original_currency || 'EGP',
                  exchange_rate_used: line.exchange_rate_used || 1,
                  branch_id: line.branch_id || null,
                  cost_center_id: line.cost_center_id || null,
                }))

                const { error: revRevLinesErr } = await supabase
                  .from('journal_entry_lines')
                  .insert(reversedRevLines)

                if (revRevLinesErr) throw revRevLinesErr

                console.log(`      ✅ تم عكس القيد العكسي`)
              }
            }
          }
        }

        console.log(`      ✅ تم إلغاء التعديل على الدفعة ${payment.id}\n`)

        revertedCount++
      } catch (err) {
        console.error(`      ❌ خطأ في معالجة الدفعة ${payment.id}:`, err.message)
        errorCount++
      }
    }

    console.log('\n📊 ملخص الإلغاء:')
    console.log(`   ✅ تم إلغاء التعديل على ${revertedCount} دفعة`)
    console.log(`   ❌ فشل إلغاء التعديل على ${errorCount} دفعة`)

    console.log('\n✅ تم الانتهاء من إلغاء عملية التعديل')
    console.log('💡 يمكنك الآن اختبار تعديل حساب الدفع مرة أخرى')
  } catch (err) {
    console.error('❌ خطأ عام:', err)
    process.exit(1)
  }
}

main()

