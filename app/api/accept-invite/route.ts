import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError, notFoundError } from "@/lib/api-error-handler"

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()
    if (!token || !password) {
      return badRequestError("رمز الدعوة وكلمة المرور مطلوبان", ["token", "password"])
    }

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return internalError("خطأ في إعدادات الخادم", "Server configuration error")
    }
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    const { data: invRows, error: invErr } = await admin
      .from("company_invitations")
      .select("id, company_id, email, role, expires_at, accepted, branch_id, cost_center_id, warehouse_id")
      .eq("accept_token", token)
      .limit(1)
    if (invErr) {
      return internalError("خطأ في جلب الدعوة", invErr.message)
    }
    const inv = invRows?.[0]
    if (!inv) {
      return notFoundError("الدعوة", "Invite not found")
    }
    if (inv.accepted) {
      return badRequestError("تم قبول هذه الدعوة مسبقاً", ["token"])
    }
    if (new Date(inv.expires_at) < new Date()) {
      return badRequestError("انتهت صلاحية الدعوة", ["token"])
    }

    // Try to find or create user
    let userId = ""
    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = listed?.users?.find((u: any) => u?.email?.toLowerCase() === String(inv.email).toLowerCase())
    if (!existing) {
      // مستخدم جديد - إنشاء حساب
      const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({ email: inv.email, password, email_confirm: true })
      if (createErr) {
        return internalError("خطأ في إنشاء المستخدم", createErr.message)
      }
      userId = createdUser.user?.id || ""
    } else {
      // مستخدم موجود - يجب تسجيل الدخول أولاً
      // لا نغير كلمة المرور! نرسل رسالة تطلب تسجيل الدخول
      return apiError(HTTP_STATUS.CONFLICT, "user_exists", "هذا البريد الإلكتروني مسجل مسبقاً. يرجى تسجيل الدخول بحسابك الحالي ثم قبول الدعوة.")
    }
    if (!userId) {
      return internalError("فشل إنشاء المستخدم", "user_create_failed")
    }

    // Insert membership with branch, cost center, and warehouse
    let branchId = inv.branch_id || null
    if (!branchId) {
      const { data: mainBranch } = await admin
        .from('branches')
        .select('id')
        .eq('company_id', inv.company_id)
        .eq('is_main', true)
        .limit(1)
        .single()
      branchId = mainBranch?.id || null
    }
    if (!branchId) {
      return internalError("لا يمكن قبول الدعوة بدون فرع", "missing_branch")
    }

    const memberData: any = {
      company_id: inv.company_id,
      user_id: userId,
      role: inv.role,
      email: inv.email,
      branch_id: branchId,
      cost_center_id: null,
      warehouse_id: null
    }
    const { error: memErr } = await admin
      .from("company_members")
      .insert(memberData)
    if (memErr) {
      return internalError("خطأ في إضافة العضوية", memErr.message)
    }

    // Mark invite accepted
    await admin.from("company_invitations").update({ accepted: true }).eq("id", inv.id)

    // Return company_id so client can set active_company_id
    return apiSuccess({ ok: true, email: inv.email, company_id: inv.company_id })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء قبول الدعوة", e?.message || String(e))
  }
}
