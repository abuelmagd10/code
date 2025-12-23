import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError } from "@/lib/api-security-enhanced"
import { NextRequest, NextResponse } from "next/server"
import { badRequestError, apiSuccess } from "@/lib/api-error-handler"

/**
 * قائمة الدخل (Income Statement)
 * تعرض الإيرادات والمصروفات وصافي الدخل/الخسارة
 * مع تفاصيل كل حساب
 */
export async function GET(req: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ تحصين موحد باستخدام secureApiRequest
    const { companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false, // قائمة الدخل تعرض بيانات الشركة كاملة
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase // ✅ تمرير supabase client
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    // ✅ بعد التحقق من الأمان، نستخدم service role key للاستعلامات
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

    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from") || "0001-01-01"
    const to = searchParams.get("to") || "9999-12-31"

    // ✅ جلب حسابات الإيرادات والمصروفات أولاً (بدون joins)
    const { data: accountsData, error: accountsError } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type")
      .eq("company_id", companyId)
      .in("account_type", ["income", "expense"])

    if (accountsError) {
      console.error("Accounts query error:", accountsError)
      return serverError(`خطأ في جلب بيانات الحسابات: ${accountsError.message}`)
    }

    // ✅ جلب القيود المرحّلة في الفترة المحددة
    const { data: journalEntriesData, error: entriesError } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .gte("entry_date", from)
      .lte("entry_date", to)

    if (entriesError) {
      console.error("Journal entries query error:", entriesError)
      return serverError(`خطأ في جلب القيود: ${entriesError.message}`)
    }

    const journalEntryIds = (journalEntriesData || []).map((je: any) => je.id)

    // ✅ جلب سطور القيود (بدون joins)
    let journalLinesData: any[] = []
    if (journalEntryIds.length > 0) {
      const { data: linesData, error: linesError } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount")
        .in("journal_entry_id", journalEntryIds)

      if (linesError) {
        console.error("Journal lines query error:", linesError)
        return serverError(`خطأ في جلب سطور القيود: ${linesError.message}`)
      }

      journalLinesData = linesData || []
    }

    // ✅ إنشاء map للحسابات
    const accountsMap: Record<string, { code: string; name: string; type: string }> = {}
    for (const acc of accountsData || []) {
      accountsMap[acc.id] = {
        code: acc.account_code,
        name: acc.account_name,
        type: acc.account_type
      }
    }

    // ✅ تجميع البيانات حسب الحساب
    const incomeAccounts: Record<string, { name: string; code: string; amount: number }> = {}
    const expenseAccounts: Record<string, { name: string; code: string; amount: number }> = {}

    let totalIncome = 0
    let totalExpense = 0

    for (const row of journalLinesData) {
      const accountId = String(row.account_id || "")
      const account = accountsMap[accountId]

      if (!account) continue // تخطي إذا لم يكن حساب إيرادات أو مصروفات

      const type = String(account.type || '').toLowerCase()
      const debit = Number(row.debit_amount || 0)
      const credit = Number(row.credit_amount || 0)
      const accountCode = account.code
      const accountName = account.name

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