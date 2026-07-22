/**
 * محرك المحاسبة على أساس الاستحقاق (Accrual Accounting Engine)
 * مطابق 100% لـ Zoho Books
 * 
 * المبادئ الأساسية:
 * ✅ تسجيل الإيراد عند إصدار الفاتورة (Issue Event)
 * ✅ تسجيل COGS عند التسليم (Delivery Event)  
 * ✅ تسجيل التحصيل النقدي منفصل عن الإيراد (Payment Event)
 * ✅ ربط المخزون محاسبياً بالأحداث
 * ✅ Trial Balance دائماً متزن
 * ✅ منع أي حلول ترقيعية أو إخفاء أخطاء
 */

import { getLeafAccountIds } from "./accounts"
import { createCompleteJournalEntry, type JournalReferenceType } from "./journal-entry-governance"

export interface AccrualJournalEntry {
  id?: string
  company_id: string
  reference_type: 'invoice' | 'invoice_cogs' | 'customer_payment' | 'supplier_payment' | 'bill' | 'bill_payment' | 'write_off'
  reference_id: string
  entry_date: string
  description: string
  branch_id?: string | null
  cost_center_id?: string | null
  warehouse_id?: string | null
  lines: AccrualJournalLine[]
}

export interface AccrualJournalLine {
  account_id: string
  debit_amount: number
  credit_amount: number
  description: string
  branch_id?: string | null
  cost_center_id?: string | null
}

export interface AccrualAccountMapping {
  company_id: string
  accounts_receivable: string
  accounts_payable: string
  sales_revenue: string
  inventory: string
  cogs: string
  cash: string
  bank: string
  vat_output: string
  vat_input: string
  customer_advance?: string
  supplier_advance?: string
  write_off_expense?: string // حساب مصروف الإهلاك
  // v3.74.784 — خصم المبيعات (المسموح به): contra-revenue for after-tax
  // discounts. Optional because older companies may lack the account; the
  // revenue-journal builder falls back to netting against sales_revenue.
  sales_discount?: string
}

/**
 * الحصول على خريطة الحسابات المطلوبة للمحاسبة على أساس الاستحقاق
 */
export async function getAccrualAccountMapping(
  supabase: any,
  companyId: string
): Promise<AccrualAccountMapping> {
  const { data: accounts, error } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type, sub_type")
    .eq("company_id", companyId)
    .eq("is_active", true)

  if (error) throw error

  const findAccount = (subType: string, fallbackType?: string) => {
    let account = accounts?.find((a: any) => a.sub_type === subType)
    if (!account && fallbackType) {
      account = accounts?.find((a: any) => a.account_type === fallbackType)
    }
    return account?.id
  }

  const mapping: AccrualAccountMapping = {
    company_id: companyId,
    accounts_receivable: findAccount('accounts_receivable', 'asset') || '',
    accounts_payable: findAccount('accounts_payable', 'liability') || '',
    sales_revenue: findAccount('sales_revenue', 'income') || '',
    inventory: findAccount('inventory', 'asset') || '',
    cogs: findAccount('cogs') || findAccount('cost_of_goods_sold', 'expense') || '',
    cash: findAccount('cash', 'asset') || '',
    bank: findAccount('bank', 'asset') || '',
    vat_output: findAccount('vat_output', 'liability') || '',
    vat_input: findAccount('vat_input', 'asset') || '',
    customer_advance: findAccount('customer_advance', 'liability'),
    supplier_advance: findAccount('supplier_advance', 'asset'),
    write_off_expense: findAccount('write_off_expense', 'expense'),
    // v3.74.784 — sub_type is 'sales_discounts' (plural) in the seeded COA
    // (code 4120, خصم المبيعات المسموح به). No account_type fallback: falling
    // back to a random income account would post discounts as revenue.
    sales_discount: findAccount('sales_discounts')
  }

  // التحقق من وجود الحسابات الأساسية
  const requiredAccounts = ['accounts_receivable', 'accounts_payable', 'sales_revenue', 'inventory', 'cogs']
  for (const account of requiredAccounts) {
    if (!mapping[account as keyof AccrualAccountMapping]) {
      throw new Error(`Required account not found: ${account}`)
    }
  }

  return mapping
}

/**
 * تحضير بيانات قيد إيراد الفاتورة (بدون حفظ)
 * لاستخدامها في المعاملات الذرية (Atomic Transactions)
 */
export async function prepareInvoiceRevenueJournal(
  supabase: any,
  invoiceId: string,
  companyId: string,
  options?: { allowDraft?: boolean }
): Promise<AccrualJournalEntry | null> {
  // v3.23.0: load FX context so we can post the journal in BASE CURRENCY (IAS 21)
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, invoice_date, status,
      subtotal, tax_amount, total_amount, shipping,
      currency_code, exchange_rate, base_currency_total,
      branch_id, cost_center_id, customer_id
    `)
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .single()

  if (invoiceError || !invoice) {
    throw new Error(`Invoice not found: ${invoiceError?.message}`)
  }

  // فقط للفواتير المرسلة (ليس المسودات)
  if (invoice.status === 'draft' && !options?.allowDraft) {
    return null
  }

  // الحصول على خريطة الحسابات
  const mapping = await getAccrualAccountMapping(supabase, companyId)

  // ─── v3.23.0: IAS 21 — journal entries MUST be in base currency ────────────
  // For FC invoices, multiply FC amounts by exchange_rate to get base values.
  // We also record original_* + exchange_rate_used for IAS 21 disclosure.
  const fxRate = Number(invoice.exchange_rate || 1) || 1
  const invoiceCurrency = String(invoice.currency_code || '').toUpperCase()
  const isFC = !!invoiceCurrency && fxRate !== 1

  // Raw FC amounts (as entered)
  const fcNet = Number(invoice.subtotal || 0)
  const fcVat = Number(invoice.tax_amount || 0)
  const fcShipping = Number(invoice.shipping || 0)
  const fcTotal = Number(invoice.total_amount || 0)

  // Base currency amounts (what the GL stores)
  const round2 = (n: number) => Math.round(n * 100) / 100
  const netAmount = isFC ? round2(fcNet * fxRate) : fcNet
  const vatAmount = isFC ? round2(fcVat * fxRate) : fcVat
  const shippingAmount = isFC ? round2(fcShipping * fxRate) : fcShipping
  const totalAmount = isFC
    ? (Number(invoice.base_currency_total || 0) || round2(fcTotal * fxRate))
    : fcTotal
  // ────────────────────────────────────────────────────────────────────────────

  // إنشاء القيد المحاسبي
  const journalEntry: AccrualJournalEntry = {
    company_id: companyId,
    reference_type: 'invoice',
    reference_id: invoiceId,
    entry_date: invoice.invoice_date,
    description: `إيراد المبيعات - ${invoice.invoice_number}`,
    branch_id: invoice.branch_id,
    cost_center_id: invoice.cost_center_id,
    lines: []
  }

  // مدين: العملاء (Accounts Receivable) - إجمالي الفاتورة (base currency)
  journalEntry.lines.push({
    account_id: mapping.accounts_receivable,
    debit_amount: totalAmount,
    credit_amount: 0,
    description: 'مستحق من العميل',
    branch_id: invoice.branch_id,
    cost_center_id: invoice.cost_center_id,
    // v3.23.0: IAS 21 disclosure — keep the original FC values
    original_debit: isFC ? fcTotal : null,
    original_credit: isFC ? 0 : null,
    original_currency: isFC ? invoiceCurrency : null,
    exchange_rate_used: isFC ? fxRate : 1,
  } as any)

  // دائن: إيرادات المبيعات (Sales Revenue) - صافي المبلغ (base currency)
  if (netAmount > 0) {
    journalEntry.lines.push({
      account_id: mapping.sales_revenue,
      debit_amount: 0,
      credit_amount: netAmount,
      description: 'إيراد المبيعات',
      branch_id: invoice.branch_id,
      cost_center_id: invoice.cost_center_id,
      original_debit: isFC ? 0 : null,
      original_credit: isFC ? fcNet : null,
      original_currency: isFC ? invoiceCurrency : null,
      exchange_rate_used: isFC ? fxRate : 1,
    } as any)
  }

  // دائن: ضريبة القيمة المضافة (إذا وجدت)
  if (vatAmount > 0 && mapping.vat_output) {
    journalEntry.lines.push({
      account_id: mapping.vat_output,
      debit_amount: 0,
      credit_amount: vatAmount,
      description: 'ضريبة القيمة المضافة',
      branch_id: invoice.branch_id,
      cost_center_id: invoice.cost_center_id,
      original_debit: isFC ? 0 : null,
      original_credit: isFC ? fcVat : null,
      original_currency: isFC ? invoiceCurrency : null,
      exchange_rate_used: isFC ? fxRate : 1,
    } as any)
  }

  // دائن: إيراد الشحن (إذا وجد)
  if (shippingAmount > 0) {
    journalEntry.lines.push({
      account_id: mapping.sales_revenue,
      debit_amount: 0,
      credit_amount: shippingAmount,
      description: 'إيراد الشحن',
      branch_id: invoice.branch_id,
      cost_center_id: invoice.cost_center_id,
      original_debit: isFC ? 0 : null,
      original_credit: isFC ? fcShipping : null,
      original_currency: isFC ? invoiceCurrency : null,
      exchange_rate_used: isFC ? fxRate : 1,
    } as any)
  }

  // v3.74.784 — the line this builder never wrote: the AFTER-TAX discount.
  //
  // The builder debits AR with the invoice TOTAL (net of everything) and
  // credits revenue + VAT + shipping — the PRE-discount components. For a
  // before-tax discount that balances, because subtotal is already net of it.
  // For an after-tax discount nothing on the credit side shrinks, so every
  // such invoice arrived at the DB guard unbalanced by exactly the discount
  // (proven live: Debit=274.60, Credit=294.00, gap 19.40 = the 10% خصم بعد
  // الضريبة) and could never be posted.
  //
  // The gap is computed from the very numbers just placed on the lines, so
  // this line balances the entry BY CONSTRUCTION — whatever combination of
  // after-tax discount and adjustment produced it. Debited to خصم المبيعات
  // (المسموح به) [sub_type sales_discounts, code 4120 in the seeded COA] so
  // the discount is visible as contra-revenue; if a company lacks that
  // account, netting against sales_revenue keeps the books balanced.
  const fcGap = round2(fcNet + fcVat + fcShipping - fcTotal)
  const gapAmount = round2(netAmount + vatAmount + shippingAmount - totalAmount)
  if (gapAmount > 0.009) {
    journalEntry.lines.push({
      account_id: mapping.sales_discount || mapping.sales_revenue,
      debit_amount: gapAmount,
      credit_amount: 0,
      description: 'خصم مسموح به (بعد الضريبة)',
      branch_id: invoice.branch_id,
      cost_center_id: invoice.cost_center_id,
      original_debit: isFC ? fcGap : null,
      original_credit: isFC ? 0 : null,
      original_currency: isFC ? invoiceCurrency : null,
      exchange_rate_used: isFC ? fxRate : 1,
    } as any)
  } else if (gapAmount < -0.009) {
    // the mirror case: an adjustment that RAISES the total above the
    // components (invoices.adjustment > 0) — credited so the entry balances
    // instead of failing at the guard.
    journalEntry.lines.push({
      account_id: mapping.sales_revenue,
      debit_amount: 0,
      credit_amount: -gapAmount,
      description: 'تسوية على الفاتورة',
      branch_id: invoice.branch_id,
      cost_center_id: invoice.cost_center_id,
      original_debit: isFC ? 0 : null,
      original_credit: isFC ? -fcGap : null,
      original_currency: isFC ? invoiceCurrency : null,
      exchange_rate_used: isFC ? fxRate : 1,
    } as any)
  }

  return journalEntry
}

/**
 * تسجيل الإيراد عند إصدار الفاتورة (Issue Event)
 * هذا هو الحدث الأساسي في Accrual Accounting
 */
export async function createInvoiceRevenueJournal(
  supabase: any,
  invoiceId: string,
  companyId: string
): Promise<string | null> {
  try {
    // التحقق من عدم وجود قيد سابق
    const { data: existingEntry } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice")
      .eq("reference_id", invoiceId)
      .limit(1)

    if (existingEntry && existingEntry.length > 0) {
      console.log(`Invoice journal already exists for ${invoiceId}`)
      return existingEntry[0].id
    }

    // تحضير القيد
    const journalEntry = await prepareInvoiceRevenueJournal(supabase, invoiceId, companyId)

    if (!journalEntry) return null

    // حفظ القيد في قاعدة البيانات
    return await saveJournalEntry(supabase, journalEntry)

  } catch (error) {
    console.error('Error creating invoice revenue journal:', error)
    throw error
  }
}

/**
 * تحضير بيانات قيد تكلفة البضاعة المباعة (بدون حفظ)
 */
export async function prepareCOGSJournalOnDelivery(
  supabase: any,
  invoiceId: string,
  companyId: string,
  preCalculatedTotalCOGS?: number, // اختياري: إذا كان محسوباً مسبقاً في نفس العملية
  options?: { allowDraft?: boolean }
): Promise<AccrualJournalEntry | null> {
  // الحصول على بيانات الفاتورة
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, invoice_date, status,
      branch_id, cost_center_id
    `)
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .single()

  if (invoiceError || !invoice) {
    throw new Error(`Invoice not found: ${invoiceError?.message}`)
  }

  // فقط للفواتير المرسلة
  if (invoice.status === 'draft' && !options?.allowDraft) {
    return null
  }

  let totalCOGS = preCalculatedTotalCOGS || 0

  if (!preCalculatedTotalCOGS) {
    // ✅ ERP Professional: حساب COGS من cogs_transactions (المصدر الوحيد للحقيقة)
    try {
      const { getCOGSByInvoice } = await import("@/lib/cogs-transactions")
      const cogsTransactions = await getCOGSByInvoice(supabase, invoiceId)

      if (cogsTransactions && cogsTransactions.length > 0) {
        totalCOGS = cogsTransactions.reduce((sum, ct) => sum + Number(ct.total_cost || 0), 0)
      } else {
        console.warn(`⚠️ No cogs_transactions found for invoice ${invoiceId} - skipping COGS journal entry creation`)
        return null
      }
    } catch (error: any) {
      console.error("Error fetching COGS transactions:", error)
      return null
    }
  }

  // إذا لم توجد تكلفة، لا نسجل قيد
  if (totalCOGS <= 0) {
    return null
  }

  // الحصول على خريطة الحسابات
  const mapping = await getAccrualAccountMapping(supabase, companyId)

  // إنشاء قيد COGS
  const journalEntry: AccrualJournalEntry = {
    company_id: companyId,
    reference_type: 'invoice_cogs',
    reference_id: invoiceId,
    entry_date: invoice.invoice_date,
    description: `تكلفة البضاعة المباعة - ${invoice.invoice_number}`,
    branch_id: invoice.branch_id,
    cost_center_id: invoice.cost_center_id,
    lines: [
      {
        // مدين: تكلفة البضاعة المباعة (COGS) - مصروف
        account_id: mapping.cogs,
        debit_amount: totalCOGS,
        credit_amount: 0,
        description: 'تكلفة البضاعة المباعة',
        branch_id: invoice.branch_id,
        cost_center_id: invoice.cost_center_id
      },
      {
        // دائن: المخزون (Inventory) - أصل
        account_id: mapping.inventory,
        debit_amount: 0,
        credit_amount: totalCOGS,
        description: 'خصم من المخزون',
        branch_id: invoice.branch_id,
        cost_center_id: invoice.cost_center_id
      }
    ]
  }

  return journalEntry
}

/**
 * تسجيل COGS عند التسليم (Delivery Event)
 * يتم تسجيله مع الإيراد في نفس الوقت
 */
export async function createCOGSJournalOnDelivery(
  supabase: any,
  invoiceId: string,
  companyId: string
): Promise<string | null> {
  try {
    // التحقق من عدم وجود قيد COGS سابق
    const { data: existingCOGS } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice_cogs")
      .eq("reference_id", invoiceId)
      .limit(1)

    if (existingCOGS && existingCOGS.length > 0) {
      console.log(`COGS journal already exists for ${invoiceId}`)
      return existingCOGS[0].id
    }

    // تحضير القيد
    const journalEntry = await prepareCOGSJournalOnDelivery(supabase, invoiceId, companyId)

    if (!journalEntry) return null

    // حفظ القيد في قاعدة البيانات
    return await saveJournalEntry(supabase, journalEntry)

  } catch (error) {
    console.error('Error creating COGS journal:', error)
    throw error
  }
}

/**
 * تحضير بيانات قيد التحصيل/الدفع من كائن البيانات مباشرة (بدون حفظ)
 *
 * Multi-currency / IAS 21 support:
 * --------------------------------
 * When the underlying invoice/bill is in a foreign currency and the rate at
 * payment date differs from the rate when the invoice/bill was issued, the
 * difference is posted to either:
 *   - 4320 (FX Gain — أرباح فروق العملة)  via getFXAccounts
 *   - 5310 (FX Loss — خسائر فروق العملة) via getFXAccounts
 *
 * Required fields on paymentData for FX:
 *   - paymentData.amount               (number)  amount paid, in BASE currency
 *   - paymentData.exchange_rate        (number, optional) FC→base rate AT PAYMENT TIME
 *   - paymentData.original_currency_amount (number, optional) amount in FC
 *
 * Behavior:
 *   - If the invoice/bill currency == company base currency: no FX, classic Dr/Cr.
 *   - If the invoice/bill currency != base AND paymentData.exchange_rate is given:
 *       AR_relieved_base = original_currency_amount × invoice.exchange_rate
 *       Cash_received_base = paymentData.amount
 *       fx_diff = Cash_received_base - AR_relieved_base   (customer payment)
 *               (sign flips for supplier payments)
 *       Post the diff to 4320 (positive) or 5310 (negative).
 *   - If FC but exchange_rate not given: behaves like the legacy path (no FX line).
 *     A console.warn is emitted so the caller can detect the gap.
 */
export async function preparePaymentJournalFromData(
  supabase: any,
  paymentData: any, // Payment Object
  companyId: string
): Promise<AccrualJournalEntry | null> {

  // الحصول على خريطة الحسابات
  const mapping = await getAccrualAccountMapping(supabase, companyId)

  // تحديد حساب النقد/البنك
  const cashAccountId = paymentData.account_id || mapping.cash || mapping.bank

  if (!cashAccountId) {
    throw new Error('Cash/Bank account not found')
  }

  // v3.23.0: Normalize amount to BASE CURRENCY (IAS 21).
  // Some callers (e.g. /payments page) pass paymentData.amount in FC while
  // paymentData.base_currency_amount holds the converted value. Trust the
  // base_currency_amount when it's present and the payment currency differs
  // from the company base currency.
  const fcAmountIn = Number(paymentData.amount || 0)
  const baseAmountIn = Number(paymentData.base_currency_amount || 0)
  const paymentCurrencyIn = String(paymentData.currency_code || '').toUpperCase()
  const isCustomerPayment = !!paymentData.customer_id
  const isSupplierPayment = !!paymentData.supplier_id

  // ---------------------------------------------------------------
  // FX detection: compare invoice/bill currency vs company base
  // ---------------------------------------------------------------
  let fxDiff = 0  // in base currency; +ve = gain (customer) / loss (supplier)
  // Will be set below once we know the base currency code.
  let amount = fcAmountIn
  let arApAmount = amount  // base-currency amount to relieve from AR/AP
  let sourceCurrency: string | null = null
  let sourceRate: number | null = null

  try {
    // Fetch base currency for the company
    const { data: companyRow } = await supabase
      .from('companies')
      .select('base_currency')
      .eq('id', companyId)
      .maybeSingle()
    const baseCurrency = (companyRow?.base_currency || 'EGP').toUpperCase()

    // v3.23.0: If the payment is in FC and base_currency_amount is set,
    // use it as the authoritative base-currency amount. This rescues callers
    // that send paymentData.amount in FC instead of base.
    if (
      paymentCurrencyIn &&
      paymentCurrencyIn !== baseCurrency &&
      baseAmountIn > 0 &&
      Math.abs(baseAmountIn - fcAmountIn) > 0.01
    ) {
      amount = baseAmountIn
      arApAmount = baseAmountIn
    }

    // Look up the source document (invoice or bill) to read original FX rate
    if (isCustomerPayment && paymentData.invoice_id) {
      const { data: inv } = await supabase
        .from('invoices')
        .select('currency_code, exchange_rate, base_currency_total, total_amount')
        .eq('id', paymentData.invoice_id)
        .maybeSingle()
      sourceCurrency = (inv?.currency_code || baseCurrency).toUpperCase()
      sourceRate = Number(inv?.exchange_rate || 1)
    } else if (isSupplierPayment && paymentData.bill_id) {
      const { data: bill } = await supabase
        .from('bills')
        .select('currency_code, exchange_rate, base_currency_total, total_amount')
        .eq('id', paymentData.bill_id)
        .maybeSingle()
      sourceCurrency = (bill?.currency_code || baseCurrency).toUpperCase()
      sourceRate = Number(bill?.exchange_rate || 1)
    }

    // FX adjustment kicks in only if all three are present
    const paymentRate = Number(paymentData.exchange_rate || 0)
    const fcAmount = Number(paymentData.original_currency_amount || 0)
    // Narrow the types via inline checks so TypeScript can infer non-null
    const isForeignCurrency = !!(
      sourceCurrency &&
      sourceCurrency !== baseCurrency &&
      sourceRate !== null &&
      sourceRate > 0
    )

    if (isForeignCurrency && sourceRate !== null && paymentRate > 0 && fcAmount > 0) {
      // Both rates available → compute FX difference per IAS 21 §28
      const arApRelievedAtOriginalRate = fcAmount * sourceRate
      const cashAtPaymentRate = fcAmount * paymentRate
      // Sanity: amount should equal cashAtPaymentRate (rounded). We trust paymentData.amount.
      arApAmount = arApRelievedAtOriginalRate
      // For customer: cash debit > AR credit → gain
      // For supplier: AP debit < cash credit → loss
      fxDiff = cashAtPaymentRate - arApRelievedAtOriginalRate
    } else if (isForeignCurrency) {
      // FC invoice but no rate provided — caller should pass exchange_rate.
      // Warn so the gap is visible; preserve legacy behavior (no FX line).
      console.warn(
        `[preparePaymentJournalFromData] FC document ${sourceCurrency} detected ` +
        `but paymentData.exchange_rate / original_currency_amount missing — ` +
        `FX gain/loss will NOT be posted. payment_id=${paymentData.id}`
      )
    }
  } catch (fxErr) {
    // Non-fatal: fall back to legacy behavior if FX lookup fails
    console.warn('[preparePaymentJournalFromData] FX detection skipped:', fxErr)
  }

  // إنشاء قيد التحصيل/الدفع
  const journalEntry: AccrualJournalEntry = {
    company_id: companyId,
    reference_type: isCustomerPayment ? 'customer_payment' : 'supplier_payment',
    reference_id: paymentData.id || 'TEMP_PAYMENT_ID',
    entry_date: paymentData.payment_date,
    description: `${isCustomerPayment ? 'تحصيل نقدي' : 'دفع نقدي'} - ${paymentData.reference || 'دفعة'}`,
    branch_id: paymentData.branch_id,
    cost_center_id: paymentData.cost_center_id,
    warehouse_id: paymentData.warehouse_id,
    lines: []
  }

  // Resolve FX accounts only if needed
  let fxGainAccountId: string | null = null
  let fxLossAccountId: string | null = null
  if (Math.abs(fxDiff) >= 0.01) {
    try {
      const { getFXAccounts } = await import('./currency-service')
      const fx = await getFXAccounts(supabase, companyId)
      fxGainAccountId = fx.gainId
      fxLossAccountId = fx.lossId
    } catch (fxErr) {
      // If FX accounts unavailable, skip the adjustment line and warn loudly
      console.error(
        '[preparePaymentJournalFromData] FX diff detected but FX accounts ' +
        'unavailable — payment will be unbalanced in FC terms. Configure ' +
        'accounts 4320 / 5310 or companies.fx_gain_account_id / fx_loss_account_id.',
        fxErr
      )
      fxDiff = 0  // silently skip rather than fail the payment
      arApAmount = amount
    }
  }

  // v3.25.0: Look up cash/bank account currency so we can record `original_debit`
  // on the cash leg in the account's own currency (per Enterprise FX Pattern §3).
  // Reads from chart_of_accounts.original_currency (set by user via v3.24.0 picker).
  let cashAccountCurrency: string | null = null
  let cashAccountInAcctCcy: number = amount       // default: account is in base, value equal
  let cashAccountToBaseRate: number = 1
  try {
    const baseCurrencyForAcct = await (async () => {
      try {
        const { data: c } = await supabase.from('companies').select('base_currency').eq('id', companyId).maybeSingle()
        return String((c as any)?.base_currency || 'EGP').toUpperCase()
      } catch { return 'EGP' }
    })()
    const { data: cashAcct } = await supabase
      .from('chart_of_accounts')
      .select('original_currency')
      .eq('id', cashAccountId)
      .maybeSingle()
    const ac = String((cashAcct as any)?.original_currency || '').toUpperCase()
    if (ac && ac !== baseCurrencyForAcct) {
      // Account is in FC — look up rate to base
      const { data: acctRateRow } = await supabase
        .from('exchange_rates')
        .select('rate')
        .eq('from_currency', ac)
        .eq('to_currency', baseCurrencyForAcct)
        .order('rate_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      const acctRate = Number((acctRateRow as any)?.rate || 1) || 1
      cashAccountCurrency = ac
      cashAccountToBaseRate = acctRate
      // amount (base) / acctRate = amount in account currency
      cashAccountInAcctCcy = Math.round((amount / acctRate) * 10000) / 10000
    }
  } catch (acctErr) {
    // non-fatal: omit account-currency FC tracking
    console.warn('[preparePaymentJournalFromData] could not load cash account currency:', acctErr)
  }

  if (isCustomerPayment) {
    // Customer payment: Dr. Cash / Cr. AR  (+FX line if applicable)
    journalEntry.lines.push(
      {
        account_id: cashAccountId,
        debit_amount: amount,
        credit_amount: 0,
        description: 'تحصيل نقدي',
        branch_id: paymentData.branch_id,
        cost_center_id: paymentData.cost_center_id,
        // v3.25.0: record cash side in account's own currency (IAS 21 disclosure)
        original_debit: cashAccountCurrency ? cashAccountInAcctCcy : null,
        original_credit: cashAccountCurrency ? 0 : null,
        original_currency: cashAccountCurrency,
        exchange_rate_used: cashAccountCurrency ? cashAccountToBaseRate : 1,
      } as any,
      {
        account_id: mapping.accounts_receivable,
        debit_amount: 0,
        credit_amount: arApAmount,
        description: 'تحصيل من العميل',
        branch_id: paymentData.branch_id,
        cost_center_id: paymentData.cost_center_id
      }
    )
    if (Math.abs(fxDiff) >= 0.01) {
      if (fxDiff > 0 && fxGainAccountId) {
        // Cash > AR: we got more base currency than recorded → FX Gain
        journalEntry.lines.push({
          account_id: fxGainAccountId,
          debit_amount: 0,
          credit_amount: fxDiff,
          description: `فرق سعر العملة - مكسب (${sourceCurrency} → base)`,
          branch_id: paymentData.branch_id,
          cost_center_id: paymentData.cost_center_id
        })
      } else if (fxDiff < 0 && fxLossAccountId) {
        // Cash < AR: we got less base currency than recorded → FX Loss
        journalEntry.lines.push({
          account_id: fxLossAccountId,
          debit_amount: Math.abs(fxDiff),
          credit_amount: 0,
          description: `فرق سعر العملة - خسارة (${sourceCurrency} → base)`,
          branch_id: paymentData.branch_id,
          cost_center_id: paymentData.cost_center_id
        })
      }
    }
  } else if (isSupplierPayment) {
    // Supplier payment: Dr. AP / Cr. Cash  (+FX line if applicable)
    journalEntry.lines.push(
      {
        account_id: mapping.accounts_payable,
        debit_amount: arApAmount,
        credit_amount: 0,
        description: 'سداد للمورد',
        branch_id: paymentData.branch_id,
        cost_center_id: paymentData.cost_center_id
      },
      {
        account_id: cashAccountId,
        debit_amount: 0,
        credit_amount: amount,
        description: 'دفع نقدي',
        branch_id: paymentData.branch_id,
        cost_center_id: paymentData.cost_center_id,
        // v3.25.0: cash side in account's own currency
        original_debit: cashAccountCurrency ? 0 : null,
        original_credit: cashAccountCurrency ? cashAccountInAcctCcy : null,
        original_currency: cashAccountCurrency,
        exchange_rate_used: cashAccountCurrency ? cashAccountToBaseRate : 1,
      } as any
    )
    if (Math.abs(fxDiff) >= 0.01) {
      if (fxDiff > 0 && fxLossAccountId) {
        // Cash > AP: we paid more base currency than recorded → FX Loss
        journalEntry.lines.push({
          account_id: fxLossAccountId,
          debit_amount: fxDiff,
          credit_amount: 0,
          description: `فرق سعر العملة - خسارة (${sourceCurrency} → base)`,
          branch_id: paymentData.branch_id,
          cost_center_id: paymentData.cost_center_id
        })
      } else if (fxDiff < 0 && fxGainAccountId) {
        // Cash < AP: we paid less base currency than recorded → FX Gain
        journalEntry.lines.push({
          account_id: fxGainAccountId,
          debit_amount: 0,
          credit_amount: Math.abs(fxDiff),
          description: `فرق سعر العملة - مكسب (${sourceCurrency} → base)`,
          branch_id: paymentData.branch_id,
          cost_center_id: paymentData.cost_center_id
        })
      }
    }
  }

  return journalEntry
}

/**
 * تسجيل التحصيل النقدي (Payment Event)
 * منفصل تماماً عن تسجيل الإيراد
 */
export async function createPaymentJournal(
  supabase: any,
  paymentId: string,
  companyId: string,
  invoiceId?: string
): Promise<string | null> {
  try {
    // الحصول على بيانات الدفعة
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select(`
        id, payment_date, amount, payment_method,
        reference, account_id, customer_id, supplier_id,
        branch_id, cost_center_id, warehouse_id, company_id
      `)
      .eq("id", paymentId)
      .eq("company_id", companyId)
      .single()

    if (paymentError || !payment) {
      throw new Error(`Payment not found: ${paymentError?.message}`)
    }

    // التحقق من عدم وجود قيد دفع سابق (أنواع المرجع الحالية + legacy: payment)
    const { data: existingPayment } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_id", paymentId)
      .in("reference_type", ["customer_payment", "supplier_payment", "payment"])
      .limit(1)

    if (existingPayment && existingPayment.length > 0) {
      console.log(`Payment journal already exists for payment ${paymentId}`)
      return existingPayment[0].id
    }

    // تحضير القيد
    const journalEntry = await preparePaymentJournalFromData(supabase, payment, companyId)

    if (!journalEntry) return null

    // حفظ القيد في قاعدة البيانات
    return await saveJournalEntry(supabase, journalEntry)

  } catch (error) {
    console.error('Error creating payment journal:', error)
    throw error
  }
}

/**
 * العثور على قيد فاتورة المشتريات الموجود (مرحّل) حتى لو كان SELECT على journal_entries
 * محجوبًا لدى بعض الأدوار (مثل store_manager) — يعتمد على RPC SECURITY DEFINER عند توفره.
 */
async function resolveJournalEntryIdForBill(
  supabase: any,
  companyId: string,
  billId: string
): Promise<string | null> {
  try {
    const { data: rpcId, error: rpcErr } = await supabase.rpc(
      "get_journal_entry_id_for_bill_receipt",
      { p_company_id: companyId, p_bill_id: billId }
    )
    if (!rpcErr && rpcId) return String(rpcId)
    if (rpcErr && typeof console !== "undefined" && console.debug) {
      console.debug("[resolveJournalEntryIdForBill] RPC:", rpcErr.message || rpcErr)
    }
  } catch (e: any) {
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[resolveJournalEntryIdForBill] RPC exception:", e?.message || e)
    }
  }

  // بدون فلتر reference_type: قد يُخزَّن المرجع كـ bill أو غيره حسب مسار الإنشاء
  const { data: rows } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("company_id", companyId)
    .eq("reference_id", billId)
    .order("created_at", { ascending: false })
    .limit(1)

  if (rows && rows.length > 0) return rows[0].id as string

  // المتصفح: جلب المعرف عبر API خادمي (service role) عندما RLS يمنع قراءة journal_entries
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/bills/${encodeURIComponent(billId)}/journal-entry-id`, {
        credentials: "include",
      })
      if (res.ok) {
        const body = (await res.json()) as { journal_entry_id?: string | null }
        if (body?.journal_entry_id) return String(body.journal_entry_id)
      }
    } catch {
      // تجاهل — نكمل إلى محاولة إنشاء القيد أو الخطأ
    }
  }

  return null
}

/**
 * تسجيل المشتريات في المخزون (Bill Event)
 */
export async function createPurchaseInventoryJournal(
  supabase: any,
  billId: string,
  companyId: string
): Promise<string | null> {
  try {
    // v3.23.0: load FX context so we can post the journal in BASE CURRENCY (IAS 21)
    const { data: bill, error: billError } = await supabase
      .from("bills")
      .select(`
        id, bill_number, bill_date, status,
        subtotal, tax_amount, total_amount, shipping, adjustment,
        currency_code, exchange_rate, base_currency_total,
        branch_id, cost_center_id, supplier_id
      `)
      .eq("id", billId)
      .eq("company_id", companyId)
      .single()

    if (billError || !bill) {
      throw new Error(`Bill not found: ${billError?.message}`)
    }

    // فقط للفواتير المرسلة/المستلمة
    if (bill.status === 'draft') {
      return null
    }

    // التحقق من عدم وجود قيد سابق (يشمل حالة القيد المرحّل من اعتماد أمر الشراء / إرسال الفاتورة)
    const existingJeId = await resolveJournalEntryIdForBill(supabase, companyId, billId)
    if (existingJeId) {
      console.log(`Bill journal already exists for ${bill.bill_number}`)
      return existingJeId
    }

    // الحصول على خريطة الحسابات
    const mapping = await getAccrualAccountMapping(supabase, companyId)

    // ─── v3.23.0: IAS 21 — convert FC bill amounts to base currency ────────────
    const billFxRate = Number((bill as any).exchange_rate || 1) || 1
    const billCurrency = String((bill as any).currency_code || '').toUpperCase()
    const billIsFC = !!billCurrency && billFxRate !== 1

    const fcBillNet = Number(bill.subtotal || 0)
    const fcBillVat = Number(bill.tax_amount || 0)
    const fcBillShip = Number((bill as any).shipping || 0)
    const fcBillAdj = Number((bill as any).adjustment || 0)
    const fcBillTotal = Number(bill.total_amount || 0)

    const round2 = (n: number) => Math.round(n * 100) / 100
    const netAmount = billIsFC ? round2(fcBillNet * billFxRate) : fcBillNet
    const vatAmount = billIsFC ? round2(fcBillVat * billFxRate) : fcBillVat
    const shippingAmount = billIsFC ? round2(fcBillShip * billFxRate) : fcBillShip
    const adjustmentAmount = billIsFC ? round2(fcBillAdj * billFxRate) : fcBillAdj
    const totalAmount = billIsFC
      ? (Number((bill as any).base_currency_total || 0) || round2(fcBillTotal * billFxRate))
      : fcBillTotal
    // ──────────────────────────────────────────────────────────────────────────

    // إنشاء قيد الشراء
    const journalEntry: AccrualJournalEntry = {
      company_id: companyId,
      reference_type: 'bill',
      reference_id: billId,
      entry_date: bill.bill_date,
      description: `شراء مخزون - ${bill.bill_number}`,
      branch_id: bill.branch_id,
      cost_center_id: bill.cost_center_id,
      lines: []
    }

    // مدين: المخزون (Inventory) - صافي المبلغ
    if (netAmount > 0) {
      journalEntry.lines.push({
        account_id: mapping.inventory,
        debit_amount: netAmount,
        credit_amount: 0,
        description: 'شراء مخزون',
        branch_id: bill.branch_id,
        cost_center_id: bill.cost_center_id
      })
    }

    // مدين: ضريبة القيمة المضافة - مدخلات (إذا وجدت)
    if (vatAmount > 0 && mapping.vat_input) {
      journalEntry.lines.push({
        account_id: mapping.vat_input,
        debit_amount: vatAmount,
        credit_amount: 0,
        description: 'ضريبة القيمة المضافة - مدخلات',
        branch_id: bill.branch_id,
        cost_center_id: bill.cost_center_id
      })
    }

    // مدين: مصاريف الشحن (إذا وجدت)
    if (shippingAmount > 0) {
      // يمكن استخدام حساب مصاريف منفصل للشحن أو إضافته للمخزون
      journalEntry.lines.push({
        account_id: mapping.inventory, // أو حساب منفصل لمصاريف الشحن
        debit_amount: shippingAmount,
        credit_amount: 0,
        description: 'مصاريف الشحن',
        branch_id: bill.branch_id,
        cost_center_id: bill.cost_center_id
      })
    }

    // مدين: التعديلات (إذا وجدت)
    if (adjustmentAmount !== 0) {
      journalEntry.lines.push({
        account_id: mapping.inventory, // أو حساب منفصل للتعديلات
        debit_amount: adjustmentAmount > 0 ? adjustmentAmount : 0,
        credit_amount: adjustmentAmount < 0 ? Math.abs(adjustmentAmount) : 0,
        description: adjustmentAmount > 0 ? 'تعديل إضافي' : 'تعديل خصم',
        branch_id: bill.branch_id,
        cost_center_id: bill.cost_center_id
      })
    }

    // دائن: الموردين (Accounts Payable) - إجمالي المبلغ بالعملة الأساسية
    // v3.23.0: includes original FC values for IAS 21 disclosure when bill is FC
    journalEntry.lines.push({
      account_id: mapping.accounts_payable,
      debit_amount: 0,
      credit_amount: totalAmount,
      description: 'مستحق للمورد',
      branch_id: bill.branch_id,
      cost_center_id: bill.cost_center_id,
      original_debit: billIsFC ? 0 : null,
      original_credit: billIsFC ? fcBillTotal : null,
      original_currency: billIsFC ? billCurrency : null,
      exchange_rate_used: billIsFC ? billFxRate : 1,
    } as any)

    // حفظ القيد في قاعدة البيانات
    try {
      return await saveJournalEntry(supabase, journalEntry)
    } catch (saveErr: any) {
      const msg = saveErr?.message || String(saveErr)
      // إن كان القيد موجودًا ومُرحَّلاً ولم يظهر في SELECT بسبب RLS، نعيد جلب المعرف عبر RPC
      if (
        msg.includes("Cannot add lines to a posted journal entry") ||
        msg.includes("posted journal") ||
        msg.includes("DUPLICATE_JE")
      ) {
        const retryId = await resolveJournalEntryIdForBill(supabase, companyId, billId)
        if (retryId) return retryId
      }
      throw saveErr
    }

  } catch (error) {
    console.error('Error creating purchase inventory journal:', error)
    throw error
  }
}

/**
 * تسجيل إهلاك المخزون (Write-off Event)
 * يتم تسجيله على أساس الاستحقاق عند اعتماد الإهلاك
 */
export async function createWriteOffJournal(
  supabase: any,
  writeOffId: string,
  companyId: string
): Promise<string | null> {
  try {
    // الحصول على بيانات الإهلاك
    const { data: writeOff, error: writeOffError } = await supabase
      .from("inventory_write_offs")
      .select(`
        id, write_off_number, write_off_date, status,
        total_cost, base_amount, currency_code, exchange_rate,
        branch_id, cost_center_id, warehouse_id
      `)
      .eq("id", writeOffId)
      .eq("company_id", companyId)
      .single()

    if (writeOffError || !writeOff) {
      throw new Error(`Write-off not found: ${writeOffError?.message}`)
    }

    // ✅ قبول الإهلاكات المعتمدة أو في حالة انتظار (خلال عملية الاعتماد)
    // في API endpoint، يتم استدعاء هذه الدالة قبل تحديث status إلى 'approved'
    if (writeOff.status !== 'approved' && writeOff.status !== 'pending') {
      return null
    }

    // ✅ ERP-Grade: Period Lock Check - منع تسجيل إهلاك في فترة مغلقة
    try {
      const { assertPeriodNotLocked } = await import("./accounting-period-lock")
      await assertPeriodNotLocked(supabase, {
        companyId,
        date: writeOff.write_off_date || new Date().toISOString().split("T")[0],
      })
    } catch (lockError: any) {
      throw new Error(
        `الفترة المحاسبية مقفلة: ${lockError.message || "لا يمكن تسجيل إهلاك في فترة محاسبية مغلقة"}`
      )
    }

    // التحقق من عدم وجود قيد سابق
    const { data: existingEntry } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "write_off")
      .eq("reference_id", writeOffId)
      .limit(1)

    if (existingEntry && existingEntry.length > 0) {
      console.log(`Write-off journal already exists for ${writeOff.write_off_number}`)
      return existingEntry[0].id
    }

    // الحصول على خريطة الحسابات
    const mapping = await getAccrualAccountMapping(supabase, companyId)

    // حساب المبلغ
    const totalCost = Number(writeOff.total_cost || 0)

    // إذا لم توجد تكلفة، لا نسجل قيد
    if (totalCost <= 0) {
      return null
    }

    // الحصول على حساب مصروف الإهلاك من mapping
    let expenseAccountId: string = mapping.write_off_expense || ''
    if (!expenseAccountId) {
      // Fallback: البحث عن أي حساب مصروف
      const { data: expenseAccount } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("company_id", companyId)
        .eq("account_type", "expense")
        .limit(1)
        .single()

      if (!expenseAccount?.id) {
        throw new Error('Write-off expense account not found. Please configure a write-off expense account in chart of accounts.')
      }
      expenseAccountId = expenseAccount.id
    }

    // التأكد من وجود حساب الإهلاك
    if (!expenseAccountId) {
      throw new Error('Write-off expense account is required')
    }

    // إنشاء قيد الإهلاك
    const journalEntry: AccrualJournalEntry = {
      company_id: companyId,
      reference_type: 'write_off',
      reference_id: writeOffId,
      entry_date: writeOff.write_off_date,
      description: `إهلاك مخزون - ${writeOff.write_off_number}`,
      branch_id: writeOff.branch_id,
      cost_center_id: writeOff.cost_center_id,
      warehouse_id: writeOff.warehouse_id,
      lines: [
        {
          // مدين: مصروف الإهلاك (Expense) - مصروف
          account_id: expenseAccountId,
          debit_amount: totalCost,
          credit_amount: 0,
          description: 'مصروف إهلاك مخزون',
          branch_id: writeOff.branch_id,
          cost_center_id: writeOff.cost_center_id
        },
        {
          // دائن: المخزون (Inventory) - أصل
          account_id: mapping.inventory,
          debit_amount: 0,
          credit_amount: totalCost,
          description: 'تخفيض المخزون',
          branch_id: writeOff.branch_id,
          cost_center_id: writeOff.cost_center_id
        }
      ]
    }

    // حفظ القيد في قاعدة البيانات
    return await saveJournalEntry(supabase, journalEntry)

  } catch (error) {
    console.error('Error creating write-off journal:', error)
    throw error
  }
}

/**
 * حفظ القيد المحاسبي في قاعدة البيانات
 *
 * ✅ يستخدم `create_journal_entry_atomic` عبر createCompleteJournalEntry
 * لأن INSERT المباشر على journal_entries محظور في الإنتاج (DIRECT_POST_BLOCKED).
 */
async function saveJournalEntry(
  supabase: any,
  journalEntry: AccrualJournalEntry
): Promise<string> {
  // ✅ ERP-Grade: Period Lock Check - منع إنشاء قيود في فترات مغلقة
  try {
    const { assertPeriodNotLocked } = await import("./accounting-period-lock")
    await assertPeriodNotLocked(supabase, {
      companyId: journalEntry.company_id,
      date: journalEntry.entry_date,
    })
  } catch (lockError: any) {
    throw new Error(
      `الفترة المحاسبية مقفلة: ${lockError.message || "لا يمكن إنشاء قيد في فترة محاسبية مغلقة"}`
    )
  }
  // التحقق من توازن القيد (تكرار مفيد قبل استدعاء RPC)
  const totalDebits = journalEntry.lines.reduce((sum, line) => sum + line.debit_amount, 0)
  const totalCredits = journalEntry.lines.reduce((sum, line) => sum + line.credit_amount, 0)

  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(`Journal entry is not balanced: Debits=${totalDebits}, Credits=${totalCredits}`)
  }

  const referenceType = journalEntry.reference_type as JournalReferenceType

  const result = await createCompleteJournalEntry(
    supabase,
    {
      company_id: journalEntry.company_id,
      reference_type: referenceType,
      reference_id: journalEntry.reference_id,
      entry_date: journalEntry.entry_date,
      description: journalEntry.description,
      branch_id: journalEntry.branch_id,
      cost_center_id: journalEntry.cost_center_id,
      warehouse_id: journalEntry.warehouse_id ?? null,
    },
    journalEntry.lines.map((line: any) => ({
      account_id: line.account_id,
      debit_amount: line.debit_amount,
      credit_amount: line.credit_amount,
      description: line.description,
      branch_id: line.branch_id,
      cost_center_id: line.cost_center_id,
      // v3.23.0: pass IAS 21 FX disclosure columns when set by FC-aware preparers
      ...(line.original_debit != null ? { original_debit: line.original_debit } : {}),
      ...(line.original_credit != null ? { original_credit: line.original_credit } : {}),
      ...(line.original_currency ? { original_currency: line.original_currency } : {}),
      ...(line.exchange_rate_used != null ? { exchange_rate_used: line.exchange_rate_used } : {}),
    }))
  )

  if (!result.success || !result.entryId) {
    throw new Error(result.error || "Error creating journal entry via create_journal_entry_atomic")
  }

  return result.entryId
}

/**
 * إصلاح البيانات الحالية بطريقة Opening Balances
 * بدون تدمير التاريخ
 */
export async function fixExistingDataWithOpeningBalances(
  supabase: any,
  companyId: string
): Promise<{
  success: boolean
  message: string
  details: {
    invoicesFixed: number
    billsFixed: number
    paymentsFixed: number
  }
}> {
  try {
    let invoicesFixed = 0
    let billsFixed = 0
    let paymentsFixed = 0

    // 1. إصلاح الفواتير المرسلة بدون قيود محاسبية
    const { data: invoicesWithoutJournals } = await supabase
      .from("invoices")
      .select("id, company_id")
      .eq("company_id", companyId)
      .neq("status", "draft")
      .not("id", "in", `(
        SELECT DISTINCT reference_id::text 
        FROM journal_entries 
        WHERE reference_type = 'invoice' 
          AND company_id = $1
      )`)

    for (const invoice of invoicesWithoutJournals || []) {
      try {
        await createInvoiceRevenueJournal(supabase, invoice.id, invoice.company_id)
        await createCOGSJournalOnDelivery(supabase, invoice.id, invoice.company_id)
        invoicesFixed++
      } catch (error: any) {
        console.error('Error fixing invoice:', { invoiceId: invoice.id, error: error?.message || String(error) })
      }
    }

    // 2. إصلاح فواتير الشراء المرسلة بدون قيود محاسبية
    const { data: billsWithoutJournals } = await supabase
      .from("bills")
      .select("id, company_id")
      .eq("company_id", companyId)
      .neq("status", "draft")
      .not("id", "in", `(
        SELECT DISTINCT reference_id::text 
        FROM journal_entries 
        WHERE reference_type = 'bill' 
          AND company_id = $1
      )`)

    for (const bill of billsWithoutJournals || []) {
      try {
        await createPurchaseInventoryJournal(supabase, bill.id, bill.company_id)
        billsFixed++
      } catch (error: any) {
        console.error('Error fixing bill:', { billId: bill.id, error: error?.message || String(error) })
      }
    }

    // 3. إصلاح المدفوعات بدون قيود محاسبية
    const { data: paymentsWithoutJournals } = await supabase
      .from("payments")
      .select("id, company_id")
      .eq("company_id", companyId)
      .not("id", "in", `(
        SELECT DISTINCT reference_id::text 
        FROM journal_entries 
        WHERE reference_type = 'payment' 
          AND company_id = $1
      )`)

    for (const payment of paymentsWithoutJournals || []) {
      try {
        await createPaymentJournal(supabase, payment.id, payment.company_id)
        paymentsFixed++
      } catch (error: any) {
        console.error('Error fixing payment:', { paymentId: payment.id, error: error?.message || String(error) })
      }
    }

    return {
      success: true,
      message: `تم إصلاح البيانات بنجاح: ${invoicesFixed} فاتورة بيع، ${billsFixed} فاتورة شراء، ${paymentsFixed} دفعة`,
      details: {
        invoicesFixed,
        billsFixed,
        paymentsFixed
      }
    }

  } catch (error: any) {
    return {
      success: false,
      message: `خطأ في إصلاح البيانات: ${error.message}`,
      details: {
        invoicesFixed: 0,
        billsFixed: 0,
        paymentsFixed: 0
      }
    }
  }
}

/**
 * التحقق من تطبيق أساس الاستحقاق بشكل صحيح
 */
export async function validateAccrualAccounting(
  supabase: any,
  companyId: string
): Promise<{
  isValid: boolean
  tests: Array<{
    name: string
    passed: boolean
    details: string
  }>
}> {
  const tests = []

  try {
    // اختبار 1: الربح يظهر قبل التحصيل
    const { data: revenueBeforePayment } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice")
      .limit(1)

    tests.push({
      name: "Revenue Recognition Before Payment",
      passed: (revenueBeforePayment?.length || 0) > 0,
      details: "Revenue is recorded when invoice is issued, not when payment is received"
    })

    // اختبار 2: COGS مسجل عند البيع
    const { data: cogsOnSale } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice_cogs")
      .limit(1)

    tests.push({
      name: "COGS Recognition on Sale",
      passed: (cogsOnSale?.length || 0) > 0,
      details: "COGS is recorded when goods are delivered, not when purchased"
    })

    // اختبار 3: Trial Balance متزن
    const { data: allLines } = await supabase
      .from("journal_entry_lines")
      .select(`
        debit_amount,
        credit_amount,
        journal_entries!inner(company_id, is_deleted, deleted_at)
      `)
      .eq("journal_entries.company_id", companyId)
      .neq("journal_entries.is_deleted", true) // ✅ استثناء القيود المحذوفة
      .is("journal_entries.deleted_at", null)

    const totalDebits = (allLines || []).reduce((sum: number, line: any) =>
      sum + Number(line.debit_amount || 0), 0)
    const totalCredits = (allLines || []).reduce((sum: number, line: any) =>
      sum + Number(line.credit_amount || 0), 0)
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01

    tests.push({
      name: "Trial Balance",
      passed: isBalanced,
      details: `Total Debits: ${totalDebits.toFixed(2)}, Total Credits: ${totalCredits.toFixed(2)}`
    })

    // اختبار 4: المخزون له قيمة محاسبية
    const { data: inventoryValue } = await supabase
      .from("journal_entry_lines")
      .select(`
        debit_amount,
        journal_entries!inner(company_id, is_deleted, deleted_at),
        chart_of_accounts!inner(sub_type)
      `)
      .eq("journal_entries.company_id", companyId)
      .neq("journal_entries.is_deleted", true) // ✅ استثناء القيود المحذوفة
      .is("journal_entries.deleted_at", null)
      .eq("chart_of_accounts.sub_type", "inventory")

    const inventoryBalance = (inventoryValue || []).reduce((sum: number, line: any) =>
      sum + Number(line.debit_amount || 0), 0)

    tests.push({
      name: "Inventory Valuation",
      passed: inventoryBalance > 0,
      details: `Inventory has accounting value: ${inventoryBalance.toFixed(2)}`
    })

    // اختبار 5: لا علاقة مباشرة بين Cash والربح
    const { data: cashEntries } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "payment")
      .limit(1)

    const { data: revenueEntries } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice")
      .limit(1)

    const hasSeparateEntries = (cashEntries?.length || 0) > 0 && (revenueEntries?.length || 0) > 0

    tests.push({
      name: "Cash vs Revenue Separation",
      passed: hasSeparateEntries,
      details: "Cash collection is recorded separately from revenue recognition"
    })

    const allPassed = tests.every(test => test.passed)

    return {
      isValid: allPassed,
      tests
    }

  } catch (error: any) {
    tests.push({
      name: "Validation Error",
      passed: false,
      details: `Error during validation: ${error.message}`
    })

    return {
      isValid: false,
      tests
    }
  }
}
