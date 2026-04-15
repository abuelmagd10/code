import { randomUUID } from "crypto"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"

const CUSTOMER_REFUND_EVENT = "customer_credit_refund_posting"

type SupabaseLike = any
type TraceRecord = { transaction_id: string; request_hash: string | null }

export type CustomerRefundCommand = {
  companyId: string
  customerId: string
  amount: number
  currencyCode: string
  exchangeRate: number
  baseAmount: number
  refundAccountId: string
  refundDate: string
  refundMethod: string
  notes?: string | null
  invoiceId?: string | null
  invoiceNumber?: string | null
  branchId?: string | null
  costCenterId?: string | null
  exchangeRateId?: string | null
  rateSource?: string | null
  uiSurface?: string | null
}

export type CustomerRefundActor = {
  actorId: string
  actorRole: string
  actorBranchId?: string | null
  actorCostCenterId?: string | null
}

export type CustomerRefundResult = {
  success: boolean
  cached: boolean
  journalEntryId: string | null
  paymentId: string | null
  transactionId: string | null
  eventType: typeof CUSTOMER_REFUND_EVENT
  updatedCreditIds: string[]
}

const duplicateTrace = (message?: string | null) =>
  !!message && (message.includes("duplicate key value violates unique constraint") || message.includes("idx_financial_operation_traces_idempotency"))

export class CustomerRefundCommandService {
  constructor(private readonly adminSupabase: SupabaseLike) {}

  async recordRefund(
    actor: CustomerRefundActor,
    command: CustomerRefundCommand,
    options: { idempotencyKey: string; requestHash: string }
  ): Promise<CustomerRefundResult> {
    if (!command.companyId) throw new Error("Company is required")
    if (!command.customerId) throw new Error("Customer is required")
    if (!command.refundAccountId) throw new Error("Refund account is required")
    if (!command.refundDate) throw new Error("Refund date is required")
    if (!Number.isFinite(command.amount) || command.amount <= 0) throw new Error("Refund amount must be greater than zero")
    if (!Number.isFinite(command.baseAmount) || command.baseAmount <= 0) throw new Error("Refund base amount must be greater than zero")

    const existingTrace = await this.findTraceByIdempotency(command.companyId, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different customer refund payload")
      }
      return {
        success: true,
        cached: true,
        journalEntryId: await this.findLinkedEntityId(existingTrace.transaction_id, "journal_entry"),
        paymentId: await this.findLinkedEntityId(existingTrace.transaction_id, "payment"),
        transactionId: existingTrace.transaction_id,
        eventType: CUSTOMER_REFUND_EVENT,
        updatedCreditIds: await this.findLinkedEntityIds(existingTrace.transaction_id, "customer_credit"),
      }
    }

    await requireOpenFinancialPeriod(command.companyId, command.refundDate)

    const customer = await this.loadCustomer(command.companyId, command.customerId)
    if (!customer) throw new Error("Customer was not found")
    const refundAccount = await this.loadAccount(command.companyId, command.refundAccountId)
    if (!refundAccount) throw new Error("Refund account was not found")
    const customerCreditAccount = await this.loadCustomerCreditAccount(command.companyId)
    if (!customerCreditAccount) throw new Error("Customer credit/advance account was not found")

    const accountBalance = await this.getAccountBalance(command.companyId, command.refundAccountId)
    if (accountBalance < command.baseAmount) {
      throw new Error(`Insufficient account balance. Available ${accountBalance.toFixed(2)}, required ${command.baseAmount.toFixed(2)}`)
    }

    const branchId = command.branchId || actor.actorBranchId || null
    const costCenterId = command.costCenterId || actor.actorCostCenterId || null
    const operationId = randomUUID()
    const description = command.invoiceNumber
      ? `Customer credit refund - ${customer.name || command.customerId} - Invoice #${command.invoiceNumber}`
      : command.notes || `Customer credit refund - ${customer.name || command.customerId}`
    const paymentNotes = command.invoiceNumber
      ? `Credit refund to customer ${customer.name || command.customerId} - Invoice #${command.invoiceNumber}`
      : command.notes || `Credit refund to customer ${customer.name || command.customerId}`

    let traceId: string | null = null
    let journalEntryId: string | null = null
    let paymentId: string | null = null
    const updatedCredits: Array<{ id: string; used_amount: number; status: string | null }> = []
    try {
      traceId = await this.createTrace({
        companyId: command.companyId,
        sourceEntity: command.invoiceId ? "invoice_credit_refund" : "customer_credit_refund",
        sourceId: operationId,
        eventType: CUSTOMER_REFUND_EVENT,
        actorId: actor.actorId,
        idempotencyKey: options.idempotencyKey,
        requestHash: options.requestHash,
        metadata: {
          customer_id: command.customerId,
          customer_name: customer.name || null,
          invoice_id: command.invoiceId || null,
          invoice_number: command.invoiceNumber || null,
          amount: command.amount,
          base_amount: command.baseAmount,
          currency_code: command.currencyCode,
          exchange_rate: command.exchangeRate,
          exchange_rate_id: command.exchangeRateId || null,
          rate_source: command.rateSource || null,
          refund_account_id: command.refundAccountId,
          customer_credit_account_id: customerCreditAccount.id,
          refund_date: command.refundDate,
          refund_method: command.refundMethod,
          branch_id: branchId,
          cost_center_id: costCenterId,
          ui_surface: command.uiSurface || "customer_refund_dialog",
        },
      })

      const { data: journalEntry, error: journalError } = await this.adminSupabase
        .from("journal_entries")
        .insert({
          company_id: command.companyId,
          reference_type: command.invoiceId ? "invoice_credit_refund" : "customer_credit_refund",
          reference_id: command.invoiceId || command.customerId,
          entry_date: command.refundDate,
          description,
          branch_id: branchId,
          cost_center_id: costCenterId,
          status: "draft",
        })
        .select("id")
        .single()
      if (journalError || !journalEntry?.id) throw new Error(journalError?.message || "Failed to create customer refund journal entry")
      journalEntryId = String(journalEntry.id)

      const { error: linesError } = await this.adminSupabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: journalEntryId,
          account_id: customerCreditAccount.id,
          debit_amount: command.baseAmount,
          credit_amount: 0,
          description: "Customer credit refund",
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
          account_id: refundAccount.id,
          debit_amount: 0,
          credit_amount: command.baseAmount,
          description: "Cash/Bank payment to customer",
          original_currency: command.currencyCode,
          original_debit: 0,
          original_credit: command.amount,
          exchange_rate_used: command.exchangeRate,
          exchange_rate_id: command.exchangeRateId || null,
          branch_id: branchId,
          cost_center_id: costCenterId,
        },
      ])
      if (linesError) throw new Error(linesError.message || "Failed to create customer refund journal lines")

      await this.applyCustomerCredits(command.companyId, command.customerId, command.amount, updatedCredits)

      const { data: payment, error: paymentError } = await this.insertRefundPayment({
        companyId: command.companyId,
        customerId: command.customerId,
        refundDate: command.refundDate,
        amount: command.amount,
        refundMethod: command.refundMethod,
        referenceNumber: command.invoiceNumber ? `REF-INV-${command.invoiceNumber}-${Date.now()}` : `REF-${Date.now()}`,
        notes: paymentNotes,
        branchId,
        costCenterId,
        accountId: command.refundAccountId,
      })
      if (paymentError) throw new Error(paymentError.message || "Failed to create customer refund payment record")
      paymentId = payment?.id ? String(payment.id) : null

      const { error: postError } = await this.adminSupabase
        .from("journal_entries")
        .update({ status: "posted" })
        .eq("id", journalEntryId)
      if (postError) throw new Error(postError.message || "Failed to post customer refund journal entry")

      await this.linkTrace(traceId, "journal_entry", journalEntryId, "customer_refund_journal", "customer_credit_refund")
      if (paymentId) await this.linkTrace(traceId, "payment", paymentId, "customer_refund_payment", "customer_credit_refund")
      for (const credit of updatedCredits) {
        await this.linkTrace(traceId, "customer_credit", credit.id, "customer_refund_credit_usage", "customer_credit_refund")
      }

      return {
        success: true,
        cached: false,
        journalEntryId,
        paymentId,
        transactionId: traceId,
        eventType: CUSTOMER_REFUND_EVENT,
        updatedCreditIds: updatedCredits.map((credit) => credit.id),
      }
    } catch (error) {
      for (const credit of updatedCredits.reverse()) {
        await this.adminSupabase
          .from("customer_credits")
          .update({ used_amount: credit.used_amount, status: credit.status, updated_at: new Date().toISOString() })
          .eq("id", credit.id)
      }
      if (paymentId) await this.adminSupabase.from("payments").delete().eq("id", paymentId)
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

  private async insertRefundPayment(params: {
    companyId: string
    customerId: string
    refundDate: string
    amount: number
    refundMethod: string
    referenceNumber: string
    notes: string
    branchId: string | null
    costCenterId: string | null
    accountId: string
  }) {
    const payload = {
      company_id: params.companyId,
      customer_id: params.customerId,
      payment_date: params.refundDate,
      amount: -params.amount,
      payment_method: params.refundMethod === "bank" ? "bank" : "cash",
      reference_number: params.referenceNumber,
      notes: params.notes,
      branch_id: params.branchId,
      cost_center_id: params.costCenterId,
    }
    const { data, error } = await this.adminSupabase.from("payments").insert({ ...payload, account_id: params.accountId }).select("id").single()
    if (!error) return { data, error: null }

    const msg = String(error.message || "").toLowerCase()
    if (msg.includes("account_id")) {
      return await this.adminSupabase.from("payments").insert(payload).select("id").single()
    }
    return { data: null, error }
  }

  private async applyCustomerCredits(companyId: string, customerId: string, amount: number, updatedCredits: Array<{ id: string; used_amount: number; status: string | null }>) {
    const { data: credits, error } = await this.adminSupabase
      .from("customer_credits")
      .select("id, amount, used_amount, applied_amount, status")
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .eq("status", "active")
      .order("credit_date", { ascending: true })
    if (error) throw new Error(error.message || "Failed to load customer credits")

    let remainingToDeduct = amount
    for (const credit of credits || []) {
      if (remainingToDeduct <= 0) break
      const usedAmount = Number(credit.used_amount || 0)
      const appliedAmount = Number(credit.applied_amount || 0)
      const available = Number(credit.amount || 0) - usedAmount - appliedAmount
      if (available <= 0) continue
      const deductAmount = Math.min(available, remainingToDeduct)
      const newUsedAmount = usedAmount + deductAmount
      const newStatus = newUsedAmount + appliedAmount >= Number(credit.amount || 0) ? "used" : "active"
      updatedCredits.push({ id: String(credit.id), used_amount: usedAmount, status: credit.status || null })
      const { error: updateError } = await this.adminSupabase
        .from("customer_credits")
        .update({ used_amount: newUsedAmount, status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", credit.id)
      if (updateError) throw new Error(updateError.message || "Failed to update customer credit")
      remainingToDeduct -= deductAmount
    }
  }

  private async getAccountBalance(companyId: string, accountId: string) {
    const { data, error } = await this.adminSupabase
      .from("journal_entry_lines")
      .select("debit_amount, credit_amount, journal_entries!inner(company_id, status)")
      .eq("account_id", accountId)
      .eq("journal_entries.company_id", companyId)
      .eq("journal_entries.status", "posted")
    if (error) throw new Error(error.message || "Failed to validate refund account balance")
    return (data || []).reduce((sum: number, line: any) => sum + Number(line.debit_amount || 0) - Number(line.credit_amount || 0), 0)
  }

  private async loadCustomer(companyId: string, customerId: string) {
    const { data, error } = await this.adminSupabase
      .from("customers")
      .select("id, name")
      .eq("id", customerId)
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

  private async loadCustomerCreditAccount(companyId: string) {
    const { data, error } = await this.adminSupabase
      .from("chart_of_accounts")
      .select("id, account_name, account_type, sub_type, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true)
    if (error || !data) return null
    return (data || []).find((account: any) => {
      const subType = String(account.sub_type || "").toLowerCase()
      const accountType = String(account.account_type || "").toLowerCase()
      const name = String(account.account_name || "").toLowerCase()
      return (accountType === "liability" && (subType === "customer_credit" || subType === "customer_advance")) ||
        subType === "customer_credit" ||
        subType === "customer_advance" ||
        name.includes("سلف العملاء") ||
        name.includes("رصيد العملاء")
    }) || null
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
      throw new Error(error.message || "Failed to create customer refund trace")
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
      .eq("event_type", CUSTOMER_REFUND_EVENT)
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

export { CUSTOMER_REFUND_EVENT }
