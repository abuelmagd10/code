import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError } from "@/lib/api-error-handler"

export async function POST(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام requireOwnerOrAdmin ===
    const { user, companyId, member, error } = await requireOwnerOrAdmin(req)

    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    }
    // === نهاية التحصين الأمني ===

    const body = await req.json()
    const userId: string = body?.userId
    const fullDelete: boolean = !!body?.fullDelete

    if (!userId) {
      return badRequestError("معرف المستخدم مطلوب", ["userId"])
    }

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return internalError("خطأ في إعدادات الخادم", "Server configuration error")
    }
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    const { error: delMemErr } = await admin.from("company_members").delete().eq("company_id", companyId).eq("user_id", userId)
    if (delMemErr) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "خطأ في حذف العضوية", delMemErr.message)
    }

    if (fullDelete) {
      const { error: delUserErr } = await (admin as any).auth.admin.deleteUser(userId)
      if (delUserErr) {
        return apiError(HTTP_STATUS.BAD_REQUEST, "خطأ في حذف المستخدم", delUserErr.message)
      }
    }

    return apiSuccess({ ok: true })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء حذف العضو", e?.message || "unknown_error")
  }
}