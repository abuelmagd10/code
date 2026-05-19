/**
 * Per-Employee Bonus Configuration API (Phase 4-B)
 *
 * Routes:
 *   GET    /api/employee-bonus-configs           - list all configs for current company
 *   POST   /api/employee-bonus-configs           - upsert config for one user
 *   DELETE /api/employee-bonus-configs?userId=X  - remove config (revert to company default)
 *
 * Authorization: owner / admin only
 */

import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, requireOwnerOrAdmin } from "@/lib/api-security"
import {
  apiError,
  apiSuccess,
  HTTP_STATUS,
  internalError,
  badRequestError,
  validationError,
} from "@/lib/api-error-handler"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey
    ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
    : null
}

const ALLOWED_FIELDS = [
  "bonus_enabled",
  "bonus_type",
  "bonus_percentage",
  "bonus_fixed_amount",
  "bonus_points_per_value",
  "bonus_daily_cap",
  "bonus_monthly_cap",
  "bonus_payout_mode",
  "is_active",
  "notes",
] as const

/**
 * GET — list all per-employee bonus configs for the company,
 * joined with employee info (name, email, job_title) when available.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "bonuses", action: "read" },
    })
    if (error) return error
    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")

    const admin = await getAdmin()
    if (!admin) return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")

    const { data: configs, error: dbErr } = await admin
      .from("employee_bonus_config")
      .select(`
        id,
        user_id,
        employee_id,
        bonus_enabled,
        bonus_type,
        bonus_percentage,
        bonus_fixed_amount,
        bonus_points_per_value,
        bonus_daily_cap,
        bonus_monthly_cap,
        bonus_payout_mode,
        is_active,
        notes,
        created_at,
        updated_at,
        employees:employee_id ( id, full_name, email, job_title, department )
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })

    if (dbErr) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب إعدادات البونص", dbErr.message)
    }

    return apiSuccess({ configs: configs || [] })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء جلب إعدادات البونص للموظفين", e?.message)
  }
}

/**
 * POST — upsert a per-employee bonus config.
 * Body: { user_id, employee_id?, bonus_enabled?, bonus_type?, bonus_percentage?, ... }
 * The (company_id, user_id) pair is the natural key.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user)
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة أو المستخدم", "Company or user not found")

    const admin = await getAdmin()
    if (!admin) return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")

    const body = await req.json()
    const { user_id, employee_id, ...settings } = body || {}

    if (!user_id) {
      return badRequestError("user_id مطلوب", ["user_id"])
    }

    // Build update payload from allowed fields only
    const upsertData: Record<string, any> = {
      company_id: companyId,
      user_id,
      employee_id: employee_id ?? null,
      updated_by_user_id: user.id,
    }
    for (const key of ALLOWED_FIELDS) {
      if (key in settings) {
        upsertData[key] = settings[key]
      }
    }

    // Validate bonus_type
    if (upsertData.bonus_type && !["percentage", "fixed", "points"].includes(upsertData.bonus_type)) {
      return validationError("bonus_type", "نوع البونص غير صحيح. يجب أن يكون: percentage, fixed, أو points")
    }
    // Validate bonus_payout_mode
    if (
      upsertData.bonus_payout_mode &&
      !["immediate", "payroll"].includes(upsertData.bonus_payout_mode)
    ) {
      return validationError("bonus_payout_mode", "وضع الدفع غير صحيح. يجب أن يكون: immediate أو payroll")
    }

    // Check if a config already exists for this user
    const { data: existing } = await admin
      .from("employee_bonus_config")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", user_id)
      .maybeSingle()

    let resultId: string | null = null

    if (existing) {
      // Update existing
      const { data, error: updErr } = await admin
        .from("employee_bonus_config")
        .update(upsertData)
        .eq("id", existing.id)
        .select()
        .single()
      if (updErr)
        return apiError(HTTP_STATUS.INTERNAL_ERROR, "فشل تحديث الإعداد", updErr.message)
      resultId = data?.id
    } else {
      // Insert new
      upsertData.created_by_user_id = user.id
      const { data, error: insErr } = await admin
        .from("employee_bonus_config")
        .insert(upsertData)
        .select()
        .single()
      if (insErr)
        return apiError(HTTP_STATUS.INTERNAL_ERROR, "فشل إنشاء الإعداد", insErr.message)
      resultId = data?.id
    }

    // Audit log (best-effort, schema-aware)
    try {
      await admin.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        action: "SETTINGS",
        target_table: "employee_bonus_config",
        record_id: resultId,
        reason: existing ? "employee_bonus_config_updated" : "employee_bonus_config_created",
        new_data: upsertData,
      })
    } catch {
      /* don't fail the request if audit fails */
    }

    return apiSuccess({ id: resultId, created: !existing })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء حفظ إعداد البونص للموظف", e?.message)
  }
}

/**
 * DELETE — remove a per-employee config (revert to company default).
 * Query param: ?userId=X
 */
export async function DELETE(req: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user)
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة أو المستخدم", "Company or user not found")

    const admin = await getAdmin()
    if (!admin) return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")

    const userId = new URL(req.url).searchParams.get("userId")
    if (!userId) return badRequestError("userId مطلوب", ["userId"])

    // Capture for audit
    const { data: existing } = await admin
      .from("employee_bonus_config")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle()

    if (!existing) {
      return apiSuccess({ ok: true, message: "لا يوجد إعداد للحذف" })
    }

    const { error: delErr } = await admin
      .from("employee_bonus_config")
      .delete()
      .eq("id", existing.id)

    if (delErr) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "فشل حذف الإعداد", delErr.message)
    }

    // Audit log (best-effort)
    try {
      await admin.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        action: "DELETE",
        target_table: "employee_bonus_config",
        record_id: existing.id,
        reason: "employee_bonus_config_removed",
        metadata: { reverted_to: "company_default", target_user_id: userId },
      })
    } catch {}

    return apiSuccess({ ok: true, deletedId: existing.id })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء حذف إعداد البونص للموظف", e?.message)
  }
}
