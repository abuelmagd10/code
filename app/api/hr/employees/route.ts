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
    // v3.74.506 — مدير الفرع يرى موظفى فرعه فقط (owner spec)
    const isBranchManager = String(member?.role || '') === 'manager'
    const managerBranchId = isBranchManager ? (member?.branch_id || null) : null
    let q = client.from("employees").select("*").eq("company_id", cid)
    if (isBranchManager) {
      if (!managerBranchId) return apiSuccess([])
      q = q.eq("branch_id", managerBranchId)
    }
    let { data, error: dbError } = await q.order("full_name")
    if (useHr && dbError && ((dbError as any).code === "PGRST205" || String(dbError.message || "").toUpperCase().includes("PGRST205"))) {
      const clientHr = (client as any).schema ? (client as any).schema("hr") : client
      let qHr = clientHr.from("employees").select("*").eq("company_id", cid)
      if (isBranchManager && managerBranchId) qHr = qHr.eq("branch_id", managerBranchId)
      const res = await qHr.order("full_name")
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

    // v3.74.506 — ربط الموظف بالفرع. مدير الفرع يُجبَر على فرعه هو.
    const isBranchManager = String(member?.role || '') === 'manager'
    if (isBranchManager && !member?.branch_id) {
      return apiError(HTTP_STATUS.FORBIDDEN, "مدير الفرع بدون فرع محدد — يرجى مراجعة المسؤول", "Branch manager has no branch assigned")
    }
    const payload: Record<string, any> = {
      company_id: companyId,
      full_name: String(employee.full_name || ''),
      base_salary: Number(employee.base_salary || 0),
      email: employee.email ? String(employee.email) : null,
      phone: employee.phone ? String(employee.phone) : null,
      job_title: employee.job_title ? String(employee.job_title) : null,
      department: employee.department ? String(employee.department) : null,
      joined_date: employee.joined_date ? String(employee.joined_date) : new Date().toISOString().split('T')[0],
      branch_id: isBranchManager ? (member?.branch_id ?? null) : (employee.branch_id ? String(employee.branch_id) : null),
    }
    const client = admin
    const useHr = String(process.env.SUPABASE_USE_HR_SCHEMA || '').toLowerCase() === 'true'
    // ✅ إضافة .select('id') للحصول على ID السجل بعد insert
    let ins = await client.from("employees").insert(payload).select('id')
    if (useHr && ins.error && ((ins.error as any).code === "PGRST205" || String(ins.error.message || "").toUpperCase().includes("PGRST205"))) {
      const clientHr = (client as any).schema ? (client as any).schema("hr") : client
      // ✅ استخدام payload المعقم بدلاً من ...employee غير المعقم
      ins = await clientHr.from("employees").insert(payload).select('id')
    }
    const { error: insertError } = ins
    if (insertError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إضافة الموظف", insertError.message)
    }
    // ✅ الآن ins.data موجود ويمكن الوصول إلى ID
    try { await admin.from('audit_logs').insert({ action: 'INSERT', target_table: 'employees', company_id: companyId, user_id: user.id, record_id: (ins.data as any)?.[0]?.id, reason: 'employee_added', new_data: { full_name: employee.full_name } }) } catch { }
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
    if (typeof update.email !== 'undefined') safeUpdate.email = update.email ? String(update.email) : null
    if (typeof update.phone !== 'undefined') safeUpdate.phone = update.phone ? String(update.phone) : null
    if (typeof update.job_title !== 'undefined') safeUpdate.job_title = update.job_title ? String(update.job_title) : null
    if (typeof update.department !== 'undefined') safeUpdate.department = update.department ? String(update.department) : null
    if (typeof update.joined_date !== 'undefined') safeUpdate.joined_date = update.joined_date ? String(update.joined_date) : null
    // v3.74.506 — الفرع: مدير الفرع لا يستطيع نقل موظف لفرع آخر،
    // وتعديلاته محصورة فى موظفى فرعه فقط.
    const isBranchManagerUpd = String(member?.role || '') === 'manager'
    if (typeof update.branch_id !== 'undefined' && !isBranchManagerUpd) {
      safeUpdate.branch_id = update.branch_id ? String(update.branch_id) : null
    }
    const client = admin
    const useHr = String(process.env.SUPABASE_USE_HR_SCHEMA || '').toLowerCase() === 'true'
    let updQuery = client.from("employees").update(safeUpdate).eq("company_id", companyId).eq("id", id)
    if (isBranchManagerUpd) {
      if (!member?.branch_id) return apiError(HTTP_STATUS.FORBIDDEN, "مدير الفرع بدون فرع محدد", "Branch manager has no branch assigned")
      updQuery = updQuery.eq("branch_id", member.branch_id)
    }
    let upd = await updQuery
    if (useHr && upd.error && ((upd.error as any).code === "PGRST205" || String(upd.error.message || "").toUpperCase().includes("PGRST205"))) {
      const clientHr = (client as any).schema ? (client as any).schema("hr") : client
      // ✅ استخدام safeUpdate المعقم بدلاً من update غير المعقم
      let updHr = clientHr.from("employees").update(safeUpdate).eq("company_id", companyId).eq("id", id)
      if (isBranchManagerUpd && member?.branch_id) updHr = updHr.eq("branch_id", member.branch_id)
      upd = await updHr
    }
    const { error: updateError } = upd
    if (updateError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في تحديث الموظف", updateError.message)
    }
    try { await admin.from('audit_logs').insert({ action: 'UPDATE', target_table: 'employees', company_id: companyId, user_id: user.id, record_id: id, reason: 'employee_updated', new_data: { id } }) } catch { }
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
    // v3.74.506 — مدير الفرع: حذف موظفى فرعه فقط
    const isBranchManagerDel = String(member?.role || '') === 'manager'
    if (isBranchManagerDel && !member?.branch_id) {
      return apiError(HTTP_STATUS.FORBIDDEN, "مدير الفرع بدون فرع محدد", "Branch manager has no branch assigned")
    }
    let delQuery = client.from("employees").delete().eq("company_id", companyId).eq("id", id)
    if (isBranchManagerDel) delQuery = delQuery.eq("branch_id", member?.branch_id as string)
    let del = await delQuery
    if (useHr && del.error && ((del.error as any).code === "PGRST205" || String(del.error.message || "").toUpperCase().includes("PGRST205"))) {
      const clientHr = (client as any).schema ? (client as any).schema("hr") : client
      let delHr = clientHr.from("employees").delete().eq("company_id", companyId).eq("id", id)
      if (isBranchManagerDel) delHr = delHr.eq("branch_id", member?.branch_id as string)
      del = await delHr
    }
    const { error: deleteError } = del
    if (deleteError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في حذف الموظف", deleteError.message)
    }
    try { await admin.from('audit_logs').insert({ action: 'DELETE', target_table: 'employees', company_id: companyId, user_id: user.id, record_id: id, reason: 'employee_deleted', old_data: { id } }) } catch { }
    return apiSuccess({ ok: true })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء حذف الموظف", e?.message)
  }
}