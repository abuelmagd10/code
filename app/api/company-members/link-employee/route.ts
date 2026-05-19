import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError } from "@/lib/api-error-handler"

export async function POST(req: NextRequest) {
  try {
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      allowRoles: ["owner", "admin", "general_manager"],
    })

    if (error) return error
    if (!user || !companyId) return internalError("خطأ في هوية المستخدم أو الشركة")

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!supabaseUrl || !serviceKey) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const admin = createClient(supabaseUrl, serviceKey, { global: { headers: { apikey: serviceKey } } })

    const body = await req.json()
    const { memberUserId, employeeId } = body || {}

    if (!memberUserId) {
      return badRequestError("معرف العضو مطلوب", ["memberUserId"])
    }

    // Normalize: treat "__none__" or empty string as null (unlink)
    const normalizedEmployeeId = employeeId && employeeId !== "__none__" ? employeeId : null

    // Verify member belongs to this company
    const { data: member, error: memberErr } = await admin
      .from("company_members")
      .select("id, user_id, employee_id")
      .eq("company_id", companyId)
      .eq("user_id", memberUserId)
      .maybeSingle()

    if (memberErr || !member) {
      return apiError(HTTP_STATUS.NOT_FOUND, "العضو غير موجود", "Member not found")
    }

    // If unlinking (employeeId is null)
    if (!normalizedEmployeeId) {
      await admin
        .from("company_members")
        .update({ employee_id: null })
        .eq("id", member.id)

      return apiSuccess({ ok: true, unlinked: true })
    }

    // Verify employee belongs to this company
    const { data: employee, error: empErr } = await admin
      .from("employees")
      .select("id, full_name, job_title")
      .eq("company_id", companyId)
      .eq("id", normalizedEmployeeId)
      .maybeSingle()

    if (empErr || !employee) {
      return apiError(HTTP_STATUS.NOT_FOUND, "الموظف غير موجود", "Employee not found")
    }

    // Link member to employee
    const { error: updateErr } = await admin
      .from("company_members")
      .update({ employee_id: normalizedEmployeeId })
      .eq("id", member.id)

    if (updateErr) {
      return internalError("خطأ في ربط العضو بالموظف", { error: updateErr.message })
    }

    // Sync display_name in user_profiles to employee name
    // This propagates the name change to sidebar, audit, and everywhere
    const { error: profileErr } = await admin
      .from("user_profiles")
      .update({
        display_name: employee.full_name,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", memberUserId)

    if (profileErr) {
      console.warn("Warning: failed to sync display_name:", profileErr.message)
    }

    return apiSuccess({
      ok: true,
      linked: true,
      employeeName: employee.full_name,
    })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء ربط العضو بالموظف", { error: e?.message })
  }
}
