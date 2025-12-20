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

    // تحديث الفاتورة
    const newTotal = Math.max(0, Number(invoice.total_amount) - returnAmount)
    
    await supabase
      .from("invoices")
      .update({
        subtotal: newTotal,
        total_amount: newTotal,
        returned_amount: returnAmount,
        return_status: returnAmount > 0 ? 'partial' : null
      })
      .eq("id", invoice.id)

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