// v3.74.92 — Customer credit integrity check API
// GET /api/governance/customer-credit-integrity
//   - Returns findings (empty array = healthy)
//   - Scoped to the caller's active company
//   - Auth required; owner/manager/accountant only

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) return NextResponse.json({ error: "Company context missing" }, { status: 400 })

    // Permission gate — only owner/manager/accountant see governance reports
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle()

    const allowedRoles = ["owner", "manager", "accountant", "chief_accountant"]
    if (!member || !allowedRoles.includes(String(member.role || ""))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data, error } = await supabase.rpc("check_customer_credit_integrity", {
      p_company_id: companyId,
    })

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const findings = (data || []) as Array<{
      cmp_id: string
      severity: "high" | "medium" | "low"
      check_name: string
      detail: Record<string, any>
    }>

    return NextResponse.json({
      success: true,
      healthy: findings.length === 0,
      findings_count: findings.length,
      findings,
      checked_at: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Unknown error" }, { status: 500 })
  }
}
