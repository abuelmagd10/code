import { randomUUID } from "crypto"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"

const BANK_TRANSFER_EVENT = "bank_transfer_posting"

type SupabaseLike = any
type TraceRecord = { transaction_id: string; request_hash: string | null }

export type BankTransferCommand = {
  companyId: string
  fromAccountId: string
  toAccountId: string
  amount: number
  transferDate: string
  description?: string | null
  currencyCode: string
  exchangeRate: number
  baseAmount: number
  exchangeRateId?: string | null
  rateSource?: string | null
  uiSurface?: string | null
  // v3.74.201 — When the transfer currency is base but one of the accounts
  // is in a foreign currency, the UI sends the rate the user picked for
  // that account so the service does not silently substitute the current
  // API rate. When omitted, the legacy silent-lookup path is used.
  accountFxRate?: number | null
  accountFxRateId?: string | null
  accountFxSource?: string | null
}

export type BankTransferActor = {
  actorId: string
  actorRole: string
  actorBranchId?: string | null
}

export type BankTransferCommandResult = {
  success: boolean
  cached: boolean
  journalEntryId: string | null
  transactionId: string | null
  eventType: typeof BANK_TRANSFER_EVENT
}

function duplicateTrace(message?: string | null) {
  return !!message && (
    message.includes("duplicate key value violates unique constraint") ||
    message.includes("idx_financial_operation_traces_idempotency")
  )
}

function isPrivilegedBankingRole(role: string | null | undefined) {
  return new Set(["owner", "admin", "manager", "general_manager"]).has(String(role || "").toLowerCase())
}

export class BankTransferCommandService {
  constructor(private readonly adminSupabase: SupabaseLike) {}

  async recordTransfer(
    actor: BankTransferActor,
    command: BankTransferCommand,
    options: { idempotencyKey: string; requestHash: string }
  ): Promise<BankTransferCommandResult> {
    if (!isPrivilegedBankingRole(actor.actorRole)) {
      throw new Error("Insufficient permission to record bank transfers")
    }
    if (!command.companyId) throw new Error("Company is required")
    if (!command.fromAccountId || !command.toAccountId) throw new Error("Both transfer accounts are required")
    if (command.fromAccountId === command.toAccountId) throw new Error("Transfer accounts must be different")
    if (!Number.isFinite(command.amount) || command.amount <= 0) throw new Error("Transfer amount must be greater than zero")
    if (!command.transferDate) throw new Error("Transfer date is required")

    const existingTrace = await this.findTraceByIdempotency(command.companyId, BANK_TRANSFER_EVENT, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different bank transfer payload")
      }
      const journalEntryId = await this.findLinkedEntityId(existingTrace.transaction_id, "journal_entry")
      return {
        success: true,
        cached: true,
        journalEntryId,
        transactionId: existingTrace.transaction_id,
        eventType: BANK_TRANSFER_EVENT,
      }
    }

    await requireOpenFinancialPeriod(command.companyId, command.transferDate)

    const [fromAccount, toAccount] = await Promise.all([
      this.loadCashBankAccount(command.companyId, command.fromAccountId),
      this.loadCashBankAccount(command.companyId, command.toAccountId),
    ])
    if (!fromAccount) throw new Error("Source cash/bank account is invalid")
    if (!toAccount) throw new Error("Destination cash/bank account is invalid")

    const transferBranchId = fromAccount.branch_id || actor.actorBranchId || null
    const transferCostCenterId = fromAccount.cost_center_id || null
    const finalBaseAmount = Number(command.baseAmount || command.amount)
    if (!Number.isFinite(finalBaseAmount) || finalBaseAmount <= 0) throw new Error("Transfer base amount must be greater than zero")

    // v3.26.0: Enterprise rule — prevent overdraft on source account
    const { assertCashOutflowAllowed } = await import("@/lib/accounting/cash-balance-validator")
    await assertCashOutflowAllowed(this.adminSupabase, {
      accountId: command.fromAccountId,
      amount: finalBaseAmount,
      nativeAmount: command.amount,
      companyId: command.companyId,
      description: `Bank transfer to ${command.toAccountId}`,
    })

    let traceId: string | null = null
    let journalEntryId: string | null = null
    try {
      const operationId = randomUUID()
      traceId = await this.createTrace({
        companyId: command.companyId,
        sourceEntity: "bank_transfer",
        sourceId: operationId,
        eventType: BANK_TRANSFER_EVENT,
        actorId: actor.actorId,
        idempotencyKey: options.idempotencyKey,
        requestHash: options.requestHash,
        metadata: {
          from_account_id: command.fromAccountId,
          to_account_id: command.toAccountId,
          transfer_date: command.transferDate,
          amount: command.amount,
          base_amount: finalBaseAmount,
          currency_code: command.currencyCode,
          exchange_rate: command.exchangeRate,
          exchange_rate_id: command.exchangeRateId || null,
          rate_source: command.rateSource || null,
          ui_surface: command.uiSurface || "banking_page",
        },
      })

      const { data: entry, error: entryError } = await this.adminSupabase
        .from("journal_entries")
        .insert({
          company_id: command.companyId,
          branch_id: transferBranchId,
          cost_center_id: transferCostCenterId,
          reference_type: "bank_transfer",
          entry_date: command.transferDate,
          status: "draft",
          description: command.description || "Transfer between cash/bank accounts",
        })
        .select("id")
        .single()
      if (entryError || !entry?.id) throw new Error(entryError?.message || "Failed to create bank transfer journal entry")
      journalEntryId = String(entry.id)

      // v3.27.2 Multi-Currency Bank Transfer Support
      // ----------------------------------------------
      // When source and destination accounts have different native currencies,
      // each line must record its OWN native amount + rate. The base-currency
      // amounts must still balance (Dr base == Cr base).
      //
      // Resolution rules:
      //   - command.currencyCode is the "transfer currency" the user typed in
      //   - command.amount is the native value in that currency
      //   - command.baseAmount is its base-currency equivalent (already converted)
      //   - For each account, we resolve native amount = baseAmount / account_rate
      //     using exchange-rates DB for cross-currency
      const baseCurrency = await this.getCompanyBaseCurrency(command.companyId)
      const fromCurrency = String(fromAccount.original_currency || baseCurrency).toUpperCase()
      const toCurrency = String(toAccount.original_currency || baseCurrency).toUpperCase()
      const transferCurrency = String(command.currencyCode || baseCurrency).toUpperCase()

      // Compute native amount for each account:
      //   - If account currency matches the transfer currency, native = command.amount
      //   - If account currency is base, native = baseAmount
      //   - Otherwise:
      //       v3.74.201 — prefer the caller-supplied accountFxRate so the user's
      //       explicit choice (live API vs manual) wins over a silent lookup.
      //       Only fall back to the silent getExchangeRate path when the caller
      //       did not provide a rate (legacy callers).
      const callerAccountFx = Number(command.accountFxRate || 0) > 0
        ? { rate: Number(command.accountFxRate), id: command.accountFxRateId || null }
        : null
      const resolveNativeAmount = async (accountCurrency: string): Promise<{ native: number; rate: number; rateId: string | null }> => {
        if (accountCurrency === transferCurrency) {
          return { native: command.amount, rate: command.exchangeRate, rateId: command.exchangeRateId || null }
        }
        if (accountCurrency === baseCurrency) {
          return { native: finalBaseAmount, rate: 1, rateId: null }
        }
        // Cross-currency: native = baseAmount / rate(accountCurrency → base).
        if (callerAccountFx) {
          return { native: Number((finalBaseAmount / callerAccountFx.rate).toFixed(8)), rate: callerAccountFx.rate, rateId: callerAccountFx.id }
        }
        try {
          const { getExchangeRate } = await import("@/lib/currency-service")
          const _rateResult: any = await getExchangeRate(this.adminSupabase, accountCurrency, baseCurrency, undefined, command.companyId); const rate = Number(_rateResult?.rate || 0)
          if (rate > 0) {
            return { native: Number((finalBaseAmount / rate).toFixed(8)), rate, rateId: null }
          }
        } catch (err) {
          console.warn("[BANK_TRANSFER] Could not resolve cross-currency rate:", accountCurrency, err)
        }
        // Fallback: assume 1:1 with transfer currency
        return { native: command.amount, rate: command.exchangeRate, rateId: command.exchangeRateId || null }
      }

      const fromResolved = await resolveNativeAmount(fromCurrency)
      const toResolved = await resolveNativeAmount(toCurrency)

      const linePayload = [
        {
          journal_entry_id: journalEntryId,
          account_id: command.toAccountId,
          debit_amount: finalBaseAmount,
          credit_amount: 0,
          description: `Incoming transfer (${toCurrency})`,
          original_debit: toResolved.native,
          original_credit: 0,
          original_currency: toCurrency,
          exchange_rate_used: toResolved.rate,
          // v3.74.201 — each line keeps its own rateId so the GL audit trail
          // reflects the actual conversion behind that account.
          exchange_rate_id: toResolved.rateId,
          branch_id: transferBranchId,
          cost_center_id: transferCostCenterId,
        },
        {
          journal_entry_id: journalEntryId,
          account_id: command.fromAccountId,
          debit_amount: 0,
          credit_amount: finalBaseAmount,
          description: `Outgoing transfer (${fromCurrency})`,
          original_debit: 0,
          original_credit: fromResolved.native,
          original_currency: fromCurrency,
          exchange_rate_used: fromResolved.rate,
          exchange_rate_id: fromResolved.rateId,
          branch_id: transferBranchId,
          cost_center_id: transferCostCenterId,
        },
      ]

      const { error: linesError } = await this.adminSupabase.from("journal_entry_lines").insert(linePayload)
      if (linesError) throw new Error(linesError.message || "Failed to create bank transfer journal lines")

      const { error: postError } = await this.adminSupabase
        .from("journal_entries")
        .update({ status: "posted" })
        .eq("id", journalEntryId)
      if (postError) throw new Error(postError.message || "Failed to post bank transfer journal entry")

      await this.linkTrace(traceId, "journal_entry", journalEntryId, "bank_transfer_journal", "bank_transfer")

      return {
        success: true,
        cached: false,
        journalEntryId,
        transactionId: traceId,
        eventType: BANK_TRANSFER_EVENT,
      }
    } catch (error) {
      if (journalEntryId) {
        await this.adminSupabase.from("journal_entry_lines").delete().eq("journal_entry_id", journalEntryId)
        await this.adminSupabase.from("journal_entries").delete().eq("id", journalEntryId)
      }
      if (traceId) {
        await this.adminSupabase.from("financial_operation_trace_links").delete().eq("transaction_id", traceId)
        await this.adminSupabase.from("financial_operation_traces").delete().eq("transaction_id", traceId)
      }
      throw error
    }
  }

  /**
   * v3.27.2: Resolve company's base currency from companies.base_currency.
   * Falls back to 'EGP' if not configured.
   */
  private async getCompanyBaseCurrency(companyId: string): Promise<string> {
    try {
      const { data } = await this.adminSupabase
        .from("companies")
        .select("base_currency")
        .eq("id", companyId)
        .maybeSingle()
      return String(data?.base_currency || "EGP").toUpperCase()
    } catch {
      return "EGP"
    }
  }

  private async loadCashBankAccount(companyId: string, accountId: string) {
    // v3.27.2: also fetch original_currency to support cross-currency transfers
    const { data, error } = await this.adminSupabase
      .from("chart_of_accounts")
      .select("id, company_id, account_type, sub_type, account_name, branch_id, cost_center_id, is_active, original_currency")
      .eq("id", accountId)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle()
    if (error || !data) return null

    const subType = String(data.sub_type || "").toLowerCase()
    const name = String(data.account_name || "").toLowerCase()
    const type = String(data.account_type || "").toLowerCase()
    const isCashBank = subType === "cash" || subType === "bank" || name.includes("cash") || name.includes("bank") || name.includes("خزينة") || name.includes("بنك")
    if (!isCashBank && type !== "asset") return null
    return data
  }

  private async createTrace(params: {
    companyId: string
    sourceEntity: string
    sourceId: string
    eventType: string
    actorId: string
    idempotencyKey?: string | null
    requestHash?: string | null
    metadata?: Record<string, unknown>
  }) {
    const { data, error } = await this.adminSupabase.rpc("create_financial_operation_trace", {
      p_company_id: params.companyId,
      p_source_entity: params.sourceEntity,
      p_source_id: params.sourceId,
      p_event_type: params.eventType,
      p_actor_id: params.actorId,
      p_idempotency_key: params.idempotencyKey || null,
      p_request_hash: params.requestHash || null,
      p_metadata: params.metadata || {},
      p_audit_flags: [],
    })
    if (error) {
      if (duplicateTrace(error.message) && params.idempotencyKey) {
        const existing = await this.findTraceByIdempotency(params.companyId, params.eventType, params.idempotencyKey)
        if (existing?.transaction_id) return existing.transaction_id
      }
      throw new Error(error.message || "Failed to create bank transfer trace")
    }
    return String(data)
  }

  private async linkTrace(traceId: string, entityType: string, entityId: string, linkRole: string, referenceType: string) {
    await this.adminSupabase.from("financial_operation_trace_links").upsert({
      transaction_id: traceId,
      entity_type: entityType,
      entity_id: entityId,
      link_role: linkRole,
      reference_type: referenceType,
    }, { onConflict: "transaction_id,entity_type,entity_id" })
  }

  private async findTraceByIdempotency(companyId: string, eventType: string, idempotencyKey: string): Promise<TraceRecord | null> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_traces")
      .select("transaction_id, request_hash")
      .eq("company_id", companyId)
      .eq("event_type", eventType)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()
    if (error || !data) return null
    return data as TraceRecord
  }

  private async findLinkedEntityId(traceId: string, entityType: string): Promise<string | null> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_trace_links")
      .select("entity_id")
      .eq("transaction_id", traceId)
      .eq("entity_type", entityType)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error || !data?.entity_id) return null
    return String(data.entity_id)
  }
}

export { BANK_TRANSFER_EVENT, isPrivilegedBankingRole }
