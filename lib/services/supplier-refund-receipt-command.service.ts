import { randomUUID } from "crypto"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"

const SUPPLIER_REFUND_RECEIPT_EVENT = "supplier_refund_receipt_posting"
const PRIVILEGED_ROLES = new Set(["owner", "admin", "general_manager"])

type SupabaseLike = any
type TraceRecord = { transaction_id: string; request_hash: string | null }

export type SupplierRefundReceiptCommand = {
  companyId: string
  supplierId: string
  amount: number
  currencyCode: string
  exchangeRate: number
  baseAmount: number
  receiptAccountId: string
  receiptDate: string
  notes?: string | null
  branchId?: string | null
  costCenterId?: string | null
  exchangeRateId?: string | null
  rateSource?: string | null
  uiSurface?: string | null
}

export type SupplierRefundReceiptActor = {
  actorId: string
  actorRole: string
  actorBranchId?: string | null
  actorCostCenterId?: string | null
}

export type SupplierRefundReceiptResult = {
  success: boolean
  cached: boolean
  journalEntryId: string | null
  transactionId: string | null
  eventType: typeof SUPPLIER_REFUND_RECEIPT_EVENT
  updatedCreditIds: string[]
}

const normalizeRole = (role: string | null | undefined) => String(role || "").trim().toLowerCase()
const duplicateTrace = (message?: string | null) =>
  !!message && (message.includes("duplicate key value violates unique constraint") || message.includes("idx_financial_operation_traces_idempotency"))

export class SupplierRefundReceiptCommandService {
  constructor(private readonly adminSupabase: SupabaseLike) {}

  async recordReceipt(
    actor: SupplierRefundReceiptActor,
    command: SupplierRefundReceiptCommand,
    options: { idempotencyKey: string; requestHash: string }
  ): Promise<SupplierRefundReceiptResult> {
    if (!PRIVILEGED_ROLES.has(normalizeRole(actor.actorRole))) {
      throw new Error("Insufficient permission to record supplier refund receipts")
    }
    if (!command.companyId) throw new Error("Company is required")
    if (!command.supplierId) throw new Error("Supplier is required")
    if (!command.receiptAccountId) throw new Error("Receipt account is required")
    if (!command.receiptDate) throw new Error("Receipt date is required")
    if (!Number.isFinite(command.amount) || command.amount <= 0) throw new Error("Receipt amount must be greater than zero")
    if (!Number.isFinite(command.baseAmount) || command.baseAmount <= 0) throw new Error("Receipt base amount must be greater than zero")

    const existingTrace = await this.findTraceByIdempotency(command.companyId, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different supplier refund receipt payload")
      }
      return {
        success: true,
        cached: true,
        journalEntryId: await this.findLinkedEntityId(existingTrace.transaction_id, "journal_entry"),
        transactionId: existingTrace.transaction_id,
        eventType: SUPPLIER_REFUND_RECEIPT_EVENT,
        updatedCreditIds: await this.findLinkedEntityIds(existingTrace.transaction_id, "vendor_credit"),
      }
    }

    await requireOpenFinancialPeriod(command.companyId, command.receiptDate)

    const supplier = await this.loadSupplier(command.companyId, command.supplierId)
    if (!supplier) throw new Error("Supplier was not found")
    const receiptAccount = await this.loadAccount(command.companyId, command.receiptAccountId)
    if (!receiptAccount) throw new Error("Receipt account was not found")
    const supplierDebitAccount = await this.loadSupplierDebitAccount(command.companyId)
    if (!supplierDebitAccount) throw new Error("Supplier debit/advance account was not found")

    const branchId = await this.resolveBranchId(command.companyId, command.branchId || actor.actorBranchId || null)
    if (!branchId) throw new Error("No branch available to record the journal entry. Please create a branch first.")
    const costCenterId = command.costCenterId || actor.actorCostCenterId || null

    let traceId: string | null = null
    let journalEntryId: string | null = null
    const updatedCredits: Array<{ id: string; applied_amount: number; status: string | null }> = []
    try {
      const operationId = randomUUID()
      traceId = await this.createTrace({
        companyId: command.companyId,
        sourceEntity: "supplier_refund_receipt",
        sourceId: operationId,
        eventType: SUPPLIER_REFUND_RECEIPT_EVENT,
        actorId: actor.actorId,
        idempotencyKey: options.idempotencyKey,
        requestHash: options.requestHash,
        metadata: {
          supplier_id: command.supplierId,
          supplier_name: supplier.name || null,
          amount: command.amount,
          base_amount: command.baseAmount,
          currency_code: command.currencyCode,
          exchange_rate: command.exchangeRate,
          exchange_rate_id: command.exchangeRateId || null,
          rate_source: command.rateSource || null,
          receipt_account_id: command.receiptAccountId,
          supplier_debit_account_id: supplierDebitAccount.id,
          receipt_date: command.receiptDate,
          branch_id: branchId,
          cost_center_id: costCenterId,
          ui_surface: command.uiSurface || "supplier_receipt_dialog",
        },
      })

      const { data: journalEntry, error: journalError } = await this.adminSupabase
        .from("journal_entries")
        .insert({
          company_id: command.companyId,
          reference_type: "supplier_debit_receipt",
          reference_id: operationId,
          entry_date: command.receiptDate,
          description: command.notes || `Supplier cash refund - ${supplier.name || command.supplierId}`,
          branch_id: branchId,
          cost_center_id: costCenterId,
          status: "draft",
        })
        .select("id")
        .single()
      if (journalError || !journalEntry?.id) throw new Error(journalError?.message || "Failed to create supplier refund journal entry")
      journalEntryId = String(journalEntry.id)

      const { error: linesError } = await this.adminSupabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: journalEntryId,
          account_id: receiptAccount.id,
          debit_amount: command.baseAmount,
          credit_amount: 0,
          description: "Cash/Bank receipt from supplier",
          original_currency: command.currencyCode,
          original_debit: command.amount,
          original_credit: 0,
          exchange_rate_used: command.exchangeRate,
          exchange_rate_id: command.exchangeRateId || null,
          branch_id: branchId,
          cost_center_id: costCenterId,
        },
        {
          journal_entry_id: journalEntryId,
          account_id: supplierDebitAccount.id,
          debit_amount: 0,
          credit_amount: command.baseAmount,
          description: "Supplier debit settlement",
          original_currency: command.currencyCode,
          original_debit: 0,
          original_credit: command.amount,
          exchange_rate_used: command.exchangeRate,
          exchange_rate_id: command.exchangeRateId || null,
          branch_id: branchId,
          cost_center_id: costCenterId,
        },
      ])
      if (linesError) throw new Error(linesError.message || "Failed to create supplier refund journal lines")

      await this.applyVendorCredits(command.companyId, command.supplierId, command.amount, updatedCredits)

      const { error: postError } = await this.adminSupabase
        .from("journal_entries")
        .update({ status: "posted" })
        .eq("id", journalEntryId)
      if (postError) throw new Error(postError.message || "Failed to post supplier refund journal entry")

      await this.linkTrace(traceId, "journal_entry", journalEntryId, "supplier_refund_journal", "supplier_refund_receipt")
      for (const credit of updatedCredits) {
        await this.linkTrace(traceId, "vendor_credit", credit.id, "supplier_refund_credit_application", "supplier_refund_receipt")
      }

      return {
        success: true,
        cached: false,
        journalEntryId,
        transactionId: traceId,
        eventType: SUPPLIER_REFUND_RECEIPT_EVENT,
        updatedCreditIds: updatedCredits.map((credit) => credit.id),
      }
    } catch (error) {
      for (const credit of updatedCredits.reverse()) {
        await this.adminSupabase
          .from("vendor_credits")
          .update({ applied_amount: credit.applied_amount, status: credit.status, updated_at: new Date().toISOString() })
          .eq("id", credit.id)
      }
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

  private async applyVendorCredits(companyId: string, supplierId: string, amount: number, updatedCredits: Array<{ id: string; applied_amount: number; status: string | null }>) {
    const { data: credits, error } = await this.adminSupabase
      .from("vendor_credits")
      .select("id, total_amount, applied_amount, status")
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId)
      .in("status", ["open", "partially_applied"])
      .order("credit_date", { ascending: true })
    if (error) throw new Error(error.message || "Failed to load vendor credits")

    let remainingToDeduct = amount
    for (const credit of credits || []) {
      if (remainingToDeduct <= 0) break
      const totalAmount = Number(credit.total_amount || 0)
      const appliedAmount = Number(credit.applied_amount || 0)
      const available = totalAmount - appliedAmount
      if (available <= 0) continue
      const deductAmount = Math.min(available, remainingToDeduct)
      const newAppliedAmount = appliedAmount + deductAmount
      const newStatus = newAppliedAmount >= totalAmount ? "applied" : "partially_applied"
      updatedCredits.push({ id: String(credit.id), applied_amount: appliedAmount, status: credit.status || null })
      const { error: updateError } = await this.adminSupabase
        .from("vendor_credits")
        .update({ applied_amount: newAppliedAmount, status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", credit.id)
      if (updateError) throw new Error(updateError.message || "Failed to update vendor credit")
      remainingToDeduct -= deductAmount
    }
  }

  private async loadSupplier(companyId: string, supplierId: string) {
    const { data, error } = await this.adminSupabase
      .from("suppliers")
      .select("id, name")
      .eq("id", supplierId)
      .eq("company_id", companyId)
      .maybeSingle()
    if (error || !data) return null
    return data
  }

  private async loadAccount(companyId: string, accountId: string) {
    const { data, error } = await this.adminSupabase
      .from("chart_of_accounts")
      .select("id, account_name, account_type, sub_type, is_active")
      .eq("id", accountId)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle()
    if (error || !data) return null
    return data
  }

  private async loadSupplierDebitAccount(companyId: string) {
    const { data, error } = await this.adminSupabase
      .from("chart_of_accounts")
      .select("id, account_name, account_type, sub_type, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true)
    if (error || !data) return null
    return (data || []).find((account: any) => {
      const subType = String(account.sub_type || "").toLowerCase()
      const name = String(account.account_name || "").toLowerCase()
      return subType === "supplier_debit" ||
        subType === "supplier_advance" ||
        subType === "vendor_advance" ||
        name.includes("سلف الموردين") ||
        name.includes("رصيد الموردين")
    }) || null
  }

  private async resolveBranchId(companyId: string, preferredBranchId: string | null) {
    if (preferredBranchId) return preferredBranchId
    const { data: mainBranch } = await this.adminSupabase
      .from("branches")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_main", true)
      .maybeSingle()
    if (mainBranch?.id) return String(mainBranch.id)
    const { data: anyBranch } = await this.adminSupabase
      .from("branches")
      .select("id")
      .eq("company_id", companyId)
      .limit(1)
      .maybeSingle()
    return anyBranch?.id ? String(anyBranch.id) : null
  }

  private async createTrace(params: {
    companyId: string
    sourceEntity: string
    sourceId: string
    eventType: string
    actorId: string
    idempotencyKey: string
    requestHash: string
    metadata: Record<string, unknown>
  }) {
    const { data, error } = await this.adminSupabase.rpc("create_financial_operation_trace", {
      p_company_id: params.companyId,
      p_source_entity: params.sourceEntity,
      p_source_id: params.sourceId,
      p_event_type: params.eventType,
      p_actor_id: params.actorId,
      p_idempotency_key: params.idempotencyKey,
      p_request_hash: params.requestHash,
      p_metadata: params.metadata,
      p_audit_flags: [],
    })
    if (error) {
      if (duplicateTrace(error.message)) {
        const existing = await this.findTraceByIdempotency(params.companyId, params.idempotencyKey)
        if (existing?.transaction_id) return existing.transaction_id
      }
      throw new Error(error.message || "Failed to create supplier refund receipt trace")
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

  private async findTraceByIdempotency(companyId: string, idempotencyKey: string): Promise<TraceRecord | null> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_traces")
      .select("transaction_id, request_hash")
      .eq("company_id", companyId)
      .eq("event_type", SUPPLIER_REFUND_RECEIPT_EVENT)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()
    if (error || !data) return null
    return data as TraceRecord
  }

  private async findLinkedEntityId(traceId: string, entityType: string): Promise<string | null> {
    const ids = await this.findLinkedEntityIds(traceId, entityType)
    return ids[0] || null
  }

  private async findLinkedEntityIds(traceId: string, entityType: string): Promise<string[]> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_trace_links")
      .select("entity_id")
      .eq("transaction_id", traceId)
      .eq("entity_type", entityType)
      .order("created_at", { ascending: true })
    if (error || !data) return []
    return data.map((row: any) => String(row.entity_id)).filter(Boolean)
  }
}

export { SUPPLIER_REFUND_RECEIPT_EVENT }
