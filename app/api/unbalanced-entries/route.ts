import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

export async function GET(req: NextRequest) {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "journal_entries", action: "read" }
    })

    if (error) return error
    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    // === نهاية التحصين الأمني ===

    const { searchParams } = new URL(req.url)
    const asOf = String(searchParams.get("asOf") || "9999-12-31")

    const { data, error } = await admin
      .from("journal_entry_lines")
      .select("debit_amount, credit_amount, journal_entries!inner(id, entry_date, company_id)")
      .eq("journal_entries.company_id", companyId)
      .lte("journal_entries.entry_date", asOf)
    if (error) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب القيود غير المتوازنة", error.message)
    }

    const byEntry: Record<string, { debit: number; credit: number; entry_date: string }> = {}
    ;(data || []).forEach((line: any) => {
      const debit = Number(line.debit_amount || 0)
      const credit = Number(line.credit_amount || 0)
      const entryId = String(line.journal_entries?.id || "")
      const entryDate = String(line.journal_entries?.entry_date || asOf)
      if (entryId) {
        const prev = byEntry[entryId] || { debit: 0, credit: 0, entry_date: entryDate }
        byEntry[entryId] = { debit: prev.debit + debit, credit: prev.credit + credit, entry_date: entryDate }
      }
    })
    const unbalanced = Object.entries(byEntry)
      .map(([id, v]) => ({ id, entry_date: v.entry_date, debit: v.debit, credit: v.credit, difference: v.debit - v.credit }))
      .filter((s) => Math.abs(s.difference) >= 0.01)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
    return apiSuccess(unbalanced)
  } catch (e: any) {
    return internalError("حدث خطأ أثناء جلب القيود غير المتوازنة", e?.message)
  }
}