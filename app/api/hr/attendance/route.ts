import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError } from "@/lib/api-error-handler"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

export async function GET(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "attendance", action: "read" }
    })

    if (error) return error
    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    // === نهاية التحصين الأمني ===

    const admin = await getAdmin()
    if (!admin) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const { searchParams } = new URL(req.url)
    const employeeId = String(searchParams.get("employeeId") || "")
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")
    const cid = companyId
    const client = admin
    let q = client.from("attendance_records").select("*").eq("company_id", cid).gte("day_date", from).lte("day_date", to)
    if (employeeId) q = q.eq("employee_id", employeeId)
    const useHr = String(process.env.SUPABASE_USE_HR_SCHEMA || '').toLowerCase() === 'true'
    let { data, error: dbError } = await q.order("day_date")
    if (useHr && dbError && ((dbError as any).code === "PGRST205" || String(dbError.message || "").toUpperCase().includes("PGRST205"))) {
      const clientHr = (client as any).schema ? (client as any).schema("hr") : client
      let q2 = clientHr.from("attendance_records").select("*").eq("company_id", cid).gte("day_date", from).lte("day_date", to)
      if (employeeId) q2 = q2.eq("employee_id", employeeId)
      const res = await q2.order("day_date")
      data = res.data as any
      dbError = res.error as any
    }
    if (dbError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب سجلات الحضور", dbError.message)
    }
    return apiSuccess(data || [])
  } catch (e: any) {
    return internalError("حدث خطأ أثناء جلب سجلات الحضور", e?.message)
  }
}

export async function POST(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "attendance", action: "write" },
      allowRoles: ['owner', 'admin', 'manager', 'accountant']
    })

    if (error) return error
    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    // === نهاية التحصين الأمني ===

    const admin = await getAdmin()
    if (!admin) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const body = await req.json()
    const { employeeId, dayDate, status } = body || {}
    if (!employeeId || !dayDate || !status) {
      return badRequestError("بيانات ناقصة: employeeId, dayDate, status مطلوبة", ["employeeId", "dayDate", "status"])
    }
    const client = admin
    const useHr = String(process.env.SUPABASE_USE_HR_SCHEMA || '').toLowerCase() === 'true'
    let up = await client.from("attendance_records").upsert({ company_id: companyId, employee_id: employeeId, day_date: dayDate, status }, { onConflict: "company_id,employee_id,day_date" })
    if (useHr && up.error && ((up.error as any).code === "PGRST205" || String(up.error.message || "").toUpperCase().includes("PGRST205"))) {
      const clientHr = (client as any).schema ? (client as any).schema("hr") : client
      up = await clientHr.from("attendance_records").upsert({ company_id: companyId, employee_id: employeeId, day_date: dayDate, status }, { onConflict: "company_id,employee_id,day_date" })
    }
    const { error: upsertError } = up
    if (upsertError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في تسجيل الحضور", upsertError.message)
    }
    try { await admin.from('audit_logs').insert({ action: 'attendance_recorded', company_id: companyId, user_id: user.id, details: { employeeId, dayDate, status } }) } catch {}
    return apiSuccess({ ok: true })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء تسجيل الحضور", e?.message)
  }
}