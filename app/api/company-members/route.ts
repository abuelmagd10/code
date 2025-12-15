import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, notFoundError } from "@/lib/api-error-handler"

export async function GET(req: NextRequest) {
  try {
    // ✅ تحصين موحد: لا نقبل companyId من الـ query، نستخدم النظام فقط
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true
    })

    if (error) return error

    if (!user || !companyId) {
      return internalError("خطأ غير متوقع في هوية المستخدم أو الشركة")
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

    if (!supabaseUrl || !serviceKey) {
      return apiError(
        HTTP_STATUS.INTERNAL_ERROR,
        "خطأ في إعدادات الخادم",
        "Server configuration error"
      )
    }

    const admin = createClient(supabaseUrl, serviceKey, { global: { headers: { apikey: serviceKey } } })

    // التحقق من عضوية المستخدم في نفس الشركة (حماية إضافية مع أن secureApiRequest يتحقق من العضوية بالفعل)
    const { data: membership, error: membershipError } = await admin
      .from("company_members")
      .select("id, role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (membershipError) {
      return internalError("خطأ في جلب عضوية الشركة", { error: membershipError.message })
    }

    if (!membership) {
      return apiError(
        HTTP_STATUS.FORBIDDEN,
        "لست عضواً في هذه الشركة",
        "You are not a member of this company"
      )
    }

    const { data: mems, error: membersError } = await admin
      .from("company_members")
      .select("id, user_id, role, email, created_at")
      .eq("company_id", companyId)

    if (membersError) {
      return apiError(
        HTTP_STATUS.BAD_REQUEST,
        "خطأ في جلب أعضاء الشركة",
        "Failed to fetch company members",
        { error: membersError.message }
      )
    }

    const list = (mems || []) as any[]

    if (!list.length) {
      return notFoundError("أعضاء الشركة", { companyId })
    }

    // جلب ملفات المستخدمين (username, display_name)
    const userIds = list.map((m) => m.user_id)

    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await admin
        .from("user_profiles")
        .select("user_id, username, display_name")
        .in("user_id", userIds)

      if (profilesError) {
        return internalError("خطأ في جلب ملفات المستخدمين", { error: profilesError.message })
      }

      // دمج بيانات الملف مع الأعضاء
      for (const member of list) {
        const profile = (profiles || []).find((p: any) => p.user_id === member.user_id)
        if (profile) {
          member.username = profile.username
          member.display_name = profile.display_name
        }
      }
    }

    const fillIds = list.filter((m) => !m.email).map((m) => m.user_id)

    if (fillIds.length > 0) {
      for (const uid of fillIds) {
        try {
          const { data: userData } = await (admin as any).auth.admin.getUserById(uid)
          const mail = userData?.user?.email || null
          const idx = list.findIndex((x) => x.user_id === uid)
          if (idx >= 0) list[idx].email = mail
        } catch {
          // نتجاهل أخطاء جلب البريد الإضافي، لأنها ليست حرجة
        }
      }
    }

    return apiSuccess({ members: list }, HTTP_STATUS.OK)
  } catch (e: any) {
    return internalError("حدث خطأ داخلي أثناء جلب أعضاء الشركة", {
      error: e?.message || "unknown_error"
    })
  }
}