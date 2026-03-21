/**
 * SecondaryStatsWidget — Async Server Component
 * يجلب ملخص الفواتير والمشتريات (الذمم + الشهر الحالي) بشكل مستقل
 */
import { createClient } from "@/lib/supabase/server"
import DashboardSecondaryStats from "@/components/DashboardSecondaryStats"
import { getGLSummaryFast } from "@/lib/dashboard-gl-summary"

interface SecondaryStatsWidgetProps {
  companyId: string
  currency: string
  appLang: 'ar' | 'en'
  fromDate: string
  toDate: string
  branchId?: string | null
}

export default async function SecondaryStatsWidget({
  companyId, currency, appLang, fromDate, toDate, branchId
}: SecondaryStatsWidgetProps) {
  const supabase = await createClient()

  const now = new Date()
  const curYmStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const curYmEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  const from = fromDate || curYmStart
  const to   = toDate   || curYmEnd

  // فواتير مبيعات — نحتاج total + paid + returned لحساب الذمم
  let invQuery = supabase
    .from('invoices')
    .select('id, total_amount, paid_amount, returned_amount, invoice_date, status, display_total, display_currency, display_rate')
    .eq('company_id', companyId)
    .in('status', ['sent', 'partially_paid', 'paid'])
    .gte('invoice_date', from)
    .lte('invoice_date', to)
    .limit(200)
  if (branchId) invQuery = invQuery.eq('branch_id', branchId)
  const { data: invoicesData } = await invQuery

  // فواتير شراء
  let billsQuery = supabase
    .from('bills')
    .select('id, total_amount, paid_amount, bill_date, status, display_total, display_currency, display_rate')
    .eq('company_id', companyId)
    .in('status', ['sent', 'partially_paid', 'paid'])
    .gte('bill_date', from)
    .lte('bill_date', to)
    .limit(200)
  if (branchId) billsQuery = billsQuery.eq('branch_id', branchId)
  const { data: billsData } = await billsQuery

  // GL الشهري (إيرادات + مصروفات الشهر الحالي)
  let glMonthlyRevenue: number | undefined
  let glMonthlyExpense: number | undefined
  try {
    const glCurrent = await getGLSummaryFast(supabase, companyId, from, to, { branchId: branchId ?? undefined })
    glMonthlyRevenue = glCurrent.revenue
    glMonthlyExpense = glCurrent.cogs + glCurrent.operatingExpenses
  } catch { /* non-critical */ }

  return (
    <DashboardSecondaryStats
      invoicesData={invoicesData || []}
      billsData={billsData || []}
      defaultCurrency={currency}
      appLang={appLang}
      glMonthlyRevenue={glMonthlyRevenue}
      glMonthlyExpense={glMonthlyExpense}
    />
  )
}
