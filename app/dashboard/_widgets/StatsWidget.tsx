/**
 * StatsWidget — Async Server Component
 * يجلب GL Summary للفترة الحالية والسابقة بشكل مستقل
 * يُغلَّف بـ <Suspense> في page.tsx
 */
import { createClient } from "@/lib/supabase/server"
import DashboardStats from "@/components/DashboardStats"
import { getGLSummaryFast } from "@/lib/dashboard-gl-summary"

interface StatsWidgetProps {
  companyId: string
  currency: string
  appLang: 'ar' | 'en'
  fromDate: string
  toDate: string
  branchId?: string | null
}

export default async function StatsWidget({
  companyId, currency, appLang, fromDate, toDate, branchId
}: StatsWidgetProps) {
  const supabase = await createClient()

  const now = new Date()
  const curYmStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const curYmEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  const prevMonth  = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevStart  = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`
  const prevEnd    = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).toISOString().split('T')[0]

  const from = fromDate || curYmStart
  const to   = toDate   || curYmEnd
  const opts = { branchId: branchId ?? undefined }

  let glRevenue = 0, glCogs = 0, glExpenses = 0, glNetProfit = 0
  let incomeChangePct = 0, expenseChangePct = 0, profitChangePct = 0

  try {
    const [glCurrent, glPrev] = await Promise.all([
      getGLSummaryFast(supabase, companyId, from, to, opts),
      getGLSummaryFast(supabase, companyId, prevStart, prevEnd, opts),
    ])

    glRevenue   = glCurrent.revenue
    glCogs      = glCurrent.cogs
    glExpenses  = glCurrent.operatingExpenses
    glNetProfit = glCurrent.netProfit

    const prevRev  = glPrev.revenue
    const prevExp  = glPrev.cogs + glPrev.operatingExpenses
    const prevProf = glPrev.netProfit
    const curExp   = glCogs + glExpenses

    incomeChangePct  = prevRev  === 0 ? (glRevenue  > 0 ? 100 : 0) : ((glRevenue  - prevRev)  / Math.abs(prevRev))  * 100
    expenseChangePct = prevExp  === 0 ? (curExp     > 0 ? 100 : 0) : ((curExp     - prevExp)  / Math.abs(prevExp))  * 100
    profitChangePct  = prevProf === 0 ? (glNetProfit > 0 ? 100 : 0) : ((glNetProfit - prevProf) / Math.abs(prevProf)) * 100
  } catch (e) {
    console.warn('[StatsWidget] GL fetch failed:', e)
  }

  // 🔐 Branch Isolation: عدد الفواتير مع فلتر الفرع
  let countQuery = supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('status', ['sent', 'partially_paid', 'paid'])
    .gte('invoice_date', from)
    .lte('invoice_date', to)
  if (branchId) countQuery = countQuery.eq('branch_id', branchId)
  const { count: invoicesCount } = await countQuery

  return (
    <DashboardStats
      glRevenue={glRevenue}
      glCogs={glCogs}
      glExpenses={glExpenses}
      glNetProfit={glNetProfit}
      invoicesCount={invoicesCount ?? 0}
      defaultCurrency={currency}
      appLang={appLang}
      incomeChangePct={incomeChangePct}
      expenseChangePct={expenseChangePct}
      profitChangePct={profitChangePct}
    />
  )
}
