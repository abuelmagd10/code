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
    .in('status', ['sent', 'partially_paid', 'overdue'])
    .limit(500)
  if (branchId) arQuery = arQuery.eq('branch_id', branchId)
  const { data: arData } = await arQuery

  // ─── 2. الذمم الدائنة — جميع فواتير المشتريات المفتوحة (بدون فلتر تاريخ) ───────
  // ✅ returned_amount مُضمَّن لخصم المرتجعات من الرصيد بغض النظر عن حالة السداد
  let apQuery = supabase
    .from('bills')
    .select('id, total_amount, paid_amount, returned_amount, bill_date, status, display_total, display_currency, display_rate')
    .eq('company_id', companyId)
    .in('status', ['sent', 'partially_paid', 'received', 'overdue'])
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

  // ─── 4. GL الذمم المدينة والدائنة (All-Time) ──────────────────────────────────
  // يجب أن يكون الرصيد التراكمي (بدون فلتر from/to)
  let glReceivables: number | undefined
  let glPayables: number | undefined
  try {
    // ⚠️ لا نستخدم Materialized View هنا لأنه قد يكون غير محدث (Stale) ويؤدي إلى عرض أرقام غير موجودة فعلياً
    // نقرأ مباشرة من قيود اليومية لضمان دقة 100% للأرصدة التراكمية الدائمة (Live GL Query)
    let fallbackQuery = supabase
      .from("journal_entry_lines")
      .select(`
        debit_amount,
        credit_amount,
        chart_of_accounts!inner(sub_type),
        journal_entries!inner(company_id, status, branch_id)
      `)
      .eq("journal_entries.company_id", companyId)
      .eq("journal_entries.status", "posted")
      .eq("journal_entries.is_deleted", false)
      .in("chart_of_accounts.sub_type", ["accounts_receivable", "accounts_payable"])

    if (branchId) fallbackQuery = fallbackQuery.eq("journal_entries.branch_id", branchId)
      
    const { data: fallbackData } = await fallbackQuery
    if (fallbackData) {
      let r = 0
      let p = 0
      for (const line of fallbackData) {
        const coa = Array.isArray(line.chart_of_accounts) ? line.chart_of_accounts[0] : line.chart_of_accounts
        const type = coa?.sub_type
        const d = Number(line.debit_amount || 0)
        const c = Number(line.credit_amount || 0)
        if (type === "accounts_receivable") r += (d - c)
        if (type === "accounts_payable") p += (c - d)
      }
      glReceivables = r
      glPayables = p
    }
  } catch { /* non-critical */ }

  return (
    <DashboardSecondaryStats
      invoicesData={monthlyInvData || []}
      billsData={monthlyBillData || []}
      arData={arData || []}
      apData={apData || []}
      glReceivables={glReceivables}
      glPayables={glPayables}
      defaultCurrency={currency}
      appLang={appLang}
      glMonthlyRevenue={glMonthlyRevenue}
      glMonthlyExpense={glMonthlyExpense}
    />
  )
}

