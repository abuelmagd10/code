import { Sidebar } from "@/components/sidebar"
import BankCashFilter from "@/components/BankCashFilter"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, ShoppingCart, BadgeDollarSign, FileText, Wallet, CreditCard, CalendarDays } from "lucide-react"
import DashboardCharts from "@/components/charts/DashboardCharts"
import { getActiveCompanyId } from "@/lib/company"
export const dynamic = "force-dynamic"

type BankAccount = { id: string; name: string; balance: number }


export default async function DashboardPage({ searchParams }: { searchParams?: { from?: string; to?: string; acct?: string | string[]; group?: string | string[] } | Promise<{ from?: string; to?: string; acct?: string | string[]; group?: string | string[] }> }) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    redirect("/auth/login")
  }

  // Load company using resilient resolver, prefer cookie
  const cookieStore = await cookies()
  const cookieCid = cookieStore.get('active_company_id')?.value || ''
  const companyId = cookieCid || await getActiveCompanyId(supabase)
  let company: { id: string; currency?: string } | null = null
  if (companyId) {
    const { data: c } = await supabase
      .from("companies")
      .select("id, currency")
      .eq("id", companyId)
      .maybeSingle()
    company = c ?? null
  }

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
  let assetAccountsData: Array<{ id: string; account_code?: string; account_name: string; account_type?: string; sub_type?: string }> = []
  let selectedAccountIds: string[] = []
  let selectedGroups: string[] = []
  let recentInvoices: any[] = []
  let recentBills: any[] = []
  let invoicesData: any[] = []
  let billsData: any[] = []
  let monthlyData: { month: string; revenue: number; expense: number }[] = []

  // Date filters from querystring
  const sp = await Promise.resolve(searchParams || {}) as any
  const isUrlSp = typeof (sp as any)?.get === "function"
  const readOne = (k: string) => isUrlSp ? String((sp as any).get(k) || "") : String((sp as any)?.[k] || "")
  const readAll = (k: string): string[] => {
    if (isUrlSp && typeof (sp as any).getAll === "function") return ((sp as any).getAll(k) || []).filter((x: any) => typeof x === "string")
    const v = (sp as any)?.[k]
    if (Array.isArray(v)) return (v as any[]).filter((x) => typeof x === "string")
    if (typeof v === "string" && v.length > 0) return [v]
    return []
  }
  const fromDate = readOne("from").slice(0, 10)
  const toDate = readOne("to").slice(0, 10)
  const appLang = String(readOne("lang")).toLowerCase() === 'en' ? 'en' : 'ar'
  // دوال مساعدة لالتقاط القيم لأي مفتاح يحمل نفس الأساس بعد إزالة الأقواس المشفرة
  const collectByKeyBase = (spAny: any, base: string): string[] => {
    if (typeof spAny?.getAll === "function") return (spAny.getAll(base) || []).filter((x: any) => typeof x === "string")
    const keys = Object.keys(spAny || {}).filter((k) => k.replace(/%5B%5D|\[\]/g, "") === base)
    const out: string[] = []
    for (const k of keys) {
      const v = spAny?.[k]
      if (Array.isArray(v)) out.push(...(v as any[]).filter((x) => typeof x === "string"))
      else if (typeof v === "string" && v.length > 0) out.push(v)
    }
    return out
  }

  // دعم جميع الصيغ: بدون أقواس، أقواس []، أو أقواس مشفرة
  selectedAccountIds = collectByKeyBase(sp as any, "acct")
  // اقرأ أولاً القائمة المجمّعة من group_list
  const groupListRaw = readOne("groups") || readOne("group_list")
  const selectedFromList = groupListRaw
    ? groupListRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : []
  // احتياطي: اقرأ group[]/group إذا لم توجد قائمة
  selectedGroups = selectedFromList.length > 0
    ? selectedFromList
    : collectByKeyBase(sp as any, "group")
  // وجود فلترة فعالة حتى لو القائمة فارغة (مجرّد إرسال النموذج)
  const hasGroupFilter = selectedGroups.length > 0

  if (company) {
    // Sum invoices total_amount (exclude draft/cancelled) & count within date range
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
      invoicesCount = invoices.length
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
    }

    // بناء سلسلة 12 شهراً للرسم البياني (مبيعات/مشتريات من الفواتير)
    const now = new Date()
    const months: { key: string; label: string }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const label = d.toLocaleString(appLang === 'en' ? 'en' : 'ar', { month: 'short' })
      months.push({ key, label })
    }

    const salesByMonth = new Map<string, number>()
    for (const i of invoicesData || []) {
      const key = String(i.invoice_date || "").slice(0, 7)
      if (!key) continue
      salesByMonth.set(key, (salesByMonth.get(key) || 0) + Number(i.total_amount || 0))
    }

    const purchasesByMonth = new Map<string, number>()
    for (const b of billsData || []) {
      const key = String(b.bill_date || "").slice(0, 7)
      if (!key) continue
      purchasesByMonth.set(key, (purchasesByMonth.get(key) || 0) + Number(b.total_amount || 0))
    }

    monthlyData = months.map(({ key, label }) => ({
      month: label,
      revenue: salesByMonth.get(key) || 0,
      expense: purchasesByMonth.get(key) || 0,
    }))

    // Bank & cash balances: opening_balance + sum(debits - credits)
    const { data: allAccounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, opening_balance, account_type, sub_type, parent_id")
      .eq("company_id", company.id)

    const looksCashOrBank = (a: any) => {
      const st = String(a.sub_type || "").toLowerCase()
      if (st === "cash" || st === "bank") return true
      const nm = String(a.account_name || "")
      const nmLower = nm.toLowerCase()
      if (nmLower.includes("cash") || nmLower.includes("bank")) return true
      if (/بنك|بنكي|مصرف|خزينة|نقد|صندوق/.test(nm)) return true
      return false
    }
    const parentIds = new Set((allAccounts || []).map((a: any) => a.parent_id).filter((x: any) => !!x))
    const assetAccounts = (allAccounts || []).filter((a: any) => looksCashOrBank(a) && !parentIds.has(a.id))

    const accIds = (assetAccounts || []).map((a: any) => a.id)
    assetAccountsData = (assetAccounts || []).map((a: any) => ({ id: a.id, account_code: a.account_code, account_name: a.account_name, account_type: a.account_type, sub_type: a.sub_type }))
    if (accIds.length > 0) {
      let linesQuery = supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount, journal_entries!inner(entry_date)")
        .in("account_id", accIds)
      if (fromDate) linesQuery = linesQuery.gte("journal_entries.entry_date", fromDate)
      if (toDate) linesQuery = linesQuery.lte("journal_entries.entry_date", toDate)
      const { data: lines } = await linesQuery
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
    // إظهار الرسوم إذا وُجدت فواتير/فواتير موردين أو بيانات شهرية مشتقة منهما
    hasData = (invoicesData?.length ?? 0) > 0 || (billsData?.length ?? 0) > 0 || (monthlyData?.some((d) => (d.revenue || d.expense)))
  }

  const formatNumber = (n: number) => n.toLocaleString(appLang === 'en' ? 'en' : 'ar')
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
          {!company && (
            <div className="rounded-md border bg-white dark:bg-slate-900 p-4 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">لا توجد شركة نشطة</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">لم نتمكن من تحديد الشركة. يرجى إنشاء/اختيار شركة من صفحة الإعدادات.</p>
              <a href="/settings" className="inline-block mt-3 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">الانتقال إلى الإعدادات</a>
            </div>
          )}
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{appLang==='en' ? 'Dashboard' : 'لوحة التحكم'}</h1>
            <p className="text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Welcome to the accounting management app' : 'مرحباً بك في تطبيق إدارة المحاسبة'}</p>
          </div>
          {/* Date Filters */}
          <form method="get" className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'From date' : 'من التاريخ'}</label>
              <input type="date" name="from" defaultValue={fromDate} className="w-full border rounded p-2" />
              <span className="block mt-1 text-xs text-gray-500">{appLang==='en' ? 'DD/MM/YYYY' : 'يوم/شهر/سنة'}</span>
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'To date' : 'إلى التاريخ'}</label>
              <input type="date" name="to" defaultValue={toDate} className="w-full border rounded p-2" />
              <span className="block mt-1 text-xs text-gray-500">{appLang==='en' ? 'DD/MM/YYYY' : 'يوم/شهر/سنة'}</span>
            </div>
            <input type="hidden" name="lang" value={appLang} />
            <div>
              <button type="submit" className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">{appLang==='en' ? 'Apply Filters' : 'تطبيق الفلاتر'}</button>
            </div>
          </form>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  {appLang==='en' ? 'Total Sales' : 'إجمالي المبيعات'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(totalSales)} {currency}</div>
                <p className="text-xs text-gray-500 mt-1">{hasData ? '' : (appLang==='en' ? 'No data yet' : 'لا توجد بيانات بعد')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <ShoppingCart className="h-4 w-4 text-emerald-600" />
                  {appLang==='en' ? 'Total Purchases' : 'إجمالي المشتريات'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(totalPurchases)} {currency}</div>
                <p className="text-xs text-gray-500 mt-1">{hasData ? '' : (appLang==='en' ? 'No data yet' : 'لا توجد بيانات بعد')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <BadgeDollarSign className="h-4 w-4 text-amber-600" />
                  {appLang==='en' ? 'Expected Profit' : 'الأرباح المتوقعة'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(expectedProfit)} {currency}</div>
                <p className="text-xs text-gray-500 mt-1">{hasData ? '' : (appLang==='en' ? 'No data yet' : 'لا توجد بيانات بعد')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <FileText className="h-4 w-4 text-violet-600" />
                  {appLang==='en' ? 'Invoices Count' : 'عدد الفواتير'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(invoicesCount)}</div>
                <p className="text-xs text-gray-500 mt-1">{invoicesCount > 0 ? '' : (appLang==='en' ? 'No invoices yet' : 'لا توجد فواتير بعد')}</p>
              </CardContent>
            </Card>
          </div>

          {/* Receivables / Payables / This Month */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <Wallet className="h-4 w-4 text-blue-600" />
                  {appLang==='en' ? 'Receivables Outstanding' : 'ذمم مدينة مستحقة'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{formatNumber(receivablesOutstanding)} {currency}</div>
                <p className="text-xs text-gray-500 mt-1">{appLang==='en' ? 'Total unpaid from customer invoices' : 'إجمالي غير المسدد من فواتير العملاء'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <CreditCard className="h-4 w-4 text-red-600" />
                  {appLang==='en' ? 'Payables Outstanding' : 'ذمم دائنة مستحقة'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{formatNumber(payablesOutstanding)} {currency}</div>
                <p className="text-xs text-gray-500 mt-1">{appLang==='en' ? 'Total unpaid from supplier bills' : 'إجمالي غير المسدد من فواتير الموردين'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <CalendarDays className="h-4 w-4" />
                  {appLang==='en' ? 'Income This Month' : 'دخل هذا الشهر'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(incomeThisMonth)} {currency}</div>
                <p className="text-xs text-gray-500 mt-1">{appLang==='en' ? 'Current month sales' : 'مبيعات الشهر الحالي'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <CalendarDays className="h-4 w-4" />
                  {appLang==='en' ? 'Expense This Month' : 'مصروف هذا الشهر'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(expenseThisMonth)} {currency}</div>
                <p className="text-xs text-gray-500 mt-1">{appLang==='en' ? 'Current month purchases' : 'مشتريات الشهر الحالي'}</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          {hasData ? (
            <DashboardCharts monthlyData={monthlyData} appLang={appLang} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{appLang==='en' ? 'Charts' : 'الرسوم البيانية'}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'No data to display charts yet.' : 'لا توجد بيانات لعرض الرسوم حالياً.'}</p>
              </CardContent>
            </Card>
          )}

          {/* Bank & Cash Accounts & Recent items */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>{appLang==='en' ? 'Cash & Bank Balances' : 'أرصدة النقد والبنك'}</CardTitle>
              </CardHeader>
              <CardContent>
                {bankAccounts.length > 0 ? (
                  <div className="space-y-4">
                      <details className="rounded-md border border-gray-200 dark:border-gray-800">
                        <summary className="cursor-pointer px-3 py-2 text-sm font-medium bg-gray-50 dark:bg-gray-800">{appLang==='en' ? 'Select accounts to display' : 'اختر الحسابات المراد إظهارها'}</summary>
                        <div className="p-3">
                        <BankCashFilter fromDate={fromDate} toDate={toDate} selectedAccountIds={selectedAccountIds} accounts={assetAccountsData as any} />
                        </div>
                      </details>
                    {(() => {
                      const nameIncludes = (s: string | undefined, q: string) => String(s || "").toLowerCase().includes(q.toLowerCase())
                      const rawById = new Map(assetAccountsData.map((a) => [a.id, a]))
                      const matchesGroup = (accId: string): boolean => {
                        const acc = rawById.get(accId)
                        if (!acc) return true
                        if (selectedAccountIds.length > 0) return selectedAccountIds.includes(accId)
                        if (selectedGroups.length === 0) return true
                        const isBank = String(acc.sub_type || "").toLowerCase() === "bank"
                        const isCash = String(acc.sub_type || "").toLowerCase() === "cash"
                        const isMainCash = isCash && (nameIncludes(acc.account_name, "الخزينة") || nameIncludes(acc.account_name, "نقد بالصندوق") || nameIncludes(acc.account_name, "main cash") || nameIncludes(acc.account_name, "cash in hand"))
                        const isMainBank = isBank && (nameIncludes(acc.account_name, "رئيسي") || nameIncludes(acc.account_name, "main"))
                        const isPetty = isCash && (nameIncludes(acc.account_name, "المبالغ الصغيرة") || nameIncludes(acc.account_name, "petty"))
                        const isUndep = (nameIncludes(acc.account_name, "غير مودعة") || nameIncludes(acc.account_name, "undeposited"))
                        const isShipWallet = (nameIncludes(acc.account_name, "بوسطة") || nameIncludes(acc.account_name, "byosta") || nameIncludes(acc.account_name, "الشحن") || nameIncludes(acc.account_name, "shipping"))
                        const isOrdinaryCash = isCash && !isMainCash && !isPetty && !isUndep
                        const selected = selectedGroups
                        // اجعل فئة "حساب بنكي" لا تشمل الحسابات الخاصة (رئيسي وبوسطة)
                        const isOrdinaryBank = isBank && !isMainBank && !isShipWallet
                        return (
                          (selected.includes("bank") && isOrdinaryBank) ||
                          (selected.includes("main_bank") && isMainBank) ||
                          (selected.includes("main_cash") && isMainCash) ||
                          (selected.includes("petty") && isPetty) ||
                          (selected.includes("undeposited") && isUndep) ||
                          (selected.includes("shipping_wallet") && isShipWallet) ||
                          (selected.includes("cash") && isOrdinaryCash)
                        )
                      }
                      const list = bankAccounts.filter((a) => matchesGroup(a.id))
                      return (
                        <div className="space-y-2">
                          {list.length > 0 ? (
                            <>
                              {list.map((a) => (
                                <div key={a.id} className="flex items-center justify-between text-sm">
                                  {(() => {
                                    const acc = rawById.get(a.id)
                                    const label = [acc?.account_code || "", acc?.account_name || a.name].filter(Boolean).join(" - ")
                                    return <span className="text-gray-700 dark:text-gray-300">{label}</span>
                                  })()}
                                  <span className="font-semibold">{formatNumber(a.balance)} {currency}</span>
                                </div>
                              ))}
                              {(() => {
                                const total = list.reduce((sum, a) => sum + Number(a.balance || 0), 0)
                                return (
                                  <div className="flex items-center justify-between text-sm border-t pt-2 mt-2">
                                    <span className="text-gray-700 dark:text-gray-300">{appLang==='en' ? 'Total' : 'المجموع'}</span>
                                    <span className="font-bold">{formatNumber(total)} {currency}</span>
                                  </div>
                                )
                              })()}
                            </>
                          ) : (
                            <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'No accounts match the selection.' : 'لا توجد حسابات مطابقة للاختيار.'}</p>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'No cash/bank accounts yet.' : 'لا توجد حسابات نقد/بنك بعد.'}</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>{appLang==='en' ? 'Invoices' : 'الفواتير'}</CardTitle>
              </CardHeader>
              <CardContent>
                {(invoicesData || []).length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {invoicesData.sort((a: any, b: any) => String(b.invoice_date || "").localeCompare(String(a.invoice_date || ""))).map((i: any) => {
                      const name = i.customer_id ? (customerNames[i.customer_id] || "") : ""
                      const label = i.invoice_number || i.id
                      return (
                        <div key={i.id} className="flex items-center justify-between text-sm">
                          <div className="flex flex-col">
                            <a href={`/invoices/${i.id}`} className="text-blue-600 hover:underline">{label}</a>
                            <span className="text-xs text-gray-500">{name} • {String(i.invoice_date || "").slice(0, 10)} • {String(i.status || (appLang==='en' ? 'draft' : 'مسودة'))}</span>
                          </div>
                          <span className="font-semibold">{formatNumber(Number(i.total_amount || 0))} {currency}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'No invoices.' : 'لا توجد فواتير.'}</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>{appLang==='en' ? 'Purchases' : 'المشتريات'}</CardTitle>
              </CardHeader>
              <CardContent>
                {(billsData || []).length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {billsData.sort((a: any, b: any) => String(b.bill_date || "").localeCompare(String(a.bill_date || ""))).map((b: any) => {
                      const name = b.supplier_id ? (supplierNames[b.supplier_id] || "") : ""
                      const label = b.bill_number || b.id
                      return (
                        <div key={b.id} className="flex items-center justify-between text-sm">
                          <div className="flex flex-col">
                            <a href={`/bills/${b.id}`} className="text-blue-600 hover:underline">{label}</a>
                            <span className="text-xs text-gray-500">{name} • {String(b.bill_date || "").slice(0, 10)} • {String(b.status || (appLang==='en' ? 'draft' : 'مسودة'))}</span>
                          </div>
                          <span className="font-semibold">{formatNumber(Number(b.total_amount || 0))} {currency}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'No purchases.' : 'لا توجد مشتريات.'}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
