import { NextRequest, NextResponse } from "next/server"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/ai/alerts?language=ar|en
 *
 * Returns proactive smart suggestions the current user is allowed to see.
 *
 * Governance: relies on the SECURITY INVOKER RPC `ai_get_proactive_alerts`
 * which itself filters by `ai_current_user_allowed_resources()` — the same
 * single source of truth made canonical in v3.59.1.
 *
 * Read-only. Never modifies data. Returns at most 20 alert rows.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const security = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      supabase,
    })

    if (security.error) return security.error
    if (!security.user || !security.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const language = searchParams.get("language") === "en" ? "en" : "ar"

    const { data, error } = await supabase.rpc("ai_get_proactive_alerts", {
      p_language: language,
    })

    if (error) {
      console.error("[AI_ALERTS][GET] RPC error:", error)
      return NextResponse.json(
        { success: true, alerts: [], total: 0 },
        { status: 200 }
      )
    }

    const rows = Array.isArray(data) ? data : []

    const alerts = rows
      .filter((row: any) => row && typeof row.alert_key === "string")
      .map((row: any) => ({
        key: String(row.alert_key),
        type: String(row.alert_type || "info"),
        severity: ["critical", "warning", "info"].includes(String(row.severity))
          ? String(row.severity)
          : "info",
        resource: String(row.resource || ""),
        title: String(row.title || ""),
        message: String(row.message || ""),
        actionUrl: typeof row.action_url === "string" ? row.action_url : null,
        count: Number.isFinite(row.count_value) ? Number(row.count_value) : 0,
        totalAmount: row.total_amount != null ? Number(row.total_amount) : null,
        metadata:
          row.metadata && typeof row.metadata === "object" ? row.metadata : null,
      }))
      .slice(0, 20)

    return NextResponse.json({
      success: true,
      alerts,
      total: alerts.reduce(
        (acc: number, a: { count: number }) => acc + (a.count || 0),
        0
      ),
    })
  } catch (error: any) {
    console.error("[AI_ALERTS][GET] Error:", error)
    return NextResponse.json(
      {
        success: true,
        alerts: [],
        total: 0,
        error: error?.message || "Failed to load alerts",
      },
      { status: 200 }
    )
  }
}
