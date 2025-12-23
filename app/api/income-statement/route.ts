import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError } from "@/lib/api-security-enhanced"
import { NextRequest, NextResponse } from "next/server"
import { badRequestError, apiSuccess } from "@/lib/api-error-handler"

/**
 * قائمة الدخل (Income Statement)
 * تعرض الإيرادات والمصروفات وصافي الدخل/الخسارة
 * مع تفاصيل كل حساب
 */
export async function GET(req: NextRequest) {
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

  try {
    // ✅ تحصين موحد باستخدام secureApiRequest
    const { companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false, // قائمة الدخل تعرض بيانات الشركة كاملة
      requirePermission: { resource: "reports", action: "read" }
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from") || "0001-01-01"
    const to = searchParams.get("to") || "9999-12-31"

    // جلب جميع قيود اليومية للإيرادات والمصروفات
    const { data, error: queryError } = await supabase
      .from("journal_entry_lines")
      .select(`
        debit_amount,
        credit_amount,
        chart_of_accounts!inner(
          id,
          account_code,
          account_name,
          account_type
        ),
        journal_entries!inner(
          company_id,
          entry_date,
          status
        )
      `)
      .eq("journal_entries.company_id", companyId)
      .eq("journal_entries.status", "posted")
      .gte("journal_entries.entry_date", from)
      .lte("journal_entries.entry_date", to)
      .in("chart_of_accounts.account_type", ["income", "expense"])

    if (queryError) {
      console.error("Income statement query error:", queryError)
      return serverError(`خطأ في جلب بيانات قائمة الدخل: ${queryError.message}`)
    }

    // تجميع البيانات حسب الحساب
    const incomeAccounts: Record<string, { name: string; code: string; amount: number }> = {}
    const expenseAccounts: Record<string, { name: string; code: string; amount: number }> = {}

    let totalIncome = 0
    let totalExpense = 0

    for (const row of data || []) {
      const account = (row as any).chart_of_accounts
      const type = String(account?.account_type || '').toLowerCase()
      const debit = Number((row as any).debit_amount || 0)
      const credit = Number((row as any).credit_amount || 0)
      const accountCode = String(account?.account_code || '')
      const accountName = String(account?.account_name || 'غير محدد')

      if (type === 'income') {
        const amount = credit - debit
        totalIncome += amount

        if (!incomeAccounts[accountCode]) {
          incomeAccounts[accountCode] = { name: accountName, code: accountCode, amount: 0 }
        }
        incomeAccounts[accountCode].amount += amount
      } else if (type === 'expense') {
        const amount = debit - credit
        totalExpense += amount

        if (!expenseAccounts[accountCode]) {
          expenseAccounts[accountCode] = { name: accountName, code: accountCode, amount: 0 }
        }
        expenseAccounts[accountCode].amount += amount
      }
    }

    // تحويل إلى مصفوفات وترتيب حسب الكود
    const incomeList = Object.values(incomeAccounts)
      .filter(acc => acc.amount !== 0)
      .sort((a, b) => a.code.localeCompare(b.code))

    const expenseList = Object.values(expenseAccounts)
      .filter(acc => acc.amount !== 0)
      .sort((a, b) => a.code.localeCompare(b.code))

    const netIncome = totalIncome - totalExpense

    return apiSuccess({
      totalIncome,
      totalExpense,
      netIncome,
      incomeAccounts: incomeList,
      expenseAccounts: expenseList,
      period: { from, to }
    })
  } catch (e: any) {
    console.error("Income statement error:", e)
    return serverError(`حدث خطأ أثناء إنشاء قائمة الدخل: ${e?.message || "unknown_error"}`)
  }
}