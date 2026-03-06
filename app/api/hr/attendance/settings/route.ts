import { NextRequest, NextResponse } from "next/server"
import { secureApiRequest, serverError } from "@/lib/api-security-enhanced"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
    const { companyId, error: authError } = await secureApiRequest(request, {
        requireAuth: true,
        requireCompany: true
    })

    if (authError) return authError
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('attendance_payroll_settings')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle()

    if (error) {
        console.error("fetch attendance_payroll_settings error:", error)
        return serverError(error.message)
    }

    return NextResponse.json(data || {})
}

export async function POST(request: NextRequest) {
    const { companyId, error: authError } = await secureApiRequest(request, {
        requireAuth: true,
        requireCompany: true
    })

    if (authError) return authError
    const supabase = await createClient()
    const body = await request.json()

    // Upsert settings
    const { error } = await supabase
        .from('attendance_payroll_settings')
        .upsert({
            company_id: companyId,
            deduct_late: body.deduct_late ?? true,
            late_deduction_type: body.late_deduction_type || 'exact_minutes',
            late_multiplier: body.late_multiplier ?? 1.0,
            deduct_early_leave: body.deduct_early_leave ?? true,
            early_leave_multiplier: body.early_leave_multiplier ?? 1.0,
            pay_overtime: body.pay_overtime ?? true,
            overtime_multiplier: body.overtime_multiplier ?? 1.5,
            deduct_absence: body.deduct_absence ?? true,
            absence_day_deduction: body.absence_day_deduction ?? 1.0,
            updated_at: new Date().toISOString()
        }, { onConflict: 'company_id' })

    if (error) {
        console.error("upsert attendance_payroll_settings error:", error)
        return serverError(error.message)
    }

    return NextResponse.json({ success: true })
}
