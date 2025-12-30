/**
 * 📌 Sales Returns Helper Functions (Zoho Books Compatible)
 * دوال مساعدة لمعالجة مرتجعات المبيعات مع عكس COGS (FIFO)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { canReturnInvoice, getInvoiceOperationError, requiresJournalEntries } from './validation'
import { reverseFIFOConsumption } from './fifo-engine'

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
      .select('status, paid_amount, total_amount, customer_id')
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

    // 4️⃣ معالجة المخزون (لجميع الحالات)
    await processInventoryReturn(supabase, {
      companyId,
      invoiceId,
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
        lang
      })
    }

    // 6️⃣ تحديث الفاتورة
    await updateInvoiceAfterReturn(supabase, {
      invoiceId,
      returnTotal,
      returnMode,
      currentData: invoiceCheck
    })

    // 7️⃣ إنشاء مستند المرتجع
    const { data: salesReturn } = await supabase
      .from('sales_returns')
      .insert({
        company_id: companyId,
        customer_id: invoiceCheck.customer_id,
        invoice_id: invoiceId,
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
 * معالجة حركات المخزون للمرتجع
 * ملاحظة: فقط qtyToReturn ترجع للمخزون، qtyCreditOnly لا ترجع (تالفة)
 *
 * استراتيجية: تحديث الحركة الموجودة إن وجدت، وإلا إنشاء حركة جديدة
 */
async function processInventoryReturn(
  supabase: SupabaseClient,
  params: {
    companyId: string
    invoiceId: string
    returnItems: SalesReturnItem[]
    lang: 'ar' | 'en'
  }
) {
  const { companyId, invoiceId, returnItems, lang } = params

  // معالجة كل منتج على حدة
  for (const item of returnItems.filter(i => i.qtyToReturn > 0 && i.product_id)) {
    // التحقق من وجود حركة مرتجع سابقة لنفس المنتج والفاتورة
    const { data: existingTx } = await supabase
      .from('inventory_transactions')
      .select('id, quantity_change')
      .eq('reference_id', invoiceId)
      .eq('product_id', item.product_id)
      .eq('transaction_type', 'sale_return')
      .eq('is_deleted', false)
      .single()

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
  }
): Promise<number> {
  const { companyId, invoiceId, invoiceNumber, returnTotal, returnedSubtotal, returnedTax, customerId, lang } = params

  // جلب الحسابات المطلوبة
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type, sub_type')
    .eq('company_id', companyId)

  const findAccount = (condition: (a: any) => boolean) =>
    (accounts || []).find(condition)?.id

  // البحث عن حساب الإيرادات: sales_revenue أو revenue أو اسم يحتوي إيرادات
  const revenue = findAccount(a =>
    a.sub_type?.toLowerCase() === 'sales_revenue' ||
    a.sub_type?.toLowerCase() === 'revenue' ||
    (a.account_type === 'income' && (
      a.account_name?.includes('إيرادات المبيعات') ||
      a.account_name?.toLowerCase().includes('sales revenue')
    ))
  )
  const vatPayable = findAccount(a => a.sub_type?.toLowerCase().includes('vat'))
  // البحث عن حساب رصيد العملاء الدائن: customer_credit أو deferred_revenue أو إيرادات مقدمة
  const customerCredit = findAccount(a =>
    a.sub_type?.toLowerCase() === 'customer_credit' ||
    a.sub_type?.toLowerCase() === 'deferred_revenue' ||
    a.account_name?.toLowerCase().includes('customer credit') ||
    a.account_name?.includes('إيرادات مقدمة') ||
    a.account_name?.includes('رصيد دائن')
  )
  // ملاحظة: inventory و cogs لم يعد مطلوبين هنا
  // لأن trigger trg_auto_cogs_reversal_on_return يتولى إنشاء قيد COGS تلقائياً

  // تحسين رسالة الخطأ لتوضيح الحسابات المفقودة
  const missingAccounts: string[] = []
  if (!revenue) missingAccounts.push(lang === 'en' ? 'Revenue' : 'الإيرادات')
  if (!customerCredit) missingAccounts.push(lang === 'en' ? 'Customer Credit' : 'رصيد العملاء الدائن')

  if (missingAccounts.length > 0) {
    const errorMsg = lang === 'en'
      ? `Required accounts not found: ${missingAccounts.join(', ')}. Please configure these accounts in Chart of Accounts.`
      : `الحسابات المطلوبة غير موجودة: ${missingAccounts.join('، ')}. يرجى إعداد هذه الحسابات في دليل الحسابات.`
    throw new Error(errorMsg)
  }

  // ملاحظة: قيد COGS يتم إنشاؤه تلقائياً عبر trigger في قاعدة البيانات
  // trg_auto_cogs_reversal_on_return عند إضافة حركة مخزون sale_return

  // إنشاء قيد المرتجع (الإيرادات ورصيد العميل فقط - COGS يتولاها الـ trigger)
  const { data: journalEntry } = await supabase
    .from('journal_entries')
    .insert({
      company_id: companyId,
      reference_type: 'sales_return',
      reference_id: invoiceId,
      entry_date: new Date().toISOString().slice(0, 10),
      description: `مرتجع مبيعات للفاتورة ${invoiceNumber}`
    })
    .select('id')
    .single()

  if (journalEntry) {
    const lines = [
      // 1. عكس الإيراد (مدين: مردودات المبيعات)
      {
        journal_entry_id: journalEntry.id,
        account_id: revenue,
        debit_amount: returnedSubtotal,
        credit_amount: 0,
        description: 'مردودات المبيعات'
      },
      // 2. رصيد دائن للعميل (دائن)
      {
        journal_entry_id: journalEntry.id,
        account_id: customerCredit,
        debit_amount: 0,
        credit_amount: returnedSubtotal,
        description: 'رصيد دائن للعميل'
      }
    ]

    // 3. عكس الضريبة (إن وجدت) - مدين ودائن
    if (vatPayable && returnedTax > 0) {
      lines.push(
        {
          journal_entry_id: journalEntry.id,
          account_id: vatPayable,
          debit_amount: returnedTax,
          credit_amount: 0,
          description: 'عكس ضريبة المبيعات'
        },
        {
          journal_entry_id: journalEntry.id,
          account_id: customerCredit,
          debit_amount: 0,
          credit_amount: returnedTax,
          description: 'رصيد دائن للعميل (ضريبة)'
        }
      )
    }

    // ملاحظة: قيد COGS (مخزون/تكلفة بضاعة) يتم إنشاؤه تلقائياً عبر:
    // trigger: trg_auto_cogs_reversal_on_return

    await supabase.from('journal_entry_lines').insert(lines)

    // إنشاء رصيد دائن للعميل
    await supabase.from('customer_credits').insert({
      company_id: companyId,
      customer_id: customerId,
      credit_number: `CR-${Date.now()}`,
      credit_date: new Date().toISOString().slice(0, 10),
      amount: returnTotal,
      used_amount: 0,
      reference_type: 'invoice_return',
      reference_id: invoiceId,
      status: 'active',
      notes: `رصيد دائن من مرتجع الفاتورة ${invoiceNumber}`
    })
  }

  return returnTotal
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
  const newReturned = oldReturned + returnTotal

  // تحديد الحالة الجديدة
  let newStatus = currentData.status
  if (newReturned >= oldTotal) {
    newStatus = 'fully_returned'
  } else if (newReturned > 0) {
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