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
 * Uses a two-step query approach for reliable branch filtering:
 *   Step 1: Get journal_entry IDs for the given date/company/branch
 *   Step 2: Get journal_entry_lines for those IDs restricted to cash/bank accounts
 * This avoids nested Supabase JS filter issues and uuid[] RPC type conversion problems.
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

  // 2) Step 1: Fetch journal entry IDs + branch_id for the given date/company/branch
  //    We do this as a SEPARATE query to avoid unreliable nested join filters in Supabase JS
  let jeQuery = supabase
    .from("journal_entries")
    .select("id, branch_id")
    .eq("company_id", companyId)
    .eq("status", "posted")
    .eq("entry_date", dateOnly)

  if (options?.branchId) {
    jeQuery = jeQuery.eq("branch_id", options.branchId)
  }
  // Note: cost_center_id is intentionally NOT filtered here.
  // Branch isolation is the correct security boundary for GL daily income.
  // Cost center is an optional allocation tag; many journal entries don't carry it,
  // so filtering by it would silently exclude valid transactions.

  const { data: journalEntries, error: jeErr } = await jeQuery
  if (jeErr) throw new Error(`Failed to load journal entries: ${jeErr.message}`)
  if (!journalEntries || journalEntries.length === 0) return []

  const jeIds = journalEntries.map((je: any) => je.id)
  const jeBranchMap = new Map<string, string | null>(
    journalEntries.map((je: any) => [je.id, je.branch_id ?? null])
  )

  // 3) Step 2: Fetch journal lines for those entry IDs, restricted to cash/bank accounts
  const { data: lines, error: linesErr } = await supabase
    .from("journal_entry_lines")
    .select("journal_entry_id, account_id, debit_amount, credit_amount")
    .in("journal_entry_id", jeIds)
    .in("account_id", accountIds)

  if (linesErr) throw new Error(`GL daily income lines fetch failed: ${linesErr.message}`)

  // 4) Group by branch: cash and bank separately
  const byBranchCash = new Map<string | null, number>()
  const byBranchBank = new Map<string | null, number>()
  for (const line of lines || []) {
    const branchId = jeBranchMap.get((line as any).journal_entry_id) ?? null
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
