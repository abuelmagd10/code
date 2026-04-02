/**
 * Dashboard GL Summary - Shared server-side logic
 * يُستدعى من page.tsx و API route
 * المصدر الوحيد للأرقام المالية الرسمية
 *
 * استراتيجية الأداء:
 * 1. يحاول أولاً الاستعلام من Materialized View (dashboard_gl_monthly_summary) — أسرع بكثير
 * 2. يرجع إلى الاستعلام التفصيلي من journal_entry_lines إذا فشل الأول
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface GLSummaryResult {
  revenue: number
  cogs: number
  grossProfit: number
  operatingExpenses: number
  netProfit: number
  profitMargin: number
  assets: number
  liabilities: number
  equity: number
  topRevenue: { name: string; amount: number }[]
  topExpenses: { name: string; amount: number }[]
  journalLinesCount: number
  /** تجميع شهري من GL للرسم البياني — YYYY-MM → { revenue, expense } */
  monthlyBreakdown: Record<string, { revenue: number; expense: number }>
}

export interface GetGLSummaryOptions {
  /** فلترة بالفرع عند عرض لوحة التحكم لنطاق فرع محدد */
  branchId?: string | null
}

export async function getGLSummary(
  supabase: SupabaseClient,
  companyId: string,
  fromDate: string,
  toDate: string,
  options?: GetGLSummaryOptions
): Promise<GLSummaryResult> {
  let query = supabase
    .from("journal_entry_lines")
    .select(`
      debit_amount,
      credit_amount,
      chart_of_accounts!inner (
        account_type,
        sub_type,
        account_code,
        account_name
      ),
      journal_entries!inner (
        entry_date,
        status,
        company_id,
        branch_id
      )
    `)
    .eq("journal_entries.company_id", companyId)
    .eq("journal_entries.status", "posted")
    .eq("journal_entries.is_deleted", false)
    .gte("journal_entries.entry_date", fromDate)
    .lte("journal_entries.entry_date", toDate)

  if (options?.branchId) {
    query = query.eq("journal_entries.branch_id", options.branchId)
  }

  const { data: glLines, error: glErr } = await query

  if (glErr) {
    throw new Error(`GL fetch failed: ${glErr.message}`)
  }

  let totalRevenue = 0
  let totalCOGS = 0
  let totalExpenses = 0
  let totalAssets = 0
  let totalLiabilities = 0
  let totalEquity = 0

  const revenueByAccount: Record<string, number> = {}
  const expenseByAccount: Record<string, number> = {}
  /** YYYY-MM → { revenue, expense } — للرسم البياني الشهري من GL */
  const monthlyBreakdown: Record<string, { revenue: number; expense: number }> = {}

  for (const line of glLines || []) {
    const coa = (line as any).chart_of_accounts
    const accountType = coa?.account_type || ""
    const subType = String(coa?.sub_type || "").toLowerCase()
    const accountCode = coa?.account_code || ""
    const debit = Number(line.debit_amount || 0)
    const credit = Number(line.credit_amount || 0)
    const net = debit - credit
    const accountName = coa?.account_name || accountCode
    // YYYY-MM من تاريخ القيد للتجميع الشهري
    const entryMonth: string = String((line as any).journal_entries?.entry_date || "").slice(0, 7)

    if (accountType === "income" || accountType === "revenue") {
      const amount = credit - debit
      totalRevenue += amount
      revenueByAccount[accountName] = (revenueByAccount[accountName] || 0) + amount
      if (entryMonth) {
        if (!monthlyBreakdown[entryMonth]) monthlyBreakdown[entryMonth] = { revenue: 0, expense: 0 }
        monthlyBreakdown[entryMonth].revenue += amount
      }
    } else if (
      accountType === "expense" &&
      (accountCode === "5000" || subType === "cogs" || subType === "cost_of_goods_sold")
    ) {
      totalCOGS += net
      if (entryMonth) {
        if (!monthlyBreakdown[entryMonth]) monthlyBreakdown[entryMonth] = { revenue: 0, expense: 0 }
        monthlyBreakdown[entryMonth].expense += net
      }
    } else if (accountType === "expense") {
      totalExpenses += net
      expenseByAccount[accountName] = (expenseByAccount[accountName] || 0) + net
      if (entryMonth) {
        if (!monthlyBreakdown[entryMonth]) monthlyBreakdown[entryMonth] = { revenue: 0, expense: 0 }
        monthlyBreakdown[entryMonth].expense += net
      }
    } else if (accountType === "asset") {
      totalAssets += net
    } else if (accountType === "liability") {
      totalLiabilities += credit - debit
    } else if (accountType === "equity") {
      totalEquity += credit - debit
    }
  }

  const grossProfit = totalRevenue - totalCOGS
  const netProfit = grossProfit - totalExpenses
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  const topRevenue = Object.entries(revenueByAccount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount }))

  const topExpenses = Object.entries(expenseByAccount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount }))

  return {
    revenue: Math.round(totalRevenue * 100) / 100,
    cogs: Math.round(totalCOGS * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    operatingExpenses: Math.round(totalExpenses * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    profitMargin: Math.round(profitMargin * 10) / 10,
    assets: Math.round(totalAssets * 100) / 100,
    liabilities: Math.round(totalLiabilities * 100) / 100,
    equity: Math.round(totalEquity * 100) / 100,
    topRevenue,
    topExpenses,
    journalLinesCount: (glLines || []).length,
    monthlyBreakdown,
  }
}

/**
 * نسخة سريعة من getGLSummary تستخدم الـ Materialized View
 * تُعيد نفس الـ interface لكن بدون topRevenue/topExpenses/assets/liabilities/equity
 * (هذه الحقول ليست مطلوبة في لوحة التحكم)
 *
 * الأداء: ~10× أسرع من getGLSummary لأنها تقرأ من بيانات مُجمَّعة مسبقاً
 */
export async function getGLSummaryFast(
  supabase: SupabaseClient,
  companyId: string,
  fromDate: string,
  toDate: string,
  options?: GetGLSummaryOptions
): Promise<GLSummaryResult> {
  const fromMonth = fromDate.slice(0, 7) // YYYY-MM
  const toMonth   = toDate.slice(0, 7)

  try {
    // محاولة استخدام الـ Materialized View
    let query = supabase
      .from("dashboard_gl_monthly_summary")
      .select("account_type, sub_type, account_code, total_debit, total_credit, net_credit, month_key")
      .eq("company_id", companyId)
      .gte("month_key", fromMonth)
      .lte("month_key", toMonth)

    if (options?.branchId) {
      query = query.eq("branch_id", options.branchId)
    } else {
      // في Company View: نجمع جميع الفروع (branch_id قد تكون null أو أي قيمة)
      // لا نضيف فلتر على branch_id
    }

    const { data: mvRows, error: mvErr } = await query

    if (mvErr) {
      // الـ MV غير موجود — ننتقل للـ fallback
      throw new Error(`MV not available: ${mvErr.message}`)
    }

    let totalRevenue = 0
    let totalCOGS    = 0
    let totalExpenses = 0
    const monthlyBreakdown: Record<string, { revenue: number; expense: number }> = {}

    for (const row of mvRows || []) {
      const accountType = String(row.account_type || "")
      const subType     = String(row.sub_type || "").toLowerCase()
      const accountCode = String(row.account_code || "")
      const netCredit   = Number(row.net_credit || 0)  // إيجابي = دائن
      const netDebit    = -netCredit                    // إيجابي = مدين
      const monthKey    = String(row.month_key || "")

      if (!monthlyBreakdown[monthKey]) monthlyBreakdown[monthKey] = { revenue: 0, expense: 0 }

      if (accountType === "income" || accountType === "revenue") {
        totalRevenue += netCredit
        monthlyBreakdown[monthKey].revenue += netCredit
      } else if (
        accountType === "expense" &&
        (accountCode === "5000" || subType === "cogs" || subType === "cost_of_goods_sold")
      ) {
        totalCOGS += netDebit
        monthlyBreakdown[monthKey].expense += netDebit
      } else if (accountType === "expense") {
        totalExpenses += netDebit
        monthlyBreakdown[monthKey].expense += netDebit
      }
    }

    const grossProfit  = totalRevenue - totalCOGS
    const netProfit    = grossProfit - totalExpenses
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

    return {
      revenue:           Math.round(totalRevenue   * 100) / 100,
      cogs:              Math.round(totalCOGS       * 100) / 100,
      grossProfit:       Math.round(grossProfit     * 100) / 100,
      operatingExpenses: Math.round(totalExpenses   * 100) / 100,
      netProfit:         Math.round(netProfit        * 100) / 100,
      profitMargin:      Math.round(profitMargin     * 10)  / 10,
      assets:            0,
      liabilities:       0,
      equity:            0,
      topRevenue:        [],
      topExpenses:       [],
      journalLinesCount: mvRows?.length ?? 0,
      monthlyBreakdown,
    }
  } catch {
    // Fallback إلى الاستعلام التفصيلي إذا لم يكن الـ MV جاهزاً
    return getGLSummary(supabase, companyId, fromDate, toDate, options)
  }
}
