/**
 * Dashboard Daily Income (Cash + Bank flow) by Branch
 * GL-First: all figures from journal_entry_lines for Cash/Bank accounts only.
 * Used by Daily Income Card and API.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface DailyIncomeByBranchRow {
  branchId: string | null
  branchName: string | null
  /** صافى النقد بالخزنة (debit - credit) */
  cashIncome: number
  /** صافى إيداعات بنكية (debit - credit) */
  bankIncome: number
  /** الإجمالي الكلي = نقد + بنك */
  totalIncome: number
  // v3.74.549 — split inflow / outflow so the widget can present
  // both sides of the movement (وارد / صادر) instead of only net.
  /** إجمالى الوارد للخزنة (sum of debit amounts) */
  cashIn: number
  /** إجمالى الصادر من الخزنة (sum of credit amounts) */
  cashOut: number
  /** إجمالى الوارد للبنك */
  bankIn: number
  /** إجمالى الصادر من البنك */
  bankOut: number
  /** إجمالى وارد نقد + بنك */
  totalIn: number
  /** إجمالى صادر نقد + بنك */
  totalOut: number
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
  //
  // v3.74.548 — Daily income is a "what really moved" report, so it must
  // exclude administrative reversals and the payment rows they cancelled.
  // Concretely:
  //   * reference_type = 'payment_reversal'  →  VOID reversal JE — filtered
  //     out below by .neq. Its debit-cash side would otherwise show as an
  //     inflow on the correction execution day.
  //   * reference_type = 'payment' with the referenced payment voided —
  //     filtered out below AFTER the fetch by a payments.voided_at check.
  //     Keeping the original would double-count the payment (once for the
  //     original, once for the correction_repost) plus show the void'd
  //     amount as a genuine cash movement it no longer is.
  //   * reference_type = 'payment_correction_repost'  →  kept: this is
  //     the CORRECTED payment and is the true business event.
  let jeQuery = supabase
    .from("journal_entries")
    .select("id, branch_id, reference_type, reference_id")
    .eq("company_id", companyId)
    .eq("status", "posted")
    .eq("entry_date", dateOnly)
    .neq("reference_type", "payment_reversal")

  if (options?.branchId) {
    jeQuery = jeQuery.eq("branch_id", options.branchId)
  }
  // Note: cost_center_id is intentionally NOT filtered here.
  // Branch isolation is the correct security boundary for GL daily income.
  // Cost center is an optional allocation tag; many journal entries don't carry it,
  // so filtering by it would silently exclude valid transactions.

  const { data: journalEntriesRaw, error: jeErr } = await jeQuery
  if (jeErr) throw new Error(`Failed to load journal entries: ${jeErr.message}`)
  if (!journalEntriesRaw || journalEntriesRaw.length === 0) return []

  // v3.74.550 — reference_type isn't a reliable marker: legacy payment
  // JEs may carry reference_type='bill_payment' (with bill_id in
  // reference_id) instead of 'payment' (with payment_id). Fix the
  // filter by asking payments directly: which JEs are payment JEs
  // (via payments.journal_entry_id) and which of those are voided?
  const jeIdsForLookup = journalEntriesRaw.map((je: any) => je.id) as string[]
  const voidedJeIds = new Set<string>()
  if (jeIdsForLookup.length > 0) {
    const { data: pays } = await supabase
      .from("payments")
      .select("journal_entry_id, voided_at")
      .in("journal_entry_id", jeIdsForLookup)
    for (const p of pays || []) {
      const jid = (p as any).journal_entry_id
      const voided = (p as any).voided_at
      if (jid && voided) voidedJeIds.add(jid)
    }
  }

  const journalEntries = journalEntriesRaw.filter(
    (je: any) => !voidedJeIds.has(je.id)
  )
  if (journalEntries.length === 0) return []

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

  // 4) Group by branch: cash and bank separately (v3.74.549 — split into
  // inflow/outflow so the widget can show وارد / صادر / صافى).
  const byBranchCash = new Map<string | null, number>()
  const byBranchBank = new Map<string | null, number>()
  const byBranchCashIn = new Map<string | null, number>()
  const byBranchCashOut = new Map<string | null, number>()
  const byBranchBankIn = new Map<string | null, number>()
  const byBranchBankOut = new Map<string | null, number>()
  for (const line of lines || []) {
    const branchId = jeBranchMap.get((line as any).journal_entry_id) ?? null
    const debit = Number((line as any).debit_amount || 0)
    const credit = Number((line as any).credit_amount || 0)
    const net = debit - credit
    const accountId = (line as any).account_id
    if (cashAccountIds.has(accountId)) {
      byBranchCash.set(branchId, (byBranchCash.get(branchId) ?? 0) + net)
      byBranchCashIn.set(branchId, (byBranchCashIn.get(branchId) ?? 0) + debit)
      byBranchCashOut.set(branchId, (byBranchCashOut.get(branchId) ?? 0) + credit)
    } else if (bankAccountIds.has(accountId)) {
      byBranchBank.set(branchId, (byBranchBank.get(branchId) ?? 0) + net)
      byBranchBankOut.set(branchId, (byBranchBankOut.get(branchId) ?? 0) + credit)
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

  const r2 = (n: number) => Math.round(n * 100) / 100
  const result: DailyIncomeByBranchRow[] = []
  for (const branchId of allBranchIds) {
    const cashIncome = r2(byBranchCash.get(branchId) ?? 0)
    const bankIncome = r2(byBranchBank.get(branchId) ?? 0)
    const cashIn    = r2(byBranchCashIn.get(branchId)  ?? 0)
    const cashOut   = r2(byBranchCashOut.get(branchId) ?? 0)
    const bankIn    = r2(byBranchBankIn.get(branchId)  ?? 0)
    const bankOut   = r2(byBranchBankOut.get(branchId) ?? 0)
    const totalIncome = r2(cashIncome + bankIncome)
    const totalIn     = r2(cashIn + bankIn)
    const totalOut    = r2(cashOut + bankOut)
    result.push({
      branchId,
      branchName: branchId ? (branchNames[branchId] || null) : null,
      cashIncome, bankIncome, totalIncome,
      cashIn, cashOut, bankIn, bankOut, totalIn, totalOut
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
