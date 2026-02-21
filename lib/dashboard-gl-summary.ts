/**
 * Dashboard GL Summary - Shared server-side logic
 * يُستدعى من page.tsx و API route
 * المصدر الوحيد للأرقام المالية الرسمية
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

  for (const line of glLines || []) {
    const coa = (line as any).chart_of_accounts
    const accountType = coa?.account_type || ""
    const subType = String(coa?.sub_type || "").toLowerCase()
    const accountCode = coa?.account_code || ""
    const debit = Number(line.debit_amount || 0)
    const credit = Number(line.credit_amount || 0)
    const net = debit - credit
    const accountName = coa?.account_name || accountCode

    if (accountType === "income" || accountType === "revenue") {
      const amount = credit - debit
      totalRevenue += amount
      revenueByAccount[accountName] = (revenueByAccount[accountName] || 0) + amount
    } else if (
      accountType === "expense" &&
      (accountCode === "5000" || subType === "cogs" || subType === "cost_of_goods_sold")
    ) {
      totalCOGS += net
    } else if (accountType === "expense") {
      totalExpenses += net
      expenseByAccount[accountName] = (expenseByAccount[accountName] || 0) + net
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
  }
}
