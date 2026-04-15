import { createCompleteJournalEntry } from "@/lib/journal-entry-governance"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"

const CREATE_EVENT = "customer_payment_command"
const PAYMENT_EVENT = "customer_payment_posting"
const APPLY_EVENT = "customer_payment_apply_invoice"
const INVOICE_PAYMENT_EVENT = "invoice_payment_posting"
const UPDATE_EVENT = "customer_payment_update"
const DELETE_EVENT = "customer_payment_delete"
const PRIVILEGED_ROLES = new Set(["owner", "admin", "general_manager"])

type SupabaseLike = any
type ActorContext = { companyId: string; actorId: string; actorRole: string; actorBranchId?: string | null }
type TraceRecord = { transaction_id: string; request_hash: string | null }

export type CustomerPaymentAllocationCommand = { invoiceId: string; amount: number }
export type CreateCustomerPaymentCommand = {
  customerId: string
  amount: number
  paymentDate: string
  paymentMethod: string
  accountId: string
  branchId?: string | null
  costCenterId?: string | null
  warehouseId?: string | null
  referenceNumber?: string | null
  notes?: string | null
  currencyCode: string
  exchangeRate: number
  baseCurrencyAmount: number
  originalAmount?: number | null
  originalCurrency?: string | null
  exchangeRateId?: string | null
  rateSource?: string | null
  allocations: CustomerPaymentAllocationCommand[]
  uiSurface?: string | null
}
export type UpdateCustomerPaymentCommand = {
  paymentDate: string
  paymentMethod: string
  accountId: string | null
  referenceNumber?: string | null
  notes?: string | null
  uiSurface?: string | null
}

type PaymentRow = {
  id: string
  company_id: string
  customer_id: string | null
  invoice_id: string | null
  payment_date: string
  amount: number
  payment_method: string | null
  account_id: string | null
  branch_id: string | null
  cost_center_id: string | null
  warehouse_id: string | null
  reference_number: string | null
  notes: string | null
  status: string | null
  journal_entry_id: string | null
  unallocated_amount: number | null
  currency_code: string | null
  exchange_rate: number | null
  exchange_rate_used: number | null
}

type InvoiceRow = {
  id: string
  company_id: string
  customer_id: string | null
  invoice_number: string | null
  invoice_date: string | null
  status: string | null
  total_amount: number | null
  paid_amount: number | null
  original_paid: number | null
  returned_amount: number | null
  subtotal: number | null
  tax_amount: number | null
  shipping: number | null
  branch_id: string | null
  cost_center_id: string | null
  warehouse_id: string | null
}

type ApplicationRow = {
  id: string
  payment_id: string
  invoice_id: string
  amount_applied: number
  invoices: {
    id: string
    invoice_number: string | null
    branch_id: string | null
    cost_center_id: string | null
    warehouse_id: string | null
    customer_id: string | null
  } | null
}

type AccountMapping = {
  ar: string
  revenue: string
  cash: string | null
  bank: string | null
  vatOutput: string | null
  customerAdvance: string | null
}

export type CustomerPaymentCommandResult = {
  success: boolean
  cached: boolean
  paymentId: string
  status: string | null
  approved: boolean
  posted: boolean
  journalEntryId: string | null
  journalEntryIds: string[]
  transactionId: string | null
  eventType: string
}

export type CustomerPaymentMaintenanceResult = {
  success: boolean
  cached: boolean
  action: "updated" | "deleted"
  paymentId: string
  transactionId: string | null
  posted: boolean
  reversalJournalIds: string[]
  journalEntryIds: string[]
}

const asNumber = (value: unknown) => {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) ? numeric : 0
}
const approved = (payment: PaymentRow) => !payment.status || payment.status === "approved"
const normalizeRole = (role: string | null | undefined) => String(role || "").trim().toLowerCase()
const isPrivilegedRole = (role: string | null | undefined) => PRIVILEGED_ROLES.has(normalizeRole(role))
const amountsEqual = (left: number, right: number) => Math.abs(left - right) < 0.01
const dedupe = (values: Array<string | null | undefined>) => Array.from(new Set(values.filter(Boolean) as string[]))
const duplicateTrace = (message?: string | null) =>
  !!message && (message.includes("duplicate key value violates unique constraint") || message.includes("idx_financial_operation_traces_idempotency"))

export class CustomerPaymentCommandService {
  constructor(private authSupabase: SupabaseLike, private adminSupabase: SupabaseLike) {}

  async createPayment(actor: ActorContext, command: CreateCustomerPaymentCommand, options: { idempotencyKey: string; requestHash: string }): Promise<CustomerPaymentCommandResult> {
    if (!command.customerId) throw new Error("Customer is required")
    if (!Number.isFinite(command.amount) || command.amount <= 0) throw new Error("Payment amount must be greater than zero")
    if (!command.paymentDate) throw new Error("Payment date is required")
    if (!command.paymentMethod) throw new Error("Payment method is required")
    if (!command.accountId) throw new Error("Receipt account is required")

    const existing = await this.findTraceByIdempotency(actor.companyId, CREATE_EVENT, options.idempotencyKey)
    if (existing) {
      if (existing.request_hash && existing.request_hash !== options.requestHash) throw new Error("Idempotency key already used with a different request payload")
      const linkedPaymentId = await this.findLinkedEntityId(existing.transaction_id, "payment")
      if (!linkedPaymentId) throw new Error("Customer payment command is already in progress")
      return this.buildResult(linkedPaymentId, existing.transaction_id, true)
    }

    await requireOpenFinancialPeriod(actor.companyId, command.paymentDate)
    await this.assertCustomerAndAccount(actor.companyId, command.customerId, command.accountId)
    const branchId = await this.resolveBranchId(actor.companyId, command.branchId || actor.actorBranchId || null, command.allocations)
    const totalAllocated = command.allocations.reduce((sum, allocation) => sum + asNumber(allocation.amount), 0)
    if (totalAllocated > command.amount + 0.01) throw new Error("Total allocations cannot exceed payment amount")

    const traceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "payment_request",
      sourceId: options.idempotencyKey,
      eventType: CREATE_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: { customer_id: command.customerId, branch_id: branchId, ui_surface: command.uiSurface || null, allocation_count: command.allocations.length },
    })

    const { data: payment, error } = await this.adminSupabase.from("payments").insert({
      company_id: actor.companyId,
      customer_id: command.customerId,
      payment_date: command.paymentDate,
      amount: command.amount,
      payment_method: command.paymentMethod,
      reference_number: command.referenceNumber || null,
      notes: command.notes || null,
      account_id: command.accountId,
      branch_id: branchId,
      cost_center_id: command.costCenterId || null,
      warehouse_id: command.warehouseId || null,
      currency_code: command.currencyCode,
      exchange_rate: command.exchangeRate,
      exchange_rate_used: command.exchangeRate,
      exchange_rate_id: command.exchangeRateId || null,
      rate_source: command.rateSource || null,
      base_currency_amount: command.baseCurrencyAmount,
      original_amount: command.originalAmount ?? command.amount,
      original_currency: command.originalCurrency || command.currencyCode,
      status: "approved",
      created_by: actor.actorId,
      approved_by: actor.actorId,
      approved_at: new Date().toISOString(),
      unallocated_amount: Math.max(command.amount - totalAllocated, 0),
    }).select("id").single()
    if (error || !payment?.id) throw new Error(error?.message || "Failed to create customer payment")

    const paymentId = String(payment.id)
    await this.linkTrace(traceId, "payment", paymentId, "payment", CREATE_EVENT)
    for (const allocation of command.allocations) {
      await this.applyAllocation(actor, paymentId, allocation.invoiceId, allocation.amount, traceId)
    }

    await this.finalizeApprovedPayment(await this.loadPayment(actor.companyId, paymentId), actor, {
      idempotencyKey: `${options.idempotencyKey}:posting`,
      requestHash: options.requestHash,
      uiSurface: command.uiSurface || null,
      invoicePaymentSeed: `${options.idempotencyKey}:invoice-payment`,
    })
    return this.buildResult(paymentId, traceId, false)
  }

  async applyPaymentToInvoice(actor: ActorContext, paymentId: string, invoiceId: string, amount: number, options: { idempotencyKey: string; requestHash: string; uiSurface?: string | null }): Promise<CustomerPaymentCommandResult> {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Allocation amount must be greater than zero")
    const existing = await this.findTraceByIdempotency(actor.companyId, APPLY_EVENT, options.idempotencyKey)
    if (existing) {
      if (existing.request_hash && existing.request_hash !== options.requestHash) throw new Error("Idempotency key already used with a different request payload")
      return this.buildResult(paymentId, existing.transaction_id, true)
    }

    const payment = await this.loadPayment(actor.companyId, paymentId)
    this.assertCustomerPaymentScope(actor, payment)
    await requireOpenFinancialPeriod(actor.companyId, payment.payment_date)
    const traceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "payment",
      sourceId: paymentId,
      eventType: APPLY_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: { customer_id: payment.customer_id, payment_id: paymentId, invoice_id: invoiceId, amount: asNumber(amount), ui_surface: options.uiSurface || null },
    })

    await this.applyAllocation(actor, paymentId, invoiceId, amount, traceId)
    const refreshedPayment = await this.loadPayment(actor.companyId, paymentId)
    const applications = await this.loadApplications(paymentId)
    const application = applications.find((item) => item.invoice_id === invoiceId)
    if (application && approved(refreshedPayment)) {
      await this.finalizeApprovedPayment(refreshedPayment, actor, {
        idempotencyKey: `customer-payment:${paymentId}:bootstrap`,
        requestHash: null,
        uiSurface: options.uiSurface || null,
        invoicePaymentSeed: `customer-payment:${paymentId}`,
      })
    }
    return this.buildResult(paymentId, traceId, false)
  }

  async updatePayment(actor: ActorContext, paymentId: string, command: UpdateCustomerPaymentCommand, options: { idempotencyKey: string; requestHash: string }): Promise<CustomerPaymentMaintenanceResult> {
    const existing = await this.findTraceByIdempotency(actor.companyId, UPDATE_EVENT, options.idempotencyKey)
    if (existing) {
      if (existing.request_hash && existing.request_hash !== options.requestHash) throw new Error("Idempotency key already used with a different request payload")
      return { success: true, cached: true, action: "updated", paymentId, transactionId: existing.transaction_id, posted: true, reversalJournalIds: [], journalEntryIds: [] }
    }
    if (!command.paymentDate) throw new Error("Payment date is required")
    if (!command.paymentMethod) throw new Error("Payment method is required")
    if (command.accountId) await this.assertAccount(actor.companyId, command.accountId)

    const payment = await this.loadPayment(actor.companyId, paymentId)
    this.assertCustomerPaymentScope(actor, payment)
    const applications = await this.loadApplications(paymentId)
    const invoiceIds = dedupe([payment.invoice_id, ...applications.map((item) => item.invoice_id)])
    const traceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "payment",
      sourceId: paymentId,
      eventType: UPDATE_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: { customer_id: payment.customer_id, invoice_ids: invoiceIds, old_account_id: payment.account_id, new_account_id: command.accountId, ui_surface: command.uiSurface || null },
    })
    await this.linkTrace(traceId, "payment", paymentId, "payment", UPDATE_EVENT)
    for (const invoiceId of invoiceIds) await this.linkTrace(traceId, "invoice", invoiceId, "invoice", UPDATE_EVENT)

    let reversalJournalIds: string[] = []
    if (approved(payment)) {
      await requireOpenFinancialPeriod(actor.companyId, command.paymentDate)
      reversalJournalIds = await this.reverseJournalEntries(actor.companyId, await this.collectPostedJournalIds(payment, applications), command.paymentDate, actor.actorId)
      for (const reversalId of reversalJournalIds) await this.linkTrace(traceId, "journal_entry", reversalId, "journal_reversal", UPDATE_EVENT)
    }

    const { error } = await this.adminSupabase.from("payments").update({
      payment_date: command.paymentDate,
      payment_method: command.paymentMethod,
      reference_number: command.referenceNumber || null,
      notes: command.notes || null,
      account_id: command.accountId || null,
      journal_entry_id: approved(payment) ? null : payment.journal_entry_id,
    }).eq("company_id", actor.companyId).eq("id", paymentId)
    if (error) throw new Error(error.message || "Failed to update customer payment")

    let journalEntryIds: string[] = []
    if (approved(payment)) {
      const repost = await this.finalizeApprovedPayment(await this.loadPayment(actor.companyId, paymentId), actor, {
        idempotencyKey: `${options.idempotencyKey}:repost`,
        requestHash: options.requestHash,
        uiSurface: command.uiSurface || null,
        invoicePaymentSeed: `${options.idempotencyKey}:invoice-payment`,
      })
      journalEntryIds = dedupe([...repost.journalEntryIds, ...repost.invoicePaymentJournalIds])
      for (const journalId of journalEntryIds) await this.linkTrace(traceId, "journal_entry", journalId, "journal_entry", UPDATE_EVENT)
    }

    return { success: true, cached: false, action: "updated", paymentId, transactionId: traceId, posted: approved(payment), reversalJournalIds, journalEntryIds }
  }

  async deletePayment(actor: ActorContext, paymentId: string, options: { idempotencyKey: string; requestHash: string; uiSurface?: string | null }): Promise<CustomerPaymentMaintenanceResult> {
    const existing = await this.findTraceByIdempotency(actor.companyId, DELETE_EVENT, options.idempotencyKey)
    if (existing) {
      if (existing.request_hash && existing.request_hash !== options.requestHash) throw new Error("Idempotency key already used with a different request payload")
      const existingPayment = await this.loadPayment(actor.companyId, paymentId).catch(() => null)
      if (!existingPayment) return { success: true, cached: true, action: "deleted", paymentId, transactionId: existing.transaction_id, posted: true, reversalJournalIds: [], journalEntryIds: [] }
    }

    const payment = await this.loadPayment(actor.companyId, paymentId)
    this.assertCustomerPaymentScope(actor, payment)
    const applications = await this.loadApplications(paymentId)
    const invoiceIds = dedupe([payment.invoice_id, ...applications.map((item) => item.invoice_id)])
    const traceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "payment",
      sourceId: paymentId,
      eventType: DELETE_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: { customer_id: payment.customer_id, payment_id: paymentId, invoice_ids: invoiceIds, ui_surface: options.uiSurface || null },
    })
    await this.linkTrace(traceId, "payment", paymentId, "payment", DELETE_EVENT)
    for (const invoiceId of invoiceIds) await this.linkTrace(traceId, "invoice", invoiceId, "invoice", DELETE_EVENT)

    const reversalDate = new Date().toISOString().slice(0, 10)
    let reversalJournalIds: string[] = []
    if (approved(payment)) {
      await requireOpenFinancialPeriod(actor.companyId, reversalDate)
      reversalJournalIds = await this.reverseJournalEntries(actor.companyId, await this.collectPostedJournalIds(payment, applications), reversalDate, actor.actorId)
      for (const reversalId of reversalJournalIds) await this.linkTrace(traceId, "journal_entry", reversalId, "journal_reversal", DELETE_EVENT)
    }

    await this.reverseApplications(payment, applications)
    const { error: appError } = await this.adminSupabase.from("advance_applications").delete().eq("payment_id", paymentId)
    if (appError) throw new Error(appError.message || "Failed to remove customer payment applications")
    const { error: deleteError } = await this.adminSupabase.from("payments").delete().eq("company_id", actor.companyId).eq("id", paymentId)
    if (deleteError) throw new Error(deleteError.message || "Failed to delete customer payment")
    return { success: true, cached: false, action: "deleted", paymentId, transactionId: traceId, posted: approved(payment), reversalJournalIds, journalEntryIds: [] }
  }

  private async applyAllocation(actor: ActorContext, paymentId: string, invoiceId: string, amount: number, commandTraceId: string) {
    const payment = await this.loadPayment(actor.companyId, paymentId)
    const invoice = await this.loadInvoice(actor.companyId, invoiceId)
    if (String(payment.customer_id || "") !== String(invoice.customer_id || "")) throw new Error("Customer payment and invoice customer do not match")
    if (!isPrivilegedRole(actor.actorRole) && actor.actorBranchId && invoice.branch_id && actor.actorBranchId !== invoice.branch_id) throw new Error("Invoice is outside your branch scope")

    const applications = await this.loadApplications(paymentId)
    if (applications.some((item) => item.invoice_id === invoiceId)) throw new Error("This customer payment is already allocated to the selected invoice")
    const totalAppliedBefore = applications.reduce((sum, item) => sum + asNumber(item.amount_applied), 0)
    if (amount > Math.max(asNumber(payment.amount) - totalAppliedBefore, 0) + 0.01) throw new Error("Allocation amount exceeds the remaining unallocated payment balance")
    const outstanding = Math.max(asNumber(invoice.total_amount) - asNumber(invoice.returned_amount) - asNumber(invoice.paid_amount), 0)
    if (amount > outstanding + 0.01) throw new Error("Allocation amount exceeds the invoice outstanding balance")

    const { data: application, error } = await this.adminSupabase.from("advance_applications").insert({
      company_id: actor.companyId,
      customer_id: payment.customer_id,
      supplier_id: null,
      payment_id: paymentId,
      invoice_id: invoiceId,
      bill_id: null,
      amount_applied: asNumber(amount),
      applied_date: payment.payment_date,
      notes: "تطبيق دفعة عميل على فاتورة مبيعات",
    }).select("id").single()
    if (error || !application?.id) throw new Error(error?.message || "Failed to create customer payment application")

    const newPaid = asNumber(invoice.paid_amount) + asNumber(amount)
    const newOriginalPaid = asNumber(invoice.original_paid ?? invoice.paid_amount) + asNumber(amount)
    const netInvoiceAmount = Math.max(asNumber(invoice.total_amount) - asNumber(invoice.returned_amount), 0)
    const { error: invoiceError } = await this.adminSupabase.from("invoices").update({
      paid_amount: newPaid,
      original_paid: newOriginalPaid,
      status: newPaid >= netInvoiceAmount ? "paid" : "partially_paid",
    }).eq("company_id", actor.companyId).eq("id", invoiceId)
    if (invoiceError) throw new Error(invoiceError.message || "Failed to update invoice settlement")

    const totalAppliedAfter = totalAppliedBefore + asNumber(amount)
    const unallocatedAmount = Math.max(asNumber(payment.amount) - totalAppliedAfter, 0)
    const shouldLinkInvoice = amountsEqual(unallocatedAmount, 0) && applications.length === 0
    const { error: paymentError } = await this.adminSupabase.from("payments").update({
      invoice_id: shouldLinkInvoice ? invoiceId : null,
      unallocated_amount: unallocatedAmount,
    }).eq("company_id", actor.companyId).eq("id", paymentId)
    if (paymentError) throw new Error(paymentError.message || "Failed to update customer payment allocation state")

    await this.linkTrace(commandTraceId, "payment", paymentId, "payment", APPLY_EVENT)
    await this.linkTrace(commandTraceId, "invoice", invoiceId, "invoice", APPLY_EVENT)
    await this.linkTrace(commandTraceId, "advance_application", String(application.id), "application", APPLY_EVENT)
  }

  private async finalizeApprovedPayment(payment: PaymentRow, actor: ActorContext, options: { idempotencyKey?: string | null; requestHash?: string | null; uiSurface?: string | null; invoicePaymentSeed?: string | null }) {
    const applications = await this.loadApplications(payment.id)
    const mapping = await this.loadAccountMapping(payment.company_id)
    const settlementAccountId = payment.account_id || mapping.cash || mapping.bank
    if (!settlementAccountId) throw new Error("Cash or bank account is required to finalize customer payment")

    const totalApplied = applications.reduce((sum, item) => sum + asNumber(item.amount_applied), 0)
    const unallocatedAmount = Math.max(asNumber(payment.unallocated_amount ?? payment.amount - totalApplied), 0)
    const existingMainJournalId = await this.findExistingMainJournalId(payment)
    const needsAdvanceJournal = Boolean(existingMainJournalId) || applications.length === 0 || unallocatedAmount > 0 || applications.length > 1
    if (needsAdvanceJournal && !mapping.customerAdvance) throw new Error("Customer advance account is required to finalize customer payment")

    let mainJournalEntryId = existingMainJournalId
    if (needsAdvanceJournal && !mainJournalEntryId) {
      const entry = await createCompleteJournalEntry(this.adminSupabase, {
        company_id: payment.company_id,
        reference_type: "customer_payment",
        reference_id: payment.id,
        entry_date: payment.payment_date,
        description: `دفعة عميل ${payment.reference_number || payment.id}`,
        branch_id: payment.branch_id || actor.actorBranchId || null,
        cost_center_id: payment.cost_center_id || null,
        warehouse_id: payment.warehouse_id || null,
      }, [
        { account_id: settlementAccountId, debit_amount: asNumber(payment.amount), credit_amount: 0, description: "نقد/بنك", branch_id: payment.branch_id || actor.actorBranchId || null, cost_center_id: payment.cost_center_id || null },
        { account_id: mapping.customerAdvance!, debit_amount: 0, credit_amount: asNumber(payment.amount), description: "سلف من العملاء", branch_id: payment.branch_id || actor.actorBranchId || null, cost_center_id: payment.cost_center_id || null },
      ])
      if (!entry.success || !entry.entryId) throw new Error(entry.error || "Failed to create customer payment journal")
      mainJournalEntryId = entry.entryId
    }

    const invoicePaymentJournalIds: string[] = []
    for (const application of applications) {
      const invoice = await this.loadInvoice(payment.company_id, application.invoice_id)
      await this.ensureInvoiceRevenueJournal(invoice, mapping)
      const branchId = application.invoices?.branch_id || payment.branch_id || actor.actorBranchId || null
      const costCenterId = application.invoices?.cost_center_id || payment.cost_center_id || null
      const warehouseId = application.invoices?.warehouse_id || payment.warehouse_id || null
      const entry = await createCompleteJournalEntry(this.adminSupabase, {
        company_id: payment.company_id,
        reference_type: "invoice_payment",
        reference_id: application.id,
        entry_date: payment.payment_date,
        description: `دفعة على فاتورة ${application.invoices?.invoice_number || application.invoice_id}`,
        branch_id: branchId,
        cost_center_id: costCenterId,
        warehouse_id: warehouseId,
      }, [
        { account_id: needsAdvanceJournal ? mapping.customerAdvance! : settlementAccountId, debit_amount: asNumber(application.amount_applied), credit_amount: 0, description: needsAdvanceJournal ? "تسوية سلف العملاء" : "نقد/بنك", branch_id: branchId, cost_center_id: costCenterId },
        { account_id: mapping.ar, debit_amount: 0, credit_amount: asNumber(application.amount_applied), description: "الذمم المدينة", branch_id: branchId, cost_center_id: costCenterId },
      ])
      if (!entry.success || !entry.entryId) throw new Error(entry.error || `Failed to create invoice payment journal for application ${application.id}`)
      invoicePaymentJournalIds.push(entry.entryId)
    }

    const primaryJournalEntryId = mainJournalEntryId || invoicePaymentJournalIds[0] || payment.journal_entry_id || null
    await this.adminSupabase.from("payments").update({ journal_entry_id: primaryJournalEntryId }).eq("company_id", payment.company_id).eq("id", payment.id)
    const traceId = await this.createTrace({
      companyId: payment.company_id,
      sourceEntity: "payment",
      sourceId: payment.id,
      eventType: PAYMENT_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey || `customer-payment:${payment.id}`,
      requestHash: options.requestHash || null,
      metadata: { customer_id: payment.customer_id, invoice_ids: applications.map((item) => item.invoice_id), ui_surface: options.uiSurface || null, settlement_mode: applications.length ? "allocated" : "advance_only" },
    })
    await this.linkTrace(traceId, "payment", payment.id, "payment", PAYMENT_EVENT)
    if (mainJournalEntryId) await this.linkTrace(traceId, "journal_entry", mainJournalEntryId, "journal_entry", PAYMENT_EVENT)

    const invoicePaymentTraceIds: string[] = []
    for (let index = 0; index < applications.length; index += 1) {
      const application = applications[index]
      const invoiceTraceId = await this.createTrace({
        companyId: payment.company_id,
        sourceEntity: "invoice",
        sourceId: application.invoice_id,
        eventType: INVOICE_PAYMENT_EVENT,
        actorId: actor.actorId,
        idempotencyKey: options.invoicePaymentSeed ? `${options.invoicePaymentSeed}:application:${application.id}` : `customer-payment:${payment.id}:application:${application.id}`,
        requestHash: null,
        metadata: { customer_id: payment.customer_id, payment_id: payment.id, advance_application_id: application.id, invoice_id: application.invoice_id, ui_surface: options.uiSurface || null },
      })
      invoicePaymentTraceIds.push(invoiceTraceId)
      await this.linkTrace(invoiceTraceId, "invoice", application.invoice_id, "invoice", INVOICE_PAYMENT_EVENT)
      await this.linkTrace(invoiceTraceId, "payment", payment.id, "payment", INVOICE_PAYMENT_EVENT)
      await this.linkTrace(invoiceTraceId, "advance_application", application.id, "application", INVOICE_PAYMENT_EVENT)
      await this.linkTrace(invoiceTraceId, "journal_entry", invoicePaymentJournalIds[index], "journal_entry", INVOICE_PAYMENT_EVENT)
    }

    return { traceId, journalEntryIds: mainJournalEntryId ? [mainJournalEntryId] : [], invoicePaymentTraceIds, invoicePaymentJournalIds }
  }

  private async ensureInvoiceRevenueJournal(invoice: InvoiceRow, mapping: AccountMapping) {
    const { data: existing } = await this.adminSupabase.from("journal_entries")
      .select("id")
      .eq("company_id", invoice.company_id)
      .eq("reference_type", "invoice")
      .eq("reference_id", invoice.id)
      .limit(1)
    if (existing && existing.length > 0) return String(existing[0].id)

    const totalAmount = asNumber(invoice.total_amount)
    const taxAmount = asNumber(invoice.tax_amount)
    const shippingAmount = asNumber(invoice.shipping)
    const subtotal = asNumber(invoice.subtotal) || Math.max(totalAmount - taxAmount - shippingAmount, 0)
    const revenueAmount = subtotal + shippingAmount + (mapping.vatOutput ? 0 : taxAmount)
    const lines = [
      { account_id: mapping.ar, debit_amount: totalAmount, credit_amount: 0, description: "الذمم المدينة", branch_id: invoice.branch_id, cost_center_id: invoice.cost_center_id },
      { account_id: mapping.revenue, debit_amount: 0, credit_amount: revenueAmount, description: "إيرادات المبيعات", branch_id: invoice.branch_id, cost_center_id: invoice.cost_center_id },
    ]
    if (mapping.vatOutput && taxAmount > 0) {
      lines.push({ account_id: mapping.vatOutput, debit_amount: 0, credit_amount: taxAmount, description: "ضريبة القيمة المضافة المستحقة", branch_id: invoice.branch_id, cost_center_id: invoice.cost_center_id })
    }

    const entry = await createCompleteJournalEntry(this.adminSupabase, {
      company_id: invoice.company_id,
      reference_type: "invoice",
      reference_id: invoice.id,
      entry_date: invoice.invoice_date || new Date().toISOString().slice(0, 10),
      description: `فاتورة مبيعات ${invoice.invoice_number || invoice.id}`,
      branch_id: invoice.branch_id,
      cost_center_id: invoice.cost_center_id,
      warehouse_id: invoice.warehouse_id,
    }, lines)
    if (!entry.success || !entry.entryId) throw new Error(entry.error || "Failed to create invoice revenue journal")
    return entry.entryId
  }

  private async reverseApplications(payment: PaymentRow, applications: ApplicationRow[]) {
    const effectiveApplications = [...applications]
    if (effectiveApplications.length === 0 && payment.invoice_id) {
      effectiveApplications.push({ id: "legacy", payment_id: payment.id, invoice_id: payment.invoice_id, amount_applied: asNumber(payment.amount), invoices: null })
    }
    for (const application of effectiveApplications) {
      const invoice = await this.loadInvoice(payment.company_id, application.invoice_id)
      const newPaid = Math.max(asNumber(invoice.paid_amount) - asNumber(application.amount_applied), 0)
      const newOriginalPaid = Math.max(asNumber(invoice.original_paid ?? invoice.paid_amount) - asNumber(application.amount_applied), 0)
      const { error } = await this.adminSupabase.from("invoices").update({
        paid_amount: newPaid,
        original_paid: newOriginalPaid,
        status: newPaid <= 0 ? "sent" : "partially_paid",
      }).eq("company_id", payment.company_id).eq("id", application.invoice_id)
      if (error) throw new Error(error.message || "Failed to reverse invoice settlement")
    }
  }

  private async loadPayment(companyId: string | undefined, paymentId: string): Promise<PaymentRow> {
    let query = this.adminSupabase.from("payments").select(`
      id, company_id, customer_id, invoice_id, payment_date, amount, payment_method, account_id,
      branch_id, cost_center_id, warehouse_id, reference_number, notes, status, journal_entry_id,
      unallocated_amount, currency_code, exchange_rate, exchange_rate_used
    `).eq("id", paymentId)
    if (companyId) query = query.eq("company_id", companyId)
    const { data, error } = await query.maybeSingle()
    if (error || !data) throw new Error(error?.message || "Customer payment not found")
    return data as PaymentRow
  }

  private async loadInvoice(companyId: string, invoiceId: string): Promise<InvoiceRow> {
    const { data, error } = await this.adminSupabase.from("invoices").select(`
      id, company_id, customer_id, invoice_number, invoice_date, status, total_amount, paid_amount,
      original_paid, returned_amount, subtotal, tax_amount, shipping, branch_id, cost_center_id, warehouse_id
    `).eq("company_id", companyId).eq("id", invoiceId).maybeSingle()
    if (error || !data) throw new Error(error?.message || "Invoice not found")
    return data as InvoiceRow
  }

  private async loadApplications(paymentId: string): Promise<ApplicationRow[]> {
    const { data, error } = await this.adminSupabase.from("advance_applications").select(`
      id, payment_id, invoice_id, amount_applied,
      invoices!inner(id, invoice_number, branch_id, cost_center_id, warehouse_id, customer_id)
    `).eq("payment_id", paymentId).not("invoice_id", "is", null).order("created_at", { ascending: true })
    if (error) throw new Error(error.message || "Failed to load customer payment applications")
    return (data || []) as ApplicationRow[]
  }

  private async loadAccountMapping(companyId: string): Promise<AccountMapping> {
    const { data, error } = await this.adminSupabase.from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, sub_type")
      .eq("company_id", companyId)
      .eq("is_active", true)
    if (error) throw new Error(error.message || "Failed to load sales account mapping")
    const accounts = data || []
    const find = (subType: string, fallback?: (row: any) => boolean) => {
      let account = accounts.find((row: any) => row.sub_type === subType)
      if (!account && fallback) account = accounts.find(fallback)
      return account?.id ? String(account.id) : null
    }
    const mapping: AccountMapping = {
      ar: find("accounts_receivable", (row) => row.account_type === "asset" && /receivable|ذمم|مدين/i.test(`${row.account_name || ""} ${row.account_code || ""}`)) || "",
      revenue: find("sales_revenue", (row) => row.account_type === "income") || "",
      cash: find("cash", (row) => row.account_type === "asset" && /cash|خزينة|نقد|صندوق|كاش/i.test(`${row.account_name || ""} ${row.account_code || ""}`)),
      bank: find("bank", (row) => row.account_type === "asset" && /bank|بنك/i.test(`${row.account_name || ""} ${row.account_code || ""}`)),
      vatOutput: find("vat_output", (row) => /vat|ضريبة/i.test(`${row.account_name || ""} ${row.account_code || ""}`)),
      customerAdvance: find("customer_advance", (row) => row.account_type === "liability" && /advance|سلف/i.test(`${row.account_name || ""} ${row.account_code || ""}`)),
    }
    if (!mapping.ar) throw new Error("Accounts receivable account is required")
    if (!mapping.revenue) throw new Error("Sales revenue account is required")
    return mapping
  }

  private async assertCustomerAndAccount(companyId: string, customerId: string, accountId: string) {
    const [customer, account] = await Promise.all([
      this.adminSupabase.from("customers").select("id").eq("company_id", companyId).eq("id", customerId).maybeSingle(),
      this.adminSupabase.from("chart_of_accounts").select("id").eq("company_id", companyId).eq("id", accountId).maybeSingle(),
    ])
    if (customer.error || !customer.data?.id) throw new Error("Selected customer is invalid")
    if (account.error || !account.data?.id) throw new Error("Selected receipt account is invalid")
  }

  private async assertAccount(companyId: string, accountId: string) {
    const { data, error } = await this.adminSupabase.from("chart_of_accounts").select("id").eq("company_id", companyId).eq("id", accountId).maybeSingle()
    if (error || !data?.id) throw new Error("Selected receipt account is invalid")
  }

  private assertCustomerPaymentScope(actor: ActorContext, payment: PaymentRow) {
    if (!payment.customer_id) throw new Error("This command is only available for customer payments")
    if (!isPrivilegedRole(actor.actorRole) && actor.actorBranchId && payment.branch_id && actor.actorBranchId !== payment.branch_id) {
      throw new Error("Customer payment is outside your branch scope")
    }
  }

  private async resolveBranchId(companyId: string, requestedBranchId: string | null, allocations: CustomerPaymentAllocationCommand[]) {
    if (requestedBranchId) return requestedBranchId
    if (allocations.length > 0) {
      const { data: invoice } = await this.adminSupabase.from("invoices").select("branch_id").eq("company_id", companyId).eq("id", allocations[0].invoiceId).maybeSingle()
      if (invoice?.branch_id) return String(invoice.branch_id)
    }
    const { data, error } = await this.adminSupabase.from("branches").select("id").eq("company_id", companyId).eq("is_active", true).order("is_main", { ascending: false }).order("name").limit(1).maybeSingle()
    if (error || !data?.id) throw new Error("Unable to resolve an active branch for customer payment")
    return String(data.id)
  }

  private async findExistingMainJournalId(payment: PaymentRow) {
    if (payment.journal_entry_id) return payment.journal_entry_id
    const { data } = await this.adminSupabase.from("journal_entries").select("id").eq("company_id", payment.company_id).eq("reference_type", "customer_payment").eq("reference_id", payment.id).maybeSingle()
    return data?.id ? String(data.id) : null
  }

  private async collectPostedJournalIds(payment: PaymentRow, applications: ApplicationRow[]) {
    const journalIds = new Set<string>()
    if (payment.journal_entry_id) journalIds.add(payment.journal_entry_id)
    const mainEntries = await this.adminSupabase.from("journal_entries").select("id").eq("company_id", payment.company_id).eq("reference_type", "customer_payment").eq("reference_id", payment.id)
    for (const row of mainEntries.data || []) if ((row as any)?.id) journalIds.add(String((row as any).id))

    const paymentTrace = await this.findTraceBySource(payment.company_id, "payment", payment.id, PAYMENT_EVENT)
    if (paymentTrace?.transaction_id) {
      for (const id of await this.getLinkedEntityIds(paymentTrace.transaction_id, "journal_entry")) journalIds.add(id)
    }
    for (const application of applications) {
      const trace = await this.findTraceByIdempotency(payment.company_id, INVOICE_PAYMENT_EVENT, `customer-payment:${payment.id}:application:${application.id}`)
      if (trace?.transaction_id) {
        for (const id of await this.getLinkedEntityIds(trace.transaction_id, "journal_entry")) journalIds.add(id)
      }
    }

    if (journalIds.size === 0) return []
    const { data } = await this.adminSupabase.from("journal_entries").select("id").in("id", Array.from(journalIds)).eq("status", "posted")
    return (data || []).map((row: any) => String(row.id))
  }

  private async reverseJournalEntries(companyId: string, journalIds: string[], reversalDate: string, actorId: string) {
    const reversalIds: string[] = []
    for (const journalId of dedupe(journalIds)) {
      const { data, error } = await this.adminSupabase.rpc("create_reversal_entry", {
        p_original_entry_id: journalId,
        p_reversal_date: reversalDate,
        p_posted_by: actorId,
      })
      if (error) throw new Error(error.message || `Failed to reverse journal entry ${journalId}`)
      if (data) reversalIds.push(String(data))
    }
    return reversalIds
  }

  private async buildResult(paymentId: string, transactionId: string | null, cached: boolean): Promise<CustomerPaymentCommandResult> {
    const payment = await this.loadPayment(undefined, paymentId)
    const paymentTrace = await this.findTraceBySource(payment.company_id, "payment", payment.id, PAYMENT_EVENT)
    const traceJournalIds = paymentTrace ? await this.getLinkedEntityIds(paymentTrace.transaction_id, "journal_entry") : []
    const invoiceTraces = await this.adminSupabase.from("financial_operation_traces").select("transaction_id").eq("company_id", payment.company_id).eq("event_type", INVOICE_PAYMENT_EVENT).contains("metadata", { payment_id: payment.id })
    const invoiceTraceIds = (invoiceTraces.data || []).map((row: any) => String(row.transaction_id))
    const invoiceJournalIds = (await Promise.all(invoiceTraceIds.map((traceId: string) => this.getLinkedEntityIds(traceId, "journal_entry")))).flat()
    const journalEntryIds = dedupe([payment.journal_entry_id, ...traceJournalIds, ...invoiceJournalIds])
    return {
      success: true,
      cached,
      paymentId: payment.id,
      status: payment.status || "approved",
      approved: approved(payment),
      posted: journalEntryIds.length > 0,
      journalEntryId: payment.journal_entry_id || journalEntryIds[0] || null,
      journalEntryIds,
      transactionId: paymentTrace?.transaction_id || transactionId || null,
      eventType: paymentTrace ? PAYMENT_EVENT : CREATE_EVENT,
    }
  }

  private async createTrace(params: { companyId: string; sourceEntity: string; sourceId: string; eventType: string; actorId: string; idempotencyKey?: string | null; requestHash?: string | null; metadata?: Record<string, unknown> }) {
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
      throw new Error(error.message || "Failed to create financial trace")
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
    const { data, error } = await this.adminSupabase.from("financial_operation_traces").select("transaction_id, request_hash").eq("company_id", companyId).eq("event_type", eventType).eq("idempotency_key", idempotencyKey).maybeSingle()
    if (error || !data) return null
    return data as TraceRecord
  }

  private async findTraceBySource(companyId: string, sourceEntity: string, sourceId: string, eventType: string): Promise<TraceRecord | null> {
    const { data, error } = await this.adminSupabase.from("financial_operation_traces").select("transaction_id, request_hash").eq("company_id", companyId).eq("source_entity", sourceEntity).eq("source_id", sourceId).eq("event_type", eventType).order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (error || !data) return null
    return data as TraceRecord
  }

  private async findLinkedEntityId(traceId: string, entityType: string): Promise<string | null> {
    const { data, error } = await this.adminSupabase.from("financial_operation_trace_links").select("entity_id").eq("transaction_id", traceId).eq("entity_type", entityType).order("created_at", { ascending: true }).limit(1).maybeSingle()
    if (error || !data?.entity_id) return null
    return String(data.entity_id)
  }

  private async getLinkedEntityIds(traceId: string, entityType: string): Promise<string[]> {
    const { data, error } = await this.adminSupabase.from("financial_operation_trace_links").select("entity_id").eq("transaction_id", traceId).eq("entity_type", entityType)
    if (error) return []
    return (data || []).map((row: any) => String(row.entity_id))
  }
}

export {
  CREATE_EVENT,
  PAYMENT_EVENT,
  APPLY_EVENT,
  INVOICE_PAYMENT_EVENT,
  UPDATE_EVENT,
  DELETE_EVENT,
  isPrivilegedRole,
}
