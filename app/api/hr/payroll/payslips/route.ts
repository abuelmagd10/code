import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError } from "@/lib/api-error-handler"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

export async function PUT(req: NextRequest) {
  try {
    // ✅ تحصين موحد: تعديل payslip واحد
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "payroll", action: "update" },
      allowRoles: ["owner", "admin", "manager", "accountant"]
    })

    if (error) return error
    if (!companyId) {
      return apiError(
        HTTP_STATUS.NOT_FOUND,
        "لم يتم العثور على الشركة",
        "Company not found"
      )
    }

    const admin = await getAdmin()
    const ssr = await createSSR()
    const body = await req.json()
    const { runId, employeeId, update } = body || {}
    if (!runId || !employeeId || !update) {
      return badRequestError("بيانات ناقصة: runId و employeeId و update مطلوبة", ["runId", "employeeId", "update"])
    }
    const client = admin || ssr

    const { data: pays } = await client
      .from('journal_entries')
      .select('id')
      .eq('company_id', companyId)
      .eq('reference_type', 'payroll_payment')
      .eq('reference_id', runId)
    if (Array.isArray(pays) && pays.length > 0) {
      return apiError(
        HTTP_STATUS.CONFLICT,
        "تم صرف دفعة مرتب لهذه الفترة بالفعل",
        "Payroll payment already exists for this run"
      )
    }

    const safe: Record<string, any> = {}
    if (typeof update.base_salary !== 'undefined') safe.base_salary = Number(update.base_salary || 0)
    if (typeof update.allowances !== 'undefined') safe.allowances = Number(update.allowances || 0)
    if (typeof update.deductions !== 'undefined') safe.deductions = Number(update.deductions || 0)
    if (typeof update.bonuses !== 'undefined') safe.bonuses = Number(update.bonuses || 0)
    if (typeof update.advances !== 'undefined') safe.advances = Number(update.advances || 0)
    if (typeof update.insurance !== 'undefined') safe.insurance = Number(update.insurance || 0)
    const net = Number(safe.base_salary ?? 0) + Number(safe.allowances ?? 0) + Number(safe.bonuses ?? 0) - (Number(safe.deductions ?? 0) + Number(safe.advances ?? 0) + Number(safe.insurance ?? 0))
    safe.net_salary = net

    const upd = await client
      .from('payslips')
      .update(safe)
      .eq('company_id', companyId)
      .eq('payroll_run_id', runId)
      .eq('employee_id', employeeId)
      .select('id')
      .single()
    if (upd.error) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في تحديث كشف المرتب", upd.error.message)
    }
    try {
      await (admin || ssr).from('audit_logs').insert({
        action: 'UPDATE',
        target_table: 'payslips',
        company_id: companyId,
        user_id: user!.id,
        record_id: upd.data?.id,
        new_data: { runId, employeeId }
      })
    } catch {}
    return apiSuccess({ ok: true })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء تحديث كشف المرتب", e?.message || 'unknown_error')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // ✅ تحصين موحد: حذف payslip واحد
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "payroll", action: "delete" },
      allowRoles: ["owner", "admin", "manager", "accountant"]
    })

    if (error) return error
    if (!companyId) {
      return apiError(
        HTTP_STATUS.NOT_FOUND,
        "لم يتم العثور على الشركة",
        "Company not found"
      )
    }

    const admin = await getAdmin()
    const ssr = await createSSR()
    const body = await req.json()
    const { runId, employeeId } = body || {}
    if (!runId || !employeeId) {
      return badRequestError("بيانات ناقصة: runId و employeeId مطلوبة", ["runId", "employeeId"])
    }
    const client = admin || ssr

    const { data: pays } = await client
      .from('journal_entries')
      .select('id')
      .eq('company_id', companyId)
      .eq('reference_type', 'payroll_payment')
      .eq('reference_id', runId)
    if (Array.isArray(pays) && pays.length > 0) {
      return apiError(
        HTTP_STATUS.CONFLICT,
        "تم صرف دفعة مرتب لهذه الفترة بالفعل",
        "Payroll payment already exists for this run"
      )
    }

    // الحصول على معرف السجل قبل الحذف
    const { data: payslipToDelete } = await client
      .from('payslips')
      .select('id')
      .eq('company_id', companyId)
      .eq('payroll_run_id', runId)
      .eq('employee_id', employeeId)
      .single()

    const payslipId = payslipToDelete?.id as string | undefined

    const del = await client
      .from('payslips')
      .delete()
      .eq('company_id', companyId)
      .eq('payroll_run_id', runId)
      .eq('employee_id', employeeId)
    if (del.error) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في حذف كشف المرتب", del.error.message)
    }
    try {
      await (admin || ssr).from('audit_logs').insert({
        action: 'DELETE',
        target_table: 'payslips',
        company_id: companyId,
        user_id: user!.id,
        record_id: payslipId,
        old_data: { runId, employeeId }
      })
    } catch {}
    return apiSuccess({ ok: true })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء حذف كشف المرتب", e?.message || 'unknown_error')
  }
}