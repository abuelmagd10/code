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

    const companyId = "3a663f6b-0689-4952-93c1-6d958c737089"

    // البحث عن الفاتورة INV-0001
    const { data: invoice } = await supabase
      .from("invoices")
      .select("*")
      .eq("company_id", companyId)
      .eq("invoice_number", "INV-0001")
      .single()

    if (!invoice) {
      return apiError(HTTP_STATUS.NOT_FOUND, "الفاتورة غير موجودة", "Invoice not found")
    }

    // جلب بنود الفاتورة
    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)

    const results = {
      invoice_number: invoice.invoice_number,
      items_fixed: 0,
      steps: []
    }

    // تصحيح الكميات السالبة أولاً
    for (const item of items || []) {
      const returnedQty = Number(item.returned_quantity || 0)
      if (returnedQty < 0) {
        await supabase
          .from("invoice_items")
          .update({ returned_quantity: Math.abs(returnedQty) })
          .eq("id", item.id)
        
        results.items_fixed++
        results.steps.push(`تم تصحيح الكمية المرتجعة من ${returnedQty} إلى ${Math.abs(returnedQty)}`)
      }
    }

    // إعادة جلب البيانات بعد التصحيح
    const { data: updatedItems } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)

    // حساب المرتجع الصحيح
    let returnAmount = 0
    let returnSubtotal = 0
    
    for (const item of updatedItems || []) {
      const returnedQty = Math.abs(Number(item.returned_quantity || 0))
      if (returnedQty > 0) {
        const unitPrice = Number(item.unit_price || 0)
        const gross = returnedQty * unitPrice
        returnSubtotal += gross
        returnAmount += gross
      }
    }

    // تحديث الفاتورة بالقيم الصحيحة
    const originalTotal = 20000
    const newSubtotal = Math.max(0, originalTotal - returnSubtotal)
    const newTotal = newSubtotal
    
    await supabase
      .from("invoices")
      .update({
        subtotal: newSubtotal,
        tax_amount: 0,
        total_amount: newTotal,
        returned_amount: returnAmount,
        return_status: returnAmount > 0 ? 'partial' : null
      })
      .eq("id", invoice.id)

    results.steps.push(`تم تحديث المجموع الفرعي إلى ${newSubtotal}`)
    results.steps.push(`تم تحديث إجمالي الفاتورة إلى ${newTotal}`)
    results.steps.push(`تم تحديث المرتجع إلى ${returnAmount}`)

    return apiSuccess({
      ...results,
      success: true,
      message: `تم تصحيح الفاتورة INV-0001 بنجاح`,
      new_subtotal: newSubtotal,
      new_total: newTotal,
      return_amount: returnAmount
    })

  } catch (err: any) {
    return internalError("حدث خطأ أثناء التصحيح", err?.message)
  }
}