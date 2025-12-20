import { createClient } from "@/lib/supabase/server"
import { NextRequest } from "next/server"
import { apiSuccess, apiError, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

/**
 * تصحيح مرتجع فاتورة مرسلة (Sent) لتتوافق مع النمط المحاسبي الجديد
 * 
 * النمط الجديد:
 * - للفواتير المرسلة: تحديث القيد الأصلي (invoice) بدلاً من إنشاء قيد جديد (sales_return)
 * - حذف قيود sales_return القديمة
 * - تحديث قيد invoice ليعكس القيم الصحيحة بعد المرتجع
 * - ربط حركات المخزون بالقيد الأصلي
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return apiError(HTTP_STATUS.UNAUTHORIZED, "غير مصرح", "Unauthorized")
    }

    const body = await request.json()
    const { invoice_number, company_id } = body

    if (!invoice_number) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "رقم الفاتورة مطلوب", "Invoice number is required")
    }

    const companyId = company_id || user.user_metadata?.company_id
    if (!companyId) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "معرف الشركة مطلوب", "Company ID is required")
    }

    // 1. البحث عن الفاتورة
    const { data: invoice, error: invoiceErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("company_id", companyId)
      .eq("invoice_number", invoice_number)
      .single()

    if (invoiceErr || !invoice) {
      return apiError(HTTP_STATUS.NOT_FOUND, `الفاتورة ${invoice_number} غير موجودة`, `Invoice ${invoice_number} not found`)
    }

    // التحقق من أن الفاتورة في حالة sent
    if (invoice.status !== 'sent') {
      return apiError(HTTP_STATUS.BAD_REQUEST, 
        `هذه الفاتورة ليست في حالة مرسلة (Sent). الحالة الحالية: ${invoice.status}`, 
        `Invoice is not in 'sent' status. Current status: ${invoice.status}`)
    }

    // 2. جلب الحسابات المطلوبة
    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, sub_type")
      .eq("company_id", companyId)

    const mapping: any = {}
    accounts?.forEach((acc: any) => {
      if (acc.sub_type === 'accounts_receivable') mapping.ar = acc.id
      if (acc.sub_type === 'revenue' || acc.account_name?.toLowerCase().includes('revenue') || acc.account_name?.toLowerCase().includes('إيراد')) {
        if (!mapping.revenue) mapping.revenue = acc.id
      }
      if (acc.sub_type === 'vat_payable' || acc.account_name?.toLowerCase().includes('vat') || acc.account_name?.toLowerCase().includes('ضريبة')) {
        if (!mapping.vatPayable) mapping.vatPayable = acc.id
      }
    })

    if (!mapping.ar || !mapping.revenue) {
      return apiError(HTTP_STATUS.BAD_REQUEST, 
        "لم يتم العثور على الحسابات المطلوبة (AR, Revenue)", 
        "Required accounts (AR, Revenue) not found")
    }

    // 3. البحث عن القيد الأصلي للفاتورة (invoice)
    const { data: originalEntry, error: findEntryErr } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice")
      .eq("reference_id", invoice.id)
      .limit(1)
      .single()

    if (findEntryErr || !originalEntry) {
      return apiError(HTTP_STATUS.NOT_FOUND, 
        "لم يتم العثور على القيد المحاسبي الأصلي للفاتورة", 
        "Original invoice journal entry not found")
    }

    // 4. البحث عن قيود sales_return القديمة المرتبطة بهذه الفاتورة
    const { data: oldReturnEntries, error: oldReturnErr } = await supabase
      .from("journal_entries")
      .select("id, description")
      .eq("company_id", companyId)
      .eq("reference_type", "sales_return")
      .eq("reference_id", invoice.id)

    const results: any = {
      invoice_number,
      invoice_id: invoice.id,
      invoice_status: invoice.status,
      original_entry_id: originalEntry.id,
      old_return_entries_found: oldReturnEntries?.length || 0,
      old_return_entries_deleted: 0,
      old_return_lines_deleted: 0,
      original_entry_updated: false,
      inventory_transactions_updated: 0,
      errors: []
    }

    // 5. حذف قيود sales_return القديمة
    if (oldReturnEntries && oldReturnEntries.length > 0) {
      for (const oldEntry of oldReturnEntries) {
        // حذف سطور القيد
        const { error: deleteLinesErr } = await supabase
          .from("journal_entry_lines")
          .delete()
          .eq("journal_entry_id", oldEntry.id)

        if (deleteLinesErr) {
          results.errors.push(`خطأ في حذف سطور قيد المرتجع ${oldEntry.id}: ${deleteLinesErr.message}`)
        } else {
          results.old_return_lines_deleted += 1
        }

        // حذف القيد
        const { error: deleteEntryErr } = await supabase
          .from("journal_entries")
          .delete()
          .eq("id", oldEntry.id)

        if (deleteEntryErr) {
          results.errors.push(`خطأ في حذف قيد المرتجع ${oldEntry.id}: ${deleteEntryErr.message}`)
        } else {
          results.old_return_entries_deleted += 1
        }
      }
    }

    // 6. جلب قيود القيد الأصلي
    const { data: originalLines, error: linesErr } = await supabase
      .from("journal_entry_lines")
      .select("*")
      .eq("journal_entry_id", originalEntry.id)

    if (linesErr || !originalLines || originalLines.length === 0) {
      return apiError(HTTP_STATUS.NOT_FOUND, 
        "لم يتم العثور على قيود القيد الأصلي", 
        "Original journal entry lines not found")
    }

    // 7. حساب القيم الصحيحة بعد المرتجع
    const returnedAmount = Number(invoice.returned_amount || 0)
    const invoiceTotal = Number(invoice.total_amount || 0)
    const invoiceSubtotal = Number(invoice.subtotal || 0)
    const invoiceTax = Number(invoice.tax_amount || 0)

    // حساب النسبة المئوية للمرتجع من إجمالي الفاتورة
    const returnPercentage = invoiceTotal > 0 ? returnedAmount / invoiceTotal : 0

    // حساب القيم المرتجعة (بنفس النسبة)
    const returnTax = invoiceTax * returnPercentage
    const returnSubtotal = invoiceSubtotal * returnPercentage
    
    // القيم الجديدة بعد المرتجع
    const newInvoiceTotal = Math.max(0, invoiceTotal - returnedAmount)
    const newSubtotal = Math.max(0, invoiceSubtotal - returnSubtotal)
    const newTax = Math.max(0, invoiceTax - returnTax)

    // 8. تحديث قيود القيد الأصلي
    let updatedLines = 0
    for (const line of originalLines) {
      let newDebit = line.debit_amount
      let newCredit = line.credit_amount
      let shouldUpdate = false

      // تحديث سطر AR (الذمم المدينة)
      if (line.account_id === mapping.ar) {
        newDebit = newInvoiceTotal
        newCredit = 0
        shouldUpdate = true
      }
      // تحديث سطر Revenue (الإيراد)
      else if (line.account_id === mapping.revenue) {
        newDebit = 0
        newCredit = newSubtotal
        shouldUpdate = true
      }
      // تحديث سطر VAT (الضريبة)
      else if (mapping.vatPayable && line.account_id === mapping.vatPayable) {
        newDebit = 0
        newCredit = newTax
        shouldUpdate = true
      }

      if (shouldUpdate && (newDebit !== line.debit_amount || newCredit !== line.credit_amount)) {
        const { error: updateLineErr } = await supabase
          .from("journal_entry_lines")
          .update({
            debit_amount: newDebit,
            credit_amount: newCredit,
            description: line.description + ' (معدل للمرتجع)'
          })
          .eq("id", line.id)

        if (updateLineErr) {
          results.errors.push(`خطأ في تحديث سطر القيد ${line.id}: ${updateLineErr.message}`)
        } else {
          updatedLines++
        }
      }
    }

    if (updatedLines > 0) {
      results.original_entry_updated = true
    }

    // 9. تحديث حركات المخزون لتربط بالقيد الأصلي
    const { data: inventoryTx, error: invTxErr } = await supabase
      .from("inventory_transactions")
      .select("id")
      .eq("reference_id", invoice.id)
      .eq("transaction_type", "sale_return")

    if (!invTxErr && inventoryTx && inventoryTx.length > 0) {
      for (const tx of inventoryTx) {
        const { error: updateTxErr } = await supabase
          .from("inventory_transactions")
          .update({
            journal_entry_id: originalEntry.id
          })
          .eq("id", tx.id)

        if (updateTxErr) {
          results.errors.push(`خطأ في تحديث حركة المخزون ${tx.id}: ${updateTxErr.message}`)
        } else {
          results.inventory_transactions_updated++
        }
      }
    }

    // 10. النتيجة النهائية
    const success = results.old_return_entries_deleted > 0 || results.original_entry_updated

    return apiSuccess({
      ...results,
      success,
      message: success 
        ? `تم تصحيح الفاتورة ${invoice_number} بنجاح. تم حذف ${results.old_return_entries_deleted} قيد مرتجع قديم وتحديث القيد الأصلي.`
        : `لم يتم العثور على قيود مرتجع قديمة للفاتورة ${invoice_number}. القيد الأصلي محدث بالفعل.`
    })

  } catch (err: any) {
    return internalError("حدث خطأ أثناء تصحيح الفاتورة", err?.message)
  }
}

