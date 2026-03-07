import { NextRequest } from "next/server"
import { createClient as createSSR } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

export async function GET(req: NextRequest) {
    try {
        const { user, companyId, error } = await secureApiRequest(req, {
            requireAuth: true,
            requireCompany: true,
        })

        if (error) return error
        if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "الشركة غير موجودة", "Company not found")

        const supabase = await createSSR()
        const { data, error: fetchErr } = await supabase
            .from('attendance_payroll_settings')
            .select('*')
            .eq('company_id', companyId)
            .maybeSingle()

        if (fetchErr) return internalError("خطأ في جلب الإعدادات", fetchErr.message)

        return apiSuccess(data || {
            deduct_late: true,
            late_deduction_type: 'exact_minutes',
            late_multiplier: 1.0,
            deduct_early_leave: true,
            early_leave_multiplier: 1.0,
            pay_overtime: true,
            overtime_multiplier: 1.5,
            deduct_absence: true,
            absence_day_deduction: 1.0
        })
    } catch (e: any) {
        return internalError("حدث خطأ", e?.message)
    }
}

export async function PUT(req: NextRequest) {
    try {
        const { user, companyId, error } = await secureApiRequest(req, {
            requireAuth: true,
            requireCompany: true,
            requirePermission: { resource: "hr", action: "write" },
            allowRoles: ["owner", "admin", "manager"]
        })

        if (error) return error
        if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "الشركة غير موجودة", "Company not found")

        const body = await req.json()
        const supabase = await createSSR()

        const updateData = {
            company_id: companyId,
            deduct_late: body.deduct_late ?? true,
            late_deduction_type: body.late_deduction_type ?? 'exact_minutes',
            late_multiplier: Number(body.late_multiplier ?? 1.0),
            deduct_early_leave: body.deduct_early_leave ?? true,
            early_leave_multiplier: Number(body.early_leave_multiplier ?? 1.0),
            pay_overtime: body.pay_overtime ?? true,
            overtime_multiplier: Number(body.overtime_multiplier ?? 1.5),
            deduct_absence: body.deduct_absence ?? true,
            absence_day_deduction: Number(body.absence_day_deduction ?? 1.0),
            updated_at: new Date().toISOString()
        }

        const { error: upsertErr } = await supabase
            .from('attendance_payroll_settings')
            .upsert(updateData, { onConflict: 'company_id' })

        if (upsertErr) return internalError("خطأ في حفظ الإعدادات", upsertErr.message)

        return apiSuccess({ ok: true })
    } catch (e: any) {
        return internalError("حدث خطأ", e?.message)
    }
}
