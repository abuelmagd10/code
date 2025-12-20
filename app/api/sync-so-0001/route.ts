import { createClient } from "@/lib/supabase/server"
import { NextRequest } from "next/server"
import { apiSuccess, internalError } from "@/lib/api-error-handler"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // مزامنة أمر البيع SO-0001 مع الفاتورة INV-0001
    const { error } = await supabase
      .from("sales_orders")
      .update({
        subtotal: 0,
        tax_amount: 0,
        total: 0
      })
      .eq("so_number", "SO-0001")

    if (error) throw error

    return apiSuccess({
      success: true,
      message: "تم تحديث أمر البيع ليتطابق مع الفاتورة"
    })

  } catch (err: any) {
    return internalError("حدث خطأ", err?.message)
  }
}