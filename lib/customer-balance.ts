/**
 * Customer Net AR Balance Engine
 * ================================
 * المصدر الوحيد للحقيقة لرصيد العميل الصافي
 *
 * المعادلة المحاسبية:
 *   رصيد العميل الصافي =
 *       Σ(إجمالي الفواتير النشطة)
 *     - Σ(المدفوعات المستلمة)
 *     - Σ(المرتجعات)
 *     + Σ(المبالغ المستردة نقداً للعميل)
 *
 * إذا الرصيد < 0 → رصيد دائن (العميل أكثر من دفع / المرتجع أكثر من الفاتورة)
 * إذا الرصيد ≥ 0 → رصيد مدين (العميل لا يزال مديناً أو صفر)
 *
 * هذا المبدأ مُطبَّق في SAP، Oracle، Microsoft Dynamics، وجميع ERP الاحترافية.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface CustomerNetBalance {
  customerId:       string
  companyId:        string
  totalInvoiced:    number  // Σ كل الفواتير النشطة (غير الملغاة)
  totalPaid:        number  // Σ كل المدفوعات المستلمة
  totalReturned:    number  // Σ كل المرتجعات
  totalRefunded:    number  // Σ كل المبالغ المستردة نقداً (cash/bank_transfer refunds)
  netBalance:       number  // = totalInvoiced - totalPaid - totalReturned + totalRefunded
  creditBalance:    number  // max(0, -netBalance) — الرصيد الدائن إذا وُجد
  isCredit:         boolean // true إذا كان رصيد العميل دائناً فعلياً
}

export interface UpsertCustomerCreditResult {
  success:         boolean
  creditCreated:   boolean
  creditAmount:    number
  netBalance:      number
  error?:          string
}

/**
 * احسب الرصيد الصافي للعميل عبر جميع فواتيره ومدفوعاته ومرتجعاته
 *
 * @param supabase  Supabase client
 * @param companyId معرف الشركة
 * @param customerId معرف العميل
 */
export async function getCustomerNetBalance(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string
): Promise<CustomerNetBalance> {
  // 1) الفواتير النشطة (كل الحالات ما عدا draft وcancelled)
  const { data: invoices } = await supabase
    .from('invoices')
    .select('total_amount, returned_amount')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .not('status', 'in', '("draft","cancelled")')

  const totalInvoiced = (invoices || []).reduce(
    (sum, inv) => sum + Number(inv.total_amount || 0), 0
  )

  // 2) المدفوعات المستلمة (غير المحذوفة)
  const { data: payments } = await supabase
    .from('payments')
    .select('amount')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .not('is_deleted', 'eq', true)

  const totalPaid = (payments || []).reduce(
    (sum, p) => sum + Number(p.amount || 0), 0
  )

  // 3) المرتجعات المكتملة
  const { data: returns } = await supabase
    .from('sales_returns')
    .select('total_amount')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .eq('status', 'completed')

  const totalReturned = (returns || []).reduce(
    (sum, r) => sum + Number(r.total_amount || 0), 0
  )

  // 4) المبالغ المستردة نقداً (payment_reversal journal entries)
  // نجلب معرفات فواتير العميل أولاً، ثم نبحث عن قيود الاسترداد المرتبطة بها
  const { data: invoiceIds } = await supabase
    .from('invoices')
    .select('id')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .not('status', 'in', '("draft","cancelled")')

  let totalRefunded = 0
  if (invoiceIds && invoiceIds.length > 0) {
    const ids = invoiceIds.map(i => i.id)
    const { data: refundEntries } = await supabase
      .from('journal_entries')
      .select('journal_entry_lines(credit_amount)')
      .eq('company_id', companyId)
      .eq('reference_type', 'payment_reversal')
      .in('reference_id', ids)

    // الدائن في payment_reversal = نقود خرجت للعميل (Cr Cash/Bank)
    for (const entry of (refundEntries || [])) {
      const lines = (entry as any).journal_entry_lines || []
      for (const line of lines) {
        totalRefunded += Number(line.credit_amount || 0)
      }
    }
  }

  const netBalance     = totalInvoiced - totalPaid - totalReturned + totalRefunded
  const creditBalance  = Math.max(0, -netBalance)
  const isCredit       = netBalance < -0.005 // تجنب floating point noise

  return {
    customerId,
    companyId,
    totalInvoiced,
    totalPaid,
    totalReturned,
    totalRefunded,
    netBalance,
    creditBalance,
    isCredit,
  }
}

/**
 * بعد أي عملية (مرتجع، دفعة، استرداد):
 * 1. احسب الرصيد الصافي للعميل
 * 2. إذا أصبح دائناً → أنشئ/حدّث سجل customer_credits
 * 3. إذا بقي مديناً أو صفراً → لا تفعل شيئاً
 *
 * @param supabase    Supabase client
 * @param companyId   معرف الشركة
 * @param customerId  معرف العميل
 * @param invoiceId   معرف الفاتورة المرجعية (لربط الـ credit بها)
 * @param reason      سبب الرصيد الدائن (اختياري)
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
      // العميل لا يزال مديناً أو صفراً → لا رصيد دائن
      return {
        success:       true,
        creditCreated: false,
        creditAmount:  0,
        netBalance:    balance.netBalance,
      }
    }

    // العميل أصبح دائناً فعلياً → أنشئ أو حدّث سجل customer_credits
    const creditAmount = Math.round(balance.creditBalance * 100) / 100

    // تحقق إذا كان هناك سجل credit نشط لهذا العميل/الفاتورة
    const { data: existingCredit } = await supabase
      .from('customer_credits')
      .select('id, remaining_amount')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .eq('invoice_id', invoiceId)
      .eq('status', 'active')
      .maybeSingle()

    if (existingCredit) {
      // حدّث السجل الموجود إذا تغيرت القيمة
      if (Math.abs(Number(existingCredit.remaining_amount) - creditAmount) > 0.005) {
        await supabase
          .from('customer_credits')
          .update({ remaining_amount: creditAmount, amount: creditAmount })
          .eq('id', existingCredit.id)
      }
    } else {
      // أنشئ سجلاً جديداً
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
