import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { secureApiRequest, requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError, validationError } from "@/lib/api-error-handler"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

// GET: جلب إعدادات البونص للشركة
export async function GET(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "bonuses", action: "read" }
    })

    if (error) return error
    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    // === نهاية التحصين الأمني ===

    const admin = await getAdmin()
    if (!admin) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const client = admin
    const { data: company, error: dbError } = await client
      .from("companies")
      .select("bonus_enabled, bonus_type, bonus_percentage, bonus_fixed_amount, bonus_points_per_value, bonus_daily_cap, bonus_monthly_cap, bonus_payout_mode")
      .eq("id", companyId)
      .single()

    if (dbError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب إعدادات البونص", dbError.message)
    }

    return apiSuccess(company || {})
  } catch (e: any) {
    return internalError("حدث خطأ أثناء جلب إعدادات البونص", e?.message)
  }
}

// PATCH: تحديث إعدادات البونص للشركة
export async function PATCH(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام requireOwnerOrAdmin ===
    const { user, companyId, member, error } = await requireOwnerOrAdmin(req)

    if (error) return error
    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    // === نهاية التحصين الأمني ===

    const admin = await getAdmin()
    if (!admin) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const body = await req.json()
    const { ...settings } = body || {}

    const client = admin

    // Validate settings
    const allowedFields = [
      "bonus_enabled", "bonus_type", "bonus_percentage", 
      "bonus_fixed_amount", "bonus_points_per_value", 
      "bonus_daily_cap", "bonus_monthly_cap", "bonus_payout_mode"
    ]
    const updateData: Record<string, any> = {}
    for (const key of allowedFields) {
      if (key in settings) {
        updateData[key] = settings[key]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return badRequestError("لا توجد حقول صحيحة للتحديث", ["settings"])
    }

    // Validate bonus_type
    if (updateData.bonus_type && !['percentage', 'fixed', 'points'].includes(updateData.bonus_type)) {
      return validationError("bonus_type", "نوع البونص غير صحيح. يجب أن يكون: percentage, fixed, أو points")
    }

    // Validate bonus_payout_mode
    if (updateData.bonus_payout_mode && !['immediate', 'payroll'].includes(updateData.bonus_payout_mode)) {
      return validationError("bonus_payout_mode", "وضع الدفع غير صحيح. يجب أن يكون: immediate أو payroll")
    }

    const { data, error: dbError } = await client
      .from("companies")
      .update(updateData)
      .eq("id", companyId)
      .select("bonus_enabled, bonus_type, bonus_percentage, bonus_fixed_amount, bonus_points_per_value, bonus_daily_cap, bonus_monthly_cap, bonus_payout_mode")
      .single()

    if (dbError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في تحديث إعدادات البونص", dbError.message)
    }

    // Log to audit
    try {
      await client.from("audit_logs").insert({
        action: "bonus_settings_updated",
        company_id: companyId,
        user_id: user.id,
        details: updateData
      })
    } catch {}

    return apiSuccess({ ok: true, settings: data })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء تحديث إعدادات البونص", e?.message)
  }
}

