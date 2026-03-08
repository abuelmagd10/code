import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError } from "@/lib/api-error-handler"
import { asyncAuditLog } from "@/lib/core"

export async function POST(req: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    }

    const body = await req.json()
    const userId: string = body?.userId
    const role: string = body?.role
    const targetUserEmail: string = body?.targetUserEmail || ""
    const targetUserName: string = body?.targetUserName || ""

    if (!userId || !role) {
      return badRequestError("معرف المستخدم والدور مطلوبان", ["userId", "role"])
    }

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return internalError("خطأ في إعدادات الخادم", "Server configuration error")

    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    // ✅ جلب الدور القديم من DB لضمان دقة الـ Audit Trail (وليس من req.body)
    const { data: oldMember } = await admin
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle()

    const actualOldRole = oldMember?.role || ""

    const { error: updateError } = await admin
      .from("company_members")
      .update({ role })
      .eq("company_id", companyId)
      .eq("user_id", userId)

    if (updateError) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "خطأ في تحديث الدور", updateError.message)
    }

    // ✅ Async Audit (Non-Blocking — Core Infrastructure)
    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email,
      action: 'UPDATE',
      table: 'company_members',
      recordId: userId,
      recordIdentifier: targetUserEmail || targetUserName,
      oldData: { role: actualOldRole },
      newData: { role },
      reason: 'Role Change by Admin/Owner'
    })

    return apiSuccess({ ok: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown_error"
    return internalError("حدث خطأ أثناء تحديث دور العضو", message)
  }
}