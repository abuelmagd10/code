/**
 * GET /api/cron/backup-weekly-email
 *
 * Vercel-Cron-driven job (weekly). For each company with
 * `companies.auto_backup_enabled = true`, it builds the weekly data and emails
 * it to the company owner:
 *   - a readable Excel report (summary + all sections)
 *   - the full JSON backup (for restore)
 *
 * This is the reliable, cross-platform equivalent of "auto-download a weekly
 * copy to the owner's computer": a browser cannot write to a chosen local path
 * on a schedule, but an emailed attachment reaches the owner everywhere and
 * even when nothing is open. The owner saves it wherever they like.
 *
 * Reuses the SAME opt-in flag as the daily storage backup, so enabling auto
 * backup gives both the stored daily JSON and the weekly emailed copy — no new
 * setting or migration required.
 *
 * Auth: Vercel injects `Authorization: Bearer <CRON_SECRET>`. Manual hits
 * without the header are 401. Per-company failures never block the others.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { exportCompanyBackupWithClient } from "@/lib/backup/export-utils"
import { buildBackupExcel } from "@/lib/backup/excel-export"
import { sendWeeklyBackupEmail } from "@/lib/backup/backup-emails"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (!url || !key) throw new Error("Supabase admin credentials missing")
  return createClient(url, key, { auth: { persistSession: false } })
}

interface PerCompanyResult {
  company_id: string
  company_name: string
  emailed: boolean
  skipped?: boolean
  error?: string
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || ""
  const secret = process.env.CRON_SECRET || ""
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  let admin: ReturnType<typeof getAdminClient>
  try {
    admin = getAdminClient()
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "admin client failed" }, { status: 500 })
  }

  const { data: companies, error: listErr } = await admin
    .from("companies")
    .select("id, name, user_id")
    .eq("auto_backup_enabled", true)

  if (listErr) {
    console.error("[cron:backup-weekly-email] list companies failed:", listErr)
    return NextResponse.json({ ok: false, error: listErr.message }, { status: 500 })
  }

  const runAt = new Date().toISOString().split("T")[0]
  const results: PerCompanyResult[] = []
  let emailed = 0
  let skipped = 0
  let failed = 0

  for (const company of companies || []) {
    const companyId = company.id as string
    const companyName = (company.name as string) || "Unknown Company"
    const ownerId = (company.user_id as string) || companyId

    try {
      // Resolve owner email (service role can read auth.users).
      const { data: ownerUser } = await admin.auth.admin.getUserById(ownerId)
      const ownerEmail = ownerUser?.user?.email
      if (!ownerEmail) {
        results.push({ company_id: companyId, company_name: companyName, emailed: false, skipped: true, error: "no owner email" })
        skipped++
        continue
      }

      // Build data once; produce both attachments.
      const backupData = await exportCompanyBackupWithClient(admin as never, companyId, ownerId, companyName)
      const excel = await buildBackupExcel(backupData, "ar")
      const json = Buffer.from(JSON.stringify(backupData, null, 2), "utf-8")

      const result = await sendWeeklyBackupEmail({
        to: ownerEmail,
        companyName,
        runAt,
        attachments: [
          { filename: `ERB-backup-${runAt}.xlsx`, content: excel },
          { filename: `ERB-backup-${runAt}.json`, content: json },
        ],
      })

      if (result.sent) {
        emailed++
        results.push({ company_id: companyId, company_name: companyName, emailed: true })
      } else if (result.skipped) {
        skipped++
        results.push({ company_id: companyId, company_name: companyName, emailed: false, skipped: true, error: "SMTP not configured" })
      } else {
        failed++
        results.push({ company_id: companyId, company_name: companyName, emailed: false, error: result.error })
      }
    } catch (err: any) {
      failed++
      results.push({ company_id: companyId, company_name: companyName, emailed: false, error: err?.message || String(err) })
      console.error(`[cron:backup-weekly-email] failed for ${companyId}:`, err?.message || err)
    }
  }

  return NextResponse.json({
    ok: true,
    companies_considered: companies?.length || 0,
    emailed,
    skipped,
    failed,
    results,
  })
}
