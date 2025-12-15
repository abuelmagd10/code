import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError } from "@/lib/api-error-handler"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "reports", action: "read" }
    })

    if (error) return error
    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    // === نهاية التحصين الأمني ===

    const { searchParams } = new URL(request.url)
    const fromDate = searchParams.get("from") || "2000-01-01"
    const toDate = searchParams.get("to") || new Date().toISOString().split("T")[0]

    // 1. رأس المال المبدئي (من حساب رأس المال - equity)
    const { data: capitalData } = await supabase
      .from("journal_entry_lines")
      .select(`
        credit_amount,
        journal_entries!inner(company_id, entry_date),
        chart_of_accounts!inner(account_type, account_code)
      `)
      .eq("journal_entries.company_id", companyId)
      .eq("chart_of_accounts.account_type", "equity")
      .lte("journal_entries.entry_date", toDate)

    const totalCapital = (capitalData || []).reduce((sum, item) => sum + (item.credit_amount || 0), 0)

    // 2. المشتريات (من فواتير الشراء)
    const { data: purchasesData } = await supabase
      .from("bills")
      .select("total_amount, status, bill_date")
      .eq("company_id", companyId)
      .gte("bill_date", fromDate)
      .lte("bill_date", toDate)
      .in("status", ["sent", "partially_paid", "paid"])

    const totalPurchases = (purchasesData || []).reduce((sum, item) => sum + (item.total_amount || 0), 0)

    // 3. المصروفات (من القيود المحاسبية - expense accounts excluding COGS)
    const { data: expensesData } = await supabase
      .from("journal_entry_lines")
      .select(`
        debit_amount,
        credit_amount,
        chart_of_accounts!inner(account_type, account_code, account_name),
        journal_entries!inner(company_id, entry_date, reference_type)
      `)
      .eq("journal_entries.company_id", companyId)
      .eq("chart_of_accounts.account_type", "expense")
      .neq("chart_of_accounts.account_code", "5000")
      .gte("journal_entries.entry_date", fromDate)
      .lte("journal_entries.entry_date", toDate)

    // تجميع المصروفات حسب الحساب
    const expensesByAccount: { [key: string]: { name: string; amount: number } } = {}
    ;(expensesData || []).forEach((item: any) => {
      const accountName = item.chart_of_accounts?.account_name || "أخرى"
      const accountCode = item.chart_of_accounts?.account_code || "0000"
      const key = accountCode
      if (!expensesByAccount[key]) {
        expensesByAccount[key] = { name: accountName, amount: 0 }
      }
      expensesByAccount[key].amount += (item.debit_amount || 0) - (item.credit_amount || 0)
    })

    const expensesList = Object.values(expensesByAccount).filter(e => e.amount > 0)
    const totalExpenses = expensesList.reduce((sum, e) => sum + e.amount, 0)

    // 4. إهلاك المخزون (من حساب إهلاك المخزون 5500)
    const { data: depreciationData } = await supabase
      .from("journal_entry_lines")
      .select(`
        debit_amount,
        journal_entries!inner(company_id, entry_date),
        chart_of_accounts!inner(account_code)
      `)
      .eq("journal_entries.company_id", companyId)
      .eq("chart_of_accounts.account_code", "5500")
      .gte("journal_entries.entry_date", fromDate)
      .lte("journal_entries.entry_date", toDate)

    const totalDepreciation = (depreciationData || []).reduce((sum, item) => sum + (item.debit_amount || 0), 0)

    // 5. المبيعات (من الفواتير المدفوعة)
    const { data: salesData } = await supabase
      .from("invoices")
      .select("total_amount, status, invoice_date")
      .eq("company_id", companyId)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .gte("invoice_date", fromDate)
      .lte("invoice_date", toDate)
      .in("status", ["paid", "partially_paid"])

    const totalSales = (salesData || []).reduce((sum, item) => sum + (item.total_amount || 0), 0)

    // 6. تكلفة البضاعة المباعة (COGS)
    const { data: cogsData } = await supabase
      .from("journal_entry_lines")
      .select(`
        debit_amount,
        credit_amount,
        journal_entries!inner(company_id, entry_date),
        chart_of_accounts!inner(account_code)
      `)
      .eq("journal_entries.company_id", companyId)
      .eq("chart_of_accounts.account_code", "5000")
      .gte("journal_entries.entry_date", fromDate)
      .lte("journal_entries.entry_date", toDate)

    const totalCOGS = (cogsData || []).reduce((sum, item) => sum + (item.debit_amount || 0) - (item.credit_amount || 0), 0)

    // 7. حساب الأرباح
    const grossProfit = totalSales - totalCOGS
    const netProfit = grossProfit - totalExpenses

    // 8. المبيعات المعلقة (sent invoices)
    const { data: pendingSalesData } = await supabase
      .from("invoices")
      .select("total_amount")
      .eq("company_id", companyId)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .eq("status", "sent")
      .gte("invoice_date", fromDate)
      .lte("invoice_date", toDate)

    const pendingSales = (pendingSalesData || []).reduce((sum, item) => sum + (item.total_amount || 0), 0)

    return apiSuccess({
      capital: { total: totalCapital },
      purchases: { total: totalPurchases, count: purchasesData?.length || 0 },
      expenses: { total: totalExpenses, items: expensesList },
      depreciation: { total: totalDepreciation },
      sales: { total: totalSales, count: salesData?.length || 0, pending: pendingSales },
      cogs: { total: totalCOGS },
      profit: { gross: grossProfit, net: netProfit },
      period: { from: fromDate, to: toDate }
    })
  } catch (error: any) {
    console.error("Simple report error:", error)
    return internalError("حدث خطأ أثناء إنشاء التقرير", error?.message)
  }
}

