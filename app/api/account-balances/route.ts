import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"

export async function GET(req: NextRequest) {
  try {
    const { user, companyId, branchId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: "reports", action: "read" },
      allowedRoles: ['owner', 'admin', 'accountant']
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!branchId) return badRequestError("معرف الفرع مطلوب")

    const supabase = createClient()
    const { searchParams } = new URL(req.url)
    const asOf = String(searchParams.get("asOf") || "9999-12-31")
    const branchFilter = buildBranchFilter(branchId!, member.role)

    const { data, error: dbError } = await supabase
      .from("journal_entry_lines")
      .select("account_id, debit_amount, credit_amount, chart_of_accounts!inner(account_code, account_name, account_type), journal_entries!inner(company_id, entry_date, branch_id)")
      .eq("journal_entries.company_id", companyId)
      .match({ 'journal_entries.branch_id': branchFilter.branch_id || null })
      .lte("journal_entries.entry_date", asOf)

    if (dbError) {
      return serverError(`خطأ في جلب أرصدة الحسابات: ${dbError.message}`)
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
      // ✅ حساب الرصيد حسب الطبيعة المحاسبية:
      // - الأصول والمصروفات: رصيدها الطبيعي مدين (debit - credit)
      // - الالتزامات وحقوق الملكية والإيرادات: رصيدها الطبيعي دائن (credit - debit)
      const isDebitNature = type === 'asset' || type === 'expense'
      const movement = isDebitNature ? (debit - credit) : (credit - debit)
      sums[aid] = { balance: prev.balance + movement, code, name, type }
    }
    const result = Object.entries(sums).map(([account_id, v]) => ({ account_id, balance: v.balance, account_code: v.code, account_name: v.name, account_type: v.type }))
    
    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب أرصدة الحسابات: ${e?.message}`)
  }
}