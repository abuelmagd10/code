import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { user, companyId, branchId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false, // ✅ أرصدة الحسابات تعرض بيانات الشركة كاملة
      requirePermission: { resource: "reports", action: "read" },
      supabase // ✅ تمرير supabase client
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const { searchParams } = new URL(req.url)
    const asOf = searchParams.get("asOf") || "9999-12-31"

    // جلب جميع قيود اليومية المرحّلة حتى التاريخ المحدد
    const { data, error: dbError } = await supabase
      .from("journal_entry_lines")
      .select(`
        account_id,
        debit_amount,
        credit_amount,
        chart_of_accounts!inner(
          account_code,
          account_name,
          account_type,
          opening_balance
        ),
        journal_entries!inner(
          company_id,
          entry_date,
          status
        )
      `)
      .eq("journal_entries.company_id", companyId)
      .eq("journal_entries.status", "posted")
      .lte("journal_entries.entry_date", asOf)

    if (dbError) {
      console.error("Account balances query error:", dbError)
      return serverError(`خطأ في جلب بيانات القيود: ${dbError.message}`)
    }

    // جلب الأرصدة الافتتاحية للحسابات
    const { data: accountsData, error: accountsError } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, opening_balance")
      .eq("company_id", companyId)

    if (accountsError) {
      console.error("Accounts query error:", accountsError)
      return serverError(`خطأ في جلب بيانات الحسابات: ${accountsError.message}`)
    }

    // إنشاء خريطة للحسابات مع الأرصدة الافتتاحية
    const accountsMap: Record<string, {
      code: string
      name: string
      type: string
      opening: number
      balance: number
    }> = {}

    for (const acc of accountsData || []) {
      accountsMap[acc.id] = {
        code: acc.account_code || '',
        name: acc.account_name || '',
        type: acc.account_type || '',
        opening: Number(acc.opening_balance || 0),
        balance: Number(acc.opening_balance || 0)
      }
    }

    // حساب الحركات من القيود
    for (const row of data || []) {
      const aid = String((row as any).account_id || "")
      const debit = Number((row as any).debit_amount || 0)
      const credit = Number((row as any).credit_amount || 0)

      if (accountsMap[aid]) {
        const type = accountsMap[aid].type
        // الحسابات المدينة بطبيعتها: الأصول والمصروفات
        const isDebitNature = type === 'asset' || type === 'expense'
        const movement = isDebitNature ? (debit - credit) : (credit - debit)
        accountsMap[aid].balance += movement
      }
    }

    // تحويل إلى مصفوفة
    const result = Object.entries(accountsMap).map(([account_id, v]) => ({
      account_id,
      account_code: v.code,
      account_name: v.name,
      account_type: v.type,
      opening_balance: v.opening,
      balance: v.balance
    }))

    return NextResponse.json(result)
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب أرصدة الحسابات: ${e?.message}`)
  }
}