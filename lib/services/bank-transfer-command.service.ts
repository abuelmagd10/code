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

      const linePayload = [
        {
          journal_entry_id: journalEntryId,
          account_id: command.toAccountId,
          debit_amount: finalBaseAmount,
          credit_amount: 0,
          description: "Incoming transfer",
          original_debit: command.amount,
          original_credit: 0,
          original_currency: command.currencyCode,
          exchange_rate_used: command.exchangeRate,
          exchange_rate_id: command.exchangeRateId || null,
          branch_id: transferBranchId,
          cost_center_id: transferCostCenterId,
        },
        {
          journal_entry_id: journalEntryId,
          account_id: command.fromAccountId,
          debit_amount: 0,
          credit_amount: finalBaseAmount,
          description: "Outgoing transfer",
          original_debit: 0,
          original_credit: command.amount,
          original_currency: command.currencyCode,
          exchange_rate_used: command.exchangeRate,
          exchange_rate_id: command.exchangeRateId || null,
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

  private async loadCashBankAccount(companyId: string, accountId: string) {
    const { data, error } = await this.adminSupabase
      .from("chart_of_accounts")
      .select("id, company_id, account_type, sub_type, account_name, branch_id, cost_center_id, is_active")
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
