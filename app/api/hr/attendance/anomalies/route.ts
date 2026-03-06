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
        const { user, companyId, error } = await secureApiRequest(req, {
            requireAuth: true,
            requireCompany: true,
            requirePermission: { resource: "attendance", action: "read" }
        })

        if (error) return error
        if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")

        const admin = await getAdmin()
        if (!admin) return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في الخادم", "Server DB error")

        // Fetch anomalies
        const { data, error: dbError } = await admin
            .from('attendance_raw_logs')
            .select('*, employees(full_name), biometric_devices(device_name)')
            .eq('company_id', companyId)
            .eq('anomaly_flag', true)
            .order('log_time', { ascending: false })

        if (dbError) return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في الجلب", dbError.message)

        return apiSuccess(data || [])
    } catch (e: any) {
        return internalError("Error Fetching anomalies", e?.message)
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

        const { log_id, action, resolution_notes } = await req.json()
        if (!log_id || !action) {
            return badRequestError("Missing log_id or action", [])
        }

        // Resolve anomaly: mark it as resolved (unflag) and add audit note
        const { error: updError } = await admin
            .from('attendance_raw_logs')
            .update({
                anomaly_flag: false,
                anomaly_reason: `Resolved via HR Override: ${resolution_notes || action}`
            })
            .eq('id', log_id)
            .eq('company_id', companyId)

        if (updError) return apiError(HTTP_STATUS.INTERNAL_ERROR, "Update failed", updError.message)

        // Audit Log
        try {
            await admin.from('audit_logs').insert({
                action: 'RESOLVE_ANOMALY',
                target_table: 'attendance_raw_logs',
                company_id: companyId,
                user_id: user.id,
                record_id: log_id,
                new_data: { action, resolution_notes }
            })
        } catch { }

        return apiSuccess({ message: 'Anomaly resolved successfully' })
    } catch (e: any) {
        return internalError("Error resolving anomaly", e?.message)
    }
}
