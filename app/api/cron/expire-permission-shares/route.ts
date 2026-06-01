/**
 * GET /api/cron/expire-permission-shares
 *
 * Vercel cron job (daily, 4 AM UTC = 6 AM Cairo).
 *
 * Calls the DB function `expire_permission_shares()` which deactivates any
 * permission_sharing row whose `expires_at` is in the past and is still
 * `is_active = true`. Without this job, time-limited permissions would
 * remain active forever — a real ERP governance gap.
 *
 * Auth: Vercel injects `Authorization: Bearer <CRON_SECRET>` for cron requests.
 * Manual hits without the header are 401.
 *
 * Logging: counts are emitted to Vercel logs + recorded as an `audit_logs`
 * entry per cron run so admins can verify the cron is actually firing.
 *
 * Idempotent: safe to call multiple times in the same hour.
 *
 * v3.70.0 Phase A.
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
    // Call the DB function which atomically marks expired rows inactive
    const { data, error } = await admin.rpc("expire_permission_shares")

    if (error) {
      console.error("[cron/expire-permission-shares] RPC failed:", error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    // The function returns a table with one row: { expired_count: integer }
    const expiredCount: number = Array.isArray(data) && data.length > 0
      ? Number(data[0]?.expired_count || 0)
      : 0

    const durationMs = Date.now() - startedAt

    // Audit log — best effort, don't fail the cron if this errors
    try {
      await admin.from("audit_logs").insert({
        action: "permission_shares_auto_expire",
        target_table: "permission_sharing",
        new_data: {
          expired_count: expiredCount,
          duration_ms: durationMs,
          source: "cron",
        },
      })
    } catch (auditErr: any) {
      console.warn("[cron/expire-permission-shares] audit_logs insert failed:", auditErr?.message)
    }

    console.log(
      `[cron/expire-permission-shares] expired=${expiredCount} duration=${durationMs}ms`
    )

    return NextResponse.json({
      ok: true,
      expired_count: expiredCount,
      duration_ms: durationMs,
    })
  } catch (e: any) {
    console.error("[cron/expire-permission-shares] unexpected error:", e)
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    )
  }
}
