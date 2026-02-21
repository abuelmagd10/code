import { Sidebar } from "@/components/sidebar"
import { createClient } from "@/lib/supabase/server"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, LayoutDashboard, ArrowUpRight, Building2, GitBranch } from "lucide-react"
import { getActiveCompanyId } from "@/lib/company"
import DashboardStats from "@/components/DashboardStats"
import DashboardSecondaryStats from "@/components/DashboardSecondaryStats"
import DashboardChartsWrapper from "@/components/charts/DashboardChartsWrapper"
import DashboardBankCash from "@/components/DashboardBankCash"
import DashboardRecentLists from "@/components/DashboardRecentLists"
import DashboardProductServiceStats from "@/components/DashboardProductServiceStats"
import DashboardInventoryStats from "@/components/DashboardInventoryStats"
import AdvancedDashboardCharts from "@/components/charts/AdvancedDashboardCharts"
import { canAccessPage, getFirstAllowedPage } from "@/lib/authz"
import { CurrencyMismatchAlert } from "@/components/CurrencyMismatchAlert"
import DashboardScopeSwitcher from "@/components/DashboardScopeSwitcher"
import DashboardDataSourceBanner from "@/components/DashboardDataSourceBanner"
import {
  buildDashboardVisibilityRules,
  type DashboardScope,
  type DashboardUserContext,
  type DashboardVisibilityRules
} from "@/lib/dashboard-visibility"
export const dynamic = "force-dynamic"

type BankAccount = { id: string; name: string; balance: number }


export default async function DashboardPage({ searchParams }: { searchParams?: { from?: string; to?: string; acct?: string | string[]; group?: string | string[] } | Promise<{ from?: string; to?: string; acct?: string | string[]; group?: string | string[] }> }) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    redirect("/auth/login")
  }

  // 🔐 التحقق من صلاحية الوصول للـ Dashboard
  const canAccessDashboard = await canAccessPage(supabase, "dashboard")
  if (!canAccessDashboard) {
    // إعادة التوجيه لأول صفحة مسموح بها
    const fallbackPage = await getFirstAllowedPage(supabase)
    if (fallbackPage !== "/dashboard") {
      redirect(fallbackPage)
    }
  }

  // جلب ملف المستخدم (username, display_name)
  let userProfile: { username?: string; display_name?: string } | null = null
  try {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("username, display_name")
      .eq("user_id", data.user.id)
      .maybeSingle()
    userProfile = profile
  } catch { }

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
    // ✅ استعلام مباشر من server component
    try {
      const { data: companyData } = await supabase
        .from("companies")
        .select("id, base_currency")
        .eq("id", companyId)
        .maybeSingle()

      if (companyData) {
        company = { id: companyData.id, currency: companyData.base_currency || cookieCurrency }
      }
    } catch (error) {
      console.error('[Dashboard] Error fetching company info:', error)
      // Fallback to existing data
    }
  }

  // 🔐 Dashboard Governance - جلب بيانات المستخدم والفرع
  let userContext: DashboardUserContext | null = null
  let visibilityRules: DashboardVisibilityRules | null = null
  let currentBranchName: string | null = null
  let allBranches: { id: string; name: string }[] = []

  if (companyId && data.user) {
    // جلب عضوية المستخدم في الشركة
    const { data: member } = await supabase
      .from("company_members")
      .select("role, branch_id, cost_center_id, warehouse_id")
      .eq("company_id", companyId)
      .eq("user_id", data.user.id)
      .maybeSingle()

    const role = member?.role || "viewer"

    userContext = {
      user_id: data.user.id,
      company_id: companyId,
      role: role,
      branch_id: member?.branch_id || null,
      cost_center_id: member?.cost_center_id || null,
      warehouse_id: member?.warehouse_id || null
    }

    // قراءة النطاق المحدد من URL
    const scopeParam = readOne("scope") as DashboardScope | ""
    const branchParam = readOne("branch")
    const selectedScope = (scopeParam === 'company' || scopeParam === 'branch') ? scopeParam : undefined
    const selectedBranchId = branchParam || undefined

    // بناء قواعد الرؤية
    visibilityRules = buildDashboardVisibilityRules(userContext, selectedScope, selectedBranchId)

    // جلب اسم الفرع المحدد
    if (visibilityRules.branchId) {
      const { data: branchData } = await supabase
        .from("branches")
        .select("name")
        .eq("id", visibilityRules.branchId)
        .maybeSingle()
      currentBranchName = branchData?.name || null
    }

    // جلب جميع الفروع للمستخدمين المميزين
    if (visibilityRules.canSeeAllBranches) {
      const { data: branchesData } = await supabase
        .from("branches")
        .select("id, name")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name")
      allBranches = branchesData || []
    }
  }

  // Default stats
  let hasData = false

  // Zoho-like KPIs
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
  let totalCOGS = 0 // تكلفة البضاعة المباعة
  let totalShipping = 0 // إجمالي مصاريف الشحن
  // Phase 4: GL-based monthly metrics (Single Source of Truth)
  let glMonthlyRevenue = 0  // إيرادات الشهر من GL (حسابات 4xxx)
  let glMonthlyExpense = 0  // مصروفات الشهر من GL (حسابات 5xxx)

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
    // 🔐 Dashboard Governance: تطبيق فلترة الفرع على الفواتير
    // Sum invoices total_amount (exclude draft/cancelled) & count within date range
    let invQuery = supabase
      .from("invoices")
      .select("id, customer_id, invoice_number, total_amount, paid_amount, returned_amount, invoice_date, status, shipping, tax_amount, display_total, display_currency, display_rate, branch_id")
      .eq("company_id", company.id)
      .in("status", ["sent", "partially_paid", "paid"])

    // 🔐 فلترة حسب الفرع (إذا كان النطاق branch)
    if (visibilityRules?.scope === 'branch' && visibilityRules.branchId) {
      invQuery = invQuery.eq("branch_id", visibilityRules.branchId)
    }

    if (fromDate) invQuery = invQuery.gte("invoice_date", fromDate)
    if (toDate) invQuery = invQuery.lte("invoice_date", toDate)
    const { data: invoices } = await invQuery

    if (invoices && invoices.length > 0) {
      invoicesData = invoices
      // Recent invoices
      recentInvoices = [...invoices]
        .sort((a: any, b: any) => String(b.invoice_date || "").localeCompare(String(a.invoice_date || "")))

      // حساب مصاريف الشحن من الفواتير
      totalShipping = invoices.reduce((sum: number, inv: any) => sum + Number(inv.shipping || 0), 0)

      // ✅ ERP Professional: حساب COGS من cogs_transactions (المصدر الوحيد للحقيقة)
      // 📌 يمنع استخدام products.cost_price في التقارير الرسمية
      // 📌 FIFO Engine هو الجهة الوحيدة المخولة بتحديد unit_cost
      // 📌 COGS = SUM(total_cost) FROM cogs_transactions WHERE source_type = 'invoice'
      try {
        const { calculateCOGSTotal } = await import("@/lib/cogs-transactions")
        const invoiceIds = invoices.map((i: any) => i.id)
        totalCOGS = await calculateCOGSTotal(supabase, {
          companyId: company.id,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          sourceType: 'invoice',
          sourceIds: invoiceIds, // ✅ تصفية بالفواتير النشطة فقط (تجنب COGS اليتيمة)
        })
        
        // Fallback: إذا لم توجد سجلات COGS (للتوافق مع البيانات القديمة)
        if (totalCOGS === 0 && invoices.length > 0) {
          console.warn("⚠️ No COGS transactions found in dashboard, falling back to cost_price calculation (deprecated)")
          const invoiceIds = invoices.map((i: any) => i.id)
          const { data: invoiceItems } = await supabase
            .from("invoice_items")
            .select("quantity, product_id, products(cost_price, item_type)")
            .in("invoice_id", invoiceIds)

          totalCOGS = (invoiceItems || []).reduce((sum: number, it: any) => {
            // تجاهل الخدمات
            if (it.products?.item_type === 'service') return sum
            const cost = Number(it.products?.cost_price || 0)
            return sum + Number(it.quantity || 0) * cost
          }, 0)
        }
      } catch (error: any) {
        console.error("Error calculating COGS in dashboard:", error)
        // Fallback to cost_price in case of error
        const invoiceIds = invoices.map((i: any) => i.id)
        if (invoiceIds.length > 0) {
          const { data: invoiceItems } = await supabase
            .from("invoice_items")
            .select("quantity, product_id, products(cost_price, item_type)")
            .in("invoice_id", invoiceIds)

          totalCOGS = (invoiceItems || []).reduce((sum: number, it: any) => {
            if (it.products?.item_type === 'service') return sum
            const cost = Number(it.products?.cost_price || 0)
            return sum + Number(it.quantity || 0) * cost
          }, 0)
        }
      }
    }

    // 🔐 Dashboard Governance: تطبيق فلترة الفرع على فواتير الشراء
    // Bills data for dashboard (includes display fields for currency conversion)
    let billsQuery = supabase
      .from("bills")
      .select("id, supplier_id, bill_number, total_amount, paid_amount, bill_date, status, display_total, display_currency, display_rate, branch_id")
      .eq("company_id", company.id)
      .in("status", ["sent", "partially_paid", "paid"]) // exclude draft/cancelled/voided from dashboard metrics

    // 🔐 فلترة حسب الفرع (إذا كان النطاق branch)
    if (visibilityRules?.scope === 'branch' && visibilityRules.branchId) {
      billsQuery = billsQuery.eq("branch_id", visibilityRules.branchId)
    }

    if (fromDate) billsQuery = billsQuery.gte("bill_date", fromDate)
    if (toDate) billsQuery = billsQuery.lte("bill_date", toDate)
    const { data: bills } = await billsQuery

    if (bills && bills.length > 0) {
      billsData = bills
      // Recent bills
      recentBills = [...bills]
        .sort((a: any, b: any) => String(b.bill_date || "").localeCompare(String(a.bill_date || "")))
    }

    // بناء سلسلة 12 شهراً للرسم البياني (مبيعات/مشتريات من الفواتير)
    const now = new Date()
    const months: { key: string; label: string }[] = []

    // أسماء الأشهر الثابتة لتجنب hydration mismatch
    const monthNamesAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    const monthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthNames = appLang === 'en' ? monthNamesEn : monthNamesAr

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const label = monthNames[d.getMonth()]
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

    // ── Phase 4: GL-based monthly revenue & expense (Single Source of Truth) ──
    // يستخدم GL مباشرةً بدلاً من الجداول التشغيلية لضمان الدقة المحاسبية
    try {
      const nowDate   = new Date()
      const ymStart   = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}-01`
      const ymEnd     = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0)
                          .toISOString().split('T')[0]

      // GL Revenue (accounts of type 'revenue') for current month
      const { data: glRevRows } = await supabase
        .from("journal_entry_lines")
        .select("credit_amount, debit_amount, journal_entries!inner(company_id, status, entry_date), chart_of_accounts!inner(account_type)")
        .eq("journal_entries.company_id", company.id)
        .eq("journal_entries.status",     "posted")
        .eq("chart_of_accounts.account_type", "revenue")
        .gte("journal_entries.entry_date", ymStart)
        .lte("journal_entries.entry_date", ymEnd)
        .limit(2000)

      glMonthlyRevenue = (glRevRows || []).reduce((s: number, r: any) =>
        s + Number(r.credit_amount || 0) - Number(r.debit_amount || 0), 0)

      // GL Expense (accounts of type 'expense') for current month
      const { data: glExpRows } = await supabase
        .from("journal_entry_lines")
        .select("credit_amount, debit_amount, journal_entries!inner(company_id, status, entry_date), chart_of_accounts!inner(account_type)")
        .eq("journal_entries.company_id", company.id)
        .eq("journal_entries.status",     "posted")
        .eq("chart_of_accounts.account_type", "expense")
        .gte("journal_entries.entry_date", ymStart)
        .lte("journal_entries.entry_date", ymEnd)
        .limit(2000)

      glMonthlyExpense = (glExpRows || []).reduce((s: number, r: any) =>
        s + Number(r.debit_amount || 0) - Number(r.credit_amount || 0), 0)

    } catch (glErr) {
      console.warn('[Dashboard] GL monthly query failed, using operational fallback:', glErr)
    }

    // 🔐 Dashboard Governance: النقد والبنك
    // Bank & cash balances: opening_balance + sum(debits - credits)
    // ⚠️ ملاحظة: الحسابات على مستوى الشركة، لكن نفلتر الحركات حسب الفرع
    let allAccounts: any[] = []
    try {
      const headerStore = await headers()
      const cookieHeader = headerStore.get('cookie') || ''
      const myCompanyRes = await fetch(`/api/my-company`, { headers: { cookie: cookieHeader } })
      if (myCompanyRes.ok) {
        const myc = await myCompanyRes.json()
        allAccounts = Array.isArray(myc?.accounts) ? myc.accounts : []
      }
    } catch { }
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

    // 🔐 في Company View: نبدأ من opening_balance
    // 🔐 في Branch View: نبدأ من صفر (لأن opening_balance على مستوى الشركة)
    if (visibilityRules?.scope === 'company') {
      for (const a of assetAccounts || []) balanceMap.set(a.id, Number(a.opening_balance || 0))
    } else {
      for (const a of assetAccounts || []) balanceMap.set(a.id, 0)
    }

    let filledViaService = false
    if (accIds.length > 0) {
      // 🔐 في Branch View: نستخدم الاستعلام المباشر مع فلترة الفرع
      // لأن API لا يدعم فلترة الفرع حالياً
      if (visibilityRules?.scope === 'branch' && visibilityRules.branchId) {
        // ✅ استعلام مباشر مع فلترة الفرع من journal_entries (وليس journal_entry_lines)
        // لأن branch_id قد تكون null في journal_entry_lines لكنها موجودة في journal_entries
        let linesQuery = supabase
          .from("journal_entry_lines")
          .select("account_id, debit_amount, credit_amount, journal_entries!inner(entry_date, company_id, branch_id, cost_center_id)")
          .in("account_id", accIds)
          .eq("journal_entries.company_id", company.id)
          .eq("journal_entries.branch_id", visibilityRules.branchId)

        if (visibilityRules.costCenterId) {
          linesQuery = linesQuery.eq("journal_entries.cost_center_id", visibilityRules.costCenterId)
        }
        if (fromDate) linesQuery = linesQuery.gte("journal_entries.entry_date", fromDate)
        if (toDate) linesQuery = linesQuery.lte("journal_entries.entry_date", toDate)

        const { data: lines } = await linesQuery
        for (const l of lines || []) {
          const prev = balanceMap.get(l.account_id) || 0
          balanceMap.set(l.account_id, prev + Number(l.debit_amount || 0) - Number(l.credit_amount || 0))
        }
        filledViaService = true
      } else {
        // Company View: استخدام API أو استعلام بدون فلترة فرع
        try {
          const headerStore = await headers()
          const cookieHeader = headerStore.get('cookie') || ''
          const asOf = toDate || new Date().toISOString().slice(0, 10)
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
        } catch { }
      }

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

    // إظهار الرسوم إذا وُجدت فواتير/فواتير موردين أو بيانات شهرية مشتقة منهما
    hasData = (invoicesData?.length ?? 0) > 0 || (billsData?.length ?? 0) > 0 || (monthlyData?.some((d) => (d.revenue || d.expense)))
  }

  const currencyCode = company?.currency || cookieCurrency || "EGP"

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
        ; (custs || []).forEach((c: any) => { customerNames[c.id] = c.name })
    }
    const uniqueSupplierIds = Array.from(new Set((recentBills || []).map((b: any) => b.supplier_id).filter(Boolean)))
    if (uniqueSupplierIds.length > 0) {
      const { data: supps } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", company.id)
        .in("id", uniqueSupplierIds)
        ; (supps || []).forEach((s: any) => { supplierNames[s.id] = s.name })
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
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

          {/* تنبيه عدم تطابق العملة */}
          <CurrencyMismatchAlert lang={appLang === 'en' ? 'en' : 'ar'} />

          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg sm:rounded-xl shadow-lg shadow-indigo-500/20 flex-shrink-0">
                  <LayoutDashboard className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white truncate">
                    {appLang === 'en' ? (
                      <>Welcome{userProfile?.display_name ? `, ${userProfile.display_name}` : userProfile?.username ? `, @${userProfile.username}` : ''}</>
                    ) : (
                      <>مرحباً{userProfile?.display_name ? ` ${userProfile.display_name}` : userProfile?.username ? ` @${userProfile.username}` : ''}</>
                    )}
                  </h1>
                  <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {appLang === 'en' ? 'Overview of your business performance' : 'نظرة عامة على أداء أعمالك'}
                  </p>
                  {/* 🔐 Governance Notice */}
                  {visibilityRules && visibilityRules.scope === 'company' && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      {appLang === 'en' ? '👑 Company-wide view - All branches data' : '👑 عرض على مستوى الشركة - بيانات جميع الفروع'}
                    </p>
                  )}
                  {visibilityRules && visibilityRules.scope === 'branch' && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      {appLang === 'en' ? '🏢 Branch view - Showing data from your branch only' : '🏢 عرض الفرع - تعرض بيانات فرعك فقط'}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                {/* 🔐 Dashboard Scope Switcher */}
                {visibilityRules && (
                  <DashboardScopeSwitcher
                    canSwitch={visibilityRules.canSwitchScope}
                    currentScope={visibilityRules.scope}
                    currentBranchId={visibilityRules.branchId}
                    currentBranchName={currentBranchName}
                    lang={appLang === 'en' ? 'en' : 'ar'}
                  />
                )}

                {/* عرض الفرع للمستخدمين العاديين */}
                {visibilityRules && !visibilityRules.canSwitchScope && currentBranchName && (
                  <Badge variant="outline" className="gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
                    <GitBranch className="w-3 h-3 sm:w-4 sm:h-4" />
                    {currentBranchName}
                  </Badge>
                )}

                {company && (
                  <Badge variant="outline" className="gap-2 px-3 py-1.5 bg-gray-50 dark:bg-slate-800 text-xs sm:text-sm">
                    <Building2 className="w-3 h-3 sm:w-4 sm:h-4" />
                    {company.currency || 'EGP'}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Phase 3: Banner مصدر البيانات - يُظهر طبيعة الأرقام ومقارنة GL */}
          {company && (
            <DashboardDataSourceBanner
              period="month"
              fromDate={fromDate || undefined}
              toDate={toDate || undefined}
              currency={currencyCode}
              operationalNetProfit={
                (() => {
                  // حساب صافي الربح التشغيلي تقريبياً من الفواتير
                  const paid = invoicesData
                    .filter((i: any) => i.status === "paid" || i.status === "partially_paid")
                    .reduce((s: number, i: any) => s + Number(i.paid_amount || 0), 0)
                  return paid - totalCOGS
                })()
              }
            />
          )}

          {/* بطاقات الإحصائيات الرئيسية - Client Component for currency conversion */}
          <DashboardStats
            invoicesData={invoicesData}
            billsData={billsData}
            defaultCurrency={currencyCode}
            appLang={appLang}
            incomeChangePct={incomeChangePct}
            expenseChangePct={expenseChangePct}
            profitChangePct={profitChangePct}
            totalCOGS={totalCOGS}
            totalShipping={totalShipping}
          />

          {/* بطاقات الذمم والشهر الحالي - Client Component for currency conversion */}
          <DashboardSecondaryStats
            invoicesData={invoicesData}
            billsData={billsData}
            defaultCurrency={currencyCode}
            appLang={appLang}
            glMonthlyRevenue={glMonthlyRevenue}
            glMonthlyExpense={glMonthlyExpense}
          />

          {/* بطاقات المخزون والضرائب والمدفوعات */}
          {company && (
            <DashboardInventoryStats
              companyId={company.id}
              defaultCurrency={currencyCode}
              appLang={appLang}
              fromDate={fromDate}
              toDate={toDate}
              branchId={visibilityRules?.scope === 'branch' ? visibilityRules.branchId : undefined}
            />
          )}
          {/* الرسوم البيانية */}
          {hasData ? (
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
              <CardHeader className="border-b border-gray-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <CardTitle>{appLang === 'en' ? 'Performance Charts' : 'رسوم الأداء البيانية'}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <DashboardChartsWrapper monthlyData={monthlyData} defaultCurrency={currencyCode} appLang={appLang} />
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                  <TrendingUp className="w-12 h-12 mb-3" />
                  <p>{appLang === 'en' ? 'No data to display charts yet.' : 'لا توجد بيانات لعرض الرسوم حالياً.'}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* إحصائيات المنتجات والخدمات */}
          {company && (
            <DashboardProductServiceStats
              companyId={company.id}
              defaultCurrency={currencyCode}
              appLang={appLang}
              fromDate={fromDate}
              toDate={toDate}
              branchId={visibilityRules?.scope === 'branch' ? visibilityRules.branchId : undefined}
            />
          )}

          {/* الرسوم البيانية المتقدمة - حالات الفواتير، أفضل العملاء، المنتجات الأكثر مبيعاً */}
          {company && (
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
              <CardHeader className="border-b border-gray-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <CardTitle>{appLang === 'en' ? 'Business Analytics' : 'تحليلات الأعمال'}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <AdvancedDashboardCharts
                  companyId={company.id}
                  defaultCurrency={currencyCode}
                  appLang={appLang}
                  fromDate={fromDate}
                  toDate={toDate}
                  branchId={visibilityRules?.scope === 'branch' ? visibilityRules.branchId : undefined}
                />
              </CardContent>
            </Card>
          )}

          {/* أرصدة البنك والنقد والفواتير الأخيرة */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* أرصدة النقد والبنك - Client Component for currency conversion */}
            <DashboardBankCash
              bankAccounts={bankAccounts}
              assetAccountsData={assetAccountsData}
              selectedAccountIds={selectedAccountIds}
              selectedGroups={selectedGroups}
              fromDate={fromDate}
              toDate={toDate}
              defaultCurrency={currencyCode}
              appLang={appLang}
            />

            {/* الفواتير الأخيرة والمشتريات الأخيرة - Client Component for currency conversion */}
            <DashboardRecentLists
              invoicesData={invoicesData}
              billsData={billsData}
              customerNames={customerNames}
              supplierNames={supplierNames}
              defaultCurrency={currencyCode}
              appLang={appLang}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
