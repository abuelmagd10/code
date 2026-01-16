import { createClient } from "@/lib/supabase/server"
import { NextRequest } from "next/server"
import { apiSuccess, apiError, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

/**
 * معالجة مرتجع فاتورة مرسلة (Sent) وفقاً للمتطلبات المحاسبية الصارمة
 * 
 * ✅ المسموح فقط:
 * - تعديل بيانات الفاتورة نفسها (الكميات، الصافي، الإجمالي)
 * - تحديث ذمم العميل (AR) في القيد الأصلي
 * - تحديث حركات المخزون
 * 
 * 🚫 ممنوع تماماً:
 * - إنشاء أي قيد مالي جديد
 * - إنشاء قيد Cash أو COGS أو Revenue إضافي
 * - المساس بأي فواتير أو قيود أخرى
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return apiError(HTTP_STATUS.UNAUTHORIZED, "غير مصرح", "Unauthorized")
    }

    const body = await request.json()
    const { invoice_id, return_items, return_number } = body

    if (!invoice_id || !return_items || !Array.isArray(return_items)) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "بيانات المرتجع غير مكتملة", "Invalid return data")
    }

    // الحصول على معرف الشركة
    const { getActiveCompanyId } = await import("@/lib/company")
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "معرف الشركة مطلوب", "Company ID is required")
    }

    // 1. التحقق من الفاتورة وحالتها
    const { data: invoice, error: invoiceErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", invoice_id)
      .single()

    if (invoiceErr || !invoice) {
      return apiError(HTTP_STATUS.NOT_FOUND, "الفاتورة غير موجودة", "Invoice not found")
    }

    // التحقق من أن الفاتورة في حالة sent
    if (invoice.status !== 'sent') {
      return apiError(HTTP_STATUS.BAD_REQUEST, 
        `هذه الفاتورة ليست في حالة مرسلة (Sent). الحالة الحالية: ${invoice.status}`, 
        `Invoice is not in 'sent' status. Current status: ${invoice.status}`)
    }

    // 2. جلب بنود الفاتورة الحالية
    const { data: invoiceItems, error: itemsErr } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice_id)

    if (itemsErr || !invoiceItems) {
      return apiError(HTTP_STATUS.NOT_FOUND, "بنود الفاتورة غير موجودة", "Invoice items not found")
    }

    // 3. حساب المرتجع الفعلي وتحديث الكميات
    let totalReturnAmount = 0
    let totalReturnSubtotal = 0
    let totalReturnTax = 0

    for (const returnItem of return_items) {
      const { item_id, returned_quantity } = returnItem
      const invoiceItem = invoiceItems.find(item => item.id === item_id)
      
      if (!invoiceItem) continue

      const returnQty = Math.abs(Number(returned_quantity || 0))
      if (returnQty <= 0) continue

      // حساب قيمة المرتجع لهذا البند
      const unitPrice = Number(invoiceItem.unit_price || 0)
      const discountPercent = Number(invoiceItem.discount_percent || 0)
      const taxRate = Number(invoiceItem.tax_rate || 0)
      
      const gross = returnQty * unitPrice
      const discount = gross * (discountPercent / 100)
      const net = gross - discount
      const tax = net * (taxRate / 100)
      
      totalReturnSubtotal += net
      totalReturnTax += tax
      totalReturnAmount += net + tax

      // تحديث الكمية المرتجعة في بند الفاتورة
      const currentReturned = Number(invoiceItem.returned_quantity || 0)
      const newReturned = currentReturned + returnQty
      
      await supabase
        .from("invoice_items")
        .update({ returned_quantity: newReturned })
        .eq("id", item_id)

      // ✅ تحديث third_party_inventory.returned_quantity (للفواتير المرسلة عبر شركات الشحن)
      if (invoiceItem.product_id) {
        const { data: tpiRecord } = await supabase
          .from("third_party_inventory")
          .select("id, returned_quantity")
          .eq("invoice_id", invoice_id)
          .eq("product_id", invoiceItem.product_id)
          .maybeSingle()

        if (tpiRecord) {
          const newTpiReturned = (Number(tpiRecord.returned_quantity) || 0) + returnQty
          await supabase
            .from("third_party_inventory")
            .update({ returned_quantity: newTpiReturned })
            .eq("id", tpiRecord.id)
        }
      }

      // إنشاء حركة مخزون للاسترجاع
      if (invoiceItem.product_id) {
        let effectiveBranchId = (invoice as any).branch_id as string | null
        let effectiveWarehouseId = (invoice as any).warehouse_id as string | null
        let effectiveCostCenterId = (invoice as any).cost_center_id as string | null

        if (effectiveBranchId && (!effectiveWarehouseId || !effectiveCostCenterId)) {
          const { getBranchDefaults } = await import("@/lib/governance-branch-defaults")
          const defaults = await getBranchDefaults(supabase, effectiveBranchId)
          if (!effectiveWarehouseId) effectiveWarehouseId = defaults.default_warehouse_id
          if (!effectiveCostCenterId) effectiveCostCenterId = defaults.default_cost_center_id
        }

        await supabase.from("inventory_transactions").insert({
          company_id: companyId,
          product_id: invoiceItem.product_id,
          transaction_type: "sale_return",
          quantity_change: returnQty,
          reference_id: invoice_id,
          reference_type: "invoice_return",
          notes: `مرتجع فاتورة مرسلة ${return_number || 'غير محدد'}`,
          branch_id: effectiveBranchId,
          cost_center_id: effectiveCostCenterId,
          warehouse_id: effectiveWarehouseId,
        })
      }
    }

    // 4. تحديث بيانات الفاتورة نفسها (تخفيض القيم)
    const currentSubtotal = Number(invoice.subtotal || 0)
    const currentTaxAmount = Number(invoice.tax_amount || 0)
    const currentTotalAmount = Number(invoice.total_amount || 0)
    const currentReturnedAmount = Number(invoice.returned_amount || 0)

    const newSubtotal = Math.max(0, currentSubtotal - totalReturnSubtotal)
    const newTaxAmount = Math.max(0, currentTaxAmount - totalReturnTax)
    const newTotalAmount = Math.max(0, currentTotalAmount - totalReturnAmount)
    const newReturnedAmount = currentReturnedAmount + totalReturnAmount

    // تحديد حالة المرتجع
    const returnStatus = newReturnedAmount >= currentTotalAmount ? 'full' : 
                        (newReturnedAmount > 0 ? 'partial' : null)
    
    // ✅ تحديد حالة الفاتورة الجديدة بناءً على المرتجع
    const newInvoiceStatus = newTotalAmount === 0 ? 'fully_returned' : 'partially_returned'

    const { error: updateInvoiceErr } = await supabase
      .from("invoices")
      .update({
        subtotal: newSubtotal,
        tax_amount: newTaxAmount,
        total_amount: newTotalAmount,
        returned_amount: newReturnedAmount,
        return_status: returnStatus,
        status: newInvoiceStatus // ✅ إضافة تحديث الحالة
      })
      .eq("id", invoice_id)

    if (updateInvoiceErr) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, 
        "فشل في تحديث الفاتورة", 
        `Failed to update invoice: ${updateInvoiceErr.message}`)
    }

    // 5. تحديث القيد الأصلي للفاتورة (إذا وجد) ليعكس القيم الجديدة
    const { data: originalEntry } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("reference_type", "invoice")
      .eq("reference_id", invoice_id)
      .single()

    let entryUpdated = false
    if (originalEntry) {
      // جلب الحسابات المطلوبة
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

      // تحديث سطور القيد الأصلي
      const { data: entryLines } = await supabase
        .from("journal_entry_lines")
        .select("*")
        .eq("journal_entry_id", originalEntry.id)

      if (entryLines) {
        for (const line of entryLines) {
          let shouldUpdate = false
          let newDebit = line.debit_amount
          let newCredit = line.credit_amount

          // تحديث سطر AR (الذمم المدينة)
          if (line.account_id === mapping.ar) {
            newDebit = newTotalAmount
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
            newCredit = newTaxAmount
            shouldUpdate = true
          }

          if (shouldUpdate) {
            await supabase
              .from("journal_entry_lines")
              .update({
                debit_amount: newDebit,
                credit_amount: newCredit,
                description: line.description + ' (معدل للمرتجع)'
              })
              .eq("id", line.id)
            entryUpdated = true
          }
        }
      }
    }

    return apiSuccess({
      success: true,
      message: `تم معالجة مرتجع الفاتورة ${invoice.invoice_number} بنجاح`,
      invoice_id: invoice_id,
      invoice_number: invoice.invoice_number,
      return_amount: totalReturnAmount,
      return_subtotal: totalReturnSubtotal,
      return_tax: totalReturnTax,
      new_invoice_total: newTotalAmount,
      new_invoice_subtotal: newSubtotal,
      new_invoice_tax: newTaxAmount,
      return_status: returnStatus,
      entry_updated: entryUpdated,
      items_processed: return_items.length
    })

  } catch (err: any) {
    return internalError("حدث خطأ أثناء معالجة المرتجع", err?.message)
  }
}
