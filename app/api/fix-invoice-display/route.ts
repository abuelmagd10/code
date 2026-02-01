import { createClient } from "@/lib/supabase/server"
import { NextRequest } from "next/server"
import { apiSuccess, internalError } from "@/lib/api-error-handler"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const companyId = "3a663f6b-0689-4952-93c1-6d958c737089"

    // جلب الفاتورة والعميل
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, customer_id, total_amount")
      .eq("company_id", companyId)
      .eq("invoice_number", "INV-0001")
      .single()

    if (!invoice) {
      return apiSuccess({ message: "Invoice not found" })
    }

    // جلب بنود الفاتورة
    const { data: items } = await supabase
      .from("invoice_items")
      .select("returned_quantity, unit_price")
      .eq("invoice_id", invoice.id)

    // حساب المرتجع
    let returnAmount = 0
    for (const item of items || []) {
      const returnedQty = Math.abs(Number(item.returned_quantity || 0))
      const unitPrice = Number(item.unit_price || 0)
      returnAmount += returnedQty * unitPrice
    }

    // إنشاء سجل مرتجع إذا لم يوجد
    const { data: existingReturn } = await supabase
      .from("sales_returns")
      .select("id")
      .eq("invoice_id", invoice.id)
      .single()

    if (!existingReturn && returnAmount > 0) {
      await supabase.from("sales_returns").insert({
        company_id: companyId,
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        return_number: "RET-INV-0001",
        return_date: new Date().toISOString().slice(0, 10),
        subtotal: returnAmount,
        tax_amount: 0,
        total_amount: returnAmount,
        status: "completed"
      })
    }

    // تحديث الفاتورة بالقيم الصحيحة بعد المرتجع
    const originalTotal = 20000
    const newTotal = originalTotal - returnAmount
    
    await supabase
      .from("invoices")
      .update({
        subtotal: newTotal,
        total_amount: newTotal,
        returned_amount: returnAmount,
        return_status: returnAmount > 0 ? 'partial' : null
      })
      .eq("id", invoice.id)

    // حذف أي قيود sales_return قديمة
    const { data: oldEntries } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("reference_type", "sales_return")
      .eq("reference_id", invoice.id)

    for (const entry of oldEntries || []) {
      await supabase.from("journal_entry_lines").delete().eq("journal_entry_id", entry.id)
      await supabase.from("journal_entries").delete().eq("id", entry.id)
    }

    // تحديث القيد الأصلي إذا وجد
    const { data: originalEntry } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("reference_type", "invoice")
      .eq("reference_id", invoice.id)
      .single()

    if (originalEntry) {
      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("id, sub_type")
        .eq("company_id", companyId)

      const arAccount = accounts?.find(a => a.sub_type === 'accounts_receivable')?.id
      const revenueAccount = accounts?.find(a => a.sub_type === 'revenue')?.id

      if (arAccount || revenueAccount) {
        const { data: lines } = await supabase
          .from("journal_entry_lines")
          .select("*")
          .eq("journal_entry_id", originalEntry.id)

        for (const line of lines || []) {
          if (line.account_id === arAccount) {
            await supabase
              .from("journal_entry_lines")
              .update({ debit_amount: newTotal })
              .eq("id", line.id)
          } else if (line.account_id === revenueAccount) {
            await supabase
              .from("journal_entry_lines")
              .update({ credit_amount: newTotal })
              .eq("id", line.id)
          }
        }
      }
    }

    return apiSuccess({
      success: true,
      message: "تم تصحيح الفاتورة بنجاح",
      original_total: invoice.total_amount,
      return_amount: returnAmount,
      new_total: newTotal
    })

  } catch (err: any) {
    return internalError("حدث خطأ", err?.message)
  }
}