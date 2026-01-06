// =====================================================
// إصلاح القيود المحاسبية الخاطئة الناتجة عن تعديل الدفعات
// Fix Incorrect Journal Entries from Payment Edits
// =====================================================
// هذا السكريبت يصلح القيود المحاسبية الخاطئة في شركة "تست"
// الناتجة عن تعديل حساب الدفع قبل تطبيق الإصلاح
//
// المشكلة:
// - قiود إعادة تصنيف (reclassification) بدون عكس القيد الأصلي
// - قيود أصلية (bill_payment/invoice_payment) لم يتم عكسها
// - أرصدة حسابات غير صحيحة
//
// الحل:
// 1. البحث عن قيود إعادة التصنيف المرتبطة بالدفعات
// 2. البحث عن القيود الأصلية التي لم يتم عكسها
// 3. عكس القيود الأصلية
// 4. حذف قيود إعادة التصنيف
// 5. إنشاء قيود صحيحة جديدة بناءً على الحساب الحالي في الدفعة
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
  console.log('🔍 بدء إصلاح القيود المحاسبية الخاطئة...\n')

  try {
    // 1. البحث عن قيود إعادة التصنيف المرتبطة بالدفعات
    console.log('1️⃣ البحث عن قiود إعادة التصنيف...')
    const { data: reclassEntries, error: reclassErr } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .in('reference_type', ['customer_payment_reclassification', 'supplier_payment_reclassification'])
      .order('entry_date', { ascending: false })

    if (reclassErr) throw reclassErr

    console.log(`   ✅ تم العثور على ${reclassEntries?.length || 0} قيد إعادة تصنيف`)

    // 2. البحث عن الدفعات المرتبطة بهذه القيود
    const paymentIds = (reclassEntries || [])
      .map((e) => e.reference_id)
      .filter(Boolean)

    if (paymentIds.length === 0) {
      console.log('   ℹ️  لا توجد قيود إعادة تصنيف لإصلاحها')
      return
    }

    console.log(`   📋 الدفعات المرتبطة: ${paymentIds.length}`)

    // 3. جلب بيانات الدفعات
    const { data: payments, error: paymentsErr } = await supabase
      .from('payments')
      .select('*')
      .in('id', paymentIds)
      .eq('company_id', TEST_COMPANY_ID)

    if (paymentsErr) throw paymentsErr

    console.log(`   ✅ تم جلب ${payments?.length || 0} دفعة\n`)

    // 4. معالجة كل دفعة
    let fixedCount = 0
    let errorCount = 0

    for (const payment of payments || []) {
      try {
        console.log(`   🔧 معالجة الدفعة ${payment.id}...`)

        // البحث عن قيود إعادة التصنيف لهذه الدفعة
        const paymentReclassEntries = (reclassEntries || []).filter(
          (e) => e.reference_id === payment.id
        )

        if (paymentReclassEntries.length === 0) {
          console.log(`      ⏭️  لا توجد قيود إعادة تصنيف لهذه الدفعة`)
          continue
        }

        // البحث عن القيد الأصلي (bill_payment أو invoice_payment)
        const referenceType = payment.invoice_id
          ? 'invoice_payment'
          : payment.bill_id
          ? 'bill_payment'
          : null

        if (!referenceType) {
          console.log(`      ⚠️  الدفعة غير مرتبطة بمستند - تخطي`)
          continue
        }

        const referenceId = payment.invoice_id || payment.bill_id

        // البحث عن القيد الأصلي
        const { data: originalEntries, error: origErr } = await supabase
          .from('journal_entries')
          .select('*')
          .eq('company_id', TEST_COMPANY_ID)
          .eq('reference_type', referenceType)
          .eq('reference_id', referenceId)
          .order('entry_date', { ascending: false })
          .limit(1)

        if (origErr) throw origErr

        if (!originalEntries || originalEntries.length === 0) {
          console.log(`      ⚠️  لم يتم العثور على القيد الأصلي - تخطي`)
          continue
        }

        const originalEntry = originalEntries[0]

        // جلب بنود القيد الأصلي
        const { data: originalLines, error: linesErr } = await supabase
          .from('journal_entry_lines')
          .select('*')
          .eq('journal_entry_id', originalEntry.id)

        if (linesErr) throw linesErr

        if (!originalLines || originalLines.length === 0) {
          console.log(`      ⚠️  القيد الأصلي لا يحتوي على بنود - تخطي`)
          continue
        }

        // التحقق من وجود قيد عكسي
        const reversalType = referenceType === 'invoice_payment' 
          ? 'invoice_payment_reversal'
          : 'bill_payment_reversal'

        const { data: reversalEntries, error: revErr } = await supabase
          .from('journal_entries')
          .select('*')
          .eq('company_id', TEST_COMPANY_ID)
          .eq('reference_type', reversalType)
          .eq('reference_id', referenceId)
          .order('entry_date', { ascending: false })
          .limit(1)

        if (revErr) throw revErr

        const hasReversal = reversalEntries && reversalEntries.length > 0

        // 5. عكس القيد الأصلي (إن لم يكن موجوداً)
        if (!hasReversal) {
          console.log(`      🔄 إنشاء قيد عكسي للقيد الأصلي...`)

          const { data: revEntry, error: revEntryErr } = await supabase
            .from('journal_entries')
            .insert({
              company_id: TEST_COMPANY_ID,
              reference_type: reversalType,
              reference_id: referenceId,
              entry_date: payment.payment_date,
              description: `عكس قيد سداد (إصلاح تعديل حساب الدفع)`,
              branch_id: originalEntry.branch_id || null,
              cost_center_id: originalEntry.cost_center_id || null,
            })
            .select()
            .single()

          if (revEntryErr) throw revEntryErr

          // عكس جميع بنود القيد الأصلي
          const reversedLines = originalLines.map((line) => ({
            journal_entry_id: revEntry.id,
            account_id: line.account_id,
            debit_amount: line.credit_amount, // عكس: مدين ← دائن
            credit_amount: line.debit_amount,  // عكس: دائن ← مدين
            description: `عكس: ${line.description || ''}`,
            original_debit: line.original_credit || 0,
            original_credit: line.original_debit || 0,
            original_currency: line.original_currency || 'EGP',
            exchange_rate_used: line.exchange_rate_used || 1,
            branch_id: line.branch_id || null,
            cost_center_id: line.cost_center_id || null,
          }))

          const { error: revLinesErr } = await supabase
            .from('journal_entry_lines')
            .insert(reversedLines)

          if (revLinesErr) throw revLinesErr

          console.log(`      ✅ تم إنشاء قيد عكسي`)
        } else {
          console.log(`      ℹ️  القيد العكسي موجود بالفعل`)
        }

        // 6. عكس قيود إعادة التصنيف بدلاً من حذفها (لأنها قد تكون محمية)
        console.log(`      🔄 عكس قيود إعادة التصنيف...`)
        for (const reclassEntry of paymentReclassEntries) {
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
                reference_type: payment.invoice_id
                  ? 'customer_payment_reclassification_reversal'
                  : 'supplier_payment_reclassification_reversal',
                reference_id: payment.id,
                entry_date: payment.payment_date,
                description: 'عكس قيد إعادة تصنيف (إصلاح تعديل حساب الدفع)',
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
              debit_amount: line.credit_amount, // عكس: مدين ← دائن
              credit_amount: line.debit_amount,  // عكس: دائن ← مدين
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
          }
        }

        console.log(`      ✅ تم عكس ${paymentReclassEntries.length} قيد إعادة تصنيف`)

        // 7. إنشاء قيد جديد صحيح بالحساب الحالي في الدفعة
        console.log(`      ✨ إنشاء قيد جديد صحيح...`)

        // جلب إعدادات الحسابات
        const { data: company } = await supabase
          .from('companies')
          .select('*')
          .eq('id', TEST_COMPANY_ID)
          .single()

        if (!company) throw new Error('Company not found')

        // جلب الحسابات المطلوبة
        const { data: accounts } = await supabase
          .from('chart_of_accounts')
          .select('*')
          .eq('company_id', TEST_COMPANY_ID)
          .in('sub_type', ['accounts_receivable', 'accounts_payable'])

        const arAccount = accounts?.find((a) => a.sub_type === 'accounts_receivable')
        const apAccount = accounts?.find((a) => a.sub_type === 'accounts_payable')

        if (!arAccount && payment.invoice_id) {
          throw new Error('AR account not found')
        }
        if (!apAccount && payment.bill_id) {
          throw new Error('AP account not found')
        }

        const currentAccountId = payment.account_id || null
        if (!currentAccountId) {
          console.log(`      ⚠️  الدفعة لا تحتوي على حساب - تخطي إنشاء قيد جديد`)
          continue
        }

        // جلب بيانات المستند للحصول على branch_id و cost_center_id
        let branchId = originalEntry.branch_id || null
        let costCenterId = originalEntry.cost_center_id || null

        if (payment.invoice_id) {
          const { data: inv } = await supabase
            .from('invoices')
            .select('branch_id, cost_center_id')
            .eq('id', payment.invoice_id)
            .maybeSingle()
          if (inv) {
            branchId = inv.branch_id || branchId
            costCenterId = inv.cost_center_id || costCenterId
          }
        } else if (payment.bill_id) {
          const { data: bill } = await supabase
            .from('bills')
            .select('branch_id, cost_center_id')
            .eq('id', payment.bill_id)
            .maybeSingle()
          if (bill) {
            branchId = bill.branch_id || branchId
            costCenterId = bill.cost_center_id || costCenterId
          }
        }

        const paymentCurrency = payment.original_currency || payment.currency_code || 'EGP'
        const paymentExRate = payment.exchange_rate_used || payment.exchange_rate || 1

        // إنشاء القيد الجديد
        const { data: newEntry, error: newEntryErr } = await supabase
          .from('journal_entries')
          .insert({
            company_id: TEST_COMPANY_ID,
            reference_type: referenceType,
            reference_id: referenceId,
            entry_date: payment.payment_date,
            description: payment.invoice_id
              ? 'سداد فاتورة (إصلاح تعديل حساب الدفع)'
              : 'سداد فاتورة مورد (إصلاح تعديل حساب الدفع)',
            branch_id: branchId,
            cost_center_id: costCenterId,
          })
          .select()
          .single()

        if (newEntryErr) throw newEntryErr

        // إنشاء بنود القيد الجديد
        if (payment.invoice_id && arAccount) {
          // قيد سداد فاتورة عميل: Dr. Cash/Bank / Cr. AR
          const { error: newLinesErr } = await supabase
            .from('journal_entry_lines')
            .insert([
              {
                journal_entry_id: newEntry.id,
                account_id: currentAccountId,
                debit_amount: payment.amount,
                credit_amount: 0,
                description: 'نقد/بنك',
                original_debit: payment.amount,
                original_credit: 0,
                original_currency: paymentCurrency,
                exchange_rate_used: paymentExRate,
                branch_id: branchId,
                cost_center_id: costCenterId,
              },
              {
                journal_entry_id: newEntry.id,
                account_id: arAccount.id,
                debit_amount: 0,
                credit_amount: payment.amount,
                description: 'الذمم المدينة',
                original_debit: 0,
                original_credit: payment.amount,
                original_currency: paymentCurrency,
                exchange_rate_used: paymentExRate,
                branch_id: branchId,
                cost_center_id: costCenterId,
              },
            ])

          if (newLinesErr) throw newLinesErr
        } else if (payment.bill_id && apAccount) {
          // قيد سداد فاتورة مورد: Dr. AP / Cr. Cash/Bank
          const { error: newLinesErr } = await supabase
            .from('journal_entry_lines')
            .insert([
              {
                journal_entry_id: newEntry.id,
                account_id: apAccount.id,
                debit_amount: payment.amount,
                credit_amount: 0,
                description: 'حسابات دائنة',
                original_debit: payment.amount,
                original_credit: 0,
                original_currency: paymentCurrency,
                exchange_rate_used: paymentExRate,
                branch_id: branchId,
                cost_center_id: costCenterId,
              },
              {
                journal_entry_id: newEntry.id,
                account_id: currentAccountId,
                debit_amount: 0,
                credit_amount: payment.amount,
                description: 'نقد/بنك',
                original_debit: 0,
                original_credit: payment.amount,
                original_currency: paymentCurrency,
                exchange_rate_used: paymentExRate,
                branch_id: branchId,
                cost_center_id: costCenterId,
              },
            ])

          if (newLinesErr) throw newLinesErr
        }

        console.log(`      ✅ تم إنشاء قيد جديد صحيح`)
        console.log(`      ✅ تم إصلاح الدفعة ${payment.id}\n`)

        fixedCount++
      } catch (err) {
        console.error(`      ❌ خطأ في معالجة الدفعة ${payment.id}:`, err.message)
        errorCount++
      }
    }

    console.log('\n📊 ملخص الإصلاح:')
    console.log(`   ✅ تم إصلاح ${fixedCount} دفعة`)
    console.log(`   ❌ فشل إصلاح ${errorCount} دفعة`)

    console.log('\n✅ تم الانتهاء من إصلاح القيود المحاسبية')
  } catch (err) {
    console.error('❌ خطأ عام:', err)
    process.exit(1)
  }
}

main()

