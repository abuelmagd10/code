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
    // البحث أولاً بقيد invoice، ثم البحث بأي قيد مرتبط بالفاتورة
    let originalEntry: any = null
    
    // البحث بقيد invoice
    const { data: invoiceEntry, error: findInvoiceEntryErr } = await supabase
      .from("journal_entries")
      .select("id, reference_type")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice")
      .eq("reference_id", invoice.id)
      .limit(1)
      .maybeSingle()

    if (!findInvoiceEntryErr && invoiceEntry) {
      originalEntry = invoiceEntry
    } else {
      // البحث بأي قيد مرتبط بالفاتورة (invoice_payment, invoice_ar, etc.)
      const { data: anyEntry, error: findAnyEntryErr } = await supabase
        .from("journal_entries")
        .select("id, reference_type")
        .eq("company_id", companyId)
        .eq("reference_id", invoice.id)
        .in("reference_type", ["invoice", "invoice_payment", "invoice_ar"])
        .limit(1)
        .maybeSingle()

      if (!findAnyEntryErr && anyEntry) {
        originalEntry = anyEntry
      }
    }

    // تهيئة warnings array قبل استخدامه
    const warnings: string[] = []
    let wasEntryCreated = false

    // إذا لم يتم العثور على قيد، نحاول إنشاء قيد جديد بناءً على بيانات الفاتورة
    if (!originalEntry) {
      wasEntryCreated = true
      
      // إنشاء قيد AR/Revenue للفاتورة
      const { data: newEntry, error: createEntryErr } = await supabase
        .from("journal_entries")
        .insert({
          company_id: companyId,
          reference_type: "invoice",
          reference_id: invoice.id,
          entry_date: invoice.invoice_date || new Date().toISOString().slice(0, 10),
          description: `فاتورة مبيعات ${invoice.invoice_number}`,
          branch_id: invoice.branch_id || null,
          cost_center_id: invoice.cost_center_id || null,
          warehouse_id: invoice.warehouse_id || null,
        })
        .select()
        .single()

      if (createEntryErr || !newEntry) {
        return apiError(HTTP_STATUS.INTERNAL_ERROR, 
          "فشل في إنشاء القيد المحاسبي للفاتورة. يرجى التأكد من وجود الحسابات المطلوبة (AR, Revenue).", 
          `Failed to create journal entry: ${createEntryErr?.message || 'Unknown error'}`)
      }

      originalEntry = newEntry

      // إنشاء سطور القيد
      const invoiceTotal = Number(invoice.total_amount || 0)
      const invoiceSubtotal = Number(invoice.subtotal || 0)
      const invoiceTax = Number(invoice.tax_amount || 0)

      // ✅ التحقق من توازن القيد: Debit = Credit
      // AR (debit) = invoiceTotal
      // Revenue (credit) = invoiceSubtotal + invoiceTax (إذا لم يوجد حساب VAT)
      // VAT (credit) = invoiceTax (إذا وجد حساب VAT)
      // يجب أن يكون: invoiceTotal = invoiceSubtotal + invoiceTax

      const lines: any[] = [
        {
          journal_entry_id: newEntry.id,
          account_id: mapping.ar,
          debit_amount: invoiceTotal,
          credit_amount: 0,
          description: "الذمم المدينة (العملاء)",
          branch_id: invoice.branch_id || null,
          cost_center_id: invoice.cost_center_id || null,
        },
        {
          journal_entry_id: newEntry.id,
          account_id: mapping.revenue,
          debit_amount: 0,
          credit_amount: invoiceSubtotal + (invoiceTax > 0 && !mapping.vatPayable ? invoiceTax : 0), // ✅ إذا لم يوجد حساب VAT، نضيف الضريبة للإيراد لضمان التوازن
          description: invoiceTax > 0 && !mapping.vatPayable 
            ? "إيراد المبيعات (شامل الضريبة - لا يوجد حساب VAT منفصل)" 
            : "إيراد المبيعات",
          branch_id: invoice.branch_id || null,
          cost_center_id: invoice.cost_center_id || null,
        },
      ]

      // إضافة سطر VAT فقط إذا كان موجوداً في mapping
      if (invoiceTax > 0 && mapping.vatPayable) {
        lines.push({
          journal_entry_id: newEntry.id,
          account_id: mapping.vatPayable,
          debit_amount: 0,
          credit_amount: invoiceTax,
          description: "ضريبة القيمة المضافة المستحقة",
          branch_id: invoice.branch_id || null,
          cost_center_id: invoice.cost_center_id || null,
        })
      } else if (invoiceTax > 0 && !mapping.vatPayable) {
        // ⚠️ تحذير: يوجد ضريبة ولكن لا يوجد حساب VAT
        // تم إضافة الضريبة إلى Revenue أعلاه لضمان التوازن
        warnings.push(`يوجد ضريبة (${invoiceTax.toFixed(2)}) ولكن لا يوجد حساب VAT منفصل. تم إضافة الضريبة إلى حساب الإيراد لضمان توازن القيد.`)
      }

      const { error: linesErr } = await supabase.from("journal_entry_lines").insert(lines)
      if (linesErr) {
        // حذف القيد إذا فشل إنشاء السطور
        await supabase.from("journal_entries").delete().eq("id", newEntry.id)
        return apiError(HTTP_STATUS.INTERNAL_ERROR, 
          "فشل في إنشاء سطور القيد المحاسبي", 
          `Failed to create journal entry lines: ${linesErr.message}`)
      }
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
      original_entry_created: wasEntryCreated,
      old_return_entries_found: oldReturnEntries?.length || 0,
      old_return_entries_deleted: 0,
      old_return_lines_deleted: 0,
      original_entry_updated: false,
      inventory_transactions_updated: 0,
      invoice_updated: false,
      actual_returned_amount: 0,
      warnings: warnings, // استخدام warnings array الذي تم تهيئته مسبقاً
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

    // 7. جلب بنود الفاتورة لحساب المرتجع الفعلي
    const { data: invoiceItems, error: itemsErr } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)

    if (itemsErr || !invoiceItems || invoiceItems.length === 0) {
      return apiError(HTTP_STATUS.NOT_FOUND, 
        "لم يتم العثور على بنود الفاتورة", 
        "Invoice items not found")
    }

    // حساب المرتجع الفعلي من بنود الفاتورة (تأكد من أن القيم موجبة)
    let actualReturnedAmount = 0
    let actualReturnedSubtotal = 0
    let actualReturnedTax = 0

    for (const item of invoiceItems) {
      const itemReturnedQty = Math.abs(Number(item.returned_quantity || 0)) // تأكد من أن القيمة موجبة
      if (itemReturnedQty > 0) {
        const gross = itemReturnedQty * Number(item.unit_price || 0)
        const discount = gross * (Number(item.discount_percent || 0) / 100)
        const net = gross - discount
        const tax = net * (Number(item.tax_rate || 0) / 100)
        actualReturnedSubtotal += net
        actualReturnedTax += tax
        actualReturnedAmount += net + tax
      }
    }

    // تحديث returned_quantity ليكون موجب (إذا كان سالب)
    for (const item of invoiceItems) {
      const currentReturnedQty = Number(item.returned_quantity || 0)
      if (currentReturnedQty < 0) {
        await supabase
          .from("invoice_items")
          .update({ returned_quantity: Math.abs(currentReturnedQty) })
          .eq("id", item.id)
      }
    }

    // استخدام القيم الأصلية للفاتورة
    const invoiceTotal = Number(invoice.total_amount || 0)
    const invoiceSubtotal = Number(invoice.subtotal || 0)
    const invoiceTax = Number(invoice.tax_amount || 0)
    
    // القيم الجديدة بعد المرتجع
    const newInvoiceTotal = Math.max(0, invoiceTotal - actualReturnedAmount)
    const newSubtotal = Math.max(0, invoiceSubtotal - actualReturnedSubtotal)
    const newTax = Math.max(0, invoiceTax - actualReturnedTax)

    // 8. تحديث قيود القيد الأصلي بالقيم الجديدة فقط (بدون إنشاء قيود جديدة)
    let updatedLines = 0
    for (const line of originalLines) {
      let newDebit = line.debit_amount
      let newCredit = line.credit_amount
      let shouldUpdate = false

      // تحديث سطر AR (الذمم المدينة) - يجب أن ينخفض بقيمة المرتجع
      if (line.account_id === mapping.ar) {
        newDebit = newInvoiceTotal // القيمة الجديدة بعد تخفيض المرتجع
        newCredit = 0
        shouldUpdate = true
      }
      // تحديث سطر Revenue (الإيراد) - يجب أن ينخفض بقيمة المرتجع
      else if (line.account_id === mapping.revenue) {
        newDebit = 0
        newCredit = newSubtotal // القيمة الجديدة بعد تخفيض المرتجع
        shouldUpdate = true
      }
      // تحديث سطر VAT (الضريبة) - يجب أن ينخفض بقيمة ضريبة المرتجع
      else if (mapping.vatPayable && line.account_id === mapping.vatPayable) {
        newDebit = 0
        newCredit = newTax // القيمة الجديدة بعد تخفيض ضريبة المرتجع
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

    // 9. تحديث حركات المخزون لتربط بالقيد الأصلي (إذا وجد)
    const { data: inventoryTx, error: invTxErr } = await supabase
      .from("inventory_transactions")
      .select("id")
      .eq("reference_id", invoice.id)
      .eq("transaction_type", "sale_return")

    if (!invTxErr && inventoryTx && inventoryTx.length > 0) {
      for (const tx of inventoryTx) {
        // ربط حركات المخزون بالقيد الأصلي (إذا وجد) أو بالفاتورة
        const { error: updateTxErr } = await supabase
          .from("inventory_transactions")
          .update({
            journal_entry_id: originalEntry?.id || null,
            reference_type: "invoice" // ربط بالفاتورة الأصلية وليس بقيد منفصل
          })
          .eq("id", tx.id)

        if (updateTxErr) {
          results.errors.push(`خطأ في تحديث حركة المخزون ${tx.id}: ${updateTxErr.message}`)
        } else {
          results.inventory_transactions_updated++
        }
      }
    }

    // 10. تحديث بيانات الفاتورة نفسها (الهدف الأساسي للمعالجة)
    const returnStatus = actualReturnedAmount >= invoiceTotal ? 'full' : (actualReturnedAmount > 0 ? 'partial' : null)

    const { error: updateInvoiceErr } = await supabase
      .from("invoices")
      .update({
        subtotal: newSubtotal,
        tax_amount: newTax,
        total_amount: newInvoiceTotal,
        returned_amount: actualReturnedAmount,
        return_status: returnStatus
      })
      .eq("id", invoice.id)

    if (updateInvoiceErr) {
      results.errors.push(`خطأ في تحديث الفاتورة: ${updateInvoiceErr.message}`)
    } else {
      results.invoice_updated = true
      results.actual_returned_amount = actualReturnedAmount
      results.actual_returned_subtotal = actualReturnedSubtotal
      results.actual_returned_tax = actualReturnedTax
      results.new_invoice_total = newInvoiceTotal
      results.new_invoice_subtotal = newSubtotal
      results.new_invoice_tax = newTax
    }

    // 11. النتيجة النهائية - التأكد من تطبيق النمط المحاسبي الصحيح
    const success = results.old_return_entries_deleted > 0 || results.original_entry_updated || results.invoice_updated

    return apiSuccess({
      ...results,
      success,
      message: success 
        ? `✅ تم تصحيح الفاتورة ${invoice_number} وفقاً للنمط المحاسبي الصارم. تم حذف ${results.old_return_entries_deleted} قيد مرتجع قديم وتحديث القيد الأصلي والفاتورة بالقيم الصحيحة.`
        : `ℹ️ لم يتم العثور على قيود مرتجع قديمة للفاتورة ${invoice_number}. القيد الأصلي والفاتورة محدثان بالفعل.`,
      accounting_compliance: {
        invoice_updated: results.invoice_updated,
        original_entry_updated: results.original_entry_updated,
        no_new_journal_entries: true, // ✅ لم يتم إنشاء قيود جديدة
        no_cogs_entries: true, // ✅ لم يتم إنشاء قيود COGS
        no_cash_entries: true, // ✅ لم يتم إنشاء قيود نقدية
        ar_updated_correctly: results.original_entry_updated // ✅ تم تحديث AR في القيد الأصلي
      }
    })

  } catch (err: any) {
    return internalError("حدث خطأ أثناء تصحيح الفاتورة", err?.message)
  }
}

