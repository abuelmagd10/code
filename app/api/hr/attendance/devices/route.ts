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

export async function POST(req: NextRequest) {
    try {
        const { companyId, error } = await secureApiRequest(req, {
            requireAuth: true,
            requireCompany: true,
            requirePermission: { resource: "attendance", action: "write" } // Using write to cover create/update
        })

        if (error) return error
        if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "Company not found", "")

        const body = await req.json()
        const { device_name, device_ip, branch_id, status, device_type, api_token, employee_mappings } = body

        if (!device_name || !branch_id) {
            return apiError(HTTP_STATUS.BAD_REQUEST, "Missing required fields", "Device Name and Branch are required.")
        }

        const admin = await getAdmin()
        if (!admin) return apiError(HTTP_STATUS.INTERNAL_ERROR, "Server config error", "")

        // Check if IP already exists for this company
        if (device_ip) {
            const { data: existingIp } = await admin
                .from('biometric_devices')
                .select('id')
                .eq('company_id', companyId)
                .eq('device_ip', device_ip)
                .single()
            if (existingIp) {
                return apiError(HTTP_STATUS.BAD_REQUEST, "Device IP already exists", "A device with this IP is already registered.")
            }
        }

        const finalToken = api_token || crypto.randomUUID()

        const { data: newDevice, error: insertError } = await admin
            .from('biometric_devices')
            .insert({
                company_id: companyId,
                branch_id,
                device_name,
                device_ip,
                device_type,
                api_token: finalToken,
                status: status || 'online',
                sync_mode: 'push'
            })
            .select()
            .single()

        if (insertError) {
            console.error("Device Insert Error:", insertError)
            return apiError(HTTP_STATUS.INTERNAL_ERROR, "Failed to create device", insertError.message)
        }

        // Update employee mappings if any
        if (employee_mappings && Array.isArray(employee_mappings)) {
            for (const map of employee_mappings) {
                if (map.employee_id && map.biometric_id) {
                    await admin
                        .from('employees')
                        .update({ biometric_id: map.biometric_id })
                        .eq('company_id', companyId)
                        .eq('id', map.employee_id)
                }
            }
        }

        return apiSuccess({ device: newDevice, message: "Device created successfully" })

    } catch (e: any) {
        console.error("Error creating device:", e)
        return internalError("Error creating device", e?.message)
    }
}
