import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

export async function GET(req: NextRequest) {
  try {
    // ✅ تحصين موحد باستخدام secureApiRequest
    const { companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "reports", action: "read" }
    })

    if (error) return error
    if (!companyId) {
      return apiError(
        HTTP_STATUS.NOT_FOUND,
        "لم يتم العثور على الشركة",
        "Company not found"
      )
    }

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return internalError("خطأ في إعدادات الخادم", "Server configuration error")
    }

    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    const { searchParams } = new URL(req.url)
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")

    const { data, error: queryError } = await admin
      .from("journal_entry_lines")
      .select("debit_amount, credit_amount, chart_of_accounts!inner(account_type), journal_entries!inner(company_id, entry_date)")
      .eq("journal_entries.company_id", companyId)
      .gte("journal_entries.entry_date", from)
      .lte("journal_entries.entry_date", to)
    if (queryError) {
      return internalError("خطأ في جلب بيانات قائمة الدخل", queryError.message)
    }

    let totalIncome = 0
    let totalExpense = 0
    for (const row of data || []) {
      const type = String(((row as any).chart_of_accounts || {}).account_type || '').toLowerCase()
      const debit = Number((row as any).debit_amount || 0)
      const credit = Number((row as any).credit_amount || 0)
      if (type === 'income') totalIncome += (credit - debit)
      else if (type === 'expense') totalExpense += (debit - credit)
    }
    return apiSuccess({ totalIncome, totalExpense })
  } catch (e: any) {
    return internalError("حدث خطأ داخلي أثناء جلب قائمة الدخل", e?.message || "unknown_error")
  }
}