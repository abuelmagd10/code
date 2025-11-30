import { Sidebar } from "@/components/sidebar"
import BankCashFilter from "@/components/BankCashFilter"
import { createClient } from "@/lib/supabase/server"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, ShoppingCart, BadgeDollarSign, FileText, Wallet, CreditCard, CalendarDays, LayoutDashboard, ArrowUpRight, ArrowDownRight, Banknote, Receipt, Clock, Building2, Filter, Search } from "lucide-react"
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
  const cookieCurrency = cookieStore.get('app_currency')?.value || 'EGP'
  const sp = await Promise.resolve(searchParams || {}) as any
  const isUrlSp = typeof (sp as any)?.get === "function"
  const readOne = (k: string) => isUrlSp ? String((sp as any).get(k) || "") : String((sp as any)?.[k] || "")
  const cidParam = readOne("cid")
  const companyId = cidParam || cookieCid || await getActiveCompanyId(supabase)
  let company: { id: string; currency?: string } | null = null
  if (companyId) {
    company = { id: companyId, currency: cookieCurrency }
    const { data: c } = await supabase
      .from("companies")
      .select("id, currency")
      .eq("id", companyId)
      .maybeSingle()
    if (c?.id) company = { id: c.id, currency: c.currency || cookieCurrency }
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
  let incomeChangePct = 0
  let expenseChangePct = 0
  let profitChangePct = 0

  // Date filters from querystring
  
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

    const prevKey = months.length > 1 ? months[months.length - 2].key : ""
    const curKey = months.length > 0 ? months[months.length - 1].key : ""
    const incomePrev = prevKey ? (salesByMonth.get(prevKey) || 0) : 0
    const expensePrev = prevKey ? (purchasesByMonth.get(prevKey) || 0) : 0
    const incomeCur = curKey ? (salesByMonth.get(curKey) || 0) : 0
    const expenseCur = curKey ? (purchasesByMonth.get(curKey) || 0) : 0
    incomeChangePct = incomePrev === 0 ? (incomeCur > 0 ? 100 : 0) : ((incomeCur - incomePrev) / Math.abs(incomePrev)) * 100
    expenseChangePct = expensePrev === 0 ? (expenseCur > 0 ? 100 : 0) : ((expenseCur - expensePrev) / Math.abs(expensePrev)) * 100
    const profitPrev = incomePrev - expensePrev
    const profitCur = incomeCur - expenseCur
    profitChangePct = profitPrev === 0 ? (profitCur > 0 ? 100 : 0) : ((profitCur - profitPrev) / Math.abs(profitPrev)) * 100

    // Bank & cash balances: opening_balance + sum(debits - credits)
    let allAccounts: any[] = []
    try {
      const headerStore = await headers()
      const cookieHeader = headerStore.get('cookie') || ''
      const myCompanyRes = await fetch(`/api/my-company`, { headers: { cookie: cookieHeader } })
      if (myCompanyRes.ok) {
        const myc = await myCompanyRes.json()
        allAccounts = Array.isArray(myc?.accounts) ? myc.accounts : []
      }
    } catch {}
    if (allAccounts.length === 0) {
      const { data: fallbackAccounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, opening_balance, account_type, sub_type, parent_id")
        .eq("company_id", company.id)
      allAccounts = fallbackAccounts || []
    }

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
    const balanceMap = new Map<string, number>()
    for (const a of assetAccounts || []) balanceMap.set(a.id, Number(a.opening_balance || 0))
    let filledViaService = false
    if (accIds.length > 0) {
      try {
        const headerStore = await headers()
        const cookieHeader = headerStore.get('cookie') || ''
        const asOf = toDate || new Date().toISOString().slice(0,10)
        const balRes = await fetch(`/api/account-balances?companyId=${encodeURIComponent(company.id)}&asOf=${encodeURIComponent(asOf)}`, { headers: { cookie: cookieHeader } })
        if (balRes.ok) {
          const balRows = await balRes.json()
          for (const r of (Array.isArray(balRows) ? balRows : [])) {
            const id = String((r as any).account_id)
            const prev = balanceMap.get(id) || 0
            balanceMap.set(id, prev + Number((r as any).balance || 0))
          }
          filledViaService = true
        }
      } catch {}
      if (!filledViaService) {
        let linesQuery = supabase
          .from("journal_entry_lines")
          .select("account_id, debit_amount, credit_amount, journal_entries!inner(entry_date)")
          .in("account_id", accIds)
        if (fromDate) linesQuery = linesQuery.gte("journal_entries.entry_date", fromDate)
        if (toDate) linesQuery = linesQuery.lte("journal_entries.entry_date", toDate)
        const { data: lines } = await linesQuery
        for (const l of lines || []) {
          const prev = balanceMap.get(l.account_id) || 0
          balanceMap.set(l.account_id, prev + Number(l.debit_amount || 0) - Number(l.credit_amount || 0))
        }
      }
    }
    bankAccounts = (assetAccounts || []).map((a: any) => ({ id: a.id, name: a.account_name, balance: balanceMap.get(a.id) || 0 }))

    expectedProfit = totalSales - totalPurchases
    // إظهار الرسوم إذا وُجدت فواتير/فواتير موردين أو بيانات شهرية مشتقة منهما
    hasData = (invoicesData?.length ?? 0) > 0 || (billsData?.length ?? 0) > 0 || (monthlyData?.some((d) => (d.revenue || d.expense)))
  }

  const formatNumber = (n: number) => n.toLocaleString(appLang === 'en' ? 'en' : 'ar')
  const currencyCode = company?.currency || cookieCurrency || "EGP"
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currency = currencySymbols[currencyCode] || currencyCode

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
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          {!companyId && (
            <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/50 dark:border-amber-800 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                  <Building2 className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-200">لا توجد شركة نشطة</h2>
                  <p className="text-sm text-amber-700 dark:text-amber-300">لم نتمكن من تحديد الشركة. يرجى إنشاء/اختيار شركة من صفحة الإعدادات.</p>
                </div>
              </div>
              <a href="/settings" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors shadow-lg shadow-amber-600/20">
                <ArrowUpRight className="w-4 h-4" />
                الانتقال إلى الإعدادات
              </a>
            </div>
          )}

          {/* رأس الصفحة */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/20">
                  <LayoutDashboard className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                    {appLang==='en' ? 'Dashboard' : 'لوحة التحكم'}
                  </h1>
                  <p className="text-gray-500 dark:text-gray-400 mt-1">
                    {appLang==='en' ? 'Overview of your business performance' : 'نظرة عامة على أداء أعمالك'}
                  </p>
                </div>
              </div>
              {company && (
                <Badge variant="outline" className="gap-2 px-3 py-1.5 bg-gray-50 dark:bg-slate-800">
                  <Building2 className="w-4 h-4" />
                  {appLang==='en' ? `Currency: ${company.currency || 'EGP'}` : `العملة: ${company.currency || 'EGP'}`}
                </Badge>
              )}
            </div>
          </div>

          {/* فلاتر التاريخ */}
          <form method="get" className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex items-center gap-2 text-gray-500">
                <Filter className="w-4 h-4" />
                <span className="text-sm font-medium">{appLang==='en' ? 'Filters:' : 'الفلاتر:'}</span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-gray-400" />
                <div>
                  <label className="text-xs text-gray-500 block mb-1">{appLang==='en' ? 'From' : 'من'}</label>
                  <input type="date" name="from" defaultValue={fromDate} className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <span className="text-gray-400 mt-4">-</span>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">{appLang==='en' ? 'To' : 'إلى'}</label>
                  <input type="date" name="to" defaultValue={toDate} className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
              <input type="hidden" name="lang" value={appLang} />
              <button type="submit" className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2">
                <Search className="w-4 h-4" />
                {appLang==='en' ? 'Apply' : 'تطبيق'}
              </button>
            </div>
          </form>

          {/* بطاقات الإحصائيات الرئيسية */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* إجمالي المبيعات */}
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full" />
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {appLang==='en' ? 'Total Sales' : 'إجمالي المبيعات'}
                    </p>
                    <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mt-2">{formatNumber(totalSales)}</p>
                    <p className="text-xs text-gray-400 mt-1">{currency}</p>
                  </div>
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                    <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-3">
                  {incomeChangePct >= 0 ? (
                    <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 text-red-500" />
                  )}
                  <span className={`text-sm font-medium ${incomeChangePct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {incomeChangePct >= 0 ? '+' : ''}{incomeChangePct.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-400">{appLang==='en' ? 'vs last month' : 'عن الشهر الماضي'}</span>
                </div>
              </CardContent>
            </Card>

            {/* إجمالي المشتريات */}
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-transparent rounded-bl-full" />
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {appLang==='en' ? 'Total Purchases' : 'إجمالي المشتريات'}
                    </p>
                    <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mt-2">{formatNumber(totalPurchases)}</p>
                    <p className="text-xs text-gray-400 mt-1">{currency}</p>
                  </div>
                  <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
                    <ShoppingCart className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-3">
                  {expenseChangePct >= 0 ? (
                    <ArrowUpRight className="w-4 h-4 text-red-500" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 text-emerald-500" />
                  )}
                  <span className={`text-sm font-medium ${expenseChangePct >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {expenseChangePct >= 0 ? '+' : ''}{expenseChangePct.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-400">{appLang==='en' ? 'vs last month' : 'عن الشهر الماضي'}</span>
                </div>
              </CardContent>
            </Card>

            {/* الأرباح المتوقعة */}
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-bl-full" />
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {appLang==='en' ? 'Expected Profit' : 'الأرباح المتوقعة'}
                    </p>
                    <p className={`text-2xl lg:text-3xl font-bold mt-2 ${expectedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatNumber(expectedProfit)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{currency}</p>
                  </div>
                  <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                    <BadgeDollarSign className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-3">
                  {profitChangePct >= 0 ? (
                    <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 text-red-500" />
                  )}
                  <span className={`text-sm font-medium ${profitChangePct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {profitChangePct >= 0 ? '+' : ''}{profitChangePct.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-400">{appLang==='en' ? 'vs last month' : 'عن الشهر الماضي'}</span>
                </div>
              </CardContent>
            </Card>

            {/* عدد الفواتير */}
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-500/10 to-transparent rounded-bl-full" />
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {appLang==='en' ? 'Invoices Count' : 'عدد الفواتير'}
                    </p>
                    <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mt-2">{formatNumber(invoicesCount)}</p>
                    <p className="text-xs text-gray-400 mt-1">{invoicesCount > 0 ? (appLang==='en' ? 'invoices' : 'فاتورة') : (appLang==='en' ? 'No invoices yet' : 'لا توجد فواتير')}</p>
                  </div>
                  <div className="p-3 bg-violet-100 dark:bg-violet-900/30 rounded-xl">
                    <FileText className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* بطاقات الذمم والشهر الحالي */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* ذمم مدينة */}
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 border border-blue-100 dark:border-blue-900 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Wallet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {appLang==='en' ? 'Receivables' : 'ذمم مدينة'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{formatNumber(receivablesOutstanding)}</p>
                <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1">{currency}</p>
              </CardContent>
            </Card>

            {/* ذمم دائنة */}
            <Card className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/50 dark:to-rose-950/50 border border-red-100 dark:border-red-900 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                    <CreditCard className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <span className="text-sm font-medium text-red-700 dark:text-red-300">
                    {appLang==='en' ? 'Payables' : 'ذمم دائنة'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">{formatNumber(payablesOutstanding)}</p>
                <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">{currency}</p>
              </CardContent>
            </Card>

            {/* دخل هذا الشهر */}
            <Card className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/50 dark:to-green-950/50 border border-emerald-100 dark:border-emerald-900 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    {appLang==='en' ? 'Income This Month' : 'دخل الشهر'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{formatNumber(incomeThisMonth)}</p>
                <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">{currency}</p>
              </CardContent>
            </Card>

            {/* مصروف هذا الشهر */}
            <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/50 border border-amber-100 dark:border-amber-900 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <TrendingDown className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    {appLang==='en' ? 'Expense This Month' : 'مصروف الشهر'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{formatNumber(expenseThisMonth)}</p>
                <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">{currency}</p>
              </CardContent>
            </Card>
          </div>
          {/* الرسوم البيانية */}
          {hasData ? (
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
              <CardHeader className="border-b border-gray-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <CardTitle>{appLang==='en' ? 'Performance Charts' : 'رسوم الأداء البيانية'}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <DashboardCharts monthlyData={monthlyData} appLang={appLang} />
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-gray-400">
                  <TrendingUp className="w-12 h-12 mb-3" />
                  <p>{appLang==='en' ? 'No data to display charts yet.' : 'لا توجد بيانات لعرض الرسوم حالياً.'}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* أرصدة البنك والنقد والفواتير الأخيرة */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* أرصدة النقد والبنك */}
            <Card className="lg:col-span-1 bg-white dark:bg-slate-900 border-0 shadow-sm">
              <CardHeader className="border-b border-gray-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
                    <Banknote className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <CardTitle className="text-base">{appLang==='en' ? 'Cash & Bank' : 'النقد والبنك'}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {bankAccounts.length > 0 ? (
                  <div className="space-y-4">
                    <details className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-400" />
                        {appLang==='en' ? 'Filter accounts' : 'فلترة الحسابات'}
                      </summary>
                      <div className="p-3 bg-white dark:bg-slate-900">
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
                        <div className="space-y-2 mt-3">
                          {list.length > 0 ? (
                            <>
                              {list.map((a) => (
                                <div key={a.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                                  {(() => {
                                    const acc = rawById.get(a.id)
                                    const label = acc?.account_name || a.name
                                    return (
                                      <div className="flex items-center gap-2">
                                        <Banknote className="w-4 h-4 text-teal-500" />
                                        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                                      </div>
                                    )
                                  })()}
                                  <span className="font-bold text-gray-900 dark:text-white">{formatNumber(a.balance)} <span className="text-xs text-gray-400">{currency}</span></span>
                                </div>
                              ))}
                              {(() => {
                                const total = list.reduce((sum, a) => sum + Number(a.balance || 0), 0)
                                return (
                                  <div className="flex items-center justify-between p-3 bg-teal-50 dark:bg-teal-900/30 rounded-lg border border-teal-200 dark:border-teal-800 mt-3">
                                    <span className="font-medium text-teal-700 dark:text-teal-300">{appLang==='en' ? 'Total Balance' : 'إجمالي الرصيد'}</span>
                                    <span className="font-bold text-teal-700 dark:text-teal-300">{formatNumber(total)} <span className="text-xs">{currency}</span></span>
                                  </div>
                                )
                              })()}
                            </>
                          ) : (
                            <div className="text-center py-4 text-gray-400">
                              <Banknote className="w-8 h-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">{appLang==='en' ? 'No accounts match' : 'لا توجد حسابات مطابقة'}</p>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400">
                    <Banknote className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{appLang==='en' ? 'No cash/bank accounts yet' : 'لا توجد حسابات نقد/بنك'}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* الفواتير الأخيرة */}
            <Card className="lg:col-span-1 bg-white dark:bg-slate-900 border-0 shadow-sm">
              <CardHeader className="border-b border-gray-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Receipt className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <CardTitle className="text-base">{appLang==='en' ? 'Recent Invoices' : 'آخر الفواتير'}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {(invoicesData || []).length > 0 ? (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {invoicesData.sort((a: any, b: any) => String(b.invoice_date || "").localeCompare(String(a.invoice_date || ""))).slice(0, 10).map((i: any) => {
                      const name = i.customer_id ? (customerNames[i.customer_id] || "") : ""
                      const label = i.invoice_number || i.id
                      const statusColors: Record<string, string> = {
                        paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                        partially_paid: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                        sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                        draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      }
                      const statusLabels: Record<string, string> = appLang === 'en'
                        ? { paid: 'Paid', partially_paid: 'Partial', sent: 'Sent', draft: 'Draft' }
                        : { paid: 'مدفوعة', partially_paid: 'جزئية', sent: 'مرسلة', draft: 'مسودة' }
                      return (
                        <div key={i.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                          <div>
                            <a href={`/invoices/${i.id}`} className="text-sm font-medium text-blue-600 hover:underline">{label}</a>
                            <p className="text-xs text-gray-500 mt-0.5">{name}</p>
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-sm text-gray-900 dark:text-white">{formatNumber(Number(i.total_amount || 0))}</p>
                            <Badge className={`text-[10px] mt-1 ${statusColors[i.status] || statusColors.draft}`}>
                              {statusLabels[i.status] || i.status}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400">
                    <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{appLang==='en' ? 'No invoices yet' : 'لا توجد فواتير'}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* المشتريات الأخيرة */}
            <Card className="lg:col-span-1 bg-white dark:bg-slate-900 border-0 shadow-sm">
              <CardHeader className="border-b border-gray-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <ShoppingCart className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <CardTitle className="text-base">{appLang==='en' ? 'Recent Purchases' : 'آخر المشتريات'}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {(billsData || []).length > 0 ? (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {billsData.sort((a: any, b: any) => String(b.bill_date || "").localeCompare(String(a.bill_date || ""))).slice(0, 10).map((b: any) => {
                      const name = b.supplier_id ? (supplierNames[b.supplier_id] || "") : ""
                      const label = b.bill_number || b.id
                      const statusColors: Record<string, string> = {
                        paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                        partially_paid: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                        sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                        draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      }
                      const statusLabels: Record<string, string> = appLang === 'en'
                        ? { paid: 'Paid', partially_paid: 'Partial', sent: 'Sent', draft: 'Draft' }
                        : { paid: 'مدفوعة', partially_paid: 'جزئية', sent: 'مرسلة', draft: 'مسودة' }
                      return (
                        <div key={b.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                          <div>
                            <a href={`/bills/${b.id}`} className="text-sm font-medium text-orange-600 hover:underline">{label}</a>
                            <p className="text-xs text-gray-500 mt-0.5">{name}</p>
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-sm text-gray-900 dark:text-white">{formatNumber(Number(b.total_amount || 0))}</p>
                            <Badge className={`text-[10px] mt-1 ${statusColors[b.status] || statusColors.draft}`}>
                              {statusLabels[b.status] || b.status}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400">
                    <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{appLang==='en' ? 'No purchases yet' : 'لا توجد مشتريات'}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
