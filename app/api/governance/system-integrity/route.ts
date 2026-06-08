// v3.74.93 — Unified system integrity API
// GET /api/governance/system-integrity
//   - Calls the master RPC run_all_integrity_checks(company_id)
//   - Scoped to caller's active company
//   - Owner/manager/accountant/chief_accountant only

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

    const { data, error } = await supabase.rpc("run_all_integrity_checks", {
      p_company_id: companyId,
    })

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const findings = (data || []) as Array<{
      cmp_id: string
      check_code: string
      category: "accounting" | "inventory" | "operational"
      name_ar: string
      name_en: string
      severity: "high" | "medium" | "low"
      detail: Record<string, any>
    }>

    // Aggregate by category for the widget
    const counts = {
      total: findings.length,
      high: findings.filter(f => f.severity === "high").length,
      medium: findings.filter(f => f.severity === "medium").length,
      low: findings.filter(f => f.severity === "low").length,
      accounting: findings.filter(f => f.category === "accounting").length,
      inventory: findings.filter(f => f.category === "inventory").length,
      operational: findings.filter(f => f.category === "operational").length,
    }

    return NextResponse.json({
      success: true,
      healthy: findings.length === 0,
      counts,
      findings,
      checked_at: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Unknown error" }, { status: 500 })
  }
}
