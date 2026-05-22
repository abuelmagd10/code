/**
 * v3.27.5: Period-end FX Revaluation (IAS 21 Part B)
 *
 * At each accounting period close (month/quarter/year), all monetary assets and
 * liabilities denominated in foreign currency must be revalued to the rate
 * prevailing at the period-end date. The difference between book value (at
 * historical rate) and current value (at period-end rate) is recognized as
 * UNREALIZED FX gain/loss.
 *
 * Standard practice:
 *  - Period-end:      Dr/Cr FC account + Dr/Cr FX Gain (4320) or FX Loss (5310)
 *  - Period-start:    Reverse the adjustment (so book value returns to historical
 *                     rate). This way the gain/loss is recognized only for the
 *                     specific period.
 *
 * Scope: This module covers cash/bank accounts (account_code starts with 10xx/11xx)
 * that have a `original_currency` different from the company's base_currency.
 * Other monetary items (AR, AP, etc.) are out of scope for this initial release.
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { getBaseCurrency, getExchangeRate, getFXAccounts } from "./currency-service"

export interface FXRevaluationLine {
  accountId: string
  accountCode: string
  accountName: string
  nativeBalance: number
  nativeCurrency: string
  bookValueBase: number
  revaluedValueBase: number
  diff: number  // positive = unrealized gain, negative = unrealized loss
}

export interface FXRevaluationResult {
  success: boolean
  asOfDate: string
  baseCurrency: string
  lines: FXRevaluationLine[]
  totalGain: number
  totalLoss: number
  journalEntryId?: string
  reverseJournalEntryId?: string
  error?: string
}

/**
 * Compute the FC accounts that need revaluation, without creating any journals.
 * Use this to preview what the revaluation will look like before posting.
 */
export async function computeFXRevaluation(
  supabase: SupabaseClient,
  companyId: string,
  asOfDate: string,  // YYYY-MM-DD
): Promise<FXRevaluationResult> {
  try {
    const baseCurrency = await getBaseCurrency(supabase, companyId)

    // 1. Load all FC cash/bank accounts (code 10xx or 11xx) with their native currency
    const { data: accounts, error: accErr } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, original_currency, sub_type, account_type")
      .eq("company_id", companyId)
      .eq("is_active", true)

    if (accErr) {
      return { success: false, asOfDate, baseCurrency, lines: [], totalGain: 0, totalLoss: 0, error: accErr.message }
    }

    const fcAccounts = (accounts || []).filter((a: any) => {
      const code = String(a.account_code || "")
      const isCashBank = /^1[01]/.test(code) || a.sub_type === "cash" || a.sub_type === "bank"
      const nativeCur = String(a.original_currency || "").toUpperCase()
      return isCashBank && nativeCur && nativeCur !== baseCurrency.toUpperCase()
    })

    if (fcAccounts.length === 0) {
      return { success: true, asOfDate, baseCurrency, lines: [], totalGain: 0, totalLoss: 0 }
    }

    const lines: FXRevaluationLine[] = []
    let totalGain = 0
    let totalLoss = 0

    // 2. For each FC account, compute book value (base) and revalued value (base @ asOfDate rate)
    for (const acc of fcAccounts) {
      const nativeCur = String(acc.original_currency || "").toUpperCase()

      // Sum native and base from journal_entry_lines
      const { data: sums } = await supabase
        .from("journal_entry_lines")
        .select("debit_amount, credit_amount, original_debit, original_credit, journal_entry_id")
        .eq("account_id", acc.id)

      let nativeBalance = 0
      let bookBaseBalance = 0
      const eligibleEntryIds = new Set<string>()

      // Filter by non-deleted journal entries up to asOfDate
      if (sums && sums.length > 0) {
        const entryIds = Array.from(new Set(sums.map((s: any) => s.journal_entry_id)))
        const { data: entries } = await supabase
          .from("journal_entries")
          .select("id, entry_date, is_deleted")
          .in("id", entryIds)
          .lte("entry_date", asOfDate)
          .eq("is_deleted", false)
        for (const e of (entries || []) as any[]) eligibleEntryIds.add(e.id)
      }

      for (const s of (sums || []) as any[]) {
        if (!eligibleEntryIds.has(s.journal_entry_id)) continue
        nativeBalance += Number(s.original_debit || 0) - Number(s.original_credit || 0)
        bookBaseBalance += Number(s.debit_amount || 0) - Number(s.credit_amount || 0)
      }

      // 3. Get the current rate (asOfDate or latest) from native → base
      let revaluedBase = bookBaseBalance
      try {
        const rateResult = await getExchangeRate(
          supabase,
          nativeCur,
          baseCurrency,
          new Date(asOfDate),
          companyId,
        )
        const currentRate = Number(rateResult?.rate || 0)
        if (currentRate > 0) {
          revaluedBase = Number((nativeBalance * currentRate).toFixed(2))
        }
      } catch {
        // If rate not found, skip this account (book value remains)
        continue
      }

      const diff = Number((revaluedBase - bookBaseBalance).toFixed(2))
      if (Math.abs(diff) < 0.01) continue  // no material change

      lines.push({
        accountId: acc.id,
        accountCode: String(acc.account_code || ""),
        accountName: String(acc.account_name || ""),
        nativeBalance: Number(nativeBalance.toFixed(8)),
        nativeCurrency: nativeCur,
        bookValueBase: Number(bookBaseBalance.toFixed(2)),
        revaluedValueBase: Number(revaluedBase.toFixed(2)),
        diff,
      })

      if (diff > 0) totalGain += diff
      else totalLoss += Math.abs(diff)
    }

    return { success: true, asOfDate, baseCurrency, lines, totalGain, totalLoss }
  } catch (e: any) {
    return {
      success: false,
      asOfDate,
      baseCurrency: "EGP",
      lines: [],
      totalGain: 0,
      totalLoss: 0,
      error: e?.message || String(e),
    }
  }
}

/**
 * Post the FX revaluation journal entries: one for period-end adjustment,
 * one for period-start reversal (next day).
 *
 * The reversal ensures book value returns to historical rate for the next period,
 * so the unrealized gain/loss is recognized in P&L only for the closed period.
 */
export async function postFXRevaluation(
  supabase: SupabaseClient,
  companyId: string,
  asOfDate: string,
  userId: string,
  options: { autoReverse?: boolean; branchId?: string | null } = { autoReverse: true },
): Promise<FXRevaluationResult> {
  const preview = await computeFXRevaluation(supabase, companyId, asOfDate)
  if (!preview.success || preview.lines.length === 0) return preview

  const { gainId, lossId } = await getFXAccounts(supabase, companyId)

  // Resolve branch if not provided
  let branchId = options.branchId || null
  if (!branchId) {
    const { data: firstBranch } = await (supabase as any)
      .from("branches")
      .select("id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    branchId = firstBranch?.id || null
  }
  if (!branchId) {
    return { ...preview, success: false, error: "Cannot post FX revaluation without an active branch" }
  }

  // Build journal lines for the adjustment
  const journalLines: any[] = []
  for (const line of preview.lines) {
    if (line.diff > 0) {
      // Unrealized gain: Dr FC account / Cr FX Gain
      journalLines.push({
        account_id: line.accountId,
        debit_amount: line.diff,
        credit_amount: 0,
        description: `FX revaluation gain - ${line.accountCode} (${line.nativeCurrency})`,
        original_currency: line.nativeCurrency,
      })
      journalLines.push({
        account_id: gainId,
        debit_amount: 0,
        credit_amount: line.diff,
        description: `Unrealized FX gain - ${line.accountCode}`,
      })
    } else {
      const abs = Math.abs(line.diff)
      // Unrealized loss: Dr FX Loss / Cr FC account
      journalLines.push({
        account_id: lossId,
        debit_amount: abs,
        credit_amount: 0,
        description: `Unrealized FX loss - ${line.accountCode}`,
      })
      journalLines.push({
        account_id: line.accountId,
        debit_amount: 0,
        credit_amount: abs,
        description: `FX revaluation loss - ${line.accountCode} (${line.nativeCurrency})`,
        original_currency: line.nativeCurrency,
      })
    }
  }

  // Create the adjustment entry
  const refUuid = (typeof crypto !== "undefined" && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const entryNumber = `FX-REVAL-${asOfDate}-${Date.now()}`

  const { data: entry, error: entryErr } = await (supabase as any)
    .from("journal_entries")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      entry_date: asOfDate,
      entry_number: entryNumber,
      description: `Period-end FX revaluation as of ${asOfDate} (IAS 21)`,
      reference_type: "fx_revaluation",
      reference_id: refUuid,
      status: "posted",
      posted_at: new Date().toISOString(),
      posted_by: userId,
    })
    .select()
    .single()

  if (entryErr || !entry) {
    return { ...preview, success: false, error: entryErr?.message || "Failed to create FX revaluation entry" }
  }

  const linesWithJE = journalLines.map((l) => ({ ...l, journal_entry_id: entry.id }))
  const { error: linesErr } = await (supabase as any)
    .from("journal_entry_lines")
    .insert(linesWithJE)
  if (linesErr) {
    return { ...preview, success: false, journalEntryId: entry.id, error: linesErr.message }
  }

  let reverseEntryId: string | undefined = undefined
  if (options.autoReverse !== false) {
    // Create reversing entry dated the next day
    const nextDay = new Date(asOfDate)
    nextDay.setDate(nextDay.getDate() + 1)
    const nextDayStr = nextDay.toISOString().slice(0, 10)
    const reverseRefUuid = (typeof crypto !== "undefined" && (crypto as any).randomUUID)
      ? (crypto as any).randomUUID()
      : `${Date.now() + 1}-${Math.random().toString(36).slice(2)}`

    const { data: reverseEntry, error: reverseErr } = await (supabase as any)
      .from("journal_entries")
      .insert({
        company_id: companyId,
        branch_id: branchId,
        entry_date: nextDayStr,
        entry_number: `FX-REVAL-REV-${nextDayStr}-${Date.now()}`,
        description: `Reversal of FX revaluation from ${asOfDate} (IAS 21)`,
        reference_type: "fx_revaluation_reversal",
        reference_id: reverseRefUuid,
        reversal_of_entry_id: entry.id,
        status: "posted",
        posted_at: new Date().toISOString(),
        posted_by: userId,
      })
      .select()
      .single()

    if (!reverseErr && reverseEntry) {
      reverseEntryId = reverseEntry.id
      // Flip debit/credit on each line
      const reversedLines = journalLines.map((l) => ({
        journal_entry_id: reverseEntry.id,
        account_id: l.account_id,
        debit_amount: l.credit_amount,
        credit_amount: l.debit_amount,
        description: `[Reversal] ${l.description}`,
        original_currency: l.original_currency,
      }))
      await (supabase as any).from("journal_entry_lines").insert(reversedLines)
    }
  }

  return { ...preview, journalEntryId: entry.id, reverseJournalEntryId: reverseEntryId }
}

/**
 * v3.27.6: Compute AR revaluation — open foreign-currency invoices.
 *
 * For each open FC invoice (status in 'sent','partially_paid','overdue'),
 * the AR exposure in BASE currency was booked at the invoice's original rate.
 * At period-end, the outstanding amount should be revalued at the current rate.
 */
export async function computeARRevaluation(
  supabase: SupabaseClient,
  companyId: string,
  asOfDate: string,
): Promise<FXRevaluationResult> {
  try {
    const baseCurrency = await getBaseCurrency(supabase, companyId)

    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, sub_type")
      .eq("company_id", companyId)
      .eq("is_active", true)
    const arRecord = (accounts as any[] | null)?.find((x: any) => x.sub_type === "accounts_receivable")
      || (accounts as any[] | null)?.find((x: any) => /receivable|عملاء|مدين/i.test(String(x.account_name || "")))
    if (!arRecord) {
      return { success: true, asOfDate, baseCurrency, lines: [], totalGain: 0, totalLoss: 0 }
    }

    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, currency_code, exchange_rate, total_amount, paid_amount, returned_amount, status")
      .eq("company_id", companyId)
      .lte("invoice_date", asOfDate)
      .in("status", ["sent", "partially_paid", "overdue", "pending"])

    if (!invoices || invoices.length === 0) {
      return { success: true, asOfDate, baseCurrency, lines: [], totalGain: 0, totalLoss: 0 }
    }

    const byCurrency = new Map<string, { totalOutstandingNative: number; totalBookBase: number; invoiceCount: number }>()
    for (const inv of invoices as any[]) {
      const cur = String(inv.currency_code || baseCurrency).toUpperCase()
      if (cur === baseCurrency.toUpperCase()) continue
      const rate = Number(inv.exchange_rate || 0)
      if (rate <= 0) continue
      const total = Number(inv.total_amount || 0)
      const paid = Number(inv.paid_amount || 0)
      const returned = Number(inv.returned_amount || 0)
      const outstanding = Math.max(0, total - paid - returned)
      if (outstanding < 0.01) continue
      const outstandingNative = outstanding / rate
      const bookBase = outstanding
      const existing = byCurrency.get(cur) || { totalOutstandingNative: 0, totalBookBase: 0, invoiceCount: 0 }
      existing.totalOutstandingNative += outstandingNative
      existing.totalBookBase += bookBase
      existing.invoiceCount += 1
      byCurrency.set(cur, existing)
    }

    if (byCurrency.size === 0) {
      return { success: true, asOfDate, baseCurrency, lines: [], totalGain: 0, totalLoss: 0 }
    }

    const lines: FXRevaluationLine[] = []
    let totalGain = 0
    let totalLoss = 0
    const byCurEntries = Array.from(byCurrency.entries())
    for (const [cur, agg] of byCurEntries) {
      let currentRate = 0
      try {
        const r = await getExchangeRate(supabase, cur, baseCurrency, new Date(asOfDate), companyId)
        currentRate = Number(r?.rate || 0)
      } catch { continue }
      if (currentRate <= 0) continue

      const revaluedBase = Number((agg.totalOutstandingNative * currentRate).toFixed(2))
      const diff = Number((revaluedBase - agg.totalBookBase).toFixed(2))
      if (Math.abs(diff) < 0.01) continue

      lines.push({
        accountId: arRecord.id,
        accountCode: String(arRecord.account_code || ""),
        accountName: arRecord.account_name + " (" + cur + " - " + agg.invoiceCount + " inv)",
        nativeBalance: Number(agg.totalOutstandingNative.toFixed(8)),
        nativeCurrency: cur,
        bookValueBase: Number(agg.totalBookBase.toFixed(2)),
        revaluedValueBase: revaluedBase,
        diff,
      })

      if (diff > 0) totalGain += diff
      else totalLoss += Math.abs(diff)
    }

    return { success: true, asOfDate, baseCurrency, lines, totalGain, totalLoss }
  } catch (e: any) {
    return { success: false, asOfDate, baseCurrency: "EGP", lines: [], totalGain: 0, totalLoss: 0, error: e?.message || String(e) }
  }
}

/**
 * v3.27.6: Compute AP revaluation — open foreign-currency bills.
 * Note: for AP, a positive base diff means we OWE MORE (a loss for us).
 * We invert the sign so downstream "positive diff = gain" logic works uniformly.
 */
export async function computeAPRevaluation(
  supabase: SupabaseClient,
  companyId: string,
  asOfDate: string,
): Promise<FXRevaluationResult> {
  try {
    const baseCurrency = await getBaseCurrency(supabase, companyId)

    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, sub_type")
      .eq("company_id", companyId)
      .eq("is_active", true)
    const apRecord = (accounts as any[] | null)?.find((x: any) => x.sub_type === "accounts_payable")
      || (accounts as any[] | null)?.find((x: any) => /payable|موردين|دائن/i.test(String(x.account_name || "")))
    if (!apRecord) {
      return { success: true, asOfDate, baseCurrency, lines: [], totalGain: 0, totalLoss: 0 }
    }

    const { data: bills } = await supabase
      .from("bills")
      .select("id, currency_code, exchange_rate, total_amount, paid_amount, returned_amount, status")
      .eq("company_id", companyId)
      .lte("bill_date", asOfDate)
      .in("status", ["received", "partially_paid", "overdue", "pending"])

    if (!bills || bills.length === 0) {
      return { success: true, asOfDate, baseCurrency, lines: [], totalGain: 0, totalLoss: 0 }
    }

    const byCurrency = new Map<string, { totalOutstandingNative: number; totalBookBase: number; billCount: number }>()
    for (const bill of bills as any[]) {
      const cur = String(bill.currency_code || baseCurrency).toUpperCase()
      if (cur === baseCurrency.toUpperCase()) continue
      const rate = Number(bill.exchange_rate || 0)
      if (rate <= 0) continue
      const total = Number(bill.total_amount || 0)
      const paid = Number(bill.paid_amount || 0)
      const returned = Number(bill.returned_amount || 0)
      const outstanding = Math.max(0, total - paid - returned)
      if (outstanding < 0.01) continue
      const outstandingNative = outstanding / rate
      const bookBase = outstanding
      const existing = byCurrency.get(cur) || { totalOutstandingNative: 0, totalBookBase: 0, billCount: 0 }
      existing.totalOutstandingNative += outstandingNative
      existing.totalBookBase += bookBase
      existing.billCount += 1
      byCurrency.set(cur, existing)
    }

    if (byCurrency.size === 0) {
      return { success: true, asOfDate, baseCurrency, lines: [], totalGain: 0, totalLoss: 0 }
    }

    const lines: FXRevaluationLine[] = []
    let totalGain = 0
    let totalLoss = 0
    const byCurEntries = Array.from(byCurrency.entries())
    for (const [cur, agg] of byCurEntries) {
      let currentRate = 0
      try {
        const r = await getExchangeRate(supabase, cur, baseCurrency, new Date(asOfDate), companyId)
        currentRate = Number(r?.rate || 0)
      } catch { continue }
      if (currentRate <= 0) continue

      const revaluedBase = Number((agg.totalOutstandingNative * currentRate).toFixed(2))
      const rawDiff = Number((revaluedBase - agg.totalBookBase).toFixed(2))
      // Invert sign for AP: revalued > book means we OWE more = LOSS
      const diff = -rawDiff
      if (Math.abs(diff) < 0.01) continue

      lines.push({
        accountId: apRecord.id,
        accountCode: String(apRecord.account_code || ""),
        accountName: apRecord.account_name + " (" + cur + " - " + agg.billCount + " bill)",
        nativeBalance: Number(agg.totalOutstandingNative.toFixed(8)),
        nativeCurrency: cur,
        bookValueBase: Number(agg.totalBookBase.toFixed(2)),
        revaluedValueBase: revaluedBase,
        diff,
      })

      if (diff > 0) totalGain += diff
      else totalLoss += Math.abs(diff)
    }

    return { success: true, asOfDate, baseCurrency, lines, totalGain, totalLoss }
  } catch (e: any) {
    return { success: false, asOfDate, baseCurrency: "EGP", lines: [], totalGain: 0, totalLoss: 0, error: e?.message || String(e) }
  }
}

/**
 * v3.27.6: Compute full period-end FX revaluation across all monetary items.
 */
export async function computeFullFXRevaluation(
  supabase: SupabaseClient,
  companyId: string,
  asOfDate: string,
): Promise<FXRevaluationResult> {
  const cashResult = await computeFXRevaluation(supabase, companyId, asOfDate)
  const arResult = await computeARRevaluation(supabase, companyId, asOfDate)
  const apResult = await computeAPRevaluation(supabase, companyId, asOfDate)

  const lines = [...cashResult.lines, ...arResult.lines, ...apResult.lines]
  const totalGain = cashResult.totalGain + arResult.totalGain + apResult.totalGain
  const totalLoss = cashResult.totalLoss + arResult.totalLoss + apResult.totalLoss
  const baseCurrency = cashResult.baseCurrency || arResult.baseCurrency || apResult.baseCurrency

  return {
    success: cashResult.success && arResult.success && apResult.success,
    asOfDate,
    baseCurrency,
    lines,
    totalGain,
    totalLoss,
    error: cashResult.error || arResult.error || apResult.error,
  }
}

/**
 * v3.27.7: Post a FULL FX revaluation across cash, AR, and AP at once.
 *
 * This is the recommended period-end function. It:
 *   1. Computes the full revaluation (cash + AR + AP) via computeFullFXRevaluation
 *   2. Builds a single journal entry with adjustment lines for each FC monetary item
 *   3. Optionally creates an auto-reversal entry for the next day
 *
 * The journal-line logic per scope:
 *  - Cash/Bank account (asset, base sign = debit-normal):
 *      diff > 0 → Dr Cash / Cr FX Gain
 *      diff < 0 → Dr FX Loss / Cr Cash
 *  - AR account (asset, base sign = debit-normal): same as cash
 *  - AP account (liability, base sign = credit-normal):
 *      In computeAPRevaluation we INVERTED the diff sign so positive=gain.
 *      Posting also requires inverted Dr/Cr against the AP account:
 *      diff > 0 (gain) → Dr AP / Cr FX Gain  (AP shrunk = gain)
 *      diff < 0 (loss) → Dr FX Loss / Cr AP  (AP grew = loss)
 *
 * Since the diff sign was already normalized in computeAPRevaluation, we can
 * use the SAME Dr/Cr logic as cash/AR for all lines. The "diff" semantic is
 * uniform across all scopes: positive = gain to company, negative = loss.
 */
export async function postFullFXRevaluation(
  supabase: SupabaseClient,
  companyId: string,
  asOfDate: string,
  userId: string,
  options: { autoReverse?: boolean; branchId?: string | null } = { autoReverse: true },
): Promise<FXRevaluationResult> {
  const preview = await computeFullFXRevaluation(supabase, companyId, asOfDate)
  if (!preview.success || preview.lines.length === 0) return preview

  const { gainId, lossId } = await getFXAccounts(supabase, companyId)

  // Resolve branch if not provided
  let branchId = options.branchId || null
  if (!branchId) {
    const { data: firstBranch } = await (supabase as any)
      .from("branches")
      .select("id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    branchId = firstBranch?.id || null
  }
  if (!branchId) {
    return { ...preview, success: false, error: "Cannot post FX revaluation without an active branch" }
  }

  // Build journal lines — uniform logic since diff sign is normalized across scopes
  const journalLines: any[] = []
  for (const line of preview.lines) {
    if (line.diff > 0) {
      // GAIN: Dr Asset/AP-side / Cr 4320
      journalLines.push({
        account_id: line.accountId,
        debit_amount: line.diff,
        credit_amount: 0,
        description: `FX revaluation gain - ${line.accountCode} (${line.nativeCurrency})`,
        original_currency: line.nativeCurrency,
      })
      journalLines.push({
        account_id: gainId,
        debit_amount: 0,
        credit_amount: line.diff,
        description: `Unrealized FX gain - ${line.accountCode}`,
      })
    } else {
      const abs = Math.abs(line.diff)
      // LOSS: Dr 5310 / Cr Asset/AP-side
      journalLines.push({
        account_id: lossId,
        debit_amount: abs,
        credit_amount: 0,
        description: `Unrealized FX loss - ${line.accountCode}`,
      })
      journalLines.push({
        account_id: line.accountId,
        debit_amount: 0,
        credit_amount: abs,
        description: `FX revaluation loss - ${line.accountCode} (${line.nativeCurrency})`,
        original_currency: line.nativeCurrency,
      })
    }
  }

  // Create the adjustment entry
  const refUuid = (typeof crypto !== "undefined" && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const entryNumber = `FX-REVAL-FULL-${asOfDate}-${Date.now()}`

  const { data: entry, error: entryErr } = await (supabase as any)
    .from("journal_entries")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      entry_date: asOfDate,
      entry_number: entryNumber,
      description: `Period-end FX revaluation (Cash+AR+AP) as of ${asOfDate} (IAS 21)`,
      reference_type: "fx_revaluation",
      reference_id: refUuid,
      status: "posted",
      posted_at: new Date().toISOString(),
      posted_by: userId,
    })
    .select()
    .single()

  if (entryErr || !entry) {
    return { ...preview, success: false, error: entryErr?.message || "Failed to create FX revaluation entry" }
  }

  const linesWithJE = journalLines.map((l) => ({ ...l, journal_entry_id: entry.id }))
  const { error: linesErr } = await (supabase as any)
    .from("journal_entry_lines")
    .insert(linesWithJE)
  if (linesErr) {
    return { ...preview, success: false, journalEntryId: entry.id, error: linesErr.message }
  }

  let reverseEntryId: string | undefined = undefined
  if (options.autoReverse !== false) {
    const nextDay = new Date(asOfDate)
    nextDay.setDate(nextDay.getDate() + 1)
    const nextDayStr = nextDay.toISOString().slice(0, 10)
    const reverseRefUuid = (typeof crypto !== "undefined" && (crypto as any).randomUUID)
      ? (crypto as any).randomUUID()
      : `${Date.now() + 1}-${Math.random().toString(36).slice(2)}`

    const { data: reverseEntry, error: reverseErr } = await (supabase as any)
      .from("journal_entries")
      .insert({
        company_id: companyId,
        branch_id: branchId,
        entry_date: nextDayStr,
        entry_number: `FX-REVAL-FULL-REV-${nextDayStr}-${Date.now()}`,
        description: `Reversal of FX revaluation from ${asOfDate} (IAS 21)`,
        reference_type: "fx_revaluation_reversal",
        reference_id: reverseRefUuid,
        reversal_of_entry_id: entry.id,
        status: "posted",
        posted_at: new Date().toISOString(),
        posted_by: userId,
      })
      .select()
      .single()

    if (!reverseErr && reverseEntry) {
      reverseEntryId = reverseEntry.id
      const reversedLines = journalLines.map((l) => ({
        journal_entry_id: reverseEntry.id,
        account_id: l.account_id,
        debit_amount: l.credit_amount,
        credit_amount: l.debit_amount,
        description: `[Reversal] ${l.description}`,
        original_currency: l.original_currency,
      }))
      await (supabase as any).from("journal_entry_lines").insert(reversedLines)
    }
  }

  return { ...preview, journalEntryId: entry.id, reverseJournalEntryId: reverseEntryId }
}
{
      reverseEntryId = reverseEntry.id
      const reversedLines = journalLines.map((l) => ({
        journal_entry_id: reverseEntry.id,
        account_id: l.account_id,
        debit_amount: l.credit_amount,
        credit_amount: l.debit_amount,
        description: `[Reversal] ${l.description}`,
        original_currency: l.original_currency,
      }))
      await (supabase as any).from("journal_entry_lines").insert(reversedLines)
    }
  }

  return { ...preview, journalEntryId: entry.id, reverseJournalEntryId: reverseEntryId }
}
