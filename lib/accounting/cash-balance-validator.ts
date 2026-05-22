/**
 * Cash/Bank Account Overdraft Prevention (Enterprise ERP rule)
 * ─────────────────────────────────────────────────────────────────────
 * Centralized validator used by every service that posts a cash-outflow
 * journal entry (supplier payment, expense, drawing, bank transfer, refund,
 * payroll, etc.).
 *
 * Rule:
 *   A cash/bank account must NEVER go negative. If a transaction would
 *   leave the account with a negative balance, reject it.
 *
 * Bypass:
 *   For period-end closing, opening-balance adjustments, or explicit owner
 *   approval, the caller may pass `{ allowOverdraft: true }`. This is logged
 *   in the audit trail with the actor's id.
 *
 * @example
 *   import { assertCashOutflowAllowed } from "@/lib/accounting/cash-balance-validator"
 *   await assertCashOutflowAllowed(supabase, {
 *     accountId,
 *     amount: 100,           // amount in account currency
 *     companyId,
 *     description: "Supplier payment to ABC Co.",
 *   })
 *   // throws CashOverdraftError if balance would go negative
 */

export class CashOverdraftError extends Error {
  public readonly accountId: string
  public readonly accountName: string | null
  public readonly currentBalance: number
  public readonly attemptedAmount: number
  public readonly currency: string | null

  constructor(opts: {
    accountId: string
    accountName: string | null
    currentBalance: number
    attemptedAmount: number
    currency?: string | null
  }) {
    const msg =
      `❌ لا يمكن السحب: رصيد الحساب "${opts.accountName ?? opts.accountId}" غير كافٍ. ` +
      `الرصيد الحالى: ${opts.currentBalance.toFixed(2)} ${opts.currency ?? ''}, ` +
      `المطلوب سحبه: ${opts.attemptedAmount.toFixed(2)}. ` +
      `Cannot withdraw — insufficient funds in account "${opts.accountName ?? opts.accountId}".`
    super(msg)
    this.name = "CashOverdraftError"
    this.accountId = opts.accountId
    this.accountName = opts.accountName
    this.currentBalance = opts.currentBalance
    this.attemptedAmount = opts.attemptedAmount
    this.currency = opts.currency ?? null
  }
}

export interface CashBalanceSnapshot {
  accountId: string
  accountCode: string | null
  accountName: string
  subType: string | null
  originalCurrency: string | null
  /** Balance in base currency (always) */
  balance: number
  /** Balance in account's native currency (only set when account is FC) */
  nativeBalance: number | null
}

/**
 * Reads the current balance of a single cash/bank account from the GL.
 * Excludes deleted journal entries. Includes opening_balance.
 */
export async function getCashAccountBalance(
  supabase: any,
  accountId: string,
): Promise<CashBalanceSnapshot | null> {
  const { data: acc, error: accErr } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, sub_type, opening_balance, original_currency, is_active")
    .eq("id", accountId)
    .maybeSingle()
  if (accErr || !acc) return null

  const subType = String(acc.sub_type || "").toLowerCase()
  // Only cash/bank accounts qualify
  if (subType !== "cash" && subType !== "bank") {
    return {
      accountId: acc.id,
      accountCode: acc.account_code,
      accountName: acc.account_name,
      subType: acc.sub_type ?? null,
      originalCurrency: acc.original_currency ?? null,
      balance: 0,
      nativeBalance: null,
    }
  }

  // Sum all posted, non-deleted journal lines on this account
  const { data: lines } = await supabase
    .from("journal_entry_lines")
    .select("debit_amount, credit_amount, original_debit, original_credit, journal_entries!inner(status, is_deleted, deleted_at)")
    .eq("account_id", accountId)
    .eq("journal_entries.status", "posted")
    .is("journal_entries.deleted_at", null)

  let debit = 0
  let credit = 0
  let nativeDebit = 0
  let nativeCredit = 0
  for (const l of lines || []) {
    if ((l as any).journal_entries?.is_deleted) continue
    debit += Number((l as any).debit_amount || 0)
    credit += Number((l as any).credit_amount || 0)
    nativeDebit += Number((l as any).original_debit || 0)
    nativeCredit += Number((l as any).original_credit || 0)
  }
  const opening = Number(acc.opening_balance || 0)
  const balance = opening + (debit - credit)
  const ccy = String(acc.original_currency || "").toUpperCase() || null
  const nativeBalance = ccy ? opening + (nativeDebit - nativeCredit) : null

  return {
    accountId: acc.id,
    accountCode: acc.account_code,
    accountName: acc.account_name,
    subType: acc.sub_type ?? null,
    originalCurrency: ccy,
    balance,
    nativeBalance,
  }
}

/**
 * Pre-validation hook. Call this from any service that's about to post a
 * cash-outflow journal entry (CR Cash X).
 *
 * If the resulting balance would be negative, throws CashOverdraftError.
 *
 * Pass `allowOverdraft: true` to bypass (must be logged externally).
 */
export async function assertCashOutflowAllowed(
  supabase: any,
  opts: {
    accountId: string
    amount: number               // amount being withdrawn (in base currency)
    nativeAmount?: number | null // if account is FC, amount in account ccy
    companyId?: string           // for audit-log lookups (caller supplies)
    description?: string         // for audit trail
    allowOverdraft?: boolean     // owner/admin override
  },
): Promise<CashBalanceSnapshot> {
  const snap = await getCashAccountBalance(supabase, opts.accountId)
  if (!snap) {
    throw new Error(`Account ${opts.accountId} not found`)
  }
  // Non-cash accounts: skip (e.g., AR/AP/expense — no overdraft concept here)
  if (snap.subType !== "cash" && snap.subType !== "bank") return snap

  // Overdraft override (explicit caller intent)
  if (opts.allowOverdraft) return snap

  // Pick the right balance to check based on currency context.
  // If account is FC AND caller passes nativeAmount, validate against
  // native balance to avoid base-currency rounding masking the issue.
  const accIsFC = !!snap.originalCurrency
  const useNative = accIsFC && opts.nativeAmount != null && snap.nativeBalance != null
  const currentBalance = useNative ? (snap.nativeBalance as number) : snap.balance
  const attempted = useNative ? Number(opts.nativeAmount) : Number(opts.amount || 0)
  const newBalance = currentBalance - attempted

  if (newBalance < -0.01) {
    throw new CashOverdraftError({
      accountId: snap.accountId,
      accountName: snap.accountName,
      currentBalance,
      attemptedAmount: attempted,
      currency: useNative ? snap.originalCurrency : null,
    })
  }
  return snap
}
