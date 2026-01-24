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

    // ✅ جلب الدور القديم قبل التحديث (للتأكد من التغيير)
    const { data: oldMember } = await admin
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle()

    const actualOldRole = oldMember?.role || ""

    console.log('🔄 [member-role API] Updating user role:', {
      userId,
      companyId,
      oldRole: actualOldRole,
      newRole: role,
      changedBy: user.id,
    })

    // ✅ تحديث الدور في company_members (هذا سيطلق Trigger تلقائياً)
    const { error: updateError, data: updateData } = await admin
      .from("company_members")
      .update({ role })
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .select()

    if (updateError) {
      console.error('❌ [member-role API] Update error:', updateError)
      return apiError(HTTP_STATUS.BAD_REQUEST, "خطأ في تحديث الدور", updateError.message)
    }

    console.log('✅ [member-role API] Role updated successfully:', {
      userId,
      oldRole: actualOldRole,
      newRole: role,
      updatedRows: updateData?.length || 0,
    })

    // ✅ التحقق من أن Trigger أطلق user_security_event (بدون delay - Trigger يعمل بشكل متزامن)
    // ✅ Note: Database triggers execute synchronously within the same transaction
    // ✅ We check immediately - if the trigger fired, the event will be there
    const { data: securityEvent } = await admin
      .from("user_security_events")
      .select("id, event_type, created_at")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .eq("event_type", "role_changed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (securityEvent) {
      console.log('✅ [member-role API] user_security_event created by trigger:', securityEvent)
    } else {
      // ✅ Warning only - trigger should fire, but Realtime will handle it even if delayed
      console.warn('⚠️ [member-role API] user_security_event not found immediately - trigger may fire asynchronously, Realtime will handle it')
    }

    // ✅ تسجيل تغيير الصلاحيات في سجل المراجعة
    // ✅ استخدام actualOldRole من قاعدة البيانات (ليس من request body) لضمان دقة audit trail
    try {
      await admin.from('audit_logs').insert({
        action: 'UPDATE',
        company_id: companyId,
        user_id: changedByUserId || user.id,
        user_email: changedByUserEmail || user.email,
        target_table: 'company_members',
        record_id: userId,
        record_identifier: targetUserEmail || targetUserName,
        old_data: { role: actualOldRole }, // ✅ استخدام actualOldRole من DB (ليس oldRole من request)
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