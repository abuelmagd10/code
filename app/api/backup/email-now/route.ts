/**
 * POST /api/backup/email-now
 *
 * On-demand: email the signed-in owner/admin their company backup right now —
 * a readable Excel report + the full JSON (restore). Same builders and email
 * transport as the weekly cron, but triggered manually so the owner can test
 * delivery (and grab a copy) without waiting for Sunday or knowing CRON_SECRET.
 *
 * Sends to the CURRENT user's own email only (never an arbitrary address).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { exportCompanyBackup, canExportBackup } from "@/lib/backup/export-utils"
import { buildBackupExcel } from "@/lib/backup/excel-export"
import { sendWeeklyBackupEmail } from "@/lib/backup/backup-emails"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(request)
    if (error) return error
    if (!companyId || !user) {
      return NextResponse.json({ error: "لم يتم العثور على الشركة", error_en: "Company not found" }, { status: 404 })
    }

    const perm = await canExportBackup(user.id, companyId)
    if (!perm.allowed) {
      return NextResponse.json({ error: perm.reason, error_en: "Permission denied" }, { status: 403 })
    }

    const to = (user as any)?.email as string | undefined
    if (!to) {
      return NextResponse.json(
        { error: "لا يوجد بريد إلكتروني مرتبط بحسابك", error_en: "No email on your account" },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const companyName = body.companyName || "Company"
    const lang = body.language === "en" ? "en" : "ar"
    const runAt = new Date().toISOString().split("T")[0]

    const backupData = await exportCompanyBackup(companyId, user.id, companyName)
    const excel = await buildBackupExcel(backupData, lang)
    const json = Buffer.from(JSON.stringify(backupData, null, 2), "utf-8")

    const result = await sendWeeklyBackupEmail({
      to,
      companyName,
      runAt,
      attachments: [
        { filename: `ERB-backup-${runAt}.xlsx`, content: excel },
        { filename: `ERB-backup-${runAt}.json`, content: json },
      ],
    })

    if (result.sent) {
      return NextResponse.json({ success: true, to })
    }
    if (result.skipped) {
      return NextResponse.json(
        {
          success: false,
          skipped: true,
          error: "لم يُضبط مزوّد بريد (Resend أو SMTP) في إعدادات الخادم بعد.",
          error_en: "No email provider (Resend/SMTP) configured on the server yet.",
        },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { success: false, error: result.error || "تعذّر إرسال البريد", error_en: "Failed to send email" },
      { status: 502 }
    )
  } catch (err: any) {
    console.error("[Backup Email-Now] Error:", err)
    return NextResponse.json(
      { error: "فشل إرسال النسخة بالبريد", error_en: "Failed to email backup", details: err?.message },
      { status: 500 }
    )
  }
}
