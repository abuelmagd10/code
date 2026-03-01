/**
 * Customer Net AR Balance Engine
 * ================================
 * المصدر الوحيد للحقيقة: حساب الذمم المدينة في القيود المحاسبية (GL)
 *
 * المنطق المحاسبي:
 *   الذمم المدينة (AR) = مجموع المدين (Dr) − مجموع الدائن (Cr) في حساب AR
 *
 *   Dr AR  ← عند إرسال الفاتورة (Accrual Basis) أو استرداد نقدي للعميل
 *   Cr AR  ← عند تسجيل دفعة أو عند مرتجع البضاعة
 *
 *   إذا net AR < 0  → رصيد دائن (العميل دفع أكثر مما عليه)
 *   إذا net AR ≥ 0  → رصيد مدين (العميل لا يزال مديناً أو صفراً)
 *
 * هذا المبدأ مُطبَّق في SAP، Oracle، Microsoft Dynamics، وجميع ERP الاحترافية.
 *
 * ملاحظة: يوجد fallback للفواتير القديمة (قبل Accrual Basis) التي لا تملك قيوداً GL.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface CustomerNetBalance {
  customerId:       string
  companyId:        string
  totalInvoiced:    number  // Σ مدين AR = ما فُوتر على العميل + مبالغ مستردة نقداً
  totalPaid:        number  // Σ دائن AR = المدفوعات + المرتجعات
  totalReturned:    number  // محجوز للتوافق — مُدمَج في totalPaid أعلاه
  totalRefunded:    number  // محجوز للتوافق — مُدمَج في totalInvoiced أعلاه
  netBalance:       number  // = totalInvoiced − totalPaid (Dr − Cr)
  creditBalance:    number  // max(0, −netBalance) — الرصيد الدائن إذا وُجد
  isCredit:         boolean // true إذا كان رصيد العميل دائناً فعلياً
}

export interface UpsertCustomerCreditResult {
  success:         boolean
  creditCreated:   boolean
  creditAmount:    number
  netBalance:      number
  error?:          string
}

// ─────────────────────────────────────────────────────────────────────────────
// الدالة الرئيسية — تعتمد على حساب AR في القيود المحاسبية (GL)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * احسب الرصيد الصافي للعميل من حساب الذمم المدينة (GL)
 *
 * المنهج: جمع كل المدين والدائن في حساب AR للقيود المرتبطة بفواتير/مرتجعات العميل.
 * هذا يُجنِّب أي إشكالية مزدوجة الحساب ناتجة عن تعديل total_amount في الفواتير.
 */
export async function getCustomerNetBalance(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string
): Promise<CustomerNetBalance> {

  // ── 1) جلب حساب الذمم المدينة للشركة ──────────────────────────────────────
  // نستخدم استعلامَين متتالَيَن لضمان الأولوية الصريحة:
  //   أولاً: تطابق دقيق عبر sub_type = 'accounts_receivable'
  //   ثانياً: fallback عبر اسم الحساب إذا لم يوجد sub_type مطابق
  const { data: arBySubType } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .eq('sub_type', 'accounts_receivable')
    .limit(1)
    .maybeSingle()

  const arAccount = arBySubType ?? (await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .ilike('account_name', '%الذمم المدين%')
    .limit(1)
    .maybeSingle()
  ).data

  if (!arAccount) {
    // لا يوجد حساب AR مُعرَّف → نستخدم الحساب التشغيلي (fallback)
    return _getCustomerNetBalanceFallback(supabase, companyId, customerId)
  }

  // ── 2) جمع معرفات مراجع العميل بالتوازي ──────────────────────────────────
  const [{ data: invoiceRows }, { data: returnRows }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .not('status', 'in', '("draft","cancelled")'),
    supabase
      .from('sales_returns')
      .select('id')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .eq('status', 'completed'),
  ])

  const invoiceIds = (invoiceRows || []).map(i => i.id)
  const returnIds  = (returnRows  || []).map(r => r.id)
  const allRefIds  = [...invoiceIds, ...returnIds]

  if (allRefIds.length === 0) {
    return _emptyBalance(customerId, companyId)
  }

  // ── 3) جلب القيود المحاسبية المُرسَلة (posted) المرتبطة بهذا العميل ────────
  //
  // نفِّذ استعلامَين منفصلَين لضمان التطابق الدقيق بين reference_type وreference_id:
  //
  //   أنواع مرتبطة بمعرف الفاتورة (invoice IDs):
  //     invoice          ← Dr AR / Cr Revenue / Cr VAT  (عند الإرسال - Accrual)
  //     invoice_ar       ← Dr AR (بديل في بعض الحالات)
  //     invoice_payment  ← Dr Cash / Cr AR              (عند الدفع)
  //     payment_reversal ← Dr AR / Cr Cash              (استرداد نقدي للعميل)
  //
  //   أنواع مرتبطة بمعرف المرتجع (sales_return IDs):
  //     sales_return     ← Dr Revenue / Cr AR           (عند المرتجع)
  //
  const [{ data: invoiceJERows }, { data: returnJERows }] = await Promise.all([
    invoiceIds.length > 0
      ? supabase
          .from('journal_entries')
          .select('id')
          .eq('company_id', companyId)
          .in('reference_type', ['invoice', 'invoice_ar', 'invoice_payment', 'payment_reversal'])
          .in('reference_id', invoiceIds)
          .is('deleted_at', null)
          .eq('status', 'posted')
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
    returnIds.length > 0
      ? supabase
          .from('journal_entries')
          .select('id')
          .eq('company_id', companyId)
          .eq('reference_type', 'sales_return')
          .in('reference_id', returnIds)
          .is('deleted_at', null)
          .eq('status', 'posted')
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
  ])

  const jeIds = [
    ...(invoiceJERows || []).map(je => je.id),
    ...(returnJERows  || []).map(je => je.id),
  ]

  if (jeIds.length === 0) {
    // لا توجد قيود GL بعد (بيانات قديمة قبل Accrual Basis) → fallback تشغيلي
    return _getCustomerNetBalanceFallback(supabase, companyId, customerId)
  }

  // ── 4) جمع المدين والدائن في حساب AR من أسطر القيود ──────────────────────
  const { data: arLines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount')
    .eq('account_id', arAccount.id)
    .in('journal_entry_id', jeIds)

  const totalARDebits  = (arLines || []).reduce((s, l) => s + Number(l.debit_amount  || 0), 0)
  const totalARCredits = (arLines || []).reduce((s, l) => s + Number(l.credit_amount || 0), 0)
  const netBalance     = totalARDebits - totalARCredits
  const creditBalance  = Math.max(0, -netBalance)

  return {
    customerId,
    companyId,
    totalInvoiced:  totalARDebits,   // Dr AR = الفواتير + استردادات نقدية
    totalPaid:      totalARCredits,  // Cr AR = المدفوعات + المرتجعات
    totalReturned:  0,               // مُدمَج في totalPaid أعلاه
    totalRefunded:  0,               // مُدمَج في totalInvoiced أعلاه
    netBalance,
    creditBalance,
    isCredit: netBalance < -0.005,   // تجنب ضجيج floating point
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback — للفواتير القديمة التي لا تملك قيوداً GL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * حساب تشغيلي بديل للفواتير التي لا تملك قيوداً GL.
 *
 * معالجة خلل الطرح المزدوج للمرتجعات:
 * ─────────────────────────────────────
 * للفواتير المرسلة (sent): total_amount يُقلَّص عند المرتجع (bug origin).
 * للفواتير المدفوعة (paid): total_amount لا يُقلَّص، returned_amount يتتبع المرتجع.
 *
 * الحل: نُعيد بناء المبلغ الأصلي للفاتورة = total_amount + returned_amount
 * فقط للفواتير التي قُلِّص total_amount فيها. نحدد ذلك بالمعيار التالي:
 *
 *   total_amount لم يُقلَّص إذا: status ∈ {partially_returned, fully_returned} AND paid_amount > 0
 *   (= مرتجع حدث على فاتورة كانت مدفوعة بالفعل → total_amount لم يُلمَس)
 *
 *   total_amount قُلِّص في جميع الحالات الأخرى التي يوجد فيها returned_amount > 0.
 */
async function _getCustomerNetBalanceFallback(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string
): Promise<CustomerNetBalance> {

  const [{ data: invoices }, { data: payments }, { data: returns }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, total_amount, returned_amount, paid_amount, status')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .not('status', 'in', '("draft","cancelled")'),
    supabase
      .from('payments')
      .select('amount')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .not('is_deleted', 'eq', true),
    supabase
      .from('sales_returns')
      .select('total_amount')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .eq('status', 'completed'),
  ])

  // إعادة بناء المبلغ الأصلي للفاتورة قبل أي تقليص
  const totalInvoiced = (invoices || []).reduce((sum, inv) => {
    const paidAmount      = Number(inv.paid_amount      || 0)
    const returnedAmount  = Number(inv.returned_amount  || 0)
    const totalAmount     = Number(inv.total_amount     || 0)
    const status          = inv.status as string

    // total_amount لم يُقلَّص: مرتجع حدث على فاتورة كانت مدفوعة
    const wasNotReduced = (
      (status === 'partially_returned' || status === 'fully_returned')
      && paidAmount > 0
    )

    // إذا قُلِّص total_amount، نُضيف returned_amount لاسترجاع الأصل
    const originalAmount = wasNotReduced
      ? totalAmount
      : totalAmount + returnedAmount

    return sum + originalAmount
  }, 0)

  const totalPaid = (payments || []).reduce(
    (sum, p) => sum + Number(p.amount || 0), 0
  )

  const totalReturned = (returns || []).reduce(
    (sum, r) => sum + Number(r.total_amount || 0), 0
  )

  // جلب المبالغ المستردة نقداً (payment_reversal) من القيود
  const invoiceIds = (invoices || []).map(i => i.id)
  let totalRefunded = 0

  if (invoiceIds.length > 0) {
    const { data: refundEntries } = await supabase
      .from('journal_entries')
      .select('journal_entry_lines(credit_amount)')
      .eq('company_id', companyId)
      .eq('reference_type', 'payment_reversal')
      .in('reference_id', invoiceIds)

    for (const entry of (refundEntries || [])) {
      const lines = (entry as any).journal_entry_lines || []
      for (const line of lines) {
        totalRefunded += Number(line.credit_amount || 0)
      }
    }
  }

  const netBalance    = totalInvoiced - totalPaid - totalReturned + totalRefunded
  const creditBalance = Math.max(0, -netBalance)

  return {
    customerId,
    companyId,
    totalInvoiced,
    totalPaid,
    totalReturned,
    totalRefunded,
    netBalance,
    creditBalance,
    isCredit: netBalance < -0.005,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// مساعد
// ─────────────────────────────────────────────────────────────────────────────

function _emptyBalance(customerId: string, companyId: string): CustomerNetBalance {
  return {
    customerId,
    companyId,
    totalInvoiced:  0,
    totalPaid:      0,
    totalReturned:  0,
    totalRefunded:  0,
    netBalance:     0,
    creditBalance:  0,
    isCredit:       false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// syncCustomerCredit — لا تغيير في واجهة الدالة
// ─────────────────────────────────────────────────────────────────────────────

/**
 * بعد أي عملية (مرتجع، دفعة، استرداد):
 * 1. احسب الرصيد الصافي للعميل
 * 2. إذا أصبح دائناً → أنشئ/حدّث سجل customer_credits
 * 3. إذا بقي مديناً أو صفراً → لا تفعل شيئاً
 */
export async function syncCustomerCredit(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string,
  invoiceId: string,
  reason?: string
): Promise<UpsertCustomerCreditResult> {
  try {
    const balance = await getCustomerNetBalance(supabase, companyId, customerId)

    if (!balance.isCredit) {
      return {
        success:       true,
        creditCreated: false,
        creditAmount:  0,
        netBalance:    balance.netBalance,
      }
    }

    const creditAmount = Math.round(balance.creditBalance * 100) / 100

    const { data: existingCredit } = await supabase
      .from('customer_credits')
      .select('id, remaining_amount')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .eq('invoice_id', invoiceId)
      .eq('status', 'active')
      .maybeSingle()

    if (existingCredit) {
      if (Math.abs(Number(existingCredit.remaining_amount) - creditAmount) > 0.005) {
        await supabase
          .from('customer_credits')
          .update({ remaining_amount: creditAmount, amount: creditAmount })
          .eq('id', existingCredit.id)
      }
    } else {
      await supabase.from('customer_credits').insert({
        company_id:       companyId,
        customer_id:      customerId,
        invoice_id:       invoiceId,
        credit_number:    `CR-${Date.now()}`,
        credit_date:      new Date().toISOString().slice(0, 10),
        amount:           creditAmount,
        remaining_amount: creditAmount,
        reason:           reason || 'رصيد دائن صافٍ للعميل',
        status:           'active',
      })
    }

    return {
      success:       true,
      creditCreated: true,
      creditAmount,
      netBalance:    balance.netBalance,
    }
  } catch (err: any) {
    return {
      success:       false,
      creditCreated: false,
      creditAmount:  0,
      netBalance:    0,
      error:         err?.message || 'Unknown error in syncCustomerCredit',
    }
  }
}
