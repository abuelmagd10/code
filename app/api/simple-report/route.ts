import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError } from "@/lib/api-security-enhanced"
import { NextRequest, NextResponse } from "next/server"
import { badRequestError, apiSuccess } from "@/lib/api-error-handler"

export async function GET(request: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان
    const { user, companyId, branchId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
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
    // ✅ لا نحتاج التحقق من branchId لأن التقرير يعرض بيانات الشركة كاملة

    const { searchParams } = new URL(request.url)
    const fromDate = searchParams.get("from") || "2000-01-01"
    const toDate = searchParams.get("to") || new Date().toISOString().split("T")[0]

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

    const { data: purchasesData } = await supabase
      .from("bills")
      .select("total_amount, status, bill_date")
      .eq("company_id", companyId)
      .gte("bill_date", fromDate)
      .lte("bill_date", toDate)
      .in("status", ["sent", "partially_paid", "paid"])

    const totalPurchases = (purchasesData || []).reduce((sum, item) => sum + (item.total_amount || 0), 0)

    // ✅ استثناء COGS من المصروفات التشغيلية
    // COGS يُحسب بشكل منفصل ولا يجب أن يظهر ضمن المصروفات
    const { data: expensesData } = await supabase
      .from("journal_entry_lines")
      .select(`
        debit_amount,
        credit_amount,
        chart_of_accounts!inner(account_type, account_code, account_name, sub_type),
        journal_entries!inner(company_id, entry_date, reference_type)
      `)
      .eq("journal_entries.company_id", companyId)
      .eq("chart_of_accounts.account_type", "expense")
      .gte("journal_entries.entry_date", fromDate)
      .lte("journal_entries.entry_date", toDate)

    const expensesByAccount: { [key: string]: { name: string; amount: number } } = {}
      ; (expensesData || []).forEach((item: any) => {
        const coa = item.chart_of_accounts
        const subType = coa?.sub_type || ""

        // ✅ استثناء COGS (account_code = 5000 أو sub_type = cogs/cost_of_goods_sold)
        // COGS يُحسب بشكل منفصل في قسم تكلفة البضاعة المباعة
        if (coa?.account_code === "5000" || subType === "cogs" || subType === "cost_of_goods_sold") {
          return // تجاهل COGS
        }

        const accountName = coa?.account_name || "أخرى"
        const accountCode = coa?.account_code || "0000"
        const key = accountCode
        if (!expensesByAccount[key]) {
          expensesByAccount[key] = { name: accountName, amount: 0 }
        }
        expensesByAccount[key].amount += (item.debit_amount || 0) - (item.credit_amount || 0)
      })

    const expensesList = Object.values(expensesByAccount).filter(e => e.amount > 0)
    const totalExpenses = expensesList.reduce((sum, e) => sum + e.amount, 0)

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

    const { data: salesData } = await supabase
      .from("invoices")
      .select("total_amount, status, invoice_date")
      .eq("company_id", companyId)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .gte("invoice_date", fromDate)
      .lte("invoice_date", toDate)
      .in("status", ["paid", "partially_paid"])

    const totalSales = (salesData || []).reduce((sum, item) => sum + (item.total_amount || 0), 0)

    // ✅ ERP Professional: حساب COGS من cogs_transactions (المصدر الوحيد للحقيقة)
    // 📌 يمنع استخدام products.cost_price أو journal_entry_lines في التقارير الرسمية
    // 📌 FIFO Engine هو الجهة الوحيدة المخولة بتحديد unit_cost
    // 📌 COGS = SUM(total_cost) FROM cogs_transactions WHERE source_type = 'invoice'
    let totalCOGS = 0

    try {
      const { calculateCOGSTotal } = await import("@/lib/cogs-transactions")
      totalCOGS = await calculateCOGSTotal(supabase, {
        companyId,
        fromDate,
        toDate,
        sourceType: 'invoice'
      })
      
      // Fallback: إذا لم توجد سجلات COGS (للتوافق مع البيانات القديمة)
      if (totalCOGS === 0) {
        console.warn("⚠️ No COGS transactions found in simple-report, falling back to journal_entry_lines (deprecated)")
        const { data: cogsData } = await supabase
          .from("journal_entry_lines")
          .select(`
            debit_amount,
            credit_amount,
            journal_entries!inner(company_id, entry_date),
            chart_of_accounts!inner(account_code, sub_type)
          `)
          .eq("journal_entries.company_id", companyId)
          .gte("journal_entries.entry_date", fromDate)
          .lte("journal_entries.entry_date", toDate)

        totalCOGS = (cogsData || [])
          .filter((item: any) => {
            const coa = item.chart_of_accounts
            return coa?.account_code === "5000" || coa?.sub_type === "cost_of_goods_sold" || coa?.sub_type === "cogs"
          })
          .reduce((sum, item) => sum + (item.debit_amount || 0) - (item.credit_amount || 0), 0)
      }
    } catch (error: any) {
      console.error("Error calculating COGS in simple-report:", error)
      // Fallback to journal_entry_lines in case of error
      const { data: cogsData } = await supabase
        .from("journal_entry_lines")
        .select(`
          debit_amount,
          credit_amount,
          journal_entries!inner(company_id, entry_date),
          chart_of_accounts!inner(account_code, sub_type)
        `)
        .eq("journal_entries.company_id", companyId)
        .gte("journal_entries.entry_date", fromDate)
        .lte("journal_entries.entry_date", toDate)

      totalCOGS = (cogsData || [])
        .filter((item: any) => {
          const coa = item.chart_of_accounts
          return coa?.account_code === "5000" || coa?.sub_type === "cost_of_goods_sold" || coa?.sub_type === "cogs"
        })
        .reduce((sum, item) => sum + (item.debit_amount || 0) - (item.credit_amount || 0), 0)
    }

    const grossProfit = totalSales - totalCOGS
    const netProfit = grossProfit - totalExpenses

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
    return serverError(`حدث خطأ أثناء إنشاء التقرير: ${error?.message}`)
  }
}