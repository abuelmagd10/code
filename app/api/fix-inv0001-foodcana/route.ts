import { createClient } from "@/lib/supabase/server"
import { NextRequest } from "next/server"
import { apiSuccess, apiError, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return apiError(HTTP_STATUS.UNAUTHORIZED, "غير مصرح", "Unauthorized")
    }

    // البحث عن شركة foodcana
    const { data: company } = await supabase
      .from("companies")
      .select("id, name")
      .ilike("name", "%foodcana%")
      .single()

    if (!company) {
      return apiError(HTTP_STATUS.NOT_FOUND, "شركة foodcana غير موجودة", "Company not found")
    }

    // البحث عن الفاتورة INV-0001
    const { data: invoice } = await supabase
      .from("invoices")
      .select("*")
      .eq("company_id", company.id)
      .eq("invoice_number", "INV-0001")
      .single()

    if (!invoice) {
      return apiError(HTTP_STATUS.NOT_FOUND, "الفاتورة INV-0001 غير موجودة", "Invoice not found")
    }

    const results: any = {
      company_name: company.name,
      invoice_number: invoice.invoice_number,
      invoice_status: invoice.status,
      steps: [],
      errors: []
    }

    // حذف قيود sales_return القديمة
    const { data: returnEntries } = await supabase
      .from("journal_entries")
      .select("id, description")
      .eq("company_id", company.id)
      .eq("reference_type", "sales_return")
      .eq("reference_id", invoice.id)

    if (returnEntries && returnEntries.length > 0) {
      for (const entry of returnEntries) {
        await supabase.from("journal_entry_lines").delete().eq("journal_entry_id", entry.id)
        await supabase.from("journal_entries").delete().eq("id", entry.id)
        results.steps.push(`حذف قيد مرتجع قديم: ${entry.description}`)
      }
    }

    // جلب بنود الفاتورة وحساب المرتجع
    const { data: invoiceItems } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)

    let returnAmount = 0
    let returnSubtotal = 0
    let returnTax = 0

    for (const item of invoiceItems || []) {
      const returnedQty = Math.abs(Number(item.returned_quantity || 0))
      if (returnedQty > 0) {
        const unitPrice = Number(item.unit_price || 0)
        const discountPercent = Number(item.discount_percent || 0)
        const taxRate = Number(item.tax_rate || 0)
        
        const gross = returnedQty * unitPrice
        const discount = gross * (discountPercent / 100)
        const net = gross - discount
        const tax = net * (taxRate / 100)
        
        returnSubtotal += net
        returnTax += tax
        returnAmount += net + tax
      }
    }

    // حساب القيم الجديدة
    const newSubtotal = Math.max(0, Number(invoice.subtotal) - returnSubtotal)
    const newTax = Math.max(0, Number(invoice.tax_amount) - returnTax)
    const newTotal = Math.max(0, Number(invoice.total_amount) - returnAmount)

    // تحديث الفاتورة
    await supabase
      .from("invoices")
      .update({
        subtotal: newSubtotal,
        tax_amount: newTax,
        total_amount: newTotal,
        returned_amount: returnAmount,
        return_status: returnAmount > 0 ? 'partial' : null
      })
      .eq("id", invoice.id)

    results.steps.push("تم تحديث بيانات الفاتورة")

    // تحديث القيد الأصلي
    const { data: originalEntry } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", company.id)
      .eq("reference_type", "invoice")
      .eq("reference_id", invoice.id)
      .single()

    if (originalEntry) {
      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_name, sub_type")
        .eq("company_id", company.id)

      const arAccount = accounts?.find(a => a.sub_type === 'accounts_receivable')?.id
      const revenueAccount = accounts?.find(a => a.sub_type === 'revenue')?.id
      const vatAccount = accounts?.find(a => a.sub_type === 'vat_payable')?.id

      const { data: entryLines } = await supabase
        .from("journal_entry_lines")
        .select("*")
        .eq("journal_entry_id", originalEntry.id)

      for (const line of entryLines || []) {
        let newDebit = line.debit_amount
        let newCredit = line.credit_amount

        if (line.account_id === arAccount) {
          newDebit = newTotal
        } else if (line.account_id === revenueAccount) {
          newCredit = newSubtotal
        } else if (vatAccount && line.account_id === vatAccount) {
          newCredit = newTax
        }

        await supabase
          .from("journal_entry_lines")
          .update({
            debit_amount: newDebit,
            credit_amount: newCredit,
            description: line.description + ' (مصحح)'
          })
          .eq("id", line.id)
      }
      results.steps.push("تم تحديث القيد الأصلي")
    }

    return apiSuccess({
      ...results,
      success: true,
      message: `تم تصحيح الفاتورة INV-0001 في شركة ${company.name} بنجاح`,
      new_values: {
        subtotal: newSubtotal,
        tax_amount: newTax,
        total_amount: newTotal,
        returned_amount: returnAmount
      }
    })

  } catch (err: any) {
    return internalError("حدث خطأ أثناء التصحيح", err?.message)
  }
}