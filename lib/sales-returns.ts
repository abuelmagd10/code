/**
 * 📌 Sales Returns Helper Functions (Zoho Books Compatible)
 * دوال مساعدة لمعالجة مرتجعات المبيعات مع عكس COGS (FIFO)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { canReturnInvoice, getInvoiceOperationError, requiresJournalEntries } from './validation'
import { reverseFIFOConsumption } from './fifo-engine'
import { prepareReverseCOGSTransaction, getCOGSByInvoice } from './cogs-transactions'

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

export interface SalesReturnResult {
  success: boolean
  error?: string
  returnId?: string
  customerCreditAmount?: number
}

/**
 * 📌 معالجة مرتجع المبيعات حسب النمط المحاسبي الصارم
 * 
 * القواعد:
 * - Sent: مخزون فقط، لا قيد محاسبي
 * - Paid/Partially Paid: مخزون + قيد محاسبي + رصيد دائن للعميل
 */
export async function processSalesReturn(
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
): Promise<SalesReturnResult> {
  try {
    const { invoiceId, invoiceNumber, returnItems, returnMode, companyId, userId, lang } = params

    // 1️⃣ التحقق من حالة الفاتورة
    const { data: invoiceCheck } = await supabase
      .from('invoices')
      .select('status, paid_amount, total_amount, customer_id, sales_order_id, subtotal, tax_amount, returned_amount, branch_id, warehouse_id, cost_center_id')
      .eq('id', invoiceId)
      .single()

    if (!invoiceCheck) {
      return {
        success: false,
        error: lang === 'en' ? 'Invoice not found' : 'الفاتورة غير موجودة'
      }
    }

    if (!canReturnInvoice(invoiceCheck.status)) {
      const error = getInvoiceOperationError(invoiceCheck.status, 'return', lang)
      return {
        success: false,
        error: error ? `${error.title}: ${error.description}` : 'Cannot return this invoice'
      }
    }

    // 2️⃣ حساب قيم المرتجع (شامل Credit-Only)
    const returnedSubtotal = returnItems.reduce((s, r) => {
      const totalQty = r.qtyToReturn + (r.qtyCreditOnly || 0)
      return s + (r.unit_price * (1 - (r.discount_percent || 0) / 100)) * totalQty
    }, 0)
    const returnedTax = returnItems.reduce((s, r) => {
      const totalQty = r.qtyToReturn + (r.qtyCreditOnly || 0)
      return s + (((r.unit_price * (1 - (r.discount_percent || 0) / 100)) * totalQty) * (r.tax_rate || 0) / 100)
    }, 0)
    const returnTotal = returnedSubtotal + returnedTax

    // 3️⃣ عكس استهلاك FIFO (إرجاع الدفعات)
    await reverseFIFOConsumption(supabase, 'invoice', invoiceId)

    // 3️⃣ ب) ✅ ERP Professional: عكس COGS Transactions (للمنتجات المرتجعة)
    // الحصول على سجلات COGS الأصلية للفاتورة
    const originalCOGSTransactions = await getCOGSByInvoice(supabase, invoiceId)

    // إنشاء Sales Return ID مؤقت للربط
    let salesReturnId: string | null = null

    // عكس COGS لكل منتج مرتجع
    for (const returnItem of returnItems.filter(r => r.qtyToReturn > 0)) {
      // البحث عن سجلات COGS الأصلية لهذا المنتج
      const productCOGS = originalCOGSTransactions.filter(
        tx => tx.product_id === returnItem.product_id
      )

      // عكس COGS بنفس نسبة المرتجع (quantity ratio)
      for (const cogsTx of productCOGS) {
        const returnRatio = returnItem.qtyToReturn / returnItem.quantity
        const returnQuantity = cogsTx.quantity * returnRatio

        if (returnQuantity > 0) {
          // إنشاء sales_return مؤقت إذا لم يكن موجوداً
          if (!salesReturnId) {
            const { data: tempReturn, error: tempErr } = await supabase
              .from('sales_returns')
              .select('id')
              .eq('invoice_id', invoiceId)
              .order('created_at', { ascending: false })
              .limit(1)
              .single()

            if (!tempErr && tempReturn) {
              salesReturnId = tempReturn.id
            }
          }

          // عكس COGS بنفس التكلفة الأصلية (FIFO)
          const reversalData = await prepareReverseCOGSTransaction(
            supabase,
            cogsTx.id,
            salesReturnId || invoiceId // استخدام invoiceId كـ fallback
          )

          let reverseResult = { success: false, transactionId: '', error: '' }

          if (reversalData) {
            const { data: revTx, error: revErr } = await supabase
              .from('cogs_transactions')
              .insert(reversalData)
              .select('id')
              .single()

            if (!revErr && revTx) {
              reverseResult = { success: true, transactionId: revTx.id, error: '' }
            } else {
              reverseResult = { success: false, transactionId: '', error: revErr?.message || 'Unknown error' }
            }
          }

          if (reverseResult.success) {
            console.log(`✅ COGS reversed for product ${returnItem.product_id}: ${reverseResult.transactionId}`)
          } else {
            console.error(`❌ Failed to reverse COGS for product ${returnItem.product_id}:`, reverseResult.error)
          }
        }
      }
    }

    // 4️⃣ معالجة المخزون (لجميع الحالات)
    await processInventoryReturn(supabase, {
      companyId,
      invoiceId,
      branchId: invoiceCheck.branch_id,
      warehouseId: invoiceCheck.warehouse_id,
      costCenterId: invoiceCheck.cost_center_id,
      returnItems: returnItems.filter(r => r.qtyToReturn > 0),
      lang
    })

    // 4️⃣ تحديث بنود الفاتورة
    await updateInvoiceItemsReturn(supabase, returnItems.filter(r => r.qtyToReturn > 0))

    // 5️⃣ معالجة القيود المحاسبية (للفواتير المدفوعة فقط)
    let customerCreditAmount = 0
    if (requiresJournalEntries(invoiceCheck.status)) {
      customerCreditAmount = await processReturnAccounting(supabase, {
        companyId,
        invoiceId,
        invoiceNumber,
        returnTotal,
        returnedSubtotal,
        returnedTax,
        customerId: invoiceCheck.customer_id,
        lang,
        // ✅ تمرير بيانات الفاتورة للتسوية التلقائية
        invoiceTotal: Number(invoiceCheck.total_amount || 0),
        paidAmount: Number(invoiceCheck.paid_amount || 0)
      })
    }

    // 6️⃣ تحديث الفاتورة
    await updateInvoiceAfterReturn(supabase, {
      invoiceId,
      returnTotal,
      returnMode,
      currentData: invoiceCheck
    })

    // 7️⃣ تحديث أمر البيع المرتبط (إن وجد)
    if (invoiceCheck.sales_order_id) {
      await updateSalesOrderAfterReturn(supabase, {
        salesOrderId: invoiceCheck.sales_order_id,
        returnTotal,
        returnedSubtotal,
        returnedTax,
        returnMode,
        invoiceCheck
      })
    }

    // 8️⃣ إنشاء مستند المرتجع
    const { data: salesReturn } = await supabase
      .from('sales_returns')
      .insert({
        company_id: companyId,
        customer_id: invoiceCheck.customer_id,
        invoice_id: invoiceId,
        branch_id: invoiceCheck.branch_id,
        warehouse_id: invoiceCheck.warehouse_id,
        cost_center_id: invoiceCheck.cost_center_id,
        return_number: `SR-${Date.now().toString().slice(-8)}`,
        return_date: new Date().toISOString().slice(0, 10),
        subtotal: returnedSubtotal,
        tax_amount: returnedTax,
        total_amount: returnTotal,
        refund_amount: customerCreditAmount,
        refund_method: customerCreditAmount > 0 ? 'credit_note' : 'none',
        status: 'completed',
        reason: returnMode === 'full' ? 'مرتجع كامل' : 'مرتجع جزئي',
        notes: `مرتجع للفاتورة ${invoiceNumber}`
      })
      .select('id')
      .single()

    return {
      success: true,
      returnId: salesReturn?.id,
      customerCreditAmount
    }

  } catch (error: any) {
    console.error('❌ Error in sales return:', error)
    return {
      success: false,
      error: error?.message || 'Unknown error occurred'
    }
  }
}


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
  updateSource?: any
  error?: string
}> {
  try {
    const { invoiceId, invoiceNumber, returnItems, returnMode, companyId, userId, lang } = params

    // 1️⃣ التحقق من الفاتورة
    const { data: invoiceCheck } = await supabase
      .from('invoices')
      .select('status, paid_amount, total_amount, customer_id, sales_order_id, subtotal, tax_amount, returned_amount, branch_id, warehouse_id, cost_center_id')
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
      reason: returnMode === 'full' ? 'مرتجع كامل' : 'مرتجع جزئي',
      notes: `مرتجع للفاتورة ${invoiceNumber}`
    }

    // 5️⃣ تحضير Sales Return Items
    const salesReturnItemsData = returnItems.map(item => ({
      sales_return_id: salesReturnId,
      product_id: item.product_id,
      quantity: item.qtyToReturn + (item.qtyCreditOnly || 0),
      // ملاحظة: sales_return_items يسجل الكمية الكلية (بما في ذلك التالف إذا أردنا توثيقه)
      // لكن المخزون يتأثر فقط بـ qtyToReturn (الصالح)
      unit_price: item.unit_price,
      tax_rate: item.tax_rate,
      discount_percent: item.discount_percent,
      line_total: item.line_total
    }))

    // 6️⃣ تحضير الحركات (Inventory + FIFO + COGS)
    // استيراد الدوال
    const { prepareReverseFIFOConsumption } = await import('./fifo-engine')
    const { prepareReverseCOGSTransaction, getCOGSByInvoice } = await import('./cogs-transactions')

    // أ) عكس استهلاك FIFO (إرجاع الدفعات)
    // هذا يعيد مصفوفة من الاستهلاكات السالبة
    const fifoConsumptions = await prepareReverseFIFOConsumption(supabase, 'invoice', invoiceId, salesReturnId)

    // ب) عكس COGS Transactions
    const originalCOGSTransactions = await getCOGSByInvoice(supabase, invoiceId)
    const cogsTransactions = []

    for (const returnItem of returnItems.filter(r => r.qtyToReturn > 0)) {
      const productCOGS = originalCOGSTransactions.filter(tx => tx.product_id === returnItem.product_id)
      for (const cogsTx of productCOGS) {
        // عكس نسبة وتناسب
        // لكن هنا سنفترض التبسيط: عكس سجل جديد بناءً على الكمية المرتجعة
        // prepareReverseCOGSTransaction يعكس السجل كاملاً... هذا قد يكون خطأ إذا كان المرتجع جزئي!
        // يجب تعديل المنطق ليدعم "الكمية المرتجعة"

        const returnRatio = returnItem.qtyToReturn / returnItem.quantity
        // تحديث الكمية في الذاكرة للسجل المعكوس
        const reversal = await prepareReverseCOGSTransaction(supabase, cogsTx.id, salesReturnId)
        if (reversal) {
          reversal.quantity = cogsTx.quantity * returnRatio
          reversal.total_cost = cogsTx.total_cost * returnRatio
          // unit_cost يبقى كما هو
          cogsTransactions.push(reversal)
        }
      }
    }

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
      reference_id: invoiceId, // Maybe link to sales_return_id if available? But invoiceId is standard linkage for now
      // Actually we should link Journal Entry to the *Return Document* usually.
      // But keeping existing pattern `processReturnAccounting` linked to invoiceId in `reference_id`?
      // `processReturnAccounting` uses `reference_id: invoiceId`.
      // Let's stick to invoiceId or better salesReturnId if passed.
      // Params has salesReturnId? Yes, I added it in prepareSalesReturnData.
      // Let's use it if available in params, else invoiceId.
      entry_date: new Date().toISOString().slice(0, 10),
      description: creditAmount > 0
        ? `مرتجع مبيعات للفاتورة ${invoiceNumber} (تسوية: ${settlementAmount.toFixed(2)}، رصيد دائن: ${creditAmount.toFixed(2)})`
        : `مرتجع مبيعات للفاتورة ${invoiceNumber} (تسوية مع المتبقي)`,
      lines: lines
    },
    customerCredits
  }
}


/**
 * معالجة حركات المخزون للمرتجع - Legacy Direct DB Update
 * ملاحظة: فقط qtyToReturn ترجع للمخزون، qtyCreditOnly لا ترجع (تالفة)
 *
 * استراتيجية: تحديث الحركة الموجودة إن وجدت، وإلا إنشاء حركة جديدة
 */
async function processInventoryReturn(
  supabase: SupabaseClient,
  params: {
    companyId: string
    invoiceId: string
    branchId: string | null
    warehouseId: string | null
    costCenterId: string | null
    returnItems: SalesReturnItem[]
    lang: 'ar' | 'en'
  }
) {

  const { companyId, invoiceId, branchId, warehouseId, costCenterId, returnItems, lang } = params

  if (!branchId || !warehouseId || !costCenterId) {
    throw new Error(
      lang === 'en'
        ? 'Inventory governance context missing (branch/warehouse/cost center)'
        : 'بيانات الحوكمة غير مكتملة (الفرع/المخزن/مركز التكلفة)'
    )
  }

  // معالجة كل منتج على حدة
  for (const item of returnItems.filter(i => i.qtyToReturn > 0 && i.product_id)) {
    // التحقق من وجود حركة مرتجع سابقة لنفس المنتج والفاتورة
    const { data: existingTx } = await supabase
      .from('inventory_transactions')
      .select('id, quantity_change')
      .eq('company_id', companyId)
      .eq('branch_id', branchId)
      .eq('warehouse_id', warehouseId)
      .eq('cost_center_id', costCenterId)
      .eq('reference_id', invoiceId)
      .eq('product_id', item.product_id)
      .eq('transaction_type', 'sale_return')
      .eq('is_deleted', false)
      .maybeSingle()

    const notes = item.qtyCreditOnly
      ? `مرتجع مبيعات (${item.qtyToReturn} صالحة، ${item.qtyCreditOnly} تالفة)`
      : 'مرتجع مبيعات'

    if (existingTx) {
      // تحديث الحركة الموجودة بإضافة الكمية الجديدة
      const newQty = Number(existingTx.quantity_change) + item.qtyToReturn
      const { error: updateError } = await supabase
        .from('inventory_transactions')
        .update({
          quantity_change: newQty,
          notes: notes
        })
        .eq('id', existingTx.id)
        .eq('company_id', companyId)

      if (updateError) {
        console.error('❌ Error updating inventory transaction:', updateError)
        throw new Error(
          lang === 'en'
            ? `Failed to update inventory: ${updateError.message}`
            : `فشل تحديث المخزون: ${updateError.message}`
        )
      }
    } else {
      // إنشاء حركة جديدة
      const { error: insertError } = await supabase
        .from('inventory_transactions')
        .insert({
          company_id: companyId,
          branch_id: branchId,
          warehouse_id: warehouseId,
          cost_center_id: costCenterId,
          product_id: item.product_id,
          transaction_type: 'sale_return',
          quantity_change: item.qtyToReturn,
          reference_id: invoiceId,
          notes: notes
        })

      if (insertError) {
        console.error('❌ Error inserting inventory transaction:', insertError)
        throw new Error(
          lang === 'en'
            ? `Failed to update inventory: ${insertError.message}`
            : `فشل تحديث المخزون: ${insertError.message}`
        )
      }
    }
  }
}

/**
 * تحديث بنود الفاتورة بالكميات المرتجعة
 */
async function updateInvoiceItemsReturn(
  supabase: SupabaseClient,
  returnItems: SalesReturnItem[]
) {
  for (const item of returnItems) {
    // جلب الكمية المرتجعة الحالية أولاً
    const { data: currentItem } = await supabase
      .from('invoice_items')
      .select('returned_quantity')
      .eq('id', item.id)
      .single()

    const currentReturnedQty = Number(currentItem?.returned_quantity || 0)
    const newReturnedQty = currentReturnedQty + item.qtyToReturn

    await supabase
      .from('invoice_items')
      .update({
        returned_quantity: newReturnedQty
      })
      .eq('id', item.id)
  }
}

/**
 * معالجة القيود المحاسبية للمرتجع (للفواتير المدفوعة فقط)
 * مع عكس COGS (Zoho Books Compatible)
 *
 * ✅ التسوية التلقائية للفواتير المدفوعة جزئياً:
 * - إذا المرتجع ≤ المتبقي: تخفيض الذمة المدينة فقط (لا رصيد دائن)
 * - إذا المرتجع > المتبقي: تصفير المتبقي + رصيد دائن بالفرق
 */
async function processReturnAccounting(
  supabase: SupabaseClient,
  params: {
    companyId: string
    invoiceId: string
    invoiceNumber: string
    returnTotal: number
    returnedSubtotal: number
    returnedTax: number
    customerId: string
    lang: 'ar' | 'en'
    // ✅ إضافة بيانات الفاتورة للتسوية
    invoiceTotal?: number
    paidAmount?: number
  }
): Promise<number> {
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

  console.log(`📊 [Return Accounting] Invoice ${invoiceNumber}:`)
  console.log(`   - Total: ${invoiceTotal}, Paid: ${paidAmount}, Remaining: ${remainingUnpaid}`)
  console.log(`   - Return: ${returnTotal}, Settlement: ${settlementAmount}, Credit: ${creditAmount}`)

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
    const errorMsg = lang === 'en'
      ? `Required accounts not found: ${missingAccounts.join(', ')}. Please configure these accounts in Chart of Accounts.`
      : `الحسابات المطلوبة غير موجودة: ${missingAccounts.join('، ')}. يرجى إعداد هذه الحسابات في دليل الحسابات.`
    throw new Error(errorMsg)
  }

  // إنشاء قيد المرتجع
  const { data: journalEntry } = await supabase
    .from('journal_entries')
    .insert({
      company_id: companyId,
      reference_type: 'sales_return',
      reference_id: invoiceId,
      entry_date: new Date().toISOString().slice(0, 10),
      description: creditAmount > 0
        ? `مرتجع مبيعات للفاتورة ${invoiceNumber} (تسوية: ${settlementAmount.toFixed(2)}، رصيد دائن: ${creditAmount.toFixed(2)})`
        : `مرتجع مبيعات للفاتورة ${invoiceNumber} (تسوية مع المتبقي)`
    })
    .select('id')
    .single()

  if (journalEntry) {
    const lines: any[] = []

    // ===== الجزء الأول: تسوية مع المتبقي غير المدفوع =====
    if (settlementAmount > 0) {
      // 1. عكس الإيراد (مدين: مردودات المبيعات)
      lines.push({
        journal_entry_id: journalEntry.id,
        account_id: revenue,
        debit_amount: settlementSubtotal,
        credit_amount: 0,
        description: 'مردودات المبيعات (تسوية مع المتبقي)'
      })

      // 2. تخفيض ذمم العملاء (دائن: ذمم العملاء)
      lines.push({
        journal_entry_id: journalEntry.id,
        account_id: accountsReceivable,
        debit_amount: 0,
        credit_amount: settlementSubtotal,
        description: 'تخفيض ذمم العملاء (تسوية المرتجع)'
      })

      // 3. عكس الضريبة للتسوية (إن وجدت)
      if (vatPayable && settlementTax > 0) {
        lines.push({
          journal_entry_id: journalEntry.id,
          account_id: vatPayable,
          debit_amount: settlementTax,
          credit_amount: 0,
          description: 'عكس ضريبة المبيعات (تسوية)'
        })
        lines.push({
          journal_entry_id: journalEntry.id,
          account_id: accountsReceivable,
          debit_amount: 0,
          credit_amount: settlementTax,
          description: 'تخفيض ذمم العملاء (ضريبة التسوية)'
        })
      }
    }

    // ===== الجزء الثاني: رصيد دائن للمبلغ الزائد =====
    if (creditAmount > 0 && customerCreditAccount) {
      // 1. عكس الإيراد (مدين: مردودات المبيعات)
      lines.push({
        journal_entry_id: journalEntry.id,
        account_id: revenue,
        debit_amount: creditSubtotal,
        credit_amount: 0,
        description: 'مردودات المبيعات (رصيد دائن)'
      })

      // 2. رصيد دائن للعميل (دائن)
      lines.push({
        journal_entry_id: journalEntry.id,
        account_id: customerCreditAccount,
        debit_amount: 0,
        credit_amount: creditSubtotal,
        description: 'رصيد دائن للعميل'
      })

      // 3. عكس الضريبة للرصيد الدائن (إن وجدت)
      if (vatPayable && creditTax > 0) {
        lines.push({
          journal_entry_id: journalEntry.id,
          account_id: vatPayable,
          debit_amount: creditTax,
          credit_amount: 0,
          description: 'عكس ضريبة المبيعات (رصيد دائن)'
        })
        lines.push({
          journal_entry_id: journalEntry.id,
          account_id: customerCreditAccount,
          debit_amount: 0,
          credit_amount: creditTax,
          description: 'رصيد دائن للعميل (ضريبة)'
        })
      }

      // ✅ إنشاء سجل رصيد دائن فقط للمبلغ الزائد
      await supabase.from('customer_credits').insert({
        company_id: companyId,
        customer_id: customerId,
        credit_number: `CR-${Date.now()}`,
        credit_date: new Date().toISOString().slice(0, 10),
        amount: creditAmount,
        used_amount: 0,
        reference_type: 'invoice_return',
        reference_id: invoiceId,
        status: 'active',
        notes: `رصيد دائن من مرتجع الفاتورة ${invoiceNumber} (المبلغ الزائد عن المتبقي)`
      })

      console.log(`✅ Created customer credit: ${creditAmount.toFixed(2)} for invoice ${invoiceNumber}`)
    } else {
      console.log(`✅ No customer credit needed - return fully settled against remaining balance`)
    }

    await supabase.from('journal_entry_lines').insert(lines)
  }

  // ✅ إرجاع المبلغ الذي تم إنشاء رصيد دائن له فقط (وليس كامل المرتجع)
  return creditAmount
}

/**
 * تحديث الفاتورة بعد المرتجع
 * ملاحظة: للفواتير المدفوعة، لا نغير total_amount (ممنوع بواسطة trigger)
 * بدلاً من ذلك نستخدم returned_amount لتتبع المبالغ المرتجعة
 */
async function updateInvoiceAfterReturn(
  supabase: SupabaseClient,
  params: {
    invoiceId: string
    returnTotal: number
    returnMode: 'partial' | 'full'
    currentData: any
  }
) {
  const { invoiceId, returnTotal, returnMode, currentData } = params

  const oldTotal = Number(currentData.total_amount || 0)
  const oldReturned = Number(currentData.returned_amount || 0)
  const paidAmount = Number(currentData.paid_amount || 0)
  const newReturned = oldReturned + returnTotal

  // ✅ حساب المستحق الفعلي بعد الإرجاع
  const effectiveOwed = oldTotal - newReturned

  // ✅ تحديد الحالة الجديدة بناءً على المدفوع والمرتجع
  let newStatus = currentData.status
  if (newReturned >= oldTotal) {
    // مرتجع بالكامل (100% أو أكثر)
    newStatus = 'fully_returned'
  } else if (paidAmount >= effectiveOwed) {
    // ✅ المدفوع يغطي المتبقي بعد الإرجاع = مدفوعة بالكامل
    newStatus = 'paid'
  } else if (paidAmount > 0) {
    // مدفوعة جزئياً
    newStatus = 'partially_paid'
  } else if (newReturned > 0) {
    // مرتجعة جزئياً بدون أي دفع
    newStatus = 'partially_returned'
  }

  // تحديث فقط الحقول المسموح بها للفواتير المدفوعة
  // (returned_amount, status, return_status, notes, updated_at)
  await supabase
    .from('invoices')
    .update({
      returned_amount: newReturned,
      status: newStatus,
      return_status: newReturned >= oldTotal ? 'full' : 'partial'
    })
    .eq('id', invoiceId)
}

/**
 * 📌 تحديث أمر البيع المرتبط بعد المرتجع
 * ⚠️ يجب أن يتطابق أمر البيع مع الفاتورة في جميع البيانات
 */
async function updateSalesOrderAfterReturn(
  supabase: SupabaseClient,
  params: {
    salesOrderId: string
    returnTotal: number
    returnedSubtotal: number
    returnedTax: number
    returnMode: 'partial' | 'full'
    invoiceCheck: any
  }
) {
  const { salesOrderId, returnTotal, invoiceCheck } = params

  // حساب القيم الجديدة (نفس حسابات الفاتورة)
  const oldTotal = Number(invoiceCheck.total_amount || 0)
  const oldReturned = Number(invoiceCheck.returned_amount || 0)
  const paidAmount = Number(invoiceCheck.paid_amount || 0)
  const newReturned = oldReturned + returnTotal

  // ✅ حساب المستحق الفعلي بعد الإرجاع
  const effectiveOwed = oldTotal - newReturned

  // ✅ تحديد الحالة الجديدة بناءً على المدفوع والمرتجع (نفس منطق الفاتورة)
  let newStatus = invoiceCheck.status
  if (newReturned >= oldTotal) {
    newStatus = 'fully_returned'
  } else if (paidAmount >= effectiveOwed) {
    // ✅ المدفوع يغطي المتبقي بعد الإرجاع = مدفوعة بالكامل
    newStatus = 'paid'
  } else if (paidAmount > 0) {
    newStatus = 'partially_paid'
  } else if (newReturned > 0) {
    newStatus = 'partially_returned'
  }

  // تحديث أمر البيع بنفس بيانات الفاتورة
  await supabase
    .from('sales_orders')
    .update({
      returned_amount: newReturned,
      status: newStatus,
      return_status: newReturned >= oldTotal ? 'full' : 'partial',
      updated_at: new Date().toISOString()
    })
    .eq('id', salesOrderId)

  console.log('✅ Sales order updated (synced with invoice):', { salesOrderId, newReturned, newStatus })
}
