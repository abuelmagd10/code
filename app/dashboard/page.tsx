/**
 * Dashboard Page — Hybrid Architecture
 * Shell سريع: Auth + Permissions + UserContext فقط (fast queries)
 * كل Widget تجلب بياناتها بشكل مستقل داخل <Suspense>
 */
import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Building2, ArrowUpRight, GitBranch, LayoutDashboard } from "lucide-react"
import { getActiveCompanyId } from "@/lib/company"
import { canAccessPage, getFirstAllowedPage } from "@/lib/authz"
import { CurrencyMismatchAlert } from "@/components/CurrencyMismatchAlert"
import DashboardScopeSwitcher from "@/components/DashboardScopeSwitcher"
import DashboardDailyIncomeCard from "@/components/DashboardDailyIncomeCard"
import DashboardInventoryStats from "@/components/DashboardInventoryStats"
import DashboardProductServiceStats from "@/components/DashboardProductServiceStats"
import AdvancedDashboardCharts from "@/components/charts/AdvancedDashboardCharts"
import DashboardManufacturingStats from "@/components/DashboardManufacturingStats"
import DashboardBookingStats from "@/components/DashboardBookingStats"
import {
  buildDashboardVisibilityRules,
  type DashboardScope,
  type DashboardUserContext,
} from "@/lib/dashboard-visibility"

// Widget Server Components (كل منها يجلب بياناته بشكل مستقل)
import StatsWidget from "./_widgets/StatsWidget"
import SecondaryStatsWidget from "./_widgets/SecondaryStatsWidget"
import ChartsWidget from "./_widgets/ChartsWidget"
import BankCashWidget from "./_widgets/BankCashWidget"
import RecentListsWidget from "./_widgets/RecentListsWidget"
import SystemIntegrityWidget from "./_widgets/SystemIntegrityWidget"

// Skeleton Components
import {
  StatsSkeleton,
  SecondaryStatsSkeleton,
  ChartsSkeleton,
  BankCashSkeleton,
  RecentListsSkeleton,
  CardWidgetSkeleton,
} from "./_widgets/SkeletonWidgets"

export const dynamic = "force-dynamic"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[]> | Promise<Record<string, string | string[]>>
}) {
  const supabase = await createClient()

  // ── 1. Auth Check ─────────────────────────────────────
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) redirect("/auth/login")

  // ── 2. Parse search params (no async work, can run early) ────
  // moved up to allow parallel queries below
  // (parsing block continues at section 3)

  // ── 3. Parse search params ─────────────────────────────
  const sp = await Promise.resolve(searchParams || {}) as any
  const isUrlSp = typeof sp?.get === "function"
  const readOne = (k: string) => isUrlSp ? String(sp.get(k) || "") : String(sp?.[k] || "")
  const readAll = (k: string): string[] => {
    if (isUrlSp && typeof sp.getAll === "function") return (sp.getAll(k) || []).filter((x: any) => typeof x === "string")
    const v = sp?.[k]
    if (Array.isArray(v)) return v.filter((x: any) => typeof x === "string")
    if (typeof v === "string" && v.length > 0) return [v]
    return []
  }
  const collectByKeyBase = (spAny: any, base: string): string[] => {
    if (typeof spAny?.getAll === "function") return (spAny.getAll(base) || []).filter((x: any) => typeof x === "string")
    const keys = Object.keys(spAny || {}).filter(k => k.replace(/%5B%5D|\[\]/g, "") === base)
    const out: string[] = []
    for (const k of keys) {
      const v = spAny?.[k]
      if (Array.isArray(v)) out.push(...v.filter((x: any) => typeof x === "string"))
      else if (typeof v === "string" && v.length > 0) out.push(v)
    }
    return out
  }

  const fromDate = readOne("from").slice(0, 10)
  const toDate   = readOne("to").slice(0, 10)
  const appLang  = String(readOne("lang")).toLowerCase() === "en" ? "en" : "ar"

  const groupListRaw    = readOne("groups") || readOne("group_list")
  const selectedFromList = groupListRaw ? groupListRaw.split(",").map(s => s.trim()).filter(Boolean) : []
  const selectedGroups   = selectedFromList.length > 0 ? selectedFromList : collectByKeyBase(sp, "group")
  const selectedAccountIds = collectByKeyBase(sp, "acct")

  // ── 4. Company & Currency (cookie-only, NO server query) ──
  // ✅ v3.28.11: Skip getActiveCompanyId fallback (contains 3+ queries)
  // If cookie is empty, render shell with no companyId (widgets show empty state)
  const cookieStore    = await cookies()
  const cookieCid      = cookieStore.get("active_company_id")?.value || ""
  const cookieCurrency = cookieStore.get("app_currency")?.value || "EGP"
  const cidParam       = readOne("cid")
  const companyId      = cidParam || cookieCid || null

  // ── 5. Parallel data fetching (replaces 3 sequential queries) ─
  let currency = cookieCurrency
  let userProfile: { username?: string; display_name?: string } | null = null
  let userContext: DashboardUserContext | null = null
  let visibilityRules: ReturnType<typeof buildDashboardVisibilityRules> | null = null
  let currentBranchName: string | null = null
  let allBranches: { id: string; name: string }[] = []

  // Build the parallel query batch — only fetch what we need based on companyId
  if (companyId) {
    const [companyResult, profileResult, memberResult] = await Promise.all([
      supabase.from("companies").select("base_currency").eq("id", companyId).maybeSingle(),
      supabase.from("user_profiles").select("username, display_name").eq("user_id", data.user.id).maybeSingle(),
      supabase.from("company_members").select("role, branch_id, cost_center_id, warehouse_id").eq("company_id", companyId).eq("user_id", data.user.id).maybeSingle(),
    ])

    if (companyResult.data?.base_currency) currency = companyResult.data.base_currency
    userProfile = profileResult.data || null
    const member = memberResult.data

    userContext = {
      user_id:        data.user.id,
      company_id:     companyId,
      role:           member?.role || "viewer",
      branch_id:      member?.branch_id || null,
      cost_center_id: member?.cost_center_id || null,
      warehouse_id:   member?.warehouse_id || null,
    }

    // ── 6. Permission Check (now we have role - skip queries for owner/admin) ──
    const role = String(member?.role || "")
    const isOwnerOrAdmin = role === "owner" || role === "admin"
    if (!isOwnerOrAdmin) {
      const canAccessDashboard = await canAccessPage(supabase, "dashboard")
      if (!canAccessDashboard) {
        const fallbackPage = await getFirstAllowedPage(supabase)
        if (fallbackPage !== "/dashboard") redirect(fallbackPage)
      }
    }

    const scopeParam      = readOne("scope") as DashboardScope | ""
    const branchParam     = readOne("branch")
    const selectedScope   = (scopeParam === "company" || scopeParam === "branch") ? scopeParam : undefined
    const selectedBranchId = branchParam || undefined

    visibilityRules = buildDashboardVisibilityRules(userContext, selectedScope, selectedBranchId)

    // ── 7. Branch info — parallel fetching where possible ────────
    const branchQueries: any[] = []
    if (visibilityRules.branchId) {
      branchQueries.push(
        supabase.from("branches").select("name").eq("id", visibilityRules.branchId).maybeSingle()
      )
    }
    if (visibilityRules.canSeeAllBranches) {
      branchQueries.push(
        supabase.from("branches").select("id, name").eq("company_id", companyId).eq("is_active", true).order("name")
      )
    }

    if (branchQueries.length > 0) {
      const branchResults: any[] = await Promise.all(branchQueries)
      let idx = 0
      if (visibilityRules.branchId) {
        currentBranchName = branchResults[idx]?.data?.name || null
        idx++
      }
      if (visibilityRules.canSeeAllBranches) {
        allBranches = (branchResults[idx]?.data as { id: string; name: string }[]) || []
      }
    }
  } else {
    // No companyId yet — still check permissions (rare path for users without company)
    const canAccessDashboard = await canAccessPage(supabase, "dashboard")
    if (!canAccessDashboard) {
      const fallbackPage = await getFirstAllowedPage(supabase)
      if (fallbackPage !== "/dashboard") redirect(fallbackPage)
    }
  }

  // سياق مشترك يُمرر لجميع الـ Widgets
  const branchId = visibilityRules?.scope === "branch" ? visibilityRules.branchId : undefined

  const widgetCtx = {
    companyId:   companyId || "",
    currency,
    appLang:     appLang as "ar" | "en",
    fromDate,
    toDate,
    branchId,
  }

  // ── 6. Render Shell (فوري) + Suspense Widgets (تتدفق تدريجياً) ──
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">

          {/* تنبيه عدم وجود شركة */}
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
          <CurrencyMismatchAlert lang={appLang === "en" ? "en" : "ar"} />

          {/* ── رأس الصفحة (يظهر فوراً) ── */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg sm:rounded-xl shadow-lg shadow-indigo-500/20 flex-shrink-0">
                  <LayoutDashboard className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white truncate">
                    {appLang === "en"
                      ? <>Welcome{userProfile?.display_name ? `, ${userProfile.display_name}` : userProfile?.username ? `, @${userProfile.username}` : ""}</>
                      : <>مرحباً{userProfile?.display_name ? ` ${userProfile.display_name}` : userProfile?.username ? ` @${userProfile.username}` : ""}</>}
                  </h1>
                  <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {appLang === "en" ? "Overview of your business performance" : "نظرة عامة على أداء أعمالك"}
                  </p>
                  {visibilityRules?.scope === "company" && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      {appLang === "en" ? "👑 Company-wide view - All branches data" : "👑 عرض على مستوى الشركة - بيانات جميع الفروع"}
                    </p>
                  )}
                  {visibilityRules?.scope === "branch" && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      {appLang === "en" ? "🏢 Branch view - Showing data from your branch only" : "🏢 عرض الفرع - تعرض بيانات فرعك فقط"}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                {visibilityRules && (
                  <DashboardScopeSwitcher
                    canSwitch={visibilityRules.canSwitchScope}
                    currentScope={visibilityRules.scope}
                    currentBranchId={visibilityRules.branchId}
                    currentBranchName={currentBranchName}
                    lang={appLang === "en" ? "en" : "ar"}
                  />
                )}
                {visibilityRules && !visibilityRules.canSwitchScope && currentBranchName && (
                  <Badge variant="outline" className="gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
                    <GitBranch className="w-3 h-3 sm:w-4 sm:h-4" />
                    {currentBranchName}
                  </Badge>
                )}
                {companyId && (
                  <Badge variant="outline" className="gap-2 px-3 py-1.5 bg-gray-50 dark:bg-slate-800 text-xs sm:text-sm">
                    <Building2 className="w-3 h-3 sm:w-4 sm:h-4" />
                    {currency}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* v3.74.92: Credit Integrity health banner — owner/manager/accountant only */}
          {companyId && <SystemIntegrityWidget />}

          {/* ── Widget 1: إحصائيات GL الرئيسية ── */}
          {companyId && (
            <Suspense fallback={<StatsSkeleton />}>
              <StatsWidget {...widgetCtx} />
            </Suspense>
          )}

          {/* ── Widget 2: الذمم والشهر الحالي ── */}
          {companyId && (
            <Suspense fallback={<SecondaryStatsSkeleton />}>
              <SecondaryStatsWidget {...widgetCtx} />
            </Suspense>
          )}

          {/* ── Widget 3: الدخل اليومي (Client Component — يجلب بياناته مستقلاً) ── */}
          {companyId && visibilityRules && (
            <DashboardDailyIncomeCard
              companyId={companyId}
              defaultCurrency={currency}
              appLang={appLang}
              canSwitchScope={visibilityRules.canSwitchScope}
              canSeeAllBranches={visibilityRules.canSeeAllBranches}
              userBranchId={visibilityRules.branchId}
              userBranchName={currentBranchName}
              allBranches={allBranches}
              userName={userProfile?.display_name || userProfile?.username || undefined}
            />
          )}

          {/* ── Widget 4: المخزون والضرائب (Client Component — مستقل) ── */}
          {companyId && (
            <DashboardInventoryStats
              companyId={companyId}
              defaultCurrency={currency}
              appLang={appLang}
              fromDate={fromDate}
              toDate={toDate}
              branchId={branchId}
            />
          )}

          {/* ── Widget 5: الرسوم البيانية الشهرية (12 شهراً) ── */}
          {companyId && (
            <Suspense fallback={<ChartsSkeleton />}>
              <ChartsWidget
                companyId={companyId}
                currency={currency}
                appLang={appLang as "ar" | "en"}
                toDate={toDate}
                branchId={branchId}
              />
            </Suspense>
          )}

          {/* ── Widget 6: المنتجات والخدمات (Client Component — مستقل) ── */}
          {companyId && (
            <DashboardProductServiceStats
              companyId={companyId}
              defaultCurrency={currency}
              appLang={appLang}
              fromDate={fromDate}
              toDate={toDate}
              branchId={branchId}
            />
          )}

          {/* ── Widget 7a: التصنيع + الحجوزات (Client Components — مستقلان) ── */}
          {companyId && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DashboardManufacturingStats
                companyId={companyId}
                appLang={appLang}
                branchId={branchId}
              />
              <DashboardBookingStats
                companyId={companyId}
                appLang={appLang}
                currency={currency}
                branchId={branchId}
              />
            </div>
          )}

          {/* ── Widget 7: تحليلات الأعمال المتقدمة (Client Component — مستقل) ── */}
          {companyId && (
                <AdvancedDashboardCharts
              companyId={companyId}
              defaultCurrency={currency}
                  appLang={appLang}
              fromDate={fromDate}
              toDate={toDate}
              branchId={branchId}
            />
          )}

          {/* ── Widget 8 + 9: البنك/النقد + قوائم الأخيرة ── */}
          {companyId && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Suspense fallback={<BankCashSkeleton />}>
                <BankCashWidget
                  companyId={companyId}
                  currency={currency}
                  appLang={appLang as "ar" | "en"}
                  fromDate={fromDate}
                  toDate={toDate}
                  selectedAccountIds={selectedAccountIds}
                  selectedGroups={selectedGroups}
                  branchId={branchId}
                />
              </Suspense>

              <Suspense fallback={<RecentListsSkeleton />}>
                <RecentListsWidget {...widgetCtx} />
              </Suspense>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
