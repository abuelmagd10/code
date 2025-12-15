import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { secureApiRequest, requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError, forbiddenError } from "@/lib/api-error-handler"
import { getActiveCompanyId } from "@/lib/company"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const userId: string = body?.userId
    const password: string = body?.password

    if (!userId || !password) {
      return badRequestError("معرف المستخدم وكلمة المرور مطلوبان", ["userId", "password"])
    }

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return internalError("خطأ في إعدادات الخادم", "Server configuration error")
    }
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    // === تحصين أمني: التحقق من صلاحية المستخدم ===
    const ssr = await createSSR()
    const { data: { user: requester } } = await ssr.auth.getUser()

    if (!requester) {
      return apiError(HTTP_STATUS.UNAUTHORIZED, "غير مصرح - يرجى تسجيل الدخول", "Unauthorized")
    }

    // السماح للمستخدم بتغيير كلمة مروره فقط، أو للمدير/المالك بتغيير كلمات مرور الآخرين
    if (requester.id !== userId) {
      // التحقق من أن الطالب owner أو admin في نفس الشركة
      const companyId = await getActiveCompanyId(ssr)
      if (!companyId) {
        return badRequestError("companyId مطلوب لتغيير كلمة مرور مستخدم آخر", ["companyId"])
      }

      const { data: requesterMember } = await admin
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", requester.id)
        .maybeSingle()

      const { data: targetMember } = await admin
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle()

      if (!requesterMember || !["owner", "admin"].includes(requesterMember.role)) {
        return forbiddenError("ليست لديك صلاحية لتغيير كلمة مرور هذا المستخدم")
      }

      if (!targetMember) {
        return forbiddenError("المستخدم المستهدف ليس عضواً في الشركة")
      }
    }
    // === نهاية التحصين الأمني ===

    const { error } = await (admin as any).auth.admin.updateUserById(userId, { password })
    if (error) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "خطأ في تحديث كلمة المرور", error.message)
    }

    return apiSuccess({ ok: true })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء تحديث كلمة المرور", e?.message || "unknown_error")
  }
}