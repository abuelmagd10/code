import { randomUUID } from "crypto"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"

const CUSTOMER_VOUCHER_EVENT = "customer_voucher_posting"

type SupabaseLike = any
type TraceRecord = { transaction_id: string; request_hash: string | null }

export type CustomerVoucherCommand = {
  companyId: string
  customerId: string
  amount: number
  currencyCode: string
  exchangeRate: number
  baseAmount: number
  voucherDate: string
  voucherMethod: string
  voucherAccountId: string
  referenceNumber?: string | null
  notes?: string | null
  exchangeRateId?: string | null
  rateSource?: string | null
  uiSurface?: string | null
}

export type CustomerVoucherActor = {
  actorId: string
  actorRole: string
  actorBranchId?: string | null
  actorCostCenterId?: string | null
}

export type CustomerVoucherResult = {
  success: boolean
  cached: boolean
  paymentId: string | null
  journalEntryId: string | null
  transactionId: string | null
  eventType: typeof CUSTOMER_VOUCHER_EVENT
  applicationIds: string[]
}

const duplicateTrace = (message?: string | null) =>
  !!message && (message.includes("duplicate key value violates unique constraint") || message.includes("idx_financial_operation_traces_idempotency"))

export class CustomerVoucherCommandService {
  constructor(private readonly adminSupabase: SupabaseLike) {}

  async createVoucher(
    actor: CustomerVoucherActor,
    command: CustomerVoucherCommand,
    options: { idempotencyKey: string; requestHash: string }
  ): Promise<CustomerVoucherResult> {
    if (!command.companyId) throw new Error("Company is required")
    if (!command.customerId) throw new Error("Customer is required")
    if (!command.voucherAccountId) throw new Error("Voucher account is required")
    if (!command.voucherDate) throw new Error("Voucher date is required")
    if (!Number.isFinite(command.amount) || command.amount <= 0) throw new Error("Voucher amount must be greater than zero")
    if (!Number.isFinite(command.baseAmount) || command.baseAmount <= 0) throw new Error("Voucher base amount must be greater than zero")

    const existingTrace = await this.findTraceByIdempotency(command.companyId, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different customer voucher payload")
      }
      return {
        success: true,
        cached: true,
        paymentId: await this.findLinkedEntityId(existingTrace.transaction_id, "payment"),
        journalEntryId: await this.findLinkedEntityId(existingTrace.transaction_id, "journal_entry"),
        transactionId: existingTrace.transaction_id,
        eventType: CUSTOMER_VOUCHER_EVENT,
        applicationIds: await this.findLinkedEntityIds(existingTrace.transaction_id, "advance_application"),
      }
    }

    await requireOpenFinancialPeriod(command.companyId, command.voucherDate)

    const customer = await this.loadCustomer(command.companyId, command.customerId)
    if (!customer) throw new Error("Customer was not found")
    const voucherAccount = await this.loadAccount(command.companyId, command.voucherAccountId)
    if (!voucherAccount) throw new Error("Voucher account was not found")
    const customerAdvanceAccount = await this.loadCustomerAdvanceAccount(command.companyId)
    if (!customerAdvanceAccount) throw new Error("Customer advance account was not found")

    const branchId = actor.actorBranchId || null
    const costCenterId = actor.actorCostCenterId || null
    const operationId = randomUUID()

    let traceId: string | null = null
    let paymentId: string | null = null
    let journalEntryId: string | null = null
    const applicationIds: string[] = []
    const invoiceSnapshots: Array<{ id: string; paid_amount: number | null; status: string | null }> = []
    try {
      traceId = await this.createTrace({
        companyId: command.companyId,
        sourceEntity: "customer_voucher",
        sourceId: operationId,
        eventType: CUSTOMER_VOUCHER_EVENT,
        actorId: actor.actorId,
        idempotencyKey: options.idempotencyKey,
        requestHash: options.requestHash,
        metadata: {
          customer_id: command.customerId,
          customer_name: customer.name || null,
          amount: command.amount,
          base_amount: command.baseAmount,
          currency_code: command.currencyCode,
          exchange_rate: command.exchangeRate,
          exchange_rate_id: command.exchangeRateId || null,
          rate_source: command.rateSource || null,
          voucher_account_id: command.voucherAccountId,
          customer_advance_account_id: customerAdvanceAccount.id,
          voucher_date: command.voucherDate,
          voucher_method: command.voucherMethod,
          ui_surface: command.uiSurface || "customer_voucher_dialog",
        },
      })

      const { data: payment, error: paymentError } = await this.insertVoucherPayment({
        companyId: command.companyId,
        customerId: command.customerId,
        paymentDate: command.voucherDate,
        amount: command.amount,
        paymentMethod: command.voucherMethod === "bank" ? "bank" : command.voucherMethod === "cash" ? "cash" : "refund",
        referenceNumber: command.referenceNumber || null,
        notes: command.notes || null,
        accountId: command.voucherAccountId,
      })
      if (paymentError || !payment?.id) throw new Error(paymentError?.message || "Failed to create customer voucher payment")
      paymentId = String(payment.id)

      const { data: journalEntry, error: journalError } = await this.adminSupabase
        .from("journal_entries")
        .insert({
          company_id: command.companyId,
          reference_type: "customer_voucher",
          reference_id: paymentId,
          entry_date: command.voucherDate,
          description: "Customer payment voucher",
          branch_id: branchId,
          cost_center_id: costCenterId,
          status: "draft",
        })
        .select("id")
        .single()
      if (journalError || !journalEntry?.id) throw new Error(journalError?.message || "Failed to create customer voucher journal entry")
      journalEntryId = String(journalEntry.id)

      const { error: linesError } = await this.adminSupabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: journalEntryId,
          account_id: customerAdvanceAccount.id,
          debit_amount: command.baseAmount,
          credit_amount: 0,
          description: "Customer advance",
          original_currency: command.currencyCode,
          original_debit: command.amount,
          original_credit: 0,
          exchange_rate_used: command.exchangeRate,
          exchange_rate_id: command.exchangeRateId || null,
          rate_source: command.rateSource || null,
          branch_id: branchId,
          cost_center_id: costCenterId,
        },
        {
          journal_entry_id: journalEntryId,
          account_id: voucherAccount.id,
          debit_amount: 0,
          credit_amount: command.baseAmount,
          description: "Cash/Bank",
          original_currency: command.currencyCode,
          original_debit: 0,
          original_credit: command.amount,
          exchange_rate_used: command.exchangeRate,
          exchange_rate_id: command.exchangeRateId || null,
          rate_source: command.rateSource || null,
          branch_id: branchId,
          cost_center_id: costCenterId,
        },
      ])
      if (linesError) throw new Error(linesError.message || "Failed to create customer voucher journal lines")

      await this.applyToOutstandingInvoices(command.companyId, command.customerId, paymentId, command.amount, applicationIds, invoiceSnapshots)

      const { error: postError } = await this.adminSupabase
        .from("journal_entries")
        .update({ status: "posted" })
        .eq("id", journalEntryId)
      if (postError) throw new Error(postError.message || "Failed to post customer voucher journal entry")

      await this.linkTrace(traceId, "payment", paymentId, "customer_voucher_payment", "customer_voucher")
      await this.linkTrace(traceId, "journal_entry", journalEntryId, "customer_voucher_journal", "customer_voucher")
      for (const applicationId of applicationIds) {
        await this.linkTrace(traceId, "advance_application", applicationId, "customer_voucher_application", "customer_voucher")
      }

      return {
        success: true,
        cached: false,
        paymentId,
        journalEntryId,
        transactionId: traceId,
        eventType: CUSTOMER_VOUCHER_EVENT,
        applicationIds,
      }
    } catch (error) {
      for (const invoice of invoiceSnapshots.reverse()) {
        await this.adminSupabase
          .from("invoices")
          .update({ paid_amount: invoice.paid_amount, status: invoice.status })
          .eq("id", invoice.id)
      }
      if (applicationIds.length > 0) await this.adminSupabase.from("advance_applications").delete().in("id", applicationIds)
      if (journalEntryId) {
        await this.adminSupabase.from("journal_entry_lines").delete().eq("journal_entry_id", journalEntryId)
        await this.adminSupabase.from("journal_entries").delete().eq("id", journalEntryId)
      }
      if (paymentId) await this.adminSupabase.from("payments").delete().eq("id", paymentId)
      if (traceId) {
        await this.adminSupabase.from("financial_operation_trace_links").delete().eq("transaction_id", traceId)
        await this.adminSupabase.from("financial_operation_traces").delete().eq("transaction_id", traceId)
      }
      throw error
    }
  }

  private async insertVoucherPayment(params: {
    companyId: string
    customerId: string
    paymentDate: string
    amount: number
    paymentMethod: string
    referenceNumber: string | null
    notes: string | null
    accountId: string
  }) {
    const payload = {
      company_id: params.companyId,
      customer_id: params.customerId,
      payment_date: params.paymentDate,
      amount: params.amount,
      payment_method: params.paymentMethod,
      reference_number: params.referenceNumber,
      notes: params.notes,
    }
    const { data, error } = await this.adminSupabase.from("payments").insert({ ...payload, account_id: params.accountId }).select("id").single()
    if (!error) return { data, error: null }
    const msg = String(error.message || "").toLowerCase()
    if (msg.includes("account_id")) {
      return await this.adminSupabase.from("payments").insert(payload).select("id").single()
    }
    return { data: null, error }
  }

  private async applyToOutstandingInvoices(
    companyId: string,
    customerId: string,
    paymentId: string,
    amount: number,
    applicationIds: string[],
    invoiceSnapshots: Array<{ id: string; paid_amount: number | null; status: string | null }>
  ) {
    const { data: invoices, error } = await this.adminSupabase
      .from("invoices")
      .select("id, total_amount, paid_amount, status")
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .in("status", ["sent", "partially_paid"])
      .order("issue_date", { ascending: true })
    if (error) throw new Error(error.message || "Failed to load outstanding customer invoices")

    let remaining = Number(amount || 0)
    for (const invoice of invoices || []) {
      if (remaining <= 0) break
      const paidAmount = Number(invoice.paid_amount || 0)
      const due = Math.max(Number(invoice.total_amount || 0) - paidAmount, 0)
      const applyAmount = Math.min(remaining, due)
      if (applyAmount <= 0) continue

      const { data: application, error: applicationError } = await this.adminSupabase
        .from("advance_applications")
        .insert({
          company_id: companyId,
          customer_id: customerId,
          invoice_id: invoice.id,
          amount_applied: applyAmount,
          payment_id: paymentId,
        })
        .select("id")
        .single()
      if (applicationError || !application?.id) throw new Error(applicationError?.message || "Failed to create voucher advance application")

      invoiceSnapshots.push({ id: String(invoice.id), paid_amount: invoice.paid_amount, status: invoice.status })
      const newPaidAmount = paidAmount + applyAmount
      const newStatus = Number(invoice.total_amount || 0) <= newPaidAmount ? "paid" : "partially_paid"
      const { error: invoiceError } = await this.adminSupabase
        .from("invoices")
        .update({ paid_amount: newPaidAmount, status: newStatus })
        .eq("id", invoice.id)
      if (invoiceError) throw new Error(invoiceError.message || "Failed to update voucher invoice allocation")

      applicationIds.push(String(application.id))
      remaining -= applyAmount
    }
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

  private async loadCustomerAdvanceAccount(companyId: string) {
    const { data, error } = await this.adminSupabase
      .from("chart_of_accounts")
      .select("id, account_name, account_type, sub_type, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true)
    if (error || !data) return null
    return (data || []).find((account: any) => {
      const subType = String(account.sub_type || "").toLowerCase()
      const name = String(account.account_name || "").toLowerCase()
      return subType === "customer_advance" || name.includes("advance") || name.includes("deposit")
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
      throw new Error(error.message || "Failed to create customer voucher trace")
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
      .eq("event_type", CUSTOMER_VOUCHER_EVENT)
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

export { CUSTOMER_VOUCHER_EVENT }
