/**
 * SecondaryStatsWidget — Async Server Component
 * يجلب ملخص الفواتير والمشتريات (الذمم + الشهر الحالي) بشكل مستقل
 *
 * ✅ إصلاح AP/AR:
 *   1. استعلامات الذمم المدينة/الدائنة بدون فلتر تاريخ — تشمل جميع الفواتير المعلقة
 *   2. returned_amount مُضمَّن في استعلام bills لطرح المرتجعات من الذمم الدائنة
 *   3. فلتر التاريخ يُطبَّق فقط على استعلامات إيرادات/مصروفات الشهر الحالي
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

  // ─── 1. الذمم المدينة — جميع فواتير المبيعات المفتوحة (بدون فلتر تاريخ) ───────
  // يجب ألّا يقتصر على الشهر الحالي — الذمة تشمل أي فاتورة قديمة غير مسددة
  let arQuery = supabase
    .from('invoices')
    .select('id, total_amount, paid_amount, returned_amount, invoice_date, status, display_total, display_currency, display_rate')
    .eq('company_id', companyId)
    .in('status', ['sent', 'partially_paid'])
    .limit(500)
  if (branchId) arQuery = arQuery.eq('branch_id', branchId)
  const { data: arData } = await arQuery

  // ─── 2. الذمم الدائنة — جميع فواتير المشتريات المفتوحة (بدون فلتر تاريخ) ───────
  // ✅ returned_amount مُضمَّن لخصم المرتجعات من الرصيد بغض النظر عن حالة السداد
  let apQuery = supabase
    .from('bills')
    .select('id, total_amount, paid_amount, returned_amount, bill_date, status, display_total, display_currency, display_rate')
    .eq('company_id', companyId)
    .in('status', ['sent', 'partially_paid'])
    .limit(500)
  if (branchId) apQuery = apQuery.eq('branch_id', branchId)
  const { data: apData } = await apQuery

  // ─── 3. إيرادات/مصروفات الشهر الحالي (مع فلتر التاريخ) ───────────────────────
  // هذا هو الاستعلام الوحيد الذي يستخدم from/to — دخل/مصروف الشهر الحالي فقط
  let monthlyInvQuery = supabase
    .from('invoices')
    .select('id, total_amount, paid_amount, returned_amount, invoice_date, status, display_total, display_currency, display_rate')
    .eq('company_id', companyId)
    .in('status', ['sent', 'partially_paid', 'paid'])
    .gte('invoice_date', from)
    .lte('invoice_date', to)
    .limit(500)
  if (branchId) monthlyInvQuery = monthlyInvQuery.eq('branch_id', branchId)
  const { data: monthlyInvData } = await monthlyInvQuery

  let monthlyBillQuery = supabase
    .from('bills')
    .select('id, total_amount, paid_amount, returned_amount, bill_date, status, display_total, display_currency, display_rate')
    .eq('company_id', companyId)
    .in('status', ['sent', 'partially_paid', 'paid'])
    .gte('bill_date', from)
    .lte('bill_date', to)
    .limit(500)
  if (branchId) monthlyBillQuery = monthlyBillQuery.eq('branch_id', branchId)
  const { data: monthlyBillData } = await monthlyBillQuery

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
      invoicesData={monthlyInvData || []}
      billsData={monthlyBillData || []}
      arData={arData || []}
      apData={apData || []}
      defaultCurrency={currency}
      appLang={appLang}
      glMonthlyRevenue={glMonthlyRevenue}
      glMonthlyExpense={glMonthlyExpense}
    />
  )
}
