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

export async function GET(req: NextRequest) {
    try {
        // ✅ تحصين موحد: عرض أرصدة العمولات المتاحة
        const { user, companyId, error } = await secureApiRequest(req, {
            requireAuth: true,
            requireCompany: true,
            requirePermission: { resource: "commissions", action: "read" },
            allowRoles: ["owner", "admin", "finance", "accountant", "manager"]
        })

        if (error) return error
        if (!companyId) {
            return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
        }

        const { searchParams } = new URL(req.url)
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')

        if (!startDate || !endDate) {
            return badRequestError("تاريخ البداية والنهاية مطلوبان", ["startDate", "endDate"])
        }

        const admin = await getAdmin()
        const ssr = await createSSR()
        const client = admin || ssr

        // ✅ استخدام company_id من التحقق الموحد (ليس من المعاملات)
        const { data: employees, error: empError } = await client
            .from('employees')
            .select('id, name, user_id')
            .eq('company_id', companyId)
            .eq('status', 'active')

        if (empError) throw empError

        const employeeSummaries = []

        for (const emp of employees || []) {
            // Get total earned commissions from commission_ledger
            // ✅ العمولة تُنسب لمنشئ أمر البيع (sales_orders.created_by)
            const { data: earned, error: earnedErr } = await client
                .from('commission_ledger')
                .select('amount, is_clawback')
                .eq('company_id', companyId)
                .eq('employee_id', emp.id)
                .gte('transaction_date', startDate)
                .lte('transaction_date', endDate)
                .in('status', ['pending', 'approved', 'posted'])

            if (earnedErr) throw earnedErr

            const totalEarned = (earned || []).reduce((sum, e) => {
                const amt = Number(e.amount || 0)
                return sum + (e.is_clawback ? -amt : amt)
            }, 0)

            // Get total advance payments already made (غير المخصومة)
            const { data: advances, error: advErr } = await client
                .from('commission_advance_payments')
                .select('amount')
                .eq('company_id', companyId)
                .eq('employee_id', emp.id)
                .lte('commission_period_start', endDate)
                .gte('commission_period_end', startDate)
                .in('status', ['pending', 'paid'])
                .eq('deducted_in_payroll', false)

            if (advErr) throw advErr

            const totalAdvanced = (advances || []).reduce((sum, a) => sum + Number(a.amount || 0), 0)
            const available = Math.max(0, totalEarned - totalAdvanced)

            if (totalEarned > 0 || totalAdvanced > 0) {
                employeeSummaries.push({
                    employee_id: emp.id,
                    employee_name: emp.name,
                    total_earned: totalEarned,
                    total_advance_paid: totalAdvanced,
                    available_amount: available
                })
            }
        }

        // Sort by available amount descending
        employeeSummaries.sort((a, b) => b.available_amount - a.available_amount)

        return apiSuccess({ employees: employeeSummaries })
    } catch (e: any) {
        console.error('Error loading available commissions:', e)
        return internalError("حدث خطأ أثناء جلب أرصدة العمولات", e?.message)
    }
}

