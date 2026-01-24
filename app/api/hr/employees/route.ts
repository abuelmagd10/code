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
      requirePermission: { resource: "employees", action: "read" }
    })

    if (error) return error
    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    // === نهاية التحصين الأمني ===

    const admin = await getAdmin()
    if (!admin) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const cid = companyId
    const client = admin
    const useHr = String(process.env.SUPABASE_USE_HR_SCHEMA || '').toLowerCase() === 'true'
    let { data, error: dbError } = await client.from("employees").select("*").eq("company_id", cid).order("full_name")
    if (useHr && dbError && ((dbError as any).code === "PGRST205" || String(dbError.message || "").toUpperCase().includes("PGRST205"))) {
      const clientHr = (client as any).schema ? (client as any).schema("hr") : client
      const res = await clientHr.from("employees").select("*").eq("company_id", cid).order("full_name")
      data = res.data as any
      dbError = res.error as any
    }
    if (dbError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب الموظفين", dbError.message)
    }
    return apiSuccess(data || [])
  } catch (e: any) {
    return internalError("حدث خطأ أثناء جلب الموظفين", e?.message)
  }
}

export async function POST(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "employees", action: "write" },
      allowRoles: ['owner', 'admin', 'manager']
    })

    if (error) return error
    if (!companyId || !user) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة أو المستخدم", "Company or user not found")
    // === نهاية التحصين الأمني ===

    const admin = await getAdmin()
    if (!admin) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const body = await req.json()
    const { employee } = body || {}
    if (!employee?.full_name) {
      return badRequestError("اسم الموظف مطلوب", ["employee.full_name"])
    }

    const payload: Record<string, any> = {
      company_id: companyId,
      full_name: String(employee.full_name || ''),
      base_salary: Number(employee.base_salary || 0),
    }
    const client = admin
    const useHr = String(process.env.SUPABASE_USE_HR_SCHEMA || '').toLowerCase() === 'true'
    let ins = await client.from("employees").insert(payload).select('id').single()
    if (useHr && ins.error && ((ins.error as any).code === "PGRST205" || String(ins.error.message || "").toUpperCase().includes("PGRST205"))) {
      const clientHr = (client as any).schema ? (client as any).schema("hr") : client
      ins = await clientHr.from("employees").insert({ company_id: companyId, ...employee }).select('id').single()
    }
    const { error: insertError } = ins
    if (insertError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إضافة الموظف", insertError.message)
    }
    try { await admin.from('audit_logs').insert({ action: 'INSERT', target_table: 'employees', company_id: companyId, user_id: user.id, record_id: ins.data?.id, new_data: { full_name: employee.full_name } }) } catch {}
    return apiSuccess({ ok: true }, HTTP_STATUS.CREATED)
  } catch (e: any) {
    return internalError("حدث خطأ أثناء إضافة الموظف", e?.message)
  }
}

export async function PUT(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "employees", action: "update" },
      allowRoles: ['owner', 'admin', 'manager']
    })

    if (error) return error
    if (!companyId || !user) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة أو المستخدم", "Company or user not found")
    // === نهاية التحصين الأمني ===

    const admin = await getAdmin()
    if (!admin) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const body = await req.json()
    const { id, update } = body || {}
    if (!id || !update) {
      return badRequestError("معرف الموظف وبيانات التحديث مطلوبة", ["id", "update"])
    }

    const safeUpdate: Record<string, any> = {}
    if (typeof update.full_name !== 'undefined') safeUpdate.full_name = String(update.full_name || '')
    if (typeof update.base_salary !== 'undefined') safeUpdate.base_salary = Number(update.base_salary || 0)
    const client = admin
    const useHr = String(process.env.SUPABASE_USE_HR_SCHEMA || '').toLowerCase() === 'true'
    let upd = await client.from("employees").update(safeUpdate).eq("company_id", companyId).eq("id", id)
    if (useHr && upd.error && ((upd.error as any).code === "PGRST205" || String(upd.error.message || "").toUpperCase().includes("PGRST205"))) {
      const clientHr = (client as any).schema ? (client as any).schema("hr") : client
      upd = await clientHr.from("employees").update(update).eq("company_id", companyId).eq("id", id)
    }
    const { error: updateError } = upd
    if (updateError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في تحديث الموظف", updateError.message)
    }
    try { await admin.from('audit_logs').insert({ action: 'UPDATE', target_table: 'employees', company_id: companyId, user_id: user.id, record_id: id, new_data: safeUpdate }) } catch {}
    return apiSuccess({ ok: true })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء تحديث الموظف", e?.message)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "employees", action: "delete" },
      allowRoles: ['owner', 'admin', 'manager']
    })

    if (error) return error
    if (!companyId || !user) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة أو المستخدم", "Company or user not found")
    // === نهاية التحصين الأمني ===

    const admin = await getAdmin()
    if (!admin) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const body = await req.json()
    const { id } = body || {}
    if (!id) {
      return badRequestError("معرف الموظف مطلوب", ["id"])
    }
    const client = admin
    const useHr = String(process.env.SUPABASE_USE_HR_SCHEMA || '').toLowerCase() === 'true'
    let del = await client.from("employees").delete().eq("company_id", companyId).eq("id", id)
    if (useHr && del.error && ((del.error as any).code === "PGRST205" || String(del.error.message || "").toUpperCase().includes("PGRST205"))) {
      const clientHr = (client as any).schema ? (client as any).schema("hr") : client
      del = await clientHr.from("employees").delete().eq("company_id", companyId).eq("id", id)
    }
    const { error: deleteError } = del
    if (deleteError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في حذف الموظف", deleteError.message)
    }
    try { await admin.from('audit_logs').insert({ action: 'DELETE', target_table: 'employees', company_id: companyId, user_id: user.id, record_id: id }) } catch {}
    return apiSuccess({ ok: true })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء حذف الموظف", e?.message)
  }
}