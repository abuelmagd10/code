import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError, notFoundError } from "@/lib/api-error-handler"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

// POST: عكس البونص (في حالة المرتجعات أو إلغاء الفاتورة)
export async function POST(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "bonuses", action: "update" },
      allowRoles: ['owner', 'admin', 'manager', 'accountant']
    })

    if (error) return error
    if (!companyId || !user) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة أو المستخدم", "Company or user not found")
    // === نهاية التحصين الأمني ===

    const admin = await getAdmin()
    if (!admin) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const body = await req.json()
    const { bonusId, invoiceId, reason } = body || {}

    if (!bonusId && !invoiceId) {
      return badRequestError("معرف البونص أو الفاتورة مطلوب", ["bonusId", "invoiceId"])
    }

    const client = admin

    // Find the bonus to reverse
    let query = client
      .from("user_bonuses")
      .select("*")
      .eq("company_id", companyId)
      .not("status", "in", '("reversed","cancelled")')

    if (bonusId) {
      query = query.eq("id", bonusId)
    } else if (invoiceId) {
      query = query.eq("invoice_id", invoiceId)
    }

    const { data: bonuses, error: fetchErr } = await query

    if (fetchErr) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب البونص", fetchErr.message)
    }
    if (!bonuses || bonuses.length === 0) {
      return notFoundError("بونص نشط", "No active bonus found to reverse")
    }

    const reversedBonuses = []

    for (const bonus of bonuses) {
      // Update bonus status to reversed
      const { error: updateErr } = await client
        .from("user_bonuses")
        .update({ 
          status: "reversed",
          reversed_at: new Date().toISOString(),
          reversal_reason: reason || "Manual reversal",
          updated_at: new Date().toISOString()
        })
        .eq("id", bonus.id)

      if (updateErr) continue

      // If bonus was already scheduled/paid and linked to payroll, update payslip
      if (bonus.payroll_run_id && bonus.employee_id) {
        const { data: payslip } = await client
          .from("payslips")
          .select("id, sales_bonus, net_salary")
          .eq("payroll_run_id", bonus.payroll_run_id)
          .eq("employee_id", bonus.employee_id)
          .maybeSingle()

        if (payslip) {
          const newSalesBonus = Math.max(0, Number(payslip.sales_bonus || 0) - Number(bonus.bonus_amount || 0))
          const newNet = Math.max(0, Number(payslip.net_salary || 0) - Number(bonus.bonus_amount || 0))

          await client
            .from("payslips")
            .update({ sales_bonus: newSalesBonus, net_salary: newNet })
            .eq("id", payslip.id)
        }
      }

      reversedBonuses.push(bonus.id)
    }

    // Log to audit
    try {
      await client.from("audit_logs").insert({
        action: "bonus_reversed",
        company_id: companyId,
        user_id: user.id,
        details: { bonus_ids: reversedBonuses, reason: reason || "Manual reversal", invoice_id: invoiceId }
      })
    } catch {}

    return apiSuccess({ 
      ok: true, 
      reversedCount: reversedBonuses.length,
      reversedIds: reversedBonuses
    })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء عكس البونص", e?.message)
  }
}

