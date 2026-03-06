import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

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
        if (!admin) return apiError(HTTP_STATUS.INTERNAL_ERROR, "Server config error", "")

        const { data, error: dbError } = await admin
            .from('biometric_devices')
            .select('*, branches(name)')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })

        if (dbError) return apiError(HTTP_STATUS.INTERNAL_ERROR, "DB Error fetch", dbError.message)

        return apiSuccess(data || [])
    } catch (e: any) {
        return internalError("Error Fetching devices", e?.message)
    }
}
