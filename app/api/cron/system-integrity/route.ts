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
    const writeErrors: string[] = []

    for (const [companyId, companyFindings] of byCompany.entries()) {
      const { data: owners } = await admin
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("role", "owner")

      const ownerIds = (owners || []).map((o: any) => o.user_id).filter(Boolean)

      const highCount = companyFindings.filter((f) => f.severity === "high").length

      // v3.74.753 — this insert had failed silently every night since the cron
      // was written. Four defects at once:
      //   entity_type  — no such column on audit_logs
      //   entity_id    — GENERATED ALWAYS (mirrors record_id); naming it is an error
      //   target_table — NOT NULL, and never supplied
      //   and the result was never checked, so all of it passed unnoticed
      //
      // Same generated-column mistake corrected in protect_customer_branch_id
      // (v3.74.743). Write the real columns and let the generated ones fill
      // themselves.
      const { error: auditErr } = await admin.from("audit_logs").insert({
        company_id: companyId,
        action: "system_integrity_check",
        target_table: "system_integrity",
        record_id: companyId,
        record_identifier: `${companyFindings.length} finding(s)`,
        metadata: {
          findings_count: companyFindings.length,
          by_severity: {
            high: highCount,
            medium: companyFindings.filter((f) => f.severity === "medium").length,
            low: companyFindings.filter((f) => f.severity === "low").length,
          },
          by_category: companyFindings.reduce<Record<string, number>>((acc, f) => {
            acc[f.category] = (acc[f.category] || 0) + 1
            return acc
          }, {}),
          checks: companyFindings.map((f) => ({
            code: f.check_code,
            severity: f.severity,
            category: f.category,
            detail: f.detail,
          })),
          checked_at: new Date().toISOString(),
        },
      })
      if (auditErr) writeErrors.push(`audit(${companyId}): ${auditErr.message}`)

      // v3.74.753 — and the notification insert failed for its own reasons:
      // notifications has no user_id column (recipients live in
      // notification_user_states), and seven NOT NULL columns were never
      // supplied — channel, created_by, kind, reference_id, reference_type,
      // retry_count, severity.
      //
      // Shape copied from notification rows the application actually creates
      // rather than inferred, and every enumerated value checked against its
      // CHECK constraint: kind in (action, info), channel in (in_app, ...),
      // severity in (info, warning, error, critical), priority in
      // (low, normal, high, urgent, critical).
      const checkNames = Array.from(new Set(companyFindings.map((f) => f.name_ar)))
        .slice(0, 3)
        .join(" ، ")

      const { data: created, error: notifErr } = await admin
        .from("notifications")
        .insert({
          company_id: companyId,
          category: "system",
          kind: "action",
          channel: "in_app",
          severity: highCount > 0 ? "critical" : "warning",
          priority: highCount > 0 ? "critical" : "high",
          reference_type: "system_integrity",
          reference_id: companyId,
          retry_count: 0,
          created_by: ownerIds[0] ?? null,
          title:
            highCount > 0
              ? `⚠️ ${highCount} انحِراف حَرِج فى سَلامَة النِّظام`
              : `⚠️ ${companyFindings.length} انحِراف فى سَلامَة النِّظام`,
          // v3.74.753 — no action_url column exists on notifications. The old
          // code set one and the insert failed on it; I copied it forward
          // without checking, and the probe caught that before it shipped.
          // The destination goes in the message instead.
          message: `${checkNames}${companyFindings.length > 3 ? " ، وغيرها..." : ""}. راجِع لوحَة التَّحَكُّم.`,
        })
        .select("id")
        .single()

      if (notifErr) {
        writeErrors.push(`notification(${companyId}): ${notifErr.message}`)
        continue
      }

      // Recipients are rows in notification_user_states, not a column.
      if (created?.id && ownerIds.length > 0) {
        const { error: stateErr } = await admin.from("notification_user_states").insert(
          ownerIds.map((ownerId: string) => ({
            notification_id: created.id,
            user_id: ownerId,
            status: "unread",
          }))
        )
        if (stateErr) {
          writeErrors.push(`recipients(${companyId}): ${stateErr.message}`)
        } else {
          notifiedCount += ownerIds.length
        }
      }
    }

    // v3.74.771 — record that the check RAN, even when it found nothing.
    //
    // The loop above iterates companies that HAVE findings. Once the system is
    // clean it does not execute at all, and the cron writes nothing. Which
    // means these two states are indistinguishable from the outside:
    //
    //     "the system is healthy"      -> 0 audit rows
    //     "the cron stopped running"   -> 0 audit rows
    //
    // On 2026-07-21, the morning after the alert chain was repaired and every
    // deviation cleared, there were 0 rows and no way to tell which had
    // happened. That is precisely the failure v3.74.753 fixed, wearing a
    // different costume: before, the cron ran and could not write; now it can
    // write but has nothing to say, and silence reads the same either way.
    //
    // A monitor that cannot report its own health is not a monitor. One
    // heartbeat row per run, cheap, and it makes absence meaningful: no row
    // this morning now means the cron did not run.
    // One heartbeat per company, so every company gets a "last checked at"
    // rather than one global row that says nothing about any of them.
    // audit_logs.company_id is NOT NULL, so the ids have to be fetched — the
    // route otherwise only ever learns about companies that HAVE findings,
    // which is the blind spot being closed.
    const { data: allCompanies, error: companiesErr } = await admin
      .from("companies")
      .select("id")

    if (companiesErr) {
      writeErrors.push(`heartbeat companies lookup: ${companiesErr.message}`)
    } else {
      const heartbeatRows = (allCompanies || []).map((c: { id: string }) => ({
        company_id: c.id,
        action: "system_integrity_check",
        target_table: "system_integrity",
        record_id: c.id,
        record_identifier: `${(byCompany.get(c.id) || []).length} finding(s)`,
        metadata: {
          heartbeat: true,
          findings_for_company: (byCompany.get(c.id) || []).length,
          total_findings_all_companies: rows.length,
          companies_scanned: (allCompanies || []).length,
          duration_ms: Date.now() - startedAt,
        },
      }))

      if (heartbeatRows.length > 0) {
        const { error: heartbeatErr } = await admin.from("audit_logs").insert(heartbeatRows)
        if (heartbeatErr) {
          writeErrors.push(`heartbeat: ${heartbeatErr.message}`)
        }
      }
    }

    // v3.74.753 — a cron that reports success while writing nothing is the
    // problem this release exists to fix. If a write failed, say so and fail.
    if (writeErrors.length > 0) {
      console.error("[system-integrity cron] write failures:", writeErrors)
      return NextResponse.json(
        {
          success: false,
          error: "integrity findings were computed but could not be recorded",
          write_errors: writeErrors.slice(0, 10),
          total_findings: rows.length,
        },
        { status: 500 }
      )
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
