import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError } from "@/lib/api-error-handler"

async function getAdmin() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

export async function GET(req: NextRequest) {
    try {
        const { companyId, error } = await secureApiRequest(req, {
            requireAuth: true,
            requireCompany: true,
            requirePermission: { resource: "attendance", action: "read" }
        })

        if (error) return error
        if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "Company not found", "")

        const admin = await getAdmin()
        if (!admin) return apiError(HTTP_STATUS.INTERNAL_ERROR, "Server database error", "")

        const { data, error: dbError } = await admin
            .from('attendance_shifts')
            .select('*, branches(name)')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })

        if (dbError) return apiError(HTTP_STATUS.INTERNAL_ERROR, "Fetch error", dbError.message)

        return apiSuccess(data || [])
    } catch (e: any) {
        return internalError("Error Fetching shifts", e?.message)
    }
}

export async function POST(req: NextRequest) {
    try {
        const { user, companyId, error } = await secureApiRequest(req, {
            requireAuth: true,
            requireCompany: true,
            requirePermission: { resource: "attendance", action: "write" }
        })

        if (error) return error
        if (!companyId || !user) return apiError(HTTP_STATUS.NOT_FOUND, "Company/User not found", "")

        const admin = await getAdmin()
        if (!admin) return apiError(HTTP_STATUS.INTERNAL_ERROR, "Server DB error", "")

        const body = await req.json()
        const { shift_name, branch_id, start_time, end_time, is_cross_day, grace_period_minutes, late_threshold_minutes, early_leave_threshold_minutes, start_checkin_window_minutes } = body

        if (!shift_name || !start_time || !end_time) {
            return badRequestError("Missing required fields (name, start, end)", [])
        }

        const newShift = {
            company_id: companyId,
            branch_id: branch_id || null, // null if applied to all branches (though schema requires branch_id? Let's check: actually company_id, branch_id typically)
            shift_name,
            start_time,
            end_time,
            is_cross_day: !!is_cross_day,
            grace_period_minutes: grace_period_minutes || 0,
            late_threshold_minutes: late_threshold_minutes || 0,
            early_leave_threshold_minutes: early_leave_threshold_minutes || 0,
            start_checkin_window_minutes: start_checkin_window_minutes || 60,
        }

        const { data, error: insertError } = await admin
            .from('attendance_shifts')
            .insert(newShift)
            .select()
            .single()

        if (insertError) return apiError(HTTP_STATUS.INTERNAL_ERROR, "Insert failed", insertError.message)

        // Audit Log
        try {
            await admin.from('audit_logs').insert({
                action: 'CREATE_SHIFT',
                target_table: 'attendance_shifts',
                company_id: companyId,
                user_id: user.id,
                record_id: data.id,
                new_data: newShift
            })
        } catch { }

        return apiSuccess(data)
    } catch (e: any) {
        return internalError("Error creating shift", e?.message)
    }
}
