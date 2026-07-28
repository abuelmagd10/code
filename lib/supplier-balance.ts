/**
 * Supplier Net AP Balance Engine
 * ================================
 * المصدر الوحيد للحقيقة: حساب الذمم الدائنة في القيود المحاسبية (GL)
 *
 * المنطق المحاسبي:
 *   الذمم الدائنة (AP) حساب التزام — رصيده الطبيعي دائن:
 *
 *   Cr AP  ← عند تسجيل فاتورة مشتريات (Bill)        → نحن مدينون للمورد
 *   Dr AP  ← عند دفع الفاتورة (Payment)              → نسدد ما علينا
 *   Dr AP  ← عند إرجاع بضاعة (Purchase Return)       → تخفيض الالتزام
 *   Cr AP  ← عند استرداد فائض الدفع (Reversal)      → المورد يعيد لنا
 *
 *   Net AP  = Σ Cr AP − Σ Dr AP
 *   Net AP > 0  → نحن لا نزال مدينين للمورد (التزام طبيعي)
 *   Net AP < 0  → رصيد دائن للمورد (المورد مدين لنا → يستحق vendor_credit)
 *   Net AP = 0  → صافٍ
 *
 * هذا المبدأ مُطبَّق في SAP، Oracle، Microsoft Dynamics، وجميع ERP الاحترافية.
 *
 * ملاحظة: يوجد fallback للفواتير القديمة التي لا تملك قيوداً GL.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SupplierNetBalance {
  supplierId:     string
  companyId:      string
  /** Σ Cr AP = مجموع الفواتير المُسجَّلة + الاستردادات من المورد */
  totalBilled:    number
  /** Σ Dr AP = مجموع المدفوعات + مجموع المرتجعات */
  totalPaid:      number
  totalReturned:  number   // محجوز للتوافق — مُدمَج في totalPaid أعلاه (GL-mode)
  /**
   * Net AP = totalBilled − totalPaid
   * موجب  → نحن لا نزال مدينين للمورد
   * سالب  → المورد مدين لنا (رصيد دائن)
   */
  netBalance:     number
  /** max(0, −netBalance) — مقدار الرصيد الدائن إذا وُجد */
  creditBalance:  number
  /** true إذا كان رصيد المورد الصافي دائناً فعلياً (المورد يدين لنا) */
  isCredit:       boolean
}

export interface SyncVendorCreditResult {
  success:       boolean
  creditCreated: boolean
  creditAmount:  number
  netBalance:    number
  error?:        string
  /**
   * v3.74.871 — إشعارٌ دائنٌ مفتوحٌ قائمٌ بمبلغٍ مختلف عن المحسوب الآن.
   *
   * ولا يُعاد كتابة مبلغه: فالقاعدة تُنشئ قيده المحاسبى **عند الإدراج
   * وحده** (`trg_auto_journal_vendor_credit` هو BEFORE INSERT لا UPDATE).
   * فتعديل `total_amount` بعد ذلك يترك القيد على مبلغه القديم ⇒ **إشعارٌ
   * يقول رقماً والدفاتر تقول غيره**.
   *
   * وهذا هو موضع الاختلاف عن جانب العملاء، وهو اختلافٌ مُبرَّر لا سهو:
   * `customer_credits` **لا مُشغِّل قيدٍ تلقائىّ عليه**، فتعديل مبلغه لا
   * يمسّ دفتراً.
   */
  amountDiffersFromOpenCredit?: {
    creditId:        string
    openAmount:      number
    calculatedAmount: number
  }
}

// ─── Journal reference types for AP ──────────────────────────────────────────
//
// Cr AP (bills / reversals received from supplier):
//   'bill'                       ← initial bill posting
//   'supplier_payment_reversal'  ← supplier refunds/reverses a payment
//
// Dr AP (payments out / returns reducing AP):
//   'supplier_payment'   ← payment made to supplier
//   'bill_payment'       ← alternative key used in payments page
//   'po_payment'         ← payment tied to a purchase order
//   'purchase_return'    ← purchase return reduces AP

const AP_CR_REFERENCE_TYPES = ['bill', 'supplier_payment_reversal'] as const
const AP_DR_REFERENCE_TYPES = ['supplier_payment', 'bill_payment', 'po_payment', 'purchase_return'] as const

// ─────────────────────────────────────────────────────────────────────────────
// الدالة الرئيسية — تعتمد على حساب AP في القيود المحاسبية (GL)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * احسب رصيد المورد الصافي من حساب الذمم الدائنة (GL)
 *
 * المنهج: جمع كل الدائن والمدين في حساب AP للقيود المرتبطة
 * بفواتير/مرتجعات/مدفوعات المورد. هذا يُجنِّب أي إشكالية مزدوجة الحساب.
 */
export async function getSupplierNetBalance(
  supabase: SupabaseClient,
  companyId: string,
  supplierId: string
): Promise<SupplierNetBalance> {

  // ── 1) جلب حساب الذمم الدائنة للشركة ────────────────────────────────────
  // نستخدم استعلامَين متتالَيَن لضمان الأولوية الصريحة:
  //   أولاً: تطابق دقيق عبر sub_type = 'accounts_payable'
  //   ثانياً: fallback عبر اسم الحساب إذا لم يوجد sub_type مطابق
  const { data: apBySubType } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .eq('sub_type', 'accounts_payable')
    .limit(1)
    .maybeSingle()

  const apAccount = apBySubType ?? (await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .ilike('account_name', '%الذمم الدائن%')
    .limit(1)
    .maybeSingle()
  ).data

  if (!apAccount) {
    // لا يوجد حساب AP مُعرَّف → نستخدم الحساب التشغيلي (fallback)
    return _getSupplierNetBalanceFallback(supabase, companyId, supplierId)
  }

  // ── 2) جمع معرفات مراجع المورد ────────────────────────────────────────────
  const [{ data: billRows }, { data: returnRows }] = await Promise.all([
    supabase
      .from('bills')
      .select('id')
      .eq('company_id', companyId)
      .eq('supplier_id', supplierId)
      .not('status', 'in', '("draft","cancelled")'),
    supabase
      .from('purchase_returns')
      .select('id')
      .eq('company_id', companyId)
      .eq('supplier_id', supplierId)
      .eq('status', 'completed'),
  ])

  const billIds   = (billRows   || []).map(b => b.id)
  const returnIds = (returnRows || []).map(r => r.id)

  if (billIds.length === 0 && returnIds.length === 0) {
    return _emptyBalance(supplierId, companyId)
  }

  // ── 3) جلب القيود المحاسبية المُرسَلة (posted) للمورد ────────────────────
  //
  // نفِّذ استعلامَين منفصلَين لضمان التطابق الدقيق بين reference_type وreference_id:
  //
  //   قيود مرتبطة بمعرف الفاتورة (bill IDs):
  //     bill                      ← Cr AP (نحن مدينون للمورد)
  //     supplier_payment          ← Dr AP (سددنا للمورد)
  //     bill_payment              ← Dr AP (بديل للدفع)
  //     po_payment                ← Dr AP (دفع مرتبط بأمر شراء)
  //     supplier_payment_reversal ← Cr AP (المورد استرجع مبالغ)
  //
  //   قيود مرتبطة بمعرف المرتجع (purchase_return IDs):
  //     purchase_return           ← Dr AP (تخفيض الالتزام بالمرتجع)

  const billRefTypes   = [...AP_CR_REFERENCE_TYPES, ...AP_DR_REFERENCE_TYPES].filter(
    t => t !== 'purchase_return'
  )
  const returnRefTypes = ['purchase_return']

  const [{ data: billJERows }, { data: returnJERows }] = await Promise.all([
    billIds.length > 0
      ? supabase
          .from('journal_entries')
          .select('id')
          .eq('company_id', companyId)
          .in('reference_type', billRefTypes)
          .in('reference_id', billIds)
          .is('deleted_at', null)
          .eq('status', 'posted')
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
    returnIds.length > 0
      ? supabase
          .from('journal_entries')
          .select('id')
          .eq('company_id', companyId)
          .in('reference_type', returnRefTypes)
          .in('reference_id', returnIds)
          .is('deleted_at', null)
          .eq('status', 'posted')
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
  ])

  const jeIds = [
    ...(billJERows   || []).map(je => je.id),
    ...(returnJERows || []).map(je => je.id),
  ]

  if (jeIds.length === 0) {
    // لا توجد قيود GL → fallback تشغيلي
    return _getSupplierNetBalanceFallback(supabase, companyId, supplierId)
  }

  // ── 4) جمع الدائن والمدين في حساب AP من أسطر القيود ──────────────────────
  //
  // AP account normal balance is CREDIT:
  //   Cr lines → نزيد التزامنا تجاه المورد
  //   Dr lines → نخفض التزامنا (دفع / مرتجع)
  //
  // Net AP = Σ Cr − Σ Dr
  // Net AP < 0 → المورد مدين لنا (يستحق vendor_credit)
  const { data: apLines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount')
    .eq('account_id', apAccount.id)
    .in('journal_entry_id', jeIds)

  const totalAPCredits = (apLines || []).reduce((s, l) => s + Number(l.credit_amount || 0), 0)
  const totalAPDebits  = (apLines || []).reduce((s, l) => s + Number(l.debit_amount  || 0), 0)
  const netBalance     = totalAPCredits - totalAPDebits   // positive = we owe supplier
  const creditBalance  = Math.max(0, -netBalance)          // negative net = supplier owes us

  return {
    supplierId,
    companyId,
    totalBilled:   totalAPCredits,  // Σ Cr AP
    totalPaid:     totalAPDebits,   // Σ Dr AP
    totalReturned: 0,               // مُدمَج في totalPaid أعلاه (GL-mode)
    netBalance,
    creditBalance,
    isCredit: netBalance < -0.005,  // تجنب ضجيج floating point
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback — للفواتير القديمة التي لا تملك قيوداً GL
// ─────────────────────────────────────────────────────────────────────────────

async function _getSupplierNetBalanceFallback(
  supabase: SupabaseClient,
  companyId: string,
  supplierId: string
): Promise<SupplierNetBalance> {

  const [{ data: bills }, { data: returns }] = await Promise.all([
    supabase
      .from('bills')
      .select('id, total_amount, returned_amount, paid_amount, status')
      .eq('company_id', companyId)
      .eq('supplier_id', supplierId)
      .not('status', 'in', '("draft","cancelled")'),
    supabase
      .from('purchase_returns')
      .select('total_amount')
      .eq('company_id', companyId)
      .eq('supplier_id', supplierId)
      .eq('status', 'completed'),
  ])

  // إعادة بناء المبلغ الأصلي للفاتورة قبل أي تقليص بسبب المرتجعات
  const totalBilled = (bills || []).reduce((sum, bill) => {
    const paidAmount     = Number(bill.paid_amount     || 0)
    const returnedAmount = Number(bill.returned_amount || 0)
    const totalAmount    = Number(bill.total_amount    || 0)
    const status         = bill.status as string

    // total_amount لم يُقلَّص: مرتجع على فاتورة مدفوعة بالفعل
    const wasNotReduced = (
      (status === 'partially_returned' || status === 'fully_returned')
      && paidAmount > 0
    )

    const originalAmount = wasNotReduced ? totalAmount : totalAmount + returnedAmount
    return sum + originalAmount
  }, 0)

  const totalPaid = (bills || []).reduce(
    (sum, b) => sum + Number(b.paid_amount || 0), 0
  )

  const totalReturned = (returns || []).reduce(
    (sum, r) => sum + Number(r.total_amount || 0), 0
  )

  const netBalance    = totalBilled - totalPaid - totalReturned
  const creditBalance = Math.max(0, -netBalance)

  return {
    supplierId,
    companyId,
    totalBilled,
    totalPaid,
    totalReturned,
    netBalance,
    creditBalance,
    isCredit: netBalance < -0.005,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// مساعد
// ─────────────────────────────────────────────────────────────────────────────

function _emptyBalance(supplierId: string, companyId: string): SupplierNetBalance {
  return {
    supplierId,
    companyId,
    totalBilled:   0,
    totalPaid:     0,
    totalReturned: 0,
    netBalance:    0,
    creditBalance: 0,
    isCredit:      false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// syncVendorCredit — المزامنة التلقائية لرصيد المورد الدائن
// ─────────────────────────────────────────────────────────────────────────────

/**
 * بعد أي عملية (مرتجع، دفعة زائدة، استرداد):
 * 1. احسب الرصيد الصافي للمورد
 * 2. إذا أصبح دائناً (المورد مدين لنا) → أنشئ/حدّث سجل vendor_credits
 * 3. إذا بقي مديناً أو صفراً → لا تُنشئ vendor_credit
 *
 * هذا يضمن أن vendor_credit يعكس حالة الرصيد الفعلية وليس مجرد وجود مرتجع.
 */
export async function syncVendorCredit(
  supabase: SupabaseClient,
  companyId: string,
  supplierId: string,
  billId: string,
  reason?: string
): Promise<SyncVendorCreditResult> {
  try {
    // v3.74.871 — الفرع ومركز التكلفة يُقرآن من الفاتورة المسبِّبة، لا
    // يُترك استنتاجهما للمُشغِّل. فبديله «أقدم فرعٍ فى الشركة» — صحيحٌ
    // لشركةٍ بفرعٍ واحد، وخاطئٌ صامتاً لأى شركةٍ بأكثر.
    let branchId: string | null = null
    let costCenterId: string | null = null

    const { data: sourceBill, error: billErr } = await supabase
      .from('bills')
      .select('id, branch_id, cost_center_id')
      .eq('id', billId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (billErr) {
      return {
        success:       false,
        creditCreated: false,
        creditAmount:  0,
        netBalance:    0,
        error: `VENDOR_CREDIT_BILL_LOOKUP_FAILED: bill ${billId} — ${billErr.message}`,
      }
    }
    if (sourceBill) {
      branchId = sourceBill.branch_id ?? null
      costCenterId = sourceBill.cost_center_id ?? null
    }

    const balance = await getSupplierNetBalance(supabase, companyId, supplierId)

    if (!balance.isCredit) {
      // الرصيد صفر أو مدين → نحن لا نزال مدينين للمورد، لا حاجة لـ vendor_credit
      return {
        success:       true,
        creditCreated: false,
        creditAmount:  0,
        netBalance:    balance.netBalance,
      }
    }

    const creditAmount = Math.round(balance.creditBalance * 100) / 100

    // التحقق من وجود vendor_credit مفتوح لهذا المورد/الفاتورة
    const { data: existingCredit } = await supabase
      .from('vendor_credits')
      .select('id, total_amount, applied_amount')
      .eq('company_id', companyId)
      .eq('supplier_id', supplierId)
      .eq('bill_id', billId)
      .eq('status', 'open')
      .maybeSingle()

    if (existingCredit) {
      const currentRemaining = Number(existingCredit.total_amount || 0)
        - Number(existingCredit.applied_amount || 0)

      // v3.74.871 — كان هنا `update({ total_amount })` بلا فحصٍ ولا وعىٍ
      // بالقيد. ولا يُعدَّل: القيد أُنشئ عند الإدراج ولا يتبع التعديل، فكتابة
      // مبلغٍ جديد تجعل المستند يقول رقماً والدفاتر تقول غيره — وهو ما
      // يمنعه أصل المشروع: **لا يُعدَّل قيدٌ مُرحَّل، بل يُعالَج بمستندٍ جديد**.
      if (Math.abs(currentRemaining - creditAmount) > 0.005) {
        return {
          success:       true,
          creditCreated: false,
          creditAmount:  currentRemaining,
          netBalance:    balance.netBalance,
          amountDiffersFromOpenCredit: {
            creditId:         String(existingCredit.id),
            openAmount:       currentRemaining,
            calculatedAmount: creditAmount,
          },
        }
      }

      // مطابق — لا عمل. و`creditCreated: false` صادقة هنا: لم يُنشأ شىء.
      return {
        success:       true,
        creditCreated: false,
        creditAmount,
        netBalance:    balance.netBalance,
      }
    }

    // إنشاء سجل vendor_credit جديد
    const creditNumber = `VC-AUTO-${Date.now().toString().slice(-8)}`
    const today        = new Date().toISOString().slice(0, 10)

    const { error: insErr } = await supabase.from('vendor_credits').insert({
      company_id:                  companyId,
      supplier_id:                 supplierId,
      bill_id:                     billId,
      source_purchase_invoice_id:  billId,
      credit_number:               creditNumber,
      credit_date:                 today,
      status:                      'open',
      subtotal:                    creditAmount,
      tax_amount:                  0,
      total_amount:                creditAmount,
      applied_amount:              0,
      // ⭐ v3.74.871 — **المفتاح الذى كان ناقصاً.**
      //
      // `fn_auto_journal_vendor_credit` تُنشئ القيد المحاسبى تلقائياً، لكنها
      // تبدأ بـ:
      //     IF reference_type NOT IN ('purchase_return','supplier_overpayment')
      //         THEN RETURN NEW;
      // وهذه الدالة لم تكن ترسل `reference_type` إطلاقاً ⇒ كانت ستُنشئ
      // إشعاراً دائناً **بلا أى أثرٍ محاسبى**: مستندٌ يقول إن للشركة مالاً
      // عند المورد، والدفاتر لا تعرف عنه شيئاً.
      //
      // والقاعدة كانت تنتظر `'supplier_overpayment'` منذ البداية — الآلية
      // مبنيّةٌ والقيمة لم تُرسل قط.
      reference_type:              'supplier_overpayment',
      reference_id:                billId,
      // الفرع ومركز التكلفة من الفاتورة نفسها. والمُشغِّل يتراجع إلى أقدم
      // فرعٍ فى الشركة إن غابا — وهو تخمينٌ يُغنى عنه المصدر الصحيح.
      branch_id:                   branchId ?? null,
      cost_center_id:              costCenterId ?? null,
      notes: reason || 'رصيد دائن صافٍ للمورد (تم الاحتساب تلقائياً)',
    })

    if (insErr) {
      return {
        success:       false,
        creditCreated: false,
        creditAmount:  0,
        netBalance:    balance.netBalance,
        error: `VENDOR_CREDIT_INSERT_FAILED: bill ${billId} supplier ${supplierId} ` +
               `amount ${creditAmount} — ${insErr.message}`,
      }
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
      error:         err?.message || 'Unknown error in syncVendorCredit',
    }
  }
}
