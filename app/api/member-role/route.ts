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
    const role: string = body?.role
    const oldRole: string = body?.oldRole || ""
    const targetUserEmail: string = body?.targetUserEmail || ""
    const targetUserName: string = body?.targetUserName || ""
    const changedByUserId: string = body?.changedByUserId || ""
    const changedByUserEmail: string = body?.changedByUserEmail || ""

    if (!userId || !role) {
      return badRequestError("معرف المستخدم والدور مطلوبان", ["userId", "role"])
    }

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return internalError("خطأ في إعدادات الخادم", "Server configuration error")
    }
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    const { error: updateError } = await admin.from("company_members").update({ role }).eq("company_id", companyId).eq("user_id", userId)
    if (updateError) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "خطأ في تحديث الدور", updateError.message)
    }

    // تسجيل تغيير الصلاحيات في سجل المراجعة
    try {
      await admin.from('audit_logs').insert({
        action: 'PERMISSIONS',
        company_id: companyId,
        user_id: changedByUserId || user.id,
        user_email: changedByUserEmail || user.email,
        target_table: 'company_members',
        record_id: userId,
        record_identifier: targetUserEmail || targetUserName,
        old_data: { role: oldRole },
        new_data: { role },
        changed_fields: ['role'],
        ip_address: req.headers.get("x-forwarded-for")?.split(",")[0] || null,
        user_agent: req.headers.get("user-agent") || null,
      })
    } catch (logError) {
      console.error("Failed to log role change:", logError)
    }

    return apiSuccess({ ok: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown_error"
    return internalError("حدث خطأ أثناء تحديث دور العضو", message)
  }
}