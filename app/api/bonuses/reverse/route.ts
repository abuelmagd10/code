import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

// POST: عكس البونص (في حالة المرتجعات أو إلغاء الفاتورة)
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdmin()
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const body = await req.json()
    const { bonusId, invoiceId, companyId, reason } = body || {}

    if (!companyId || (!bonusId && !invoiceId)) {
      return NextResponse.json({ error: "companyId and (bonusId or invoiceId) are required" }, { status: 400 })
    }

    // Check membership and role
    const { data: member } = await (admin || ssr).from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle()
    const role = String(member?.role || "")
    if (!['owner', 'admin', 'manager', 'accountant'].includes(role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const client = admin || ssr

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

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    if (!bonuses || bonuses.length === 0) {
      return NextResponse.json({ error: "No active bonus found to reverse" }, { status: 404 })
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

    return NextResponse.json({ 
      ok: true, 
      reversedCount: reversedBonuses.length,
      reversedIds: reversedBonuses
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}

