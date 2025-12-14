import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError } from "@/lib/api-error-handler"

export async function GET(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "chart_of_accounts", action: "read" }
    })

    if (error) return error
    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    // === نهاية التحصين الأمني ===

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    const { searchParams } = new URL(req.url)
    const accountId = String(searchParams.get("accountId") || "")
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")
    const limit = Number(searchParams.get("limit") || 50)
    
    if (!accountId) {
      return badRequestError("معرف الحساب مطلوب", ["accountId"])
    }

    const { data, error: dbError } = await admin
      .from("journal_entry_lines")
      .select("id, debit_amount, credit_amount, description, display_debit, display_credit, display_currency, original_debit, original_credit, original_currency, exchange_rate_used, journal_entries!inner(entry_date, description, company_id)")
      .eq("account_id", accountId)
      .eq("journal_entries.company_id", companyId)
      .gte("journal_entries.entry_date", from)
      .lte("journal_entries.entry_date", to)
      .order("id", { ascending: false })
      .limit(limit)
    if (dbError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب سطور الحساب", dbError.message)
    }
    return apiSuccess(data || [])
  } catch (e: any) {
    return internalError("حدث خطأ أثناء جلب سطور الحساب", e?.message)
  }
}