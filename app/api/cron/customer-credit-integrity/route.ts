/**
 * v3.74.92 — Daily customer credit integrity check
 *
 * GET /api/cron/customer-credit-integrity
 *
 * Vercel cron (daily, 4 AM Cairo). Runs `check_customer_credit_integrity()`
 * across every company in the system. For each company with findings:
 *   - Logs a structured audit_logs entry
 *   - Inserts an internal notification for the company's owner(s)
 *     with severity=high so it surfaces in the bell + (if escalation is
 *     enabled) is emailed via the subscription-notifications helper.
 *
 * Healthy companies: nothing is written. This is intentional — we don't
 * want to spam audit logs every day with "all green". The presence of an
 * audit entry IS the signal that something went wrong.
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
    // Run the integrity check for ALL companies (p_company_id IS NULL).
    const { data: findings, error: rpcErr } = await admin.rpc(
      "check_customer_credit_integrity",
      { p_company_id: null }
    )

    if (rpcErr) {
      console.error("[customer-credit-integrity cron] RPC error:", rpcErr)
      return NextResponse.json(
        { success: false, error: rpcErr.message },
        { status: 500 }
      )
    }

    const rows = (findings || []) as Array<{
      cmp_id: string
      severity: "high" | "medium" | "low"
      check_name: string
      detail: Record<string, any>
    }>

    // Group findings by company for cleaner alerts.
    const byCompany = new Map<string, typeof rows>()
    for (const row of rows) {
      const list = byCompany.get(row.cmp_id) || []
      list.push(row)
      byCompany.set(row.cmp_id, list)
    }

    let notifiedCount = 0

    for (const [companyId, companyFindings] of byCompany.entries()) {
      // Find owner(s) of this company so we can notify them.
      const { data: owners } = await admin
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("role", "owner")

      const ownerIds = (owners || []).map((o: any) => o.user_id).filter(Boolean)

      // Audit log — always written, even if no owners (so admins see it).
      await admin.from("audit_logs").insert({
        company_id: companyId,
        action: "system_integrity_check",
        entity_type: "customer_credit_integrity",
        entity_id: companyId,
        metadata: {
          findings_count: companyFindings.length,
          checks: companyFindings.map((f) => ({
            severity: f.severity,
            check: f.check_name,
            detail: f.detail,
          })),
          checked_at: new Date().toISOString(),
        },
      })

      // Notify each owner.
      for (const ownerId of ownerIds) {
        const highestSev = companyFindings.some((f) => f.severity === "high") ? "high" : "medium"
        await admin.from("notifications").insert({
          company_id: companyId,
          user_id: ownerId,
          category: "system",
          priority: highestSev === "high" ? "critical" : "high",
          title: "⚠️ خَلَل توازُن فى حسابات أَرصِدَة العُملاء",
          message: `تَمَّ اكتِشاف ${companyFindings.length} انحِراف فى توازُن customer_credits ↔ حساب 2155. راجِع لوحَة التَّحَكُّم أَو /reports.`,
          action_url: "/dashboard",
        })
        notifiedCount++
      }
    }

    const durationMs = Date.now() - startedAt

    return NextResponse.json({
      success: true,
      companies_checked: byCompany.size === 0 ? "all_healthy" : Array.from(byCompany.keys()).length,
      total_findings: rows.length,
      owners_notified: notifiedCount,
      duration_ms: durationMs,
      checked_at: new Date().toISOString(),
    })
  } catch (e: any) {
    console.error("[customer-credit-integrity cron] error:", e)
    return NextResponse.json(
      { success: false, error: e?.message || "Unknown error", duration_ms: Date.now() - startedAt },
      { status: 500 }
    )
  }
}
