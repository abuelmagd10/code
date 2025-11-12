import { Sidebar } from "@/components/sidebar"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, ShoppingCart, BadgeDollarSign, FileText, Wallet, CreditCard, CalendarDays } from "lucide-react"
import DashboardCharts from "@/components/charts/DashboardCharts"
export const dynamic = "force-dynamic"

type BankAccount = { id: string; name: string; balance: number }


export default async function DashboardPage({ searchParams }: { searchParams?: { from?: string; to?: string } }) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    redirect("/auth/login")
  }

  // Load company
  const { data: company } = await supabase
    .from("companies")
    .select("id, currency")
    .eq("user_id", data.user.id)
    .single()

  // Default stats
  let totalSales = 0
  let totalPurchases = 0
  let expectedProfit = 0
  let invoicesCount = 0
  let hasData = false

  // Zoho-like KPIs
  let receivablesOutstanding = 0
  let payablesOutstanding = 0
  let incomeThisMonth = 0
  let expenseThisMonth = 0
  let bankAccounts: BankAccount[] = []
  let recentInvoices: any[] = []
  let recentBills: any[] = []
  let invoicesData: any[] = []
  let billsData: any[] = []
  let monthlyData: { month: string; revenue: number; expense: number }[] = []
  // دفعات لاستخدام أساس نقدي في الرسم البياني الشهري
  let customerPayments: { payment_date: string; amount: number }[] = []
  let supplierPayments: { payment_date: string; amount: number }[] = []

  // Date filters from querystring
  const fromDate = String(searchParams?.from || "").slice(0, 10)
  const toDate = String(searchParams?.to || "").slice(0, 10)

  if (company) {
    // Invoices count
    const { count: invCount } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)

    invoicesCount = invCount ?? 0

    // Sum invoices total_amount (exclude draft/cancelled)
    let invQuery = supabase
      .from("invoices")
      .select("id, customer_id, invoice_number, total_amount, paid_amount, invoice_date, status")
      .eq("company_id", company.id)
      .in("status", ["sent", "partially_paid", "paid"]) 
    if (fromDate) invQuery = invQuery.gte("invoice_date", fromDate)
    if (toDate) invQuery = invQuery.lte("invoice_date", toDate)
    const { data: invoices } = await invQuery

    if (invoices && invoices.length > 0) {
      invoicesData = invoices
      totalSales = invoices.reduce((sum, i) => sum + Number(i.total_amount ?? 0), 0)
      // Receivables outstanding (not fully paid & not cancelled)
      receivablesOutstanding = invoices
        .filter((i: any) => !["paid", "cancelled"].includes(String(i.status || "").toLowerCase()))
        .reduce((sum, i: any) => sum + Math.max(Number(i.total_amount || 0) - Number(i.paid_amount || 0), 0), 0)
      // Income for current month
      const now = new Date()
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      incomeThisMonth = invoices
        .filter((i: any) => String(i.invoice_date || "").startsWith(ym))
        .reduce((sum, i: any) => sum + Number(i.total_amount || 0), 0)
      // Recent invoices
      recentInvoices = [...invoices]
        .sort((a: any, b: any) => String(b.invoice_date || "").localeCompare(String(a.invoice_date || "")))
        .slice(0, 5)
    }

    // Sum purchases from supplier bills (exclude draft/cancelled)
    let billsPurchasesQuery = supabase
      .from("bills")
      .select("total_amount, status, bill_date")
      .eq("company_id", company.id)
      .in("status", ["sent", "partially_paid", "paid"]) 
    if (fromDate) billsPurchasesQuery = billsPurchasesQuery.gte("bill_date", fromDate)
    if (toDate) billsPurchasesQuery = billsPurchasesQuery.lte("bill_date", toDate)
    const { data: billsForPurchases } = await billsPurchasesQuery

    if (billsForPurchases && billsForPurchases.length > 0) {
      totalPurchases = billsForPurchases.reduce((sum, b) => sum + Number(b.total_amount ?? 0), 0)
    }

    // Bills totals and payables outstanding
    let billsQuery = supabase
      .from("bills")
      .select("id, supplier_id, bill_number, total_amount, paid_amount, bill_date, status")
      .eq("company_id", company.id)
      .in("status", ["sent", "partially_paid", "paid"]) // exclude draft/cancelled/voided from dashboard metrics
    if (fromDate) billsQuery = billsQuery.gte("bill_date", fromDate)
    if (toDate) billsQuery = billsQuery.lte("bill_date", toDate)
    const { data: bills } = await billsQuery

    if (bills && bills.length > 0) {
      billsData = bills
      // Payables outstanding (not fully paid & not cancelled)
      payablesOutstanding = bills
        .filter((b: any) => !["paid", "cancelled", "voided"].includes(String(b.status || "").toLowerCase()))
        .reduce((sum, b: any) => sum + Math.max(Number(b.total_amount || 0) - Number(b.paid_amount || 0), 0), 0)
      // Expense for current month
      const now = new Date()
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      expenseThisMonth = bills
        .filter((b: any) => String(b.bill_date || "").startsWith(ym) && !["draft", "cancelled", "voided"].includes(String(b.status || "").toLowerCase()))
        .reduce((sum, b: any) => sum + Number(b.total_amount || 0), 0)
      // Recent bills
      recentBills = [...bills]
        .sort((a: any, b: any) => String(b.bill_date || "").localeCompare(String(a.bill_date || "")))
        .slice(0, 5)
    }

    // تحميل دفعات العملاء (تحصيلات نقدية) ودفعات الموردين (مدفوعات نقدية) للفترة المحددة
    {
      let custPaysQuery = supabase
        .from("payments")
        .select("payment_date, amount")
        .eq("company_id", company.id)
        .not("customer_id", "is", null)
      if (fromDate) custPaysQuery = custPaysQuery.gte("payment_date", fromDate)
      if (toDate) custPaysQuery = custPaysQuery.lte("payment_date", toDate)
      const { data: custPays } = await custPaysQuery
      customerPayments = custPays || []

      let suppPaysQuery = supabase
        .from("payments")
        .select("payment_date, amount")
        .eq("company_id", company.id)
        .not("supplier_id", "is", null)
      if (fromDate) suppPaysQuery = suppPaysQuery.gte("payment_date", fromDate)
      if (toDate) suppPaysQuery = suppPaysQuery.lte("payment_date", toDate)
      const { data: suppPays } = await suppPaysQuery
      supplierPayments = suppPays || []
    }

    // Bank & cash balances: opening_balance + sum(debits - credits)
    const { data: assetAccounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_name, opening_balance, account_type, sub_type")
      .eq("company_id", company.id)
      .in("sub_type", ["cash", "bank"])

    const accIds = (assetAccounts || []).map((a: any) => a.id)
    if (accIds.length > 0) {
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount")
        .in("account_id", accIds)
      const balanceMap = new Map<string, number>()
      for (const a of assetAccounts || []) {
        balanceMap.set(a.id, Number(a.opening_balance || 0))
      }
      for (const l of lines || []) {
        const prev = balanceMap.get(l.account_id) || 0
        balanceMap.set(l.account_id, prev + Number(l.debit_amount || 0) - Number(l.credit_amount || 0))
      }
      bankAccounts = (assetAccounts || []).map((a: any) => ({ id: a.id, name: a.account_name, balance: balanceMap.get(a.id) || 0 }))
    }

    expectedProfit = totalSales - totalPurchases
    // Build 12-month series for charts (cash-basis by payments)
    const now = new Date()
    const months: { key: string; label: string }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const label = d.toLocaleString("ar", { month: "short" })
      months.push({ key, label })
    }

    // Cash-basis aggregation using payment_date
    const custPayByMonth = new Map<string, number>()
    for (const p of customerPayments || []) {
      const key = String(p.payment_date || "").slice(0, 7)
      custPayByMonth.set(key, (custPayByMonth.get(key) || 0) + Number(p.amount || 0))
    }

    const suppPayByMonth = new Map<string, number>()
    for (const p of supplierPayments || []) {
      const key = String(p.payment_date || "").slice(0, 7)
      suppPayByMonth.set(key, (suppPayByMonth.get(key) || 0) + Number(p.amount || 0))
    }

    monthlyData = months.map(({ key, label }) => ({
      month: label,
      revenue: custPayByMonth.get(key) || 0,
      expense: suppPayByMonth.get(key) || 0,
    }))
    // Consider presence of invoices/bills/payments for charts and KPIs visibility
    hasData = (invoicesData?.length ?? 0) > 0 || (billsData?.length ?? 0) > 0 || (customerPayments?.length ?? 0) > 0 || (supplierPayments?.length ?? 0) > 0
  }

  const formatNumber = (n: number) => n.toLocaleString("ar")
  const currency = company?.currency || "USD"

  // Names lookup for recent lists
  let customerNames: Record<string, string> = {}
  let supplierNames: Record<string, string> = {}
  if (company) {
    const uniqueCustomerIds = Array.from(new Set((recentInvoices || []).map((i: any) => i.customer_id).filter(Boolean)))
    if (uniqueCustomerIds.length > 0) {
      const { data: custs } = await supabase
        .from("customers")
        .select("id, name")
        .eq("company_id", company.id)
        .in("id", uniqueCustomerIds)
      ;(custs || []).forEach((c: any) => { customerNames[c.id] = c.name })
    }
    const uniqueSupplierIds = Array.from(new Set((recentBills || []).map((b: any) => b.supplier_id).filter(Boolean)))
    if (uniqueSupplierIds.length > 0) {
      const { data: supps } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", company.id)
        .in("id", uniqueSupplierIds)
      ;(supps || []).forEach((s: any) => { supplierNames[s.id] = s.name })
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">لوحة التحكم</h1>
            <p className="text-gray-600 dark:text-gray-400">مرحباً بك في تطبيق إدارة المحاسبة</p>
          </div>
          {/* Date Filters */}
          <form method="get" className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400">من التاريخ</label>
              <input type="date" name="from" defaultValue={fromDate} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400">إلى التاريخ</label>
              <input type="date" name="to" defaultValue={toDate} className="w-full border rounded p-2" />
            </div>
            <div>
              <button type="submit" className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">تطبيق الفلاتر</button>
            </div>
          </form>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  إجمالي المبيعات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(totalSales)} {currency}</div>
                <p className="text-xs text-gray-500 mt-1">{hasData ? "" : "لا توجد بيانات بعد"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <ShoppingCart className="h-4 w-4 text-emerald-600" />
                  إجمالي المشتريات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(totalPurchases)} {currency}</div>
                <p className="text-xs text-gray-500 mt-1">{hasData ? "" : "لا توجد بيانات بعد"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <BadgeDollarSign className="h-4 w-4 text-amber-600" />
                  الأرباح المتوقعة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(expectedProfit)} {currency}</div>
                <p className="text-xs text-gray-500 mt-1">{hasData ? "" : "لا توجد بيانات بعد"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <FileText className="h-4 w-4 text-violet-600" />
                  عدد الفواتير
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(invoicesCount)}</div>
                <p className="text-xs text-gray-500 mt-1">{invoicesCount > 0 ? "" : "لا توجد فواتير بعد"}</p>
              </CardContent>
            </Card>
          </div>

          {/* Receivables / Payables / This Month */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <Wallet className="h-4 w-4 text-blue-600" />
                  ذمم مدينة مستحقة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{formatNumber(receivablesOutstanding)} {currency}</div>
                <p className="text-xs text-gray-500 mt-1">إجمالي غير المسدد من فواتير العملاء</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <CreditCard className="h-4 w-4 text-red-600" />
                  ذمم دائنة مستحقة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{formatNumber(payablesOutstanding)} {currency}</div>
                <p className="text-xs text-gray-500 mt-1">إجمالي غير المسدد من فواتير الموردين</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <CalendarDays className="h-4 w-4" />
                  دخل هذا الشهر
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(incomeThisMonth)} {currency}</div>
                <p className="text-xs text-gray-500 mt-1">مبيعات الشهر الحالي</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <CalendarDays className="h-4 w-4" />
                  مصروف هذا الشهر
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(expenseThisMonth)} {currency}</div>
                <p className="text-xs text-gray-500 mt-1">مشتريات الشهر الحالي</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          {hasData ? (
            <DashboardCharts monthlyData={monthlyData} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>الرسوم البيانية</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-400">لا توجد بيانات لعرض الرسوم حالياً.</p>
              </CardContent>
            </Card>
          )}

          {/* Bank & Cash Accounts & Recent items */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>أرصدة النقد والبنك</CardTitle>
              </CardHeader>
              <CardContent>
                {bankAccounts.length > 0 ? (
                  <div className="space-y-2">
                    {bankAccounts.slice(0, 5).map((a) => (
                      <div key={a.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">{a.name}</span>
                        <span className="font-semibold">{formatNumber(a.balance)} {currency}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">لا توجد حسابات نقد/بنك بعد.</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>أحدث الفواتير</CardTitle>
              </CardHeader>
              <CardContent>
                {recentInvoices.length > 0 ? (
                  <div className="space-y-2">
                    {recentInvoices.map((i: any, idx: number) => {
                      const name = i.customer_id ? (customerNames[i.customer_id] || "") : ""
                      return (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <div className="flex flex-col">
                            <span className="text-gray-700 dark:text-gray-300">{i.invoice_number || i.id}</span>
                            <span className="text-xs text-gray-500">{name} • {String(i.invoice_date || "").slice(0, 10)} • {String(i.status || "مسودة")}</span>
                          </div>
                          <span className="font-semibold">{formatNumber(Number(i.total_amount || 0))} {currency}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">لا توجد فواتير حديثة.</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>أحدث المشتريات</CardTitle>
              </CardHeader>
              <CardContent>
                {recentBills.length > 0 ? (
                  <div className="space-y-2">
                    {recentBills.map((b: any, idx: number) => {
                      const name = b.supplier_id ? (supplierNames[b.supplier_id] || "") : ""
                      return (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <div className="flex flex-col">
                            <span className="text-gray-700 dark:text-gray-300">{b.bill_number || b.id}</span>
                            <span className="text-xs text-gray-500">{name} • {String(b.bill_date || "").slice(0, 10)} • {String(b.status || "مسودة")}</span>
                          </div>
                          <span className="font-semibold">{formatNumber(Number(b.total_amount || 0))} {currency}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">لا توجد مشتريات حديثة.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
