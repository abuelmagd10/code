/**
 * v3.74.93 — Daily system integrity check (replaces v3.74.92 customer-credit-only cron)
 *
 * GET /api/cron/system-integrity
 *
 * Runs run_all_integrity_checks() across every company. For each company with
 * findings: audit_logs row + notification to each owner (severity=critical
 * if any finding has severity=high).
 *
 * Auth: Bearer CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (!url || !key) throw new Error("Supabase admin credentials missing")
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || ""
  const secret = process.env.CRON_SECRET || ""
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const startedAt = Date.now()
  const admin = getAdminClient()

  try {
    const { data: findings, error: rpcErr } = await admin.rpc(
      "run_all_integrity_checks",
      { p_company_id: null }
    )

    if (rpcErr) {
      console.error("[system-integrity cron] RPC error:", rpcErr)
      return NextResponse.json({ success: false, error: rpcErr.message }, { status: 500 })
    }

    const rows = (findings || []) as Array<{
      cmp_id: string
      check_code: string
      category: string
      name_ar: string
      name_en: string
      severity: "high" | "medium" | "low"
      detail: Record<string, any>
    }>

    const byCompany = new Map<string, typeof rows>()
    for (const row of rows) {
      const list = byCompany.get(row.cmp_id) || []
      list.push(row)
      byCompany.set(row.cmp_id, list)
    }

    let notifiedCount = 0

    for (const [companyId, companyFindings] of byCompany.entries()) {
      const { data: owners } = await admin
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("role", "owner")

      const ownerIds = (owners || []).map((o: any) => o.user_id).filter(Boolean)

      const highCount = companyFindings.filter((f) => f.severity === "high").length

      await admin.from("audit_logs").insert({
        company_id: companyId,
        action: "system_integrity_check",
        entity_type: "system_integrity",
        entity_id: companyId,
        metadata: {
          findings_count: companyFindings.length,
          by_severity: {
            high: highCount,
            medium: companyFindings.filter((f) => f.severity === "medium").length,
            low: companyFindings.filter((f) => f.severity === "low").length,
          },
          by_category: {
            accounting: companyFindings.filter((f) => f.category === "accounting").length,
            inventory: companyFindings.filter((f) => f.category === "inventory").length,
            operational: companyFindings.filter((f) => f.category === "operational").length,
          },
          checks: companyFindings.map((f) => ({
            code: f.check_code,
            severity: f.severity,
            category: f.category,
            detail: f.detail,
          })),
          checked_at: new Date().toISOString(),
        },
      })

      for (const ownerId of ownerIds) {
        const checkNames = Array.from(new Set(companyFindings.map((f) => f.name_ar))).slice(0, 3).join(" ، ")
        await admin.from("notifications").insert({
          company_id: companyId,
          user_id: ownerId,
          category: "system",
          priority: highCount > 0 ? "critical" : "high",
          title: highCount > 0
            ? `⚠️ ${highCount} انحِراف حَرِج فى سَلامَة النِّظام`
            : `⚠️ ${companyFindings.length} انحِراف فى سَلامَة النِّظام`,
          message: `${checkNames}${companyFindings.length > 3 ? " ، وغيرها..." : ""}. راجِع لوحَة التَّحَكُّم.`,
          action_url: "/dashboard",
        })
        notifiedCount++
      }
    }

    const durationMs = Date.now() - startedAt

    return NextResponse.json({
      success: true,
      companies_with_findings: byCompany.size,
      total_findings: rows.length,
      owners_notified: notifiedCount,
      duration_ms: durationMs,
      checked_at: new Date().toISOString(),
    })
  } catch (e: any) {
    console.error("[system-integrity cron] error:", e)
    return NextResponse.json(
      { success: false, error: e?.message || "Unknown error", duration_ms: Date.now() - startedAt },
      { status: 500 }
    )
  }
}
