import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { getDailyIncomeByBranch } from "@/lib/dashboard-daily-income"

const PRIVILEGED_ROLES = ["owner", "admin", "general_manager"]

/**
 * GET /api/dashboard-daily-income
 * Query: date (YYYY-MM-DD, default today), branchId (optional, for privileged users only)
 * Returns daily Cash+Bank income per branch (GL-First). Non-privileged users get their branch only.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, companyId, branchId: memberBranchId, costCenterId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "dashboard", action: "read" },
      supabase
    })
    if (error) return error
    if (!companyId) return badRequestError("Company required")

    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get("date")
    const today = new Date().toISOString().slice(0, 10)
    const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today

    const isPrivileged = member && PRIVILEGED_ROLES.includes(member.role)
    const requestedBranchId = searchParams.get("branchId") || null

    let options: { branchId?: string | null; costCenterId?: string | null } = {}
    if (isPrivileged) {
      if (requestedBranchId) options.branchId = requestedBranchId
    } else {
      options.branchId = memberBranchId || undefined
      if (costCenterId) options.costCenterId = costCenterId
    }

    const rows = await getDailyIncomeByBranch(supabase, companyId, date, options)

    // Optional: fetch alert limits for KPI (min_daily_cash, max_daily_expense)
    let alertLimits: { min_daily_cash?: number; max_daily_expense?: number } | null = null
    try {
      let limitsQuery = supabase
        .from("company_dashboard_alert_limits")
        .select("min_daily_cash, max_daily_expense")
        .eq("company_id", companyId)
      if (options.branchId) limitsQuery = limitsQuery.eq("branch_id", options.branchId)
      else limitsQuery = limitsQuery.is("branch_id", null)
      const { data: limitsRow } = await limitsQuery.maybeSingle()
      if (limitsRow) {
        alertLimits = {
          min_daily_cash: limitsRow.min_daily_cash != null ? Number(limitsRow.min_daily_cash) : undefined,
          max_daily_expense: limitsRow.max_daily_expense != null ? Number(limitsRow.max_daily_expense) : undefined
        }
      }
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      date,
      scope: isPrivileged && !requestedBranchId ? "company" : "branch",
      branchId: options.branchId ?? null,
      data: rows,
      alertLimits: alertLimits ?? undefined,
      fetchedAt: new Date().toISOString(),
      userId: user?.id ?? null
    })
  } catch (e: any) {
    console.error("Dashboard daily income error:", e)
    return serverError(e?.message ?? "Failed to load daily income")
  }
}
