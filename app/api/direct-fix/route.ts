import { createClient } from "@/lib/supabase/server"
import { NextRequest } from "next/server"
import { apiSuccess, internalError } from "@/lib/api-error-handler"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return apiSuccess({ success: false, message: "غير مصرح" })
    }

    // تحديث الفاتورة مباشرة
    const { data, error } = await supabase
      .from("invoices")
      .update({
        subtotal: 0,
        total_amount: 0,
        returned_amount: 20000,
        return_status: 'full'
      })
      .eq("company_id", "3a663f6b-0689-4952-93c1-6d958c737089")
      .eq("invoice_number", "INV-0001")
      .select()

    return apiSuccess({
      success: true,
      message: "تم تصحيح الفاتورة: الإجمالي = 0، المرتجع = 20000",
      data: data,
      error: error?.message || null
    })

  } catch (err: any) {
    return apiSuccess({
      success: false,
      message: `خطأ: ${err?.message || 'خطأ غير معروف'}`,
      error: err?.message
    })
  }
}