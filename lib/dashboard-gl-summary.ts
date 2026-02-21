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
  journalLinesCount: number
}

export async function getGLSummary(
  supabase: SupabaseClient,
  companyId: string,
  fromDate: string,
  toDate: string
): Promise<GLSummaryResult> {
  const { data: glLines, error: glErr } = await supabase
    .from("journal_entry_lines")
    .select(`
      debit_amount,
      credit_amount,
      chart_of_accounts!inner (
        account_type,
        sub_type,
        account_code
      ),
      journal_entries!inner (
        entry_date,
        status,
        company_id
      )
    `)
    .eq("journal_entries.company_id", companyId)
    .eq("journal_entries.status", "posted")
    .gte("journal_entries.entry_date", fromDate)
    .lte("journal_entries.entry_date", toDate)

  if (glErr) {
    throw new Error(`GL fetch failed: ${glErr.message}`)
  }

  let totalRevenue = 0
  let totalCOGS = 0
  let totalExpenses = 0

  for (const line of glLines || []) {
    const coa = (line as any).chart_of_accounts
    const accountType = coa?.account_type || ""
    const subType = String(coa?.sub_type || "").toLowerCase()
    const accountCode = coa?.account_code || ""
    const debit = Number(line.debit_amount || 0)
    const credit = Number(line.credit_amount || 0)
    const net = debit - credit

    if (accountType === "income" || accountType === "revenue") {
      totalRevenue += credit - debit
    } else if (
      accountType === "expense" &&
      (accountCode === "5000" || subType === "cogs" || subType === "cost_of_goods_sold")
    ) {
      totalCOGS += net
    } else if (accountType === "expense") {
      totalExpenses += net
    }
  }

  const grossProfit = totalRevenue - totalCOGS
  const netProfit = grossProfit - totalExpenses
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  return {
    revenue: Math.round(totalRevenue * 100) / 100,
    cogs: Math.round(totalCOGS * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    operatingExpenses: Math.round(totalExpenses * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    profitMargin: Math.round(profitMargin * 10) / 10,
    journalLinesCount: (glLines || []).length,
  }
}
