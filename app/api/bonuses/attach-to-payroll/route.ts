import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

// POST: ربط البونصات المعلقة بدفعة المرتبات
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdmin()
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const body = await req.json()
    const { companyId, payrollRunId, year, month } = body || {}

    if (!companyId || !payrollRunId) {
      return NextResponse.json({ error: "companyId and payrollRunId are required" }, { status: 400 })
    }

    // Check membership and role
    const { data: member } = await (admin || ssr).from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle()
    const role = String(member?.role || "")
    if (!['owner', 'admin', 'manager', 'accountant'].includes(role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const client = admin || ssr

    // Get pending bonuses for this company
    let query = client
      .from("user_bonuses")
      .select("id, user_id, employee_id, bonus_amount")
      .eq("company_id", companyId)
      .eq("status", "pending")

    // Filter by month if provided
    if (year && month) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = `${year}-${String(month).padStart(2, '0')}-31`
      query = query.gte("calculated_at", startDate).lte("calculated_at", endDate + "T23:59:59")
    }

    const { data: pendingBonuses, error: fetchErr } = await query

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    if (!pendingBonuses || pendingBonuses.length === 0) {
      return NextResponse.json({ message: "No pending bonuses to attach", count: 0 })
    }

    // Update bonuses to scheduled and link to payroll run
    const bonusIds = pendingBonuses.map(b => b.id)
    const { error: updateErr } = await client
      .from("user_bonuses")
      .update({ 
        status: "scheduled", 
        payroll_run_id: payrollRunId,
        updated_at: new Date().toISOString()
      })
      .in("id", bonusIds)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // Calculate total bonus per employee for payslip update
    const bonusByEmployee: Record<string, number> = {}
    for (const b of pendingBonuses) {
      if (b.employee_id) {
        bonusByEmployee[b.employee_id] = (bonusByEmployee[b.employee_id] || 0) + Number(b.bonus_amount || 0)
      }
    }

    // Update payslips with sales_bonus
    for (const [employeeId, totalBonus] of Object.entries(bonusByEmployee)) {
      const { data: existingSlip } = await client
        .from("payslips")
        .select("id, sales_bonus, bonuses, net_salary")
        .eq("company_id", companyId)
        .eq("payroll_run_id", payrollRunId)
        .eq("employee_id", employeeId)
        .maybeSingle()

      if (existingSlip) {
        const currentSalesBonus = Number(existingSlip.sales_bonus || 0)
        const newSalesBonus = currentSalesBonus + totalBonus
        const currentNet = Number(existingSlip.net_salary || 0)
        const newNet = currentNet + totalBonus

        await client
          .from("payslips")
          .update({ 
            sales_bonus: newSalesBonus,
            net_salary: newNet
          })
          .eq("id", existingSlip.id)
      }
    }

    // Log to audit
    try {
      await client.from("audit_logs").insert({
        action: "bonuses_attached_to_payroll",
        company_id: companyId,
        user_id: user.id,
        details: { payroll_run_id: payrollRunId, count: bonusIds.length, total_by_employee: bonusByEmployee }
      })
    } catch {}

    return NextResponse.json({ 
      ok: true, 
      count: bonusIds.length, 
      bonusByEmployee 
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}

