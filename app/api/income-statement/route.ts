import { createClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"
import { NextRequest } from "next/server"




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

    const supabase = createClient()

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
      return serverError(`خطأ في جلب بيانات قائمة الدخل: ${queryError.message}`)
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
    return NextResponse.json({
      success: true,
      data: { totalIncome, totalExpense }
    })
  } catch (e: any) {
    return serverError(`حدث خطأ داخلي أثناء جلب قائمة الدخل: ${e?.message || "unknown_error"}`)
  }
}