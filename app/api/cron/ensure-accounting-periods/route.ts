/**
 * GET /api/cron/ensure-accounting-periods
 *
 * Vercel cron job (daily, 1 AM UTC = 3 AM Cairo).
 *
 * Calls the DB function `cron_ensure_accounting_periods(p_months_ahead)`
 * which iterates over every company in the system and seeds the current
 * month plus the next N months (default 3) of accounting periods if any
 * are missing. The DB function is idempotent — pre-checks for overlap
 * before insert so existing periods are never touched.
 *
 * Why this exists:
 *   Without it, the moment the calendar flips to a new month and no
 *   accounting_periods row covers that month, every financial mutation
 *   (record_payment, post_journal, etc.) fails with NO_ACTIVE_FINANCIAL_PERIOD.
 *   v3.74.9 — Layer 2.
 *
 * Auth: Vercel injects `Authorization: Bearer <CRON_SECRET>` for cron requests.
 * Manual hits without the header are 401.
 *
 * Logging: counts emitted to Vercel logs + recorded as an audit_logs entry
 * per cron run so admins can verify the cron is firing.
 *
 * Idempotent: safe to call multiple times in the same hour / day.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (!url || !key) throw new Error("Supabase admin credentials missing")
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET(request: NextRequest) {
  // ─── Auth ────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") || ""
  const secret = process.env.CRON_SECRET || ""
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const startedAt = Date.now()
  const admin = getAdminClient()

  try {
    // Seed current month + 3 months ahead — gives 3 months of runway
    // before the next cron run, far more than the daily safety margin needed.
    const { data, error } = await admin.rpc("cron_ensure_accounting_periods", {
      p_months_ahead: 3,
    })

    if (error) {
      console.error("[cron/ensure-accounting-periods] RPC failed:", error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null
    const totalCompanies: number = Number(row?.total_companies || 0)
    const totalInserted: number = Number(row?.total_inserted || 0)
    const durationMs = Date.now() - startedAt

    // Audit log — best effort
    try {
      await admin.from("audit_logs").insert({
        action: "accounting_periods_auto_seed",
        target_table: "accounting_periods",
        new_data: {
          total_companies: totalCompanies,
          total_inserted: totalInserted,
          duration_ms: durationMs,
          months_ahead: 3,
          source: "cron",
        },
      })
    } catch (auditErr: any) {
      console.warn(
        "[cron/ensure-accounting-periods] audit_logs insert failed:",
        auditErr?.message
      )
    }

    console.log(
      `[cron/ensure-accounting-periods] companies=${totalCompanies} inserted=${totalInserted} duration=${durationMs}ms`
    )

    return NextResponse.json({
      ok: true,
      total_companies: totalCompanies,
      total_inserted: totalInserted,
      duration_ms: durationMs,
    })
  } catch (e: any) {
    console.error("[cron/ensure-accounting-periods] unexpected error:", e)
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    )
  }
}
