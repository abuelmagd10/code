/**
 * Dashboard Daily Income (Cash + Bank flow) by Branch
 * GL-First: all figures from journal_entry_lines for Cash/Bank accounts only.
 * Used by Daily Income Card and API.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface DailyIncomeByBranchRow {
  branchId: string | null
  branchName: string | null
  /** المتحصل النقدي بالخزنة (Cash in Treasury) */
  cashIncome: number
  /** الإيداعات البنكية اليومية (Bank Deposits) */
  bankIncome: number
  /** الإجمالي الكلي = نقد + بنك */
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

/** Classify as bank (إيداعات بنكية) vs cash (نقد بالخزنة); prefer sub_type, then name. */
function getAccountFlowType(account: { sub_type?: string | null; account_name?: string | null }): "cash" | "bank" | null {
  const st = String(account.sub_type || "").toLowerCase()
  if (st === "bank") return "bank"
  if (st === "cash") return "cash"
  const nm = (account.account_name || "").toLowerCase()
  const ar = account.account_name || ""
  if (/bank|بنك|بنكي|مصرف/.test(nm) || /بنك|مصرف/.test(ar)) return "bank"
  if (/cash|خزينة|نقد|صندوق/.test(nm) || /خزينة|نقد|صندوق/.test(ar)) return "cash"
  return null
}

/**
 * Get daily income (Cash + Bank) per branch for a given date, with separate cash and bank amounts.
 * Cash = المتحصل النقدي بالخزنة (Cash in Treasury), Bank = الإيداعات البنكية (Bank Deposits), Total = نقد + بنك.
 * Uses direct GL query to support cash/bank breakdown (MV does not provide it).
 */
export async function getDailyIncomeByBranch(
  supabase: SupabaseClient,
  companyId: string,
  date: string,
  options?: GetDailyIncomeByBranchOptions
): Promise<DailyIncomeByBranchRow[]> {
  const dateOnly = date.slice(0, 10)

  // 1) Get Cash/Bank account IDs and classify as cash vs bank
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

  const cashAccountIds = new Set<string>()
  const bankAccountIds = new Set<string>()
  for (const a of cashBankAccounts) {
    const flowType = getAccountFlowType(a)
    if (flowType === "cash") cashAccountIds.add(a.id)
    else if (flowType === "bank") bankAccountIds.add(a.id)
    else cashAccountIds.add(a.id) // default ambiguous to cash
  }

  // 2) Fetch journal lines for that date using direct SQL for reliable branch filtering
  let sqlQuery = `
    SELECT
      jel.account_id,
      jel.debit_amount,
      jel.credit_amount,
      je.branch_id
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = ANY($1::uuid[])
      AND je.company_id = $2
      AND je.status = 'posted'
      AND je.entry_date = $3
  `
  const sqlParams: any[] = [accountIds, companyId, dateOnly]
  let paramIdx = 4

  if (options?.branchId) {
    sqlQuery += ` AND je.branch_id = $${paramIdx++}`
    sqlParams.push(options.branchId)
  }
  if (options?.costCenterId) {
    sqlQuery += ` AND je.cost_center_id = $${paramIdx++}`
    sqlParams.push(options.costCenterId)
  }

  // Use Supabase RPC for direct SQL execution
  const { data: lines, error: linesErr } = await (supabase as any).rpc(
    "run_daily_income_query",
    {
      p_account_ids: accountIds,
      p_company_id: companyId,
      p_date: dateOnly,
      p_branch_id: options?.branchId ?? null,
      p_cost_center_id: options?.costCenterId ?? null,
    }
  )
  if (linesErr) {
    // Fallback: use the original Supabase query approach if RPC is not available
    let fallbackQuery = supabase
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
      fallbackQuery = fallbackQuery.eq("journal_entries.branch_id", options.branchId)
    }
    if (options?.costCenterId) {
      fallbackQuery = fallbackQuery.eq("journal_entries.cost_center_id", options.costCenterId)
    }

    const { data: fallbackLines, error: fallbackErr } = await fallbackQuery
    if (fallbackErr) throw new Error(`GL daily income fetch failed: ${fallbackErr.message}`)

    // Process fallback lines (nested structure)
    const byBranchCashFb = new Map<string | null, number>()
    const byBranchBankFb = new Map<string | null, number>()
    for (const line of fallbackLines || []) {
      const je = (line as any).journal_entries
      const branchId = je?.branch_id ?? null
      const debit = Number(line.debit_amount || 0)
      const credit = Number(line.credit_amount || 0)
      const net = debit - credit
      const accountId = (line as any).account_id
      if (cashAccountIds.has(accountId)) {
        byBranchCashFb.set(branchId, (byBranchCashFb.get(branchId) ?? 0) + net)
      } else if (bankAccountIds.has(accountId)) {
        byBranchBankFb.set(branchId, (byBranchBankFb.get(branchId) ?? 0) + net)
      }
    }
    const allBranchIdsFb = new Set([...byBranchCashFb.keys(), ...byBranchBankFb.keys()])
    const branchIdsFb = [...allBranchIdsFb].filter(Boolean) as string[]
    let branchNamesFb: Record<string, string> = {}
    if (branchIdsFb.length > 0) {
      const { data: branches } = await supabase
        .from("branches")
        .select("id, name")
        .in("id", branchIdsFb)
      branchNamesFb = Object.fromEntries((branches || []).map((b: any) => [b.id, b.name || ""]))
    }
    const resultFb: DailyIncomeByBranchRow[] = []
    for (const branchId of allBranchIdsFb) {
      const cashIncome = Math.round((byBranchCashFb.get(branchId) ?? 0) * 100) / 100
      const bankIncome = Math.round((byBranchBankFb.get(branchId) ?? 0) * 100) / 100
      const totalIncome = Math.round((cashIncome + bankIncome) * 100) / 100
      resultFb.push({ branchId, branchName: branchId ? (branchNamesFb[branchId] || null) : null, cashIncome, bankIncome, totalIncome })
    }
    resultFb.sort((a, b) => { if (!a.branchId) return -1; if (!b.branchId) return 1; return (a.branchName || "").localeCompare(b.branchName || "") })
    return resultFb
  }

  // Process RPC response (flat structure: account_id, debit_amount, credit_amount, branch_id)
  const processedLines = lines || []

  // 3) Group by branch: cash (نقد بالخزنة) and bank (إيداعات بنكية) separately
  const byBranchCash = new Map<string | null, number>()
  const byBranchBank = new Map<string | null, number>()
  for (const line of processedLines) {
    // RPC returns flat: { account_id, debit_amount, credit_amount, branch_id }
    const branchId = (line as any).branch_id ?? null
    const debit = Number((line as any).debit_amount || 0)
    const credit = Number((line as any).credit_amount || 0)
    const net = debit - credit
    const accountId = (line as any).account_id
    if (cashAccountIds.has(accountId)) {
      byBranchCash.set(branchId, (byBranchCash.get(branchId) ?? 0) + net)
    } else if (bankAccountIds.has(accountId)) {
      byBranchBank.set(branchId, (byBranchBank.get(branchId) ?? 0) + net)
    }
  }

  const allBranchIds = new Set([...byBranchCash.keys(), ...byBranchBank.keys()])
  const branchIds = [...allBranchIds].filter(Boolean) as string[]
  let branchNames: Record<string, string> = {}
  if (branchIds.length > 0) {
    const { data: branches } = await supabase
      .from("branches")
      .select("id, name")
      .in("id", branchIds)
    branchNames = Object.fromEntries((branches || []).map((b: any) => [b.id, b.name || ""]))
  }

  const result: DailyIncomeByBranchRow[] = []
  for (const branchId of allBranchIds) {
    const cashIncome = Math.round((byBranchCash.get(branchId) ?? 0) * 100) / 100
    const bankIncome = Math.round((byBranchBank.get(branchId) ?? 0) * 100) / 100
    const totalIncome = Math.round((cashIncome + bankIncome) * 100) / 100
    result.push({
      branchId,
      branchName: branchId ? (branchNames[branchId] || null) : null,
      cashIncome,
      bankIncome,
      totalIncome
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
