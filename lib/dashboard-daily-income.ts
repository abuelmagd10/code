/**
 * Dashboard Daily Income (Cash + Bank flow) by Branch
 * GL-First: all figures from journal_entry_lines for Cash/Bank accounts only.
 * Used by Daily Income Card and API.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface DailyIncomeByBranchRow {
  branchId: string | null
  branchName: string | null
  totalIncome: number
}

export interface GetDailyIncomeByBranchOptions {
  /** Restrict to a single branch (for non-privileged users) */
  branchId?: string | null
  /** Optional cost_center filter when scope is branch */
  costCenterId?: string | null
}

function isCashOrBankAccount(account: { sub_type?: string | null; account_name?: string | null }): boolean {
  const st = String(account.sub_type || "").toLowerCase()
  if (st === "cash" || st === "bank") return true
  const nm = String(account.account_name || "").toLowerCase()
  if (nm.includes("cash") || nm.includes("bank")) return true
  if (/بنك|بنكي|مصرف|خزينة|نقد|صندوق/.test(account.account_name || "")) return true
  return false
}

/**
 * Get daily income (net Cash + Bank flow) per branch for a given date.
 * Daily income = sum(debit - credit) for all Cash/Bank account lines on that day, grouped by branch.
 * Values are in company base currency (GL).
 * Uses mv_gl_daily_branch_cash_flow when available (no cost_center filter); otherwise queries GL directly.
 */
export async function getDailyIncomeByBranch(
  supabase: SupabaseClient,
  companyId: string,
  date: string,
  options?: GetDailyIncomeByBranchOptions
): Promise<DailyIncomeByBranchRow[]> {
  const dateOnly = date.slice(0, 10)

  // Optional: use materialized view when no cost_center filter (faster for large data)
  if (!options?.costCenterId) {
    try {
      let mvQuery = supabase
        .from("mv_gl_daily_branch_cash_flow")
        .select("branch_id, total_debit, total_credit")
        .eq("company_id", companyId)
        .eq("entry_date", dateOnly)
      if (options?.branchId) {
        mvQuery = mvQuery.eq("branch_id", options.branchId)
      }
      const { data: mvRows, error: mvErr } = await mvQuery
      if (!mvErr && mvRows && mvRows.length > 0) {
        const byBranch = new Map<string | null, number>()
        for (const row of mvRows) {
          const branchId = row.branch_id ?? null
          const net = Number(row.total_debit || 0) - Number(row.total_credit || 0)
          byBranch.set(branchId, (byBranch.get(branchId) ?? 0) + net)
        }
        const branchIds = [...byBranch.keys()].filter(Boolean) as string[]
        let branchNames: Record<string, string> = {}
        if (branchIds.length > 0) {
          const { data: branches } = await supabase
            .from("branches")
            .select("id, name")
            .in("id", branchIds)
          branchNames = Object.fromEntries((branches || []).map((b: any) => [b.id, b.name || ""]))
        }
        const result: DailyIncomeByBranchRow[] = []
        for (const [branchId, totalIncome] of byBranch.entries()) {
          result.push({
            branchId,
            branchName: branchId ? (branchNames[branchId] || null) : null,
            totalIncome: Math.round(totalIncome * 100) / 100
          })
        }
        result.sort((a, b) => {
          if (!a.branchId) return -1
          if (!b.branchId) return 1
          return (a.branchName || "").localeCompare(b.branchName || "")
        })
        return result
      }
    } catch {
      // Fall through to direct GL query
    }
  }

  // 1) Get Cash/Bank account IDs for this company
  const { data: accounts, error: accErr } = await supabase
    .from("chart_of_accounts")
    .select("id, sub_type, account_name, parent_id")
    .eq("company_id", companyId)

  if (accErr) throw new Error(`Failed to load accounts: ${accErr.message}`)

  const parentIds = new Set((accounts || []).map((a: any) => a.parent_id).filter(Boolean))
  const cashBankAccounts = (accounts || []).filter(
    (a: any) => isCashOrBankAccount(a) && !parentIds.has(a.id)
  )
  const accountIds = cashBankAccounts.map((a: any) => a.id)
  if (accountIds.length === 0) return []

  // 2) Fetch journal lines for that date: jel + je, filter by account_id in accountIds
  let query = supabase
    .from("journal_entry_lines")
    .select(`
      account_id,
      debit_amount,
      credit_amount,
      journal_entries!inner (
        entry_date,
        company_id,
        branch_id,
        status,
        cost_center_id
      )
    `)
    .in("account_id", accountIds)
    .eq("journal_entries.company_id", companyId)
    .eq("journal_entries.status", "posted")
    .eq("journal_entries.entry_date", dateOnly)

  if (options?.branchId) {
    query = query.eq("journal_entries.branch_id", options.branchId)
  }
  if (options?.costCenterId) {
    query = query.eq("journal_entries.cost_center_id", options.costCenterId)
  }

  const { data: lines, error: linesErr } = await query
  if (linesErr) throw new Error(`GL daily income fetch failed: ${linesErr.message}`)

  // 3) Group by branch_id and sum (debit - credit)
  const byBranch = new Map<string | null, number>()
  for (const line of lines || []) {
    const je = (line as any).journal_entries
    const branchId = je?.branch_id ?? null
    const debit = Number(line.debit_amount || 0)
    const credit = Number(line.credit_amount || 0)
    const net = debit - credit
    byBranch.set(branchId, (byBranch.get(branchId) ?? 0) + net)
  }

  // 4) Fetch branch names for non-null branch_ids
  const branchIds = [...byBranch.keys()].filter(Boolean) as string[]
  let branchNames: Record<string, string> = {}
  if (branchIds.length > 0) {
    const { data: branches } = await supabase
      .from("branches")
      .select("id, name")
      .in("id", branchIds)
    branchNames = Object.fromEntries((branches || []).map((b: any) => [b.id, b.name || ""]))
  }

  const result: DailyIncomeByBranchRow[] = []
  for (const [branchId, totalIncome] of byBranch.entries()) {
    result.push({
      branchId,
      branchName: branchId ? (branchNames[branchId] || null) : null,
      totalIncome: Math.round(totalIncome * 100) / 100
    })
  }
  // Sort: null (company-wide) first, then by branch name
  result.sort((a, b) => {
    if (!a.branchId) return -1
    if (!b.branchId) return 1
    return (a.branchName || "").localeCompare(b.branchName || "")
  })
  return result
}
