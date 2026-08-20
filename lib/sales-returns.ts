/**
 * 📌 Sales Returns Helper Functions (Zoho Books Compatible)
 * دوال مساعدة لمعالجة مرتجعات المبيعات مع عكس COGS (FIFO)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { canReturnInvoice, getInvoiceOperationError, requiresJournalEntries } from './validation'
import { reverseFIFOConsumption } from './fifo-engine'
import { prepareReverseCOGSTransaction, getCOGSByInvoice } from './cogs-transactions'
import { getBaseCurrency } from './currency-service'

export interface SalesReturnItem {
  id: string
  product_id: string
  name: string
  quantity: number
  maxQty: number
  qtyToReturn: number
  qtyCreditOnly?: number // الكمية التالفة (لا ترجع للمخزون)
  cost_price: number
  unit_price: number
  tax_rate: number
  discount_percent: number
  line_total: number
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * v3.74.876 — أُزيل نصفُ هذا الملف: كودٌ لا يصله مسار، ويحمل عطباً قاتلاً.
 *
 * كان يحوى مسارين لمرتجع المبيعات:
 *
 *   `prepareSalesReturnData`  ← **حىّ**، يُستدعى من
 *      `accounting-transaction-service` عبر `await import('./sales-returns')`،
 *      ومنه إلى مسار الموافقات. باقٍ كما هو.
 *
 *   `processSalesReturn`      ← **لا يصله أحد**، ومعه خمس دوالٍ خاصةٍ به
 *      وحده: `processInventoryReturn` · `updateInvoiceItemsReturn` ·
 *      `processReturnAccounting` · `updateInvoiceAfterReturn` ·
 *      `updateSalesOrderAfterReturn`. أُزيلت جميعاً.
 *
 * ولمَ لم يُترك؟ لأنه **لغمٌ لا كودٌ خاملٌ فحسب**. `processReturnAccounting`
 * تُنشئ قيداً هكذا:
 *
 *     .from('journal_entries').insert({ company_id, reference_type, ... })
 *
 * بلا `branch_id` — **وهو عمود NOT NULL**. أى أنها تفشل حتماً لحظة أول
 * استدعاء. ثم لا تفحص النتيجة أصلاً: `const { data: journalEntry } = ...`
 * ثم `if (journalEntry)` — فتُخطّى الدفاتر كلها بصمت وتُعيد نجاحاً.
 *
 * ⇒ لو وصله أحدٌ يوماً لأنتج **مرتجعاً بلا أثرٍ محاسبى، مُعلَناً كناجح**.
 * ولم يكسر بناءً قط لأنه لم يُنفَّذ قط — وهو تعريف اللغم.
 *
 * والمعالجة الصحيحة قائمةٌ فى المسار الحىّ: مرتجعات المبيعات تمرّ من
 * `sales-return-requests/[id]/warehouse-approve` عبر
 * `accounting-transaction-service`، فتُنشئ قيدها بالبوابة المعتمدة وبفرعها.
 * ═══════════════════════════════════════════════════════════════════════════
 */


/**
 * تحضير بيانات مرتجع المبيعات (للاستخدام الذري)
 * يعيد جميع الكائنات اللازمة للإدخال في قاعدة البيانات
 */
export async function prepareSalesReturnData(
  supabase: SupabaseClient,
  params: {
    invoiceId: string
    invoiceNumber: string
    returnItems: SalesReturnItem[]
    returnMode: 'partial' | 'full'
    companyId: string
    userId: string
    lang: 'ar' | 'en'
  }
): Promise<{
  success: boolean
  salesReturn?: any
  salesReturnItems?: any[]
  inventoryTransactions?: any[]
  cogsTransactions?: any[]
  fifoConsumptions?: any[]
  journalEntry?: any
  customerCredits?: any[]
  customerCreditLedgerEntries?: any[]
  updateSource?: any
  error?: string
}> {
  try {
    const { invoiceId, invoiceNumber, returnItems, returnMode, companyId, userId, lang } = params

    // 1️⃣ التحقق من الفاتورة
    // v3.74.187 — also read the invoice's FX columns so the sales_return
    // can persist original_currency + exchange_rate_used instead of
    // silently assuming base currency.
    const { data: invoiceCheck } = await supabase
      .from('invoices')
      .select('status, paid_amount, total_amount, customer_id, sales_order_id, subtotal, tax_amount, returned_amount, branch_id, warehouse_id, cost_center_id, currency_code, exchange_rate, exchange_rate_used, exchange_rate_id')
      .eq('id', invoiceId)
      .single()

    if (!invoiceCheck) {
      return { success: false, error: 'Invoice not found' }
    }

    if (!canReturnInvoice(invoiceCheck.status)) {
      return { success: false, error: 'Cannot return this invoice status' }
    }

    // 2️⃣ حساب التوتال
    const returnedSubtotal = returnItems.reduce((s, r) => {
      const totalQty = r.qtyToReturn + (r.qtyCreditOnly || 0)
      return s + (r.unit_price * (1 - (r.discount_percent || 0) / 100)) * totalQty
    }, 0)
    const returnedTax = returnItems.reduce((s, r) => {
      const totalQty = r.qtyToReturn + (r.qtyCreditOnly || 0)
      return s + (((r.unit_price * (1 - (r.discount_percent || 0) / 100)) * totalQty) * (r.tax_rate || 0) / 100)
    }, 0)
    const returnTotal = returnedSubtotal + returnedTax

    // 3️⃣ توليد معرفات UUID مسبقاً
    const salesReturnId = crypto.randomUUID()

    // 4️⃣ تحضير بيانات Sales Return Header
    // هنا نحتاج حساب Credit Amount للتسوية
    const invoiceTotal = Number(invoiceCheck.total_amount || 0)
    const paidAmount = Number(invoiceCheck.paid_amount || 0)
    const remainingUnpaid = Math.max(0, invoiceTotal - paidAmount)
    const creditAmount = Math.max(0, returnTotal - remainingUnpaid)

    // v3.74.187 — propagate the invoice's FX context onto the return.
    // The amounts above (returnedSubtotal / returnedTax / returnTotal) are
    // computed from invoice line numbers, which are already in base
    // currency when the invoice was foreign-currency (display_total flow).
    // We mirror that and back-compute the "original" amounts so a future
    // FX revaluation can rebuild the per-currency view.
    const invoiceCurrency = String((invoiceCheck as any).currency_code || 'EGP')
    const invoiceRate = Number(
      (invoiceCheck as any).exchange_rate
      ?? (invoiceCheck as any).exchange_rate_used
      ?? 1
    ) || 1
    // v3.75.72 — **فالعملةُ الأساسيّةُ لا تُقرَأُ إلا من بيتِها الواحد**:
    // كان isBaseCurrency يقارنُ عملةَ الفاتورةِ بحرفٍ مخترَعٍ 'EGP' مباشرةً —
    // فلو كانت عملةُ الشركةِ الأساسيّةُ الحقيقيّةُ غيرَ الجنيه، وفاتورةُ
    // المرتجعِ بتلك العملةِ نفسِها (أى بعملتِها الأساسيّةِ الصحيحة)، كان
    // هذا الشرطُ يُخطئُ فيظنُّها أجنبيّةً، فيقسِمُ originalSubtotal/Tax/Total
    // على سعرِ الصرفِ رغم أنّها لا تحتاجُ قسمةً أصلاً — قيمةٌ محاسبيّةٌ
    // خاطئةٌ تُكتَبُ على صفِّ المرتجعِ فى القاعدة، لا عرضاً خاطئاً يزول.
    // فتُستبدَلُ المقارنةُ بنداءِ البيتِ الواحد؛ وإن صرخ (تعذَّر تحديدُ
    // عملةِ الشركة) تفشلُ الدالّةُ كلُّها بخطإٍ واضحٍ (يلتقطُه catch أدناه)
    // بدلَ أن تكتبَ رقماً مخترَعاً بصمت.
    const companyBaseCurrency = await getBaseCurrency(supabase, companyId)
    const isBaseCurrency = invoiceCurrency === companyBaseCurrency
    const originalSubtotal = isBaseCurrency
      ? returnedSubtotal
      : Math.round((returnedSubtotal / invoiceRate) * 10000) / 10000
    const originalTax = isBaseCurrency
      ? returnedTax
      : Math.round((returnedTax / invoiceRate) * 10000) / 10000
    const originalTotal = isBaseCurrency
      ? returnTotal
      : Math.round((returnTotal / invoiceRate) * 10000) / 10000

    const salesReturn = {
      id: salesReturnId,
      company_id: companyId,
      customer_id: invoiceCheck.customer_id,
      invoice_id: invoiceId,
      branch_id: invoiceCheck.branch_id,
      warehouse_id: invoiceCheck.warehouse_id,
      cost_center_id: invoiceCheck.cost_center_id,
      return_number: `SR-${Date.now().toString().slice(-8)}`, // مؤقت
      return_date: new Date().toISOString().slice(0, 10),
      subtotal: returnedSubtotal,
      tax_amount: returnedTax,
      total_amount: returnTotal,
      refund_amount: creditAmount,
      refund_method: creditAmount > 0 ? 'credit_note' : 'none',
      status: 'completed',
      // v3.74.781 — record who executed it. This was never sent, so
      // sales_return_approval_insert_trg had no user to look up, found no role,
      // and refused the insert outright. The workflow flag is what now permits
      // the status; this column is what makes the row answer "who".
      created_by_user_id: userId || null,
      reason: returnMode === 'full' ? 'مرتجع كامل' : 'مرتجع جزئي',
      notes: `مرتجع للفاتورة ${invoiceNumber}`,
      // v3.74.187 — FX snapshot. Without these the return looks like an
      // EGP movement even when the invoice was, say, USD.
      original_currency: invoiceCurrency,
      original_subtotal: originalSubtotal,
      original_tax_amount: originalTax,
      original_total_amount: originalTotal,
      exchange_rate_used: invoiceRate,
      exchange_rate_at_return: invoiceRate,
      exchange_rate_id: (invoiceCheck as any).exchange_rate_id || null,
    }

    // 5️⃣ تحضير Sales Return Items
    const salesReturnItemsData = returnItems.map(item => ({
      sales_return_id: salesReturnId,
      // v3.74.781 — the invoice line this came from. It was never sent, and the
      // column was never populated, which silently disabled the committed-
      // quantity half of check_sales_return_request_quantity: that guard sums
      // sales_return_items.invoice_item_id, always got 0, and so only pending
      // requests ever constrained a return. Sequential returns could exceed the
      // quantity actually sold. The id was already flowing through every layer;
      // only this line was missing.
      invoice_item_id: item.id || null,
      product_id: item.product_id,
      quantity: item.qtyToReturn + (item.qtyCreditOnly || 0),
      // ملاحظة: sales_return_items يسجل الكمية الكلية (بما في ذلك التالف إذا أردنا توثيقه)
      // لكن المخزون يتأثر فقط بـ qtyToReturn (الصالح)
      unit_price: item.unit_price,
      tax_rate: item.tax_rate,
      discount_percent: item.discount_percent,
      line_total: item.line_total
    }))

    // 6️⃣ الحركات المالية للمرتجع — تملكها قاعدة البيانات، لا هذه الطبقة
    //
    // v3.74.781 — what stood here built a full reversal of EVERY FIFO
    // consumption on the invoice (all products, whole quantity, regardless of
    // what was actually returned) and a COGS reversal pro-rated by
    // qtyToReturn/quantity. Both were wrong, and both were duplicates:
    //
    //   * restore_fifo_lots_on_return already gives the units back, per product,
    //     per returned quantity, at the cost each batch was taken at. Applying
    //     this payload on top restored the lots a SECOND time.
    //
    //   * the GL reversal is posted by trg_auto_cogs_reversal_on_return from the
    //     cost those lots actually returned. Pro-rating a different number here
    //     produced a sub-ledger that could not agree with the ledger.
    //
    // The trigger now writes the cogs_transactions row itself, from the same
    // figure it posts to the GL. One owner, one number, no reconciliation
    // needed between two calculations of the same thing.
    //
    // Both arrays stay in the payload shape: post_accounting_event skips each
    // block when the array is empty, so nothing downstream needs to change.
    const fifoConsumptions: any[] = []
    const cogsTransactions: any[] = []

    // ج) حركات المخزون (Inventory Transactions)
    const inventoryTransactions = []
    for (const item of returnItems.filter(i => i.qtyToReturn > 0 && i.product_id)) {
      inventoryTransactions.push({
        company_id: companyId,
        branch_id: invoiceCheck.branch_id,
        warehouse_id: invoiceCheck.warehouse_id,
        cost_center_id: invoiceCheck.cost_center_id,
        product_id: item.product_id,
        transaction_type: 'sale_return',
        quantity_change: item.qtyToReturn, // زيادة المخزون
        reference_type: 'sales_return', // نربط بالمرتجع الجديد
        reference_id: salesReturnId,
        notes: item.qtyCreditOnly
          ? `مرتجع مبيعات (${item.qtyToReturn} صالحة، ${item.qtyCreditOnly} تالفة)`
          : 'مرتجع مبيعات',
        transaction_date: new Date().toISOString().slice(0, 10)
      })
    }

    // 7️⃣ تحضير القيود المحاسبية
    let journalEntry = null
    let customerCredits: any[] = []
    let customerCreditLedgerEntries: any[] = []

    if (requiresJournalEntries(invoiceCheck.status)) {
      const preparedAccounting = await prepareReturnJournal(supabase, {
        companyId, invoiceId, invoiceNumber, returnTotal, returnedSubtotal, returnedTax,
        customerId: invoiceCheck.customer_id, lang,
        invoiceTotal, paidAmount, creditAmount,
        salesReturnId
      })

      if (preparedAccounting) {
        preparedAccounting.journalEntry.reference_id = salesReturnId
        journalEntry = preparedAccounting.journalEntry
        customerCredits = preparedAccounting.customerCredits || []
        if (creditAmount > 0 && invoiceCheck.customer_id && journalEntry?.id) {
          customerCreditLedgerEntries = [{
            company_id: companyId,
            customer_id: invoiceCheck.customer_id,
            source_type: 'sales_return',
            source_id: salesReturnId,
            journal_entry_id: journalEntry.id,
            amount: creditAmount,
            description: `رصيد دائن من مرتجع الفاتورة ${invoiceNumber}`,
            created_by: userId
          }]
        }
      }
    }

    // 8️⃣ تحديث المصدر (Invoice + SO Status)
    const oldReturned = Number(invoiceCheck.returned_amount || 0)
    const newReturned = oldReturned + returnTotal

    // ✅ حساب المستحق الفعلي بعد الإرجاع
    const effectiveOwed = invoiceTotal - newReturned

    // ✅ تحديد الحالة الجديدة بناءً على المدفوع والمرتجع
    let newStatus = invoiceCheck.status
    if (newReturned >= invoiceTotal) {
      newStatus = 'fully_returned'
    } else if (paidAmount >= effectiveOwed) {
      // ✅ المدفوع يغطي المتبقي بعد الإرجاع = مدفوعة بالكامل
      newStatus = 'paid'
    } else if (paidAmount > 0) {
      newStatus = 'partially_paid'
    } else if (newReturned > 0) {
      newStatus = 'partially_returned'
    }

    const updateSource = {
      invoice_id: invoiceId,
      sales_order_id: invoiceCheck.sales_order_id,
      status: newStatus,
      returned_amount: newReturned,
      return_status: newReturned >= invoiceTotal ? 'full' : 'partial'
    }

    return {
      success: true,
      salesReturn,
      salesReturnItems: salesReturnItemsData,
      inventoryTransactions,
      cogsTransactions,
      fifoConsumptions,
      journalEntry,
      customerCredits,
      customerCreditLedgerEntries,
      updateSource
    }

  } catch (error: any) {
    console.error('Error preparing sales return data:', error)
    return { success: false, error: error.message }
  }
}


/**
 * تحضير قيد المرتجع (بدون حفظ)
 */
async function prepareReturnJournal(supabase: SupabaseClient, params: any): Promise<{
  journalEntry: any
  customerCredits: any[]
} | null> {
  const {
    companyId, invoiceId, invoiceNumber, returnTotal, returnedSubtotal, returnedTax,
    customerId, lang, invoiceTotal = 0, paidAmount = 0
  } = params

  // ✅ حساب المتبقي غير المدفوع
  const remainingUnpaid = Math.max(0, invoiceTotal - paidAmount)

  // ✅ حساب التسوية والرصيد الدائن
  // - settlementAmount: المبلغ الذي يُخصم من الذمة المدينة (المتبقي)
  // - creditAmount: المبلغ الذي يُنشأ كرصيد دائن للعميل
  const settlementAmount = Math.min(returnTotal, remainingUnpaid)
  const creditAmount = Math.max(0, returnTotal - remainingUnpaid)

  // نسبة التسوية للضريبة
  const settlementRatio = returnTotal > 0 ? settlementAmount / returnTotal : 0
  const creditRatio = returnTotal > 0 ? creditAmount / returnTotal : 0

  const settlementSubtotal = returnedSubtotal * settlementRatio
  const settlementTax = returnedTax * settlementRatio
  const creditSubtotal = returnedSubtotal * creditRatio
  const creditTax = returnedTax * creditRatio

  // جلب الحسابات المطلوبة
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type, sub_type')
    .eq('company_id', companyId)

  const findAccount = (condition: (a: any) => boolean) =>
    (accounts || []).find(condition)?.id

  // البحث عن حساب الإيرادات
  const revenue = findAccount(a =>
    a.sub_type?.toLowerCase() === 'sales_revenue' ||
    a.sub_type?.toLowerCase() === 'revenue' ||
    (a.account_type === 'income' && (
      a.account_name?.includes('إيرادات المبيعات') ||
      a.account_name?.toLowerCase().includes('sales revenue')
    ))
  )

  // البحث عن حساب ذمم العملاء (للتسوية)
  const accountsReceivable = findAccount(a =>
    a.sub_type?.toLowerCase() === 'accounts_receivable' ||
    a.sub_type?.toLowerCase() === 'receivable' ||
    a.account_name?.includes('ذمم العملاء') ||
    a.account_name?.includes('المدينون') ||
    a.account_name?.toLowerCase().includes('accounts receivable') ||
    a.account_name?.toLowerCase().includes('receivable')
  )

  const vatPayable = findAccount(a => a.sub_type?.toLowerCase().includes('vat'))

  // البحث عن حساب رصيد العملاء الدائن (للرصيد الزائد فقط)
  const customerCreditAccount = findAccount(a =>
    a.sub_type?.toLowerCase() === 'customer_credit' ||
    a.sub_type?.toLowerCase() === 'deferred_revenue' ||
    a.account_name?.toLowerCase().includes('customer credit') ||
    a.account_name?.includes('إيرادات مقدمة') ||
    a.account_name?.includes('رصيد دائن')
  )

  // تحسين رسالة الخطأ لتوضيح الحسابات المفقودة
  const missingAccounts: string[] = []
  if (!revenue) missingAccounts.push(lang === 'en' ? 'Revenue' : 'الإيرادات')
  if (!accountsReceivable) missingAccounts.push(lang === 'en' ? 'Accounts Receivable' : 'ذمم العملاء')
  // رصيد العملاء الدائن مطلوب فقط إذا كان هناك رصيد زائد
  if (creditAmount > 0 && !customerCreditAccount) {
    missingAccounts.push(lang === 'en' ? 'Customer Credit' : 'رصيد العملاء الدائن')
  }

  if (missingAccounts.length > 0) {
    throw new Error(lang === 'en'
      ? `Required accounts not found: ${missingAccounts.join(', ')}.`
      : `الحسابات المطلوبة غير موجودة: ${missingAccounts.join('، ')}.`
    )
  }

  const lines: any[] = []
  const journalEntryId = crypto.randomUUID()

  // ===== الجزء الأول: تسوية مع المتبقي غير المدفوع =====
  if (settlementAmount > 0) {
    // 1. عكس الإيراد (مدين: مردودات المبيعات)
    lines.push({
      journal_entry_id: journalEntryId,
      account_id: revenue,
      debit_amount: settlementSubtotal,
      credit_amount: 0,
      description: 'مردودات المبيعات (تسوية مع المتبقي)'
    })

    // 2. تخفيض ذمم العملاء (دائن: ذمم العملاء)
    lines.push({
      journal_entry_id: journalEntryId,
      account_id: accountsReceivable,
      debit_amount: 0,
      credit_amount: settlementSubtotal,
      description: 'تخفيض ذمم العملاء (تسوية المرتجع)'
    })

    // 3. عكس الضريبة للتسوية (إن وجدت)
    if (vatPayable && settlementTax > 0) {
      lines.push({
        journal_entry_id: journalEntryId,
        account_id: vatPayable,
        debit_amount: settlementTax,
        credit_amount: 0,
        description: 'عكس ضريبة المبيعات (تسوية)'
      })
      lines.push({
        journal_entry_id: journalEntryId,
        account_id: accountsReceivable,
        debit_amount: 0,
        credit_amount: settlementTax,
        description: 'تخفيض ذمم العملاء (ضريبة التسوية)'
      })
    }
  }

  // ===== الجزء الثاني: رصيد دائن للمبلغ الزائد =====
  const customerCredits: any[] = []

  if (creditAmount > 0 && customerCreditAccount) {
    // 1. عكس الإيراد (مدين: مردودات المبيعات)
    lines.push({
      journal_entry_id: journalEntryId,
      account_id: revenue,
      debit_amount: creditSubtotal,
      credit_amount: 0,
      description: 'مردودات المبيعات (رصيد دائن)'
    })

    // 2. رصيد دائن للعميل (دائن)
    lines.push({
      journal_entry_id: journalEntryId,
      account_id: customerCreditAccount,
      debit_amount: 0,
      credit_amount: creditSubtotal,
      description: 'رصيد دائن للعميل'
    })

    // 3. عكس الضريبة للرصيد الدائن (إن وجدت)
    if (vatPayable && creditTax > 0) {
      lines.push({
        journal_entry_id: journalEntryId,
        account_id: vatPayable,
        debit_amount: creditTax,
        credit_amount: 0,
        description: 'عكس ضريبة المبيعات (رصيد دائن)'
      })
      lines.push({
        journal_entry_id: journalEntryId,
        account_id: customerCreditAccount,
        debit_amount: 0,
        credit_amount: creditTax,
        description: 'رصيد دائن للعميل (ضريبة)'
      })
    }

    // ✅ تحضير سجل رصيد دائن
    customerCredits.push({
      company_id: companyId,
      customer_id: customerId,
      credit_number: `CR-${Date.now()}`,
      credit_date: new Date().toISOString().slice(0, 10),
      amount: creditAmount,
      reference_type: 'invoice_return',
      reference_id: invoiceId,
      status: 'active',
      notes: `رصيد دائن من مرتجع الفاتورة ${invoiceNumber} (المبلغ الزائد عن المتبقي)`
    })
  }

  return {
    journalEntry: {
      id: journalEntryId,
      company_id: companyId,
      reference_type: 'sales_return',
      reference_id: params.salesReturnId || invoiceId,
      entry_date: new Date().toISOString().slice(0, 10),
      description: creditAmount > 0
        ? `مرتجع مبيعات للفاتورة ${invoiceNumber} (تسوية: ${settlementAmount.toFixed(2)}، رصيد دائن: ${creditAmount.toFixed(2)})`
        : `مرتجع مبيعات للفاتورة ${invoiceNumber} (تسوية مع المتبقي)`,
      lines: lines
    },
    customerCredits
  }
}
