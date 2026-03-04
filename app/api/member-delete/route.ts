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
    const targetUserId: string = body?.targetUserId
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

    // 1. Check user data dependencies
    const { data: depsData, error: depsError } = await admin.rpc('get_user_dependencies', {
      p_company_id: companyId,
      p_user_id: userId,
    })

    if (depsError) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "خطأ في فحص الارتباطات", depsError.message)
    }

    const totalDeps = depsData?.total || 0

    // 2. If dependencies exist
    if (totalDeps > 0) {
      if (!targetUserId) {
        // User hasn't selected a replacement -> return 409 to show modal
        return NextResponse.json(
          {
            error: "يوجد بيانات تخص هذا المستخدم",
            reason: "HAS_DEPENDENCIES",
            dependencies: depsData,
          },
          { status: 409 }
        )
      }

      // Perform atomic reassignment & removal
      const { error: reassignError } = await admin.rpc('reassign_user_data_and_remove', {
        p_company_id: companyId,
        p_old_user_id: userId,
        p_new_user_id: targetUserId,
      })

      if (reassignError) {
        return apiError(HTTP_STATUS.BAD_REQUEST, "خطأ في نقل البيانات وحذف العضو", reassignError.message)
      }
    } else {
      // 3. No dependencies -> Safe to just delete from company_members natively
      const { error: delMemErr } = await admin
        .from("company_members")
        .delete()
        .eq("company_id", companyId)
        .eq("user_id", userId)

      if (delMemErr) {
        return apiError(HTTP_STATUS.BAD_REQUEST, "خطأ في حذف العضوية", delMemErr.message)
      }
    }

    if (fullDelete) {
      const { error: delUserErr } = await (admin as any).auth.admin.deleteUser(userId)
      if (delUserErr) {
        // تحذير فقط - العضوية تم حذفها بنجاح، لكن حذف المستخدم من Auth فشل
        // (قد يكون بسبب بيانات مرتبطة في جداول أخرى)
        console.warn("⚠️ [member-delete] Auth user deletion failed (non-fatal):", delUserErr.message)
        return apiSuccess({ ok: true, warning: "تم حذف العضوية/البيانات، لكن تعذر الحذف الشامل للحساب: " + delUserErr.message })
      }
    }

    return apiSuccess({ ok: true })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء حذف العضو", e?.message || "unknown_error")
  }
}