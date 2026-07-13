/**
 * API: تصدير بيانات الشركة كملف Excel مقروء
 * Export a human-readable Excel workbook of the company data.
 *
 * This is NOT the restore backup (that stays JSON). It reuses the same
 * in-memory backup data and formats it into a professional multi-sheet
 * .xlsx (summary + customers, suppliers, products, sales/purchase invoices,
 * payments, journal entries, employees, chart of accounts).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { createClient } from "@/lib/supabase/server"
import { resolveActorInfo } from "@/lib/audit-actor"
import { exportCompanyBackup, canExportBackup } from "@/lib/backup/export-utils"
import { buildBackupExcel } from "@/lib/backup/excel-export"

// exceljs needs the Node runtime (not edge); data can be large so allow time.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(request)
    if (error) return error
    if (!companyId || !user) {
      return NextResponse.json(
        { error: "لم يتم العثور على الشركة", error_en: "Company not found" },
        { status: 404 }
      )
    }

    const permissionCheck = await canExportBackup(user.id, companyId)
    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { error: permissionCheck.reason, error_en: "Permission denied" },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const companyName = body.companyName || "Company"
    const lang = body.language === "en" ? "en" : "ar"

    // Reuse the exact backup dataset — no divergence, no extra queries.
    const backupData = await exportCompanyBackup(companyId, user.id, companyName)
    const buffer = await buildBackupExcel(backupData, lang)

    // Audit (non-fatal).
    try {
      const auditSupabase = await createClient()
      await auditSupabase.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        ...resolveActorInfo(user),
        action: "backup_export_excel",
        target_table: "backup_history",
        record_id: companyId,
        record_identifier: `تصدير بيانات الشركة كملف Excel (${backupData.metadata.total_records} سجل)`,
        metadata: {
          total_records: backupData.metadata.total_records,
          duration_seconds: Math.round((Date.now() - startTime) / 1000),
        },
      })
    } catch (auditErr: any) {
      console.warn("[Backup Excel] audit log skipped:", auditErr?.message || auditErr)
    }

    const date = new Date().toISOString().split("T")[0]
    const filename = `ERB-backup-${date}.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err: any) {
    console.error("[Backup Excel] Error:", err)
    return NextResponse.json(
      {
        error: "فشل تصدير ملف الإكسل",
        error_en: "Failed to export Excel",
        details: err?.message,
      },
      { status: 500 }
    )
  }
}
