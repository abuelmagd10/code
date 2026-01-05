import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS } from "@/lib/api-error-handler"

/**
 * API لإعادة حالة فاتورة تم تغييرها بالخطأ
 */
export async function POST(req: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!user || !companyId) {
      return apiError(HTTP_STATUS.UNAUTHORIZED, "غير مصرح", "Unauthorized")
    }

    const body = await req.json()
    const { bill_number, returned_amount, return_status, status } = body

    if (!bill_number) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "رقم الفاتورة مطلوب", "Bill number is required")
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!supabaseUrl || !serviceKey) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const admin = createClient(supabaseUrl, serviceKey, { global: { headers: { apikey: serviceKey } } })

    // جلب الفاتورة
    const { data: bill, error: billError } = await admin
      .from("bills")
      .select("*")
      .eq("company_id", companyId)
      .eq("bill_number", bill_number)
      .single()

    if (billError || !bill) {
      return apiError(HTTP_STATUS.NOT_FOUND, "الفاتورة غير موجودة", "Bill not found")
    }

    // إعادة الحالة
    const updateData: any = {}
    if (returned_amount !== undefined) updateData.returned_amount = returned_amount
    if (return_status !== undefined) updateData.return_status = return_status
    if (status !== undefined) updateData.status = status

    const { error: updateError } = await admin
      .from("bills")
      .update(updateData)
      .eq("id", bill.id)

    if (updateError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "فشل تحديث الفاتورة", updateError.message)
    }

    return apiSuccess({
      message: "تم إعادة حالة الفاتورة بنجاح",
      messageEn: "Bill status restored successfully",
      bill_id: bill.id,
      bill_number: bill.bill_number,
      updated_fields: updateData
    }, HTTP_STATUS.OK)

  } catch (e: any) {
    console.error("Error restoring bill:", e)
    return apiError(
      HTTP_STATUS.INTERNAL_ERROR,
      "حدث خطأ أثناء إعادة حالة الفاتورة",
      e?.message || "Unknown error"
    )
  }
}

