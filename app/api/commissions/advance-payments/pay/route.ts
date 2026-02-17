import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, badRequestError, internalError } from "@/lib/api-error-handler"

async function getAdmin() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

export async function POST(req: NextRequest) {
    try {
        // ✅ تحصين موحد: صرف سلفة عمولات
        const { user, companyId, error } = await secureApiRequest(req, {
            requireAuth: true,
            requireCompany: true,
            requirePermission: { resource: "commissions", action: "write" },
            allowRoles: ["owner", "admin", "finance", "accountant"]
        })

        if (error) return error
        if (!companyId) {
            return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
        }

        const body = await req.json()
        const { employeeId, amount, paymentAccountId, paymentDate, periodStart, periodEnd, notes } = body

        // ✅ Server-side Validation
        if (!employeeId || !amount || !paymentAccountId || !periodStart || !periodEnd) {
            return badRequestError("البيانات المطلوبة غير مكتملة", ["employeeId", "amount", "paymentAccountId", "periodStart", "periodEnd"])
        }

        if (typeof amount !== 'number' || amount <= 0) {
            return badRequestError("المبلغ يجب أن يكون رقم موجب", ["amount"])
        }

        // ✅ التحقق من أن الموظف ينتمي لنفس الشركة (منع الوصول لموظفين شركات أخرى)
        const admin = await getAdmin()
        const ssr = await createSSR()
        const client = admin || ssr

        const { data: employee, error: empError } = await client
            .from('employees')
            .select('id, company_id, full_name')
            .eq('id', employeeId)
            .eq('company_id', companyId)
            .single()

        if (empError || !employee) {
            return apiError(HTTP_STATUS.NOT_FOUND, "الموظف غير موجود أو لا ينتمي لهذه الشركة", "Employee not found")
        }

        // ✅ التحقق من حساب الدفع
        const { data: paymentAccount, error: accError } = await client
            .from('chart_of_accounts')
            .select('id')
            .eq('id', paymentAccountId)
            .eq('company_id', companyId)
            .single()

        if (accError || !paymentAccount) {
            return apiError(HTTP_STATUS.BAD_REQUEST, "حساب الدفع غير صالح", "Invalid payment account")
        }

        // Call the RPC function to pay advance
        const { data, error: rpcError } = await client.rpc('pay_commission_advance', {
            p_company_id: companyId,
            p_employee_id: employeeId,
            p_amount: amount,
            p_payment_account_id: paymentAccountId,
            p_payment_date: paymentDate || new Date().toISOString().slice(0, 10),
            p_period_start: periodStart,
            p_period_end: periodEnd,
            p_user_id: user!.id,
            p_notes: notes || null
        })

        if (rpcError) {
            console.error('RPC error:', rpcError)
            // استخراج رسالة الخطأ من PostgreSQL
            const errorMessage = rpcError.message || 'فشل صرف السلفة'
            return apiError(HTTP_STATUS.BAD_REQUEST, errorMessage, errorMessage)
        }

        // ✅ تسجيل في Audit Log
        try {
            await client.from('audit_logs').insert({
                action: 'INSERT',
                target_table: 'commission_advance_payments',
                company_id: companyId,
                user_id: user!.id,
                record_id: data?.advance_id,
                new_data: { employee_id: employeeId, amount, reference: data?.reference_number }
            })
        } catch (auditErr) {
            console.log('Audit log error:', auditErr)
        }

        return apiSuccess({
            success: true,
            advance_id: data?.advance_id,
            reference_number: data?.reference_number,
            amount: amount,
            remaining_available: data?.remaining_available
        })
    } catch (e: any) {
        console.error('Error paying advance:', e)
        return internalError("حدث خطأ أثناء صرف السلفة", e?.message)
    }
}

