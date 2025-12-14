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
      requirePermission: { resource: "reports", action: "read" }
    })

    if (error) return error
    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    // === نهاية التحصين الأمني ===

    const { searchParams } = new URL(req.url)
    const asOf = String(searchParams.get("asOf") || "9999-12-31")

    const { data, error } = await admin
      .from("journal_entry_lines")
      .select("account_id, debit_amount, credit_amount, chart_of_accounts!inner(account_code, account_name, account_type), journal_entries!inner(company_id, entry_date)")
      .eq("journal_entries.company_id", companyId)
      .lte("journal_entries.entry_date", asOf)

    if (error) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب أرصدة الحسابات", error.message)
    }

    const sums: Record<string, { balance: number; code?: string; name?: string; type?: string }> = {}
    for (const row of data || []) {
      const aid = (row as any).account_id as string
      const debit = Number((row as any).debit_amount || 0)
      const credit = Number((row as any).credit_amount || 0)
      const code = String(((row as any).chart_of_accounts || {}).account_code || '')
      const name = String(((row as any).chart_of_accounts || {}).account_name || '')
      const type = String(((row as any).chart_of_accounts || {}).account_type || '')
      const prev = sums[aid] || { balance: 0, code, name, type }
      sums[aid] = { balance: prev.balance + (debit - credit), code, name, type }
    }
    const result = Object.entries(sums).map(([account_id, v]) => ({ account_id, balance: v.balance, account_code: v.code, account_name: v.name, account_type: v.type }))
    return apiSuccess(result)
  } catch (e: any) {
    return internalError("حدث خطأ أثناء جلب أرصدة الحسابات", e?.message)
  }
}