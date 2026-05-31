/**
 * GET /api/cron/backup-daily
 *
 * Vercel-Cron-driven job (daily, 3 AM UTC = 5 AM Cairo).
 *
 * For each company where `companies.auto_backup_enabled = true`:
 *   1. Run exportCompanyBackupWithClient(adminClient, ...)
 *   2. Upload the JSON to Supabase Storage at backups/<company_id>/<id>.json
 *   3. Insert a row in backup_history with metadata.source = "cron"
 *   4. Stamp companies.auto_backup_last_run_at / last_status
 *   5. Audit-log as action = "backup_auto_export"
 *
 * Failures on one company never block the next — each company runs in its
 * own try/catch and the failure is recorded both on the company row and as
 * a separate audit_log entry. The cron returns a summary array.
 *
 * Auth: Vercel injects `Authorization: Bearer <CRON_SECRET>` for cron requests.
 * Manual hits without the header are 401.
 *
 * Retention: same 30-day Storage window as the manual /api/backup/export.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { exportCompanyBackupWithClient } from "@/lib/backup/export-utils"
import { estimateBackupSize } from "@/lib/backup/export-utils"
import { sendBackupFailureNotice } from "@/lib/backup/backup-emails"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60 // Hobby cap

const RETENTION_DAYS = 30
const BUCKET = "backups"

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (!url || !key) throw new Error("Supabase admin credentials missing")
  return createClient(url, key, { auth: { persistSession: false } })
}

interface PerCompanyResult {
  company_id: string
  company_name: string
  ok: boolean
  history_id?: string
  storage_path?: string
  size_mb?: number
  total_records?: number
  duration_ms?: number
  error?: string
}

export async function GET(request: NextRequest) {
  // ─── Auth ────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") || ""
  const secret = process.env.CRON_SECRET || ""
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const admin = getAdminClient()

  // ─── Discover candidate companies ────────────────────────
  const { data: companies, error: listErr } = await admin
    .from("companies")
    .select("id, name, user_id")
    .eq("auto_backup_enabled", true)

  if (listErr) {
    console.error("[cron:backup-daily] list companies failed:", listErr)
    return NextResponse.json(
      { ok: false, error: listErr.message, ran_at: startedAt },
      { status: 500 }
    )
  }

  const results: PerCompanyResult[] = []

  for (const company of companies || []) {
    const cT0 = Date.now()
    const companyId = company.id as string
    const companyName = (company.name as string) || "Unknown Company"
    const ownerId = (company.user_id as string) || companyId // fallback to companyId so created_by is never null

    try {
      // 1. Build backup using admin client (bypasses RLS — safe because we
      //    explicitly filter by company_id inside exportCompanyBackupWithClient)
      const backupData = await exportCompanyBackupWithClient(admin as never, companyId, ownerId, companyName)
      const sizeInfo = estimateBackupSize(backupData)

      // 2. Upload to Storage
      const historyId = crypto.randomUUID()
      const storagePath = `${companyId}/${historyId}.json`
      const json = JSON.stringify(backupData, null, 2)
      const blob = new Blob([json], { type: "application/json" })

      const { error: uploadErr } = await admin.storage
        .from(BUCKET)
        .upload(storagePath, blob, { contentType: "application/json", upsert: false })
      if (uploadErr) throw uploadErr

      const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

      // 3. Insert backup_history with source="cron" in notes for clarity
      const { error: insertErr } = await admin.from("backup_history").insert({
        id: historyId,
        company_id: companyId,
        created_by: ownerId,
        storage_bucket: BUCKET,
        storage_path: storagePath,
        file_size_bytes: sizeInfo.sizeInBytes,
        is_encrypted: false,
        system_version: backupData.metadata.system_version,
        schema_version: backupData.metadata.schema_version,
        total_records: backupData.metadata.total_records,
        table_count: Object.keys(backupData.data || {}).length,
        checksum: backupData.metadata.checksum,
        status: "completed",
        expires_at: expiresAt,
        notes: "[cron] daily auto-backup",
      })
      if (insertErr) {
        await admin.storage.from(BUCKET).remove([storagePath]).catch(() => undefined)
        throw insertErr
      }

      // 4. Stamp the company row
      await admin
        .from("companies")
        .update({
          auto_backup_last_run_at: new Date().toISOString(),
          auto_backup_last_status: "success",
          auto_backup_last_error: null,
        })
        .eq("id", companyId)

      // 5. Audit log
      await admin.from("audit_logs").insert({
        company_id: companyId,
        user_id: ownerId,
        user_name: "System (cron)",
        user_email: "cron@7esab.com",
        action: "backup_auto_export",
        target_table: "backup_history",
        record_id: historyId,
        record_identifier: `نسخة احتياطية يومية تلقائية (${backupData.metadata.total_records} سجل)`,
        metadata: {
          total_records: backupData.metadata.total_records,
          size_mb: sizeInfo.sizeInMB,
          duration_ms: Date.now() - cT0,
          history_id: historyId,
          storage_path: storagePath,
          source: "cron-daily",
        },
      })

      results.push({
        company_id: companyId,
        company_name: companyName,
        ok: true,
        history_id: historyId,
        storage_path: storagePath,
        size_mb: sizeInfo.sizeInMB,
        total_records: backupData.metadata.total_records,
        duration_ms: Date.now() - cT0,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron:backup-daily] failed for ${companyId}:`, msg)

      // Stamp failure on the company row (do not throw — keep the loop going)
      await admin
        .from("companies")
        .update({
          auto_backup_last_run_at: new Date().toISOString(),
          auto_backup_last_status: "failed",
          auto_backup_last_error: msg.slice(0, 500),
        })
        .eq("id", companyId)
        .then(() => undefined, () => undefined)

      // Audit the failure too
      await admin.from("audit_logs").insert({
        company_id: companyId,
        user_id: ownerId,
        user_name: "System (cron)",
        user_email: "cron@7esab.com",
        action: "backup_auto_export",
        target_table: "backup_history",
        record_id: companyId,
        record_identifier: `فشل النسخة الاحتياطية اليومية`,
        metadata: { error: msg.slice(0, 500), source: "cron-daily", failed: true },
      }).then(() => undefined, () => undefined)

      results.push({
        company_id: companyId,
        company_name: companyName,
        ok: false,
        duration_ms: Date.now() - cT0,
        error: msg.slice(0, 200),
      })
    }
  }

  // ─── B5: email each owner whose backup failed ────────────
  // We do this AFTER the main loop so the cron's primary work is recorded
  // before any email-related delay. Email failures here are non-fatal —
  // the audit log already captured the backup failure.
  const failed = results.filter(r => !r.ok)
  let emails_sent = 0
  let emails_failed = 0
  if (failed.length > 0) {
    const failedIds = failed.map(f => f.company_id)
    // Get owner user_id for each failed company
    const { data: failedCompanies } = await admin
      .from("companies")
      .select("id, name, user_id")
      .in("id", failedIds)

    for (const fc of failedCompanies || []) {
      try {
        // Look up the owner's email from auth.users (service-role can read it)
        const { data: ownerUser } = await admin.auth.admin.getUserById(fc.user_id as string)
        const ownerEmail = ownerUser?.user?.email
        if (!ownerEmail) {
          console.warn(`[cron:backup-daily] no email for owner of ${fc.id}, skipping`)
          continue
        }
        const r = failed.find(f => f.company_id === fc.id)
        const result = await sendBackupFailureNotice({
          to: ownerEmail,
          companyName: (fc.name as string) || "شركتك",
          errorMessage: r?.error || "خطأ غير معروف",
          runAt: startedAt,
        })
        if (result.sent) emails_sent++
        else emails_failed++
      } catch (err) {
        console.error(`[cron:backup-daily] failure-email path errored for ${fc.id}:`, err)
        emails_failed++
      }
    }
  }

  const summary = {
    ok: true,
    ran_at: startedAt,
    duration_ms: Date.now() - t0,
    companies_considered: companies?.length || 0,
    backed_up: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    failure_emails_sent: emails_sent,
    failure_emails_failed: emails_failed,
    results,
  }

  return NextResponse.json(summary)
}
