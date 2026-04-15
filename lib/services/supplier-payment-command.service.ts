import { getAccrualAccountMapping } from "@/lib/accrual-accounting-engine"
import { createCompleteJournalEntry } from "@/lib/journal-entry-governance"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"

const CREATE_COMMAND_EVENT = "supplier_payment_command"
const SUPPLIER_PAYMENT_EVENT = "supplier_payment_posting"
const BILL_PAYMENT_EVENT = "bill_payment_posting"
const APPLY_BILL_COMMAND_EVENT = "supplier_payment_apply_bill"
const APPLY_PO_COMMAND_EVENT = "supplier_payment_apply_po"
const UPDATE_COMMAND_EVENT = "supplier_payment_update"
const DELETE_COMMAND_EVENT = "supplier_payment_delete"
const PRIVILEGED_ROLES = new Set(["owner", "admin", "general_manager"])

type SupabaseLike = any

export type SupplierPaymentAllocationCommand = {
  billId: string
  amount: number
}

export type CreateSupplierPaymentCommand = {
  companyId: string
  supplierId: string
  amount: number
  paymentDate: string
  paymentMethod: string
  accountId: string
  branchId?: string | null
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
  allocations: SupplierPaymentAllocationCommand[]
  uiSurface?: string | null
}

export type SupplierPaymentDecisionAction = "APPROVE" | "REJECT"

export type UpdateSupplierPaymentCommand = {
  paymentDate: string
  paymentMethod: string
  accountId: string | null
  referenceNumber?: string | null
  notes?: string | null
  uiSurface?: string | null
}

type ActorContext = {
  companyId: string
  actorId: string
  actorRole: string
  actorBranchId?: string | null
}

type PaymentRow = {
  id: string
  company_id: string
  supplier_id: string
  bill_id: string | null
  purchase_order_id: string | null
  payment_date: string
  amount: number
  payment_method: string
  account_id: string | null
  branch_id: string | null
  cost_center_id: string | null
  warehouse_id: string | null
  reference_number: string | null
  notes: string | null
  currency_code: string | null
  exchange_rate: number | null
  exchange_rate_used: number | null
  exchange_rate_id: string | null
  rate_source: string | null
  base_currency_amount: number | null
  original_amount: number | null
  original_currency: string | null
  status: string
  approved_by: string | null
  approved_at: string | null
  created_by: string | null
  journal_entry_id: string | null
  unallocated_amount: number | null
}

type AllocationRow = {
  id: string
  payment_id: string
  bill_id: string
  allocated_amount: number
  bills: {
    id: string
    bill_number: string
    purchase_order_id: string | null
    branch_id: string | null
    cost_center_id: string | null
    warehouse_id: string | null
    supplier_id: string | null
  } | null
}

type BillAllocationTarget = {
  id: string
  company_id: string
  bill_number: string | null
  supplier_id: string | null
  purchase_order_id: string | null
  branch_id: string | null
  cost_center_id: string | null
  warehouse_id: string | null
  total_amount: number | null
  paid_amount: number | null
  returned_amount: number | null
}

type PurchaseOrderAllocationTarget = {
  id: string
  company_id: string
  po_number: string | null
  supplier_id: string | null
  branch_id: string | null
  cost_center_id: string | null
  warehouse_id: string | null
  total_amount: number | null
  received_amount: number | null
  status: string | null
}

type TraceRecord = {
  transaction_id: string
  request_hash: string | null
}

type TraceResult = {
  traceId: string
  journalEntryIds: string[]
  billPaymentTraceIds: string[]
  billPaymentJournalIds: string[]
}

export type SupplierPaymentCommandResult = {
  success: boolean
  cached: boolean
  paymentId: string
  status: string
  approved: boolean
  posted: boolean
  journalEntryId: string | null
  journalEntryIds: string[]
  transactionId: string | null
  eventType: string
  billPaymentTraceIds: string[]
  billPaymentJournalIds: string[]
}

export type SupplierPaymentMaintenanceResult = {
  success: boolean
  cached: boolean
  action: "updated" | "deleted"
  paymentId: string
  transactionId: string | null
  posted: boolean
  reversalJournalIds: string[]
  journalEntryIds: string[]
}

function normalizeRole(role: string | null | undefined) {
  return String(role || "").trim().toLowerCase()
}

function isPrivilegedRole(role: string | null | undefined) {
  return PRIVILEGED_ROLES.has(normalizeRole(role))
}

function asNumber(value: unknown) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function isDuplicateTraceError(message?: string | null) {
  if (!message) return false
  return (
    message.includes("duplicate key value violates unique constraint")
    || message.includes("idx_financial_operation_traces_idempotency")
  )
}

function amountsEqual(left: number, right: number) {
  return Math.abs(left - right) < 0.01
}

function dedupe(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]))
}

function buildCommandMetadata(command: CreateSupplierPaymentCommand) {
  return {
    supplier_id: command.supplierId,
    branch_id: command.branchId || null,
    warehouse_id: command.warehouseId || null,
    ui_surface: command.uiSurface || null,
    allocation_count: command.allocations.length,
    allocated_bill_ids: command.allocations.map((allocation) => allocation.billId),
    legacy_bootstrap_applied: false,
  }
}

function buildPostingMetadata(payment: PaymentRow, allocations: AllocationRow[], uiSurface: string | null) {
  const firstBill = allocations[0]?.bills
  return {
    purchase_order_id: firstBill?.purchase_order_id || payment.purchase_order_id || null,
    purchase_order_ids: dedupe(allocations.map((allocation) => allocation.bills?.purchase_order_id || null)),
    supplier_id: payment.supplier_id,
    branch_id: payment.branch_id || firstBill?.branch_id || null,
    warehouse_id: payment.warehouse_id || firstBill?.warehouse_id || null,
    cost_center_id: payment.cost_center_id || firstBill?.cost_center_id || null,
    bill_ids: allocations.map((allocation) => allocation.bill_id),
    ui_surface: uiSurface,
    legacy_bootstrap_applied: false,
    settlement_mode: allocations.length > 0 ? "allocated" : "advance_only",
  }
}

function buildBillPostingMetadata(payment: PaymentRow, allocation: AllocationRow, uiSurface: string | null) {
  return {
    purchase_order_id: allocation.bills?.purchase_order_id || payment.purchase_order_id || null,
    supplier_id: payment.supplier_id,
    branch_id: allocation.bills?.branch_id || payment.branch_id || null,
    warehouse_id: allocation.bills?.warehouse_id || payment.warehouse_id || null,
    cost_center_id: allocation.bills?.cost_center_id || payment.cost_center_id || null,
    payment_id: payment.id,
    payment_allocation_id: allocation.id,
    ui_surface: uiSurface,
    legacy_bootstrap_applied: false,
  }
}

function willApprovalFinalize(status: string, actorRole: string) {
  const normalizedStatus = String(status || "").trim().toLowerCase()
  const normalizedRole = normalizeRole(actorRole)

  if (normalizedStatus === "approved") return true
  if (normalizedStatus === "pending_approval") {
    return normalizedRole === "manager" || isPrivilegedRole(normalizedRole)
  }
  if (normalizedStatus === "pending_manager") {
    return normalizedRole === "manager" || isPrivilegedRole(normalizedRole)
  }
  if (normalizedStatus === "pending_director") {
    return isPrivilegedRole(normalizedRole)
  }
  return false
}

export class SupplierPaymentCommandService {
  constructor(
    private authSupabase: SupabaseLike,
    private adminSupabase: SupabaseLike
  ) {}

  async createPayment(
    actor: ActorContext,
    command: CreateSupplierPaymentCommand,
    options: { idempotencyKey: string; requestHash: string }
  ): Promise<SupplierPaymentCommandResult> {
    const existingCommandTrace = await this.findTraceByIdempotency(
      actor.companyId,
      CREATE_COMMAND_EVENT,
      options.idempotencyKey
    )

    if (existingCommandTrace) {
      if (existingCommandTrace.request_hash && existingCommandTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      const linkedPaymentId = await this.findLinkedEntityId(existingCommandTrace.transaction_id, "payment")
      if (!linkedPaymentId) {
        throw new Error("Supplier payment command is already in progress")
      }

      return await this.buildResultFromPayment(linkedPaymentId, existingCommandTrace.transaction_id, true)
    }

    const commandTraceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "payment_request",
      sourceId: options.idempotencyKey,
      eventType: CREATE_COMMAND_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: buildCommandMetadata(command),
    })

    const branchId = await this.resolveBranchId(actor.companyId, command.branchId || null, command.allocations)

    const { data: paymentIdData, error: createError } = await this.authSupabase.rpc("process_supplier_payment_allocation", {
      p_company_id: actor.companyId,
      p_supplier_id: command.supplierId,
      p_payment_amount: command.amount,
      p_payment_date: command.paymentDate,
      p_payment_method: command.paymentMethod,
      p_account_id: command.accountId,
      p_branch_id: branchId,
      p_currency_code: command.currencyCode,
      p_exchange_rate: command.exchangeRate,
      p_base_currency_amount: command.baseCurrencyAmount,
      p_allocations: command.allocations.length > 0
        ? command.allocations.map((allocation) => ({ bill_id: allocation.billId, amount: allocation.amount }))
        : null,
    })

    if (createError || !paymentIdData) {
      throw new Error(createError?.message || "Failed to create supplier payment")
    }

    const paymentId = String(paymentIdData)

    const extraUpdatePayload = {
      reference_number: command.referenceNumber || null,
      notes: command.notes || null,
      original_amount: command.originalAmount ?? command.amount,
      original_currency: command.originalCurrency || command.currencyCode,
      exchange_rate_used: command.exchangeRate,
      exchange_rate_id: command.exchangeRateId || null,
      rate_source: command.rateSource || null,
      warehouse_id: command.warehouseId || null,
    }

    const { error: updateError } = await this.adminSupabase
      .from("payments")
      .update(extraUpdatePayload)
      .eq("company_id", actor.companyId)
      .eq("id", paymentId)

    if (updateError) {
      throw new Error(updateError.message || "Failed to enrich supplier payment metadata")
    }

    await this.linkTrace(commandTraceId, "payment", paymentId, "payment", CREATE_COMMAND_EVENT)

    const payment = await this.loadPayment(actor.companyId, paymentId)
    if (payment.status === "approved") {
      await requireOpenFinancialPeriod(actor.companyId, payment.payment_date)
      await this.finalizeApprovedPayment(payment, actor, { uiSurface: command.uiSurface || null })
    }

    return await this.buildResultFromPayment(paymentId, commandTraceId, false)
  }

  async processDecision(
    actor: ActorContext,
    paymentId: string,
    action: SupplierPaymentDecisionAction,
    rejectionReason: string | null,
    options: { idempotencyKey: string; requestHash: string; uiSurface?: string | null }
  ): Promise<SupplierPaymentCommandResult> {
    const paymentBefore = await this.loadPayment(actor.companyId, paymentId)

    if (action === "REJECT") {
      if (paymentBefore.status !== "rejected") {
        const { error } = await this.authSupabase.rpc("process_payment_approval_stage", {
          p_payment_id: paymentId,
          p_action: "REJECT",
          p_rejection_reason: rejectionReason || null,
        })

        if (error) {
          throw new Error(error.message || "Failed to reject supplier payment")
        }
      }

      return await this.buildResultFromPayment(paymentId, null, paymentBefore.status === "rejected")
    }

    if (paymentBefore.status !== "approved" && willApprovalFinalize(paymentBefore.status, actor.actorRole)) {
      await requireOpenFinancialPeriod(actor.companyId, paymentBefore.payment_date)
    }

    if (paymentBefore.status !== "approved") {
      const { error } = await this.authSupabase.rpc("process_payment_approval_stage", {
        p_payment_id: paymentId,
        p_action: "APPROVE",
        p_rejection_reason: null,
      })

      if (error) {
        throw new Error(error.message || "Failed to approve supplier payment")
      }
    }

    const paymentAfter = await this.loadPayment(actor.companyId, paymentId)
    if (paymentAfter.status === "approved") {
      const existingTrace = await this.findTraceBySource(actor.companyId, "payment", paymentId, SUPPLIER_PAYMENT_EVENT)
      await this.finalizeApprovedPayment(paymentAfter, actor, {
        uiSurface: options.uiSurface || null,
        idempotencyKey: options.idempotencyKey,
        requestHash: options.requestHash,
      })
      return await this.buildResultFromPayment(paymentId, existingTrace?.transaction_id || null, Boolean(existingTrace))
    }

    return await this.buildResultFromPayment(paymentId, null, paymentBefore.status === paymentAfter.status)
  }

  async applyPaymentToBill(
    actor: ActorContext,
    paymentId: string,
    billId: string,
    amount: number,
    options: { idempotencyKey: string; requestHash: string; uiSurface?: string | null }
  ): Promise<SupplierPaymentCommandResult> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Allocation amount must be greater than zero")
    }

    const existingCommandTrace = await this.findTraceByIdempotency(
      actor.companyId,
      APPLY_BILL_COMMAND_EVENT,
      options.idempotencyKey
    )

    if (existingCommandTrace) {
      if (existingCommandTrace.request_hash && existingCommandTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      return await this.buildResultFromPayment(paymentId, existingCommandTrace.transaction_id, true)
    }

    const payment = await this.loadPayment(actor.companyId, paymentId)
    if (payment.company_id !== actor.companyId) {
      throw new Error("Supplier payment is outside your company scope")
    }

    if (payment.status === "rejected") {
      throw new Error("Rejected supplier payments cannot be applied to purchase bills")
    }

    const bill = await this.loadBillForAllocation(actor.companyId, billId)
    if (String(payment.supplier_id || "") !== String(bill.supplier_id || "")) {
      throw new Error("Supplier payment and bill supplier do not match")
    }

    if (!isPrivilegedRole(actor.actorRole) && actor.actorBranchId && bill.branch_id && actor.actorBranchId !== bill.branch_id) {
      throw new Error("Bill is outside your branch scope")
    }

    const existingAllocations = await this.loadAllocations(paymentId)
    if (existingAllocations.some((allocation) => allocation.bill_id === billId)) {
      throw new Error("This supplier payment is already allocated to the selected bill")
    }

    const totalAllocatedBefore = existingAllocations.reduce((sum, allocation) => sum + asNumber(allocation.allocated_amount), 0)
    const availableToAllocate = Math.max(asNumber(payment.amount) - totalAllocatedBefore, 0)
    if (amount > availableToAllocate + 0.01) {
      throw new Error("Allocation amount exceeds the remaining unallocated payment balance")
    }

    const netOutstanding = Math.max(
      asNumber(bill.total_amount) - asNumber(bill.returned_amount) - asNumber(bill.paid_amount),
      0
    )
    if (amount > netOutstanding + 0.01) {
      throw new Error("Allocation amount exceeds the bill net outstanding balance")
    }

    const commandTraceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "payment",
      sourceId: paymentId,
      eventType: APPLY_BILL_COMMAND_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: {
        supplier_id: payment.supplier_id,
        payment_id: paymentId,
        bill_id: billId,
        purchase_order_id: bill.purchase_order_id,
        branch_id: bill.branch_id || payment.branch_id || null,
        warehouse_id: bill.warehouse_id || payment.warehouse_id || null,
        cost_center_id: bill.cost_center_id || payment.cost_center_id || null,
        amount: asNumber(amount),
        ui_surface: options.uiSurface || null,
      },
    })

    const { data: insertedAllocation, error: allocationError } = await this.adminSupabase
      .from("payment_allocations")
      .insert({
        company_id: actor.companyId,
        payment_id: paymentId,
        bill_id: billId,
        allocated_amount: asNumber(amount),
      })
      .select("id, payment_id, bill_id, allocated_amount")
      .single()

    if (allocationError || !insertedAllocation?.id) {
      throw new Error(allocationError?.message || "Failed to create supplier payment allocation")
    }

    const totalAllocatedAfter = totalAllocatedBefore + asNumber(amount)
    const unallocatedAmount = Math.max(asNumber(payment.amount) - totalAllocatedAfter, 0)
    const shouldLinkLegacyBill = totalAllocatedAfter > 0 && amountsEqual(unallocatedAmount, 0) && (existingAllocations.length + 1) === 1

    const paymentUpdatePayload: Record<string, unknown> = {
      unallocated_amount: unallocatedAmount,
      bill_id: shouldLinkLegacyBill ? billId : null,
      purchase_order_id: shouldLinkLegacyBill ? bill.purchase_order_id || null : null,
    }

    const { error: paymentUpdateError } = await this.adminSupabase
      .from("payments")
      .update(paymentUpdatePayload)
      .eq("company_id", actor.companyId)
      .eq("id", paymentId)

    if (paymentUpdateError) {
      throw new Error(paymentUpdateError.message || "Failed to update supplier payment allocation state")
    }

    await this.linkTrace(commandTraceId, "payment", paymentId, "payment", APPLY_BILL_COMMAND_EVENT)
    await this.linkTrace(commandTraceId, "bill", billId, "bill", APPLY_BILL_COMMAND_EVENT)
    await this.linkTrace(commandTraceId, "payment_allocation", String(insertedAllocation.id), "allocation", APPLY_BILL_COMMAND_EVENT)

    if (payment.status === "approved") {
      await requireOpenFinancialPeriod(actor.companyId, payment.payment_date)
      const refreshedPayment = await this.loadPayment(actor.companyId, paymentId)
      await this.ensureApprovedAllocationPosting(
        refreshedPayment,
        {
          id: String(insertedAllocation.id),
          payment_id: paymentId,
          bill_id: billId,
          allocated_amount: asNumber(amount),
          bills: {
            id: bill.id,
            bill_number: bill.bill_number || bill.id,
            purchase_order_id: bill.purchase_order_id,
            branch_id: bill.branch_id,
            cost_center_id: bill.cost_center_id,
            warehouse_id: bill.warehouse_id,
            supplier_id: bill.supplier_id,
          },
        },
        actor,
        { uiSurface: options.uiSurface || null }
      )
    }

    return await this.buildResultFromPayment(paymentId, commandTraceId, false)
  }

  async applyPaymentToPurchaseOrder(
    actor: ActorContext,
    paymentId: string,
    purchaseOrderId: string,
    amount: number,
    options: { idempotencyKey: string; requestHash: string; uiSurface?: string | null }
  ): Promise<SupplierPaymentCommandResult> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Allocation amount must be greater than zero")
    }

    const existingCommandTrace = await this.findTraceByIdempotency(
      actor.companyId,
      APPLY_PO_COMMAND_EVENT,
      options.idempotencyKey
    )

    if (existingCommandTrace) {
      if (existingCommandTrace.request_hash && existingCommandTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      return await this.buildResultFromPayment(paymentId, existingCommandTrace.transaction_id, true)
    }

    const payment = await this.loadPayment(actor.companyId, paymentId)
    if (payment.company_id !== actor.companyId) {
      throw new Error("Supplier payment is outside your company scope")
    }

    if (payment.status === "rejected") {
      throw new Error("Rejected supplier payments cannot be applied to purchase orders")
    }

    const purchaseOrder = await this.loadPurchaseOrderForAllocation(actor.companyId, purchaseOrderId)
    if (String(payment.supplier_id || "") !== String(purchaseOrder.supplier_id || "")) {
      throw new Error("Supplier payment and purchase order supplier do not match")
    }

    if (!isPrivilegedRole(actor.actorRole) && actor.actorBranchId && purchaseOrder.branch_id && actor.actorBranchId !== purchaseOrder.branch_id) {
      throw new Error("Purchase order is outside your branch scope")
    }

    const existingBillAllocations = await this.loadAllocations(paymentId)
    const allocatedToBills = existingBillAllocations.reduce((sum, allocation) => sum + asNumber(allocation.allocated_amount), 0)
    const currentUnallocated = Math.max(asNumber(payment.unallocated_amount ?? payment.amount - allocatedToBills), 0)
    const availableToAllocate = payment.purchase_order_id && payment.purchase_order_id !== purchaseOrderId
      ? 0
      : currentUnallocated

    if (amount > availableToAllocate + 0.01) {
      throw new Error("Allocation amount exceeds the remaining unallocated payment balance")
    }

    const outstanding = Math.max(asNumber(purchaseOrder.total_amount) - asNumber(purchaseOrder.received_amount), 0)
    if (amount > outstanding + 0.01) {
      throw new Error("Allocation amount exceeds the purchase order outstanding balance")
    }

    const commandTraceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "payment",
      sourceId: paymentId,
      eventType: APPLY_PO_COMMAND_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: {
        supplier_id: payment.supplier_id,
        payment_id: paymentId,
        purchase_order_id: purchaseOrderId,
        branch_id: purchaseOrder.branch_id || payment.branch_id || null,
        warehouse_id: purchaseOrder.warehouse_id || payment.warehouse_id || null,
        cost_center_id: purchaseOrder.cost_center_id || payment.cost_center_id || null,
        amount: asNumber(amount),
        ui_surface: options.uiSurface || null,
      },
    })

    const newReceivedAmount = asNumber(purchaseOrder.received_amount) + asNumber(amount)
    const newStatus = newReceivedAmount >= asNumber(purchaseOrder.total_amount) ? "received" : "received_partial"

    const { error: poUpdateError } = await this.adminSupabase
      .from("purchase_orders")
      .update({
        received_amount: newReceivedAmount,
        status: newStatus,
      })
      .eq("company_id", actor.companyId)
      .eq("id", purchaseOrderId)

    if (poUpdateError) {
      throw new Error(poUpdateError.message || "Failed to update purchase order settlement")
    }

    const newUnallocatedAmount = Math.max(currentUnallocated - asNumber(amount), 0)
    const { error: paymentUpdateError } = await this.adminSupabase
      .from("payments")
      .update({
        purchase_order_id: purchaseOrderId,
        unallocated_amount: newUnallocatedAmount,
      })
      .eq("company_id", actor.companyId)
      .eq("id", paymentId)

    if (paymentUpdateError) {
      throw new Error(paymentUpdateError.message || "Failed to update supplier payment purchase order link")
    }

    await this.linkTrace(commandTraceId, "payment", paymentId, "payment", APPLY_PO_COMMAND_EVENT)
    await this.linkTrace(commandTraceId, "purchase_order", purchaseOrderId, "purchase_order", APPLY_PO_COMMAND_EVENT)

    if (payment.status === "approved") {
      await requireOpenFinancialPeriod(actor.companyId, payment.payment_date)
      const refreshedPayment = await this.loadPayment(actor.companyId, paymentId)
      const supplierTraceId = await this.ensureSupplierPaymentTrace(
        refreshedPayment,
        existingBillAllocations,
        actor,
        options.uiSurface || null
      )
      await this.linkTrace(supplierTraceId, "purchase_order", purchaseOrderId, "purchase_order", SUPPLIER_PAYMENT_EVENT)
    }

    return await this.buildResultFromPayment(paymentId, commandTraceId, false)
  }

  async updatePayment(
    actor: ActorContext,
    paymentId: string,
    command: UpdateSupplierPaymentCommand,
    options: { idempotencyKey: string; requestHash: string }
  ): Promise<SupplierPaymentMaintenanceResult> {
    const existingCommandTrace = await this.findTraceByIdempotency(
      actor.companyId,
      UPDATE_COMMAND_EVENT,
      options.idempotencyKey
    )

    if (existingCommandTrace) {
      if (existingCommandTrace.request_hash && existingCommandTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      return {
        success: true,
        cached: true,
        action: "updated",
        paymentId,
        transactionId: existingCommandTrace.transaction_id,
        posted: true,
        reversalJournalIds: [],
        journalEntryIds: [],
      }
    }

    if (!command.paymentDate) {
      throw new Error("Payment date is required")
    }

    if (!command.paymentMethod) {
      throw new Error("Payment method is required")
    }

    if (command.accountId) {
      const { data: account, error: accountError } = await this.adminSupabase
        .from("chart_of_accounts")
        .select("id")
        .eq("company_id", actor.companyId)
        .eq("id", command.accountId)
        .maybeSingle()

      if (accountError || !account?.id) {
        throw new Error("Selected payment account is invalid")
      }
    }

    const paymentBefore = await this.loadPayment(actor.companyId, paymentId)
    this.assertSupplierPaymentScope(actor, paymentBefore)
    const allocations = await this.loadAllocations(paymentId)
    const linkedBillIds = dedupe([paymentBefore.bill_id, ...allocations.map((allocation) => allocation.bill_id)])

    const commandTraceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "payment",
      sourceId: paymentId,
      eventType: UPDATE_COMMAND_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: {
        supplier_id: paymentBefore.supplier_id,
        payment_id: paymentId,
        purchase_order_id: paymentBefore.purchase_order_id,
        bill_ids: linkedBillIds,
        old_payment_date: paymentBefore.payment_date,
        new_payment_date: command.paymentDate,
        old_payment_method: paymentBefore.payment_method,
        new_payment_method: command.paymentMethod,
        old_account_id: paymentBefore.account_id,
        new_account_id: command.accountId,
        ui_surface: command.uiSurface || null,
      },
    })

    await this.linkTrace(commandTraceId, "payment", paymentId, "payment", UPDATE_COMMAND_EVENT)
    if (paymentBefore.purchase_order_id) {
      await this.linkTrace(commandTraceId, "purchase_order", paymentBefore.purchase_order_id, "purchase_order", UPDATE_COMMAND_EVENT)
    }
    for (const billId of linkedBillIds) {
      await this.linkTrace(commandTraceId, "bill", billId, "bill", UPDATE_COMMAND_EVENT)
    }

    let reversalJournalIds: string[] = []
    const approved = paymentBefore.status === "approved"
    if (approved) {
      await requireOpenFinancialPeriod(actor.companyId, command.paymentDate)
      const existingJournalIds = await this.collectPostedJournalIds(paymentBefore, allocations)
      reversalJournalIds = await this.reverseJournalEntries(actor.companyId, existingJournalIds, command.paymentDate, actor.actorId)
      for (const reversalJournalId of reversalJournalIds) {
        await this.linkTrace(commandTraceId, "journal_entry", reversalJournalId, "journal_reversal", UPDATE_COMMAND_EVENT)
      }
    }

    const { error: paymentUpdateError } = await this.adminSupabase
      .from("payments")
      .update({
        payment_date: command.paymentDate,
        payment_method: command.paymentMethod,
        reference_number: command.referenceNumber || null,
        notes: command.notes || null,
        account_id: command.accountId || null,
        journal_entry_id: approved ? null : paymentBefore.journal_entry_id,
      })
      .eq("company_id", actor.companyId)
      .eq("id", paymentId)

    if (paymentUpdateError) {
      throw new Error(paymentUpdateError.message || "Failed to update supplier payment")
    }

    let repostedJournalIds: string[] = []
    if (approved) {
      const refreshedPayment = await this.loadPayment(actor.companyId, paymentId)
      const repostResult = await this.finalizeApprovedPayment(refreshedPayment, actor, {
        uiSurface: command.uiSurface || null,
        idempotencyKey: `${options.idempotencyKey}:repost`,
        requestHash: options.requestHash,
        billPaymentTraceSeed: `${options.idempotencyKey}:bill-payment`,
      })

      repostedJournalIds = dedupe([
        ...repostResult.journalEntryIds,
        ...repostResult.billPaymentJournalIds,
      ])

      for (const journalEntryId of repostedJournalIds) {
        await this.linkTrace(commandTraceId, "journal_entry", journalEntryId, "journal_entry", UPDATE_COMMAND_EVENT)
      }

      if (refreshedPayment.purchase_order_id) {
        await this.linkTrace(repostResult.traceId, "purchase_order", refreshedPayment.purchase_order_id, "purchase_order", SUPPLIER_PAYMENT_EVENT)
      }
    }

    return {
      success: true,
      cached: false,
      action: "updated",
      paymentId,
      transactionId: commandTraceId,
      posted: approved,
      reversalJournalIds,
      journalEntryIds: repostedJournalIds,
    }
  }

  async deletePayment(
    actor: ActorContext,
    paymentId: string,
    options: { idempotencyKey: string; requestHash: string; uiSurface?: string | null }
  ): Promise<SupplierPaymentMaintenanceResult> {
    const existingCommandTrace = await this.findTraceByIdempotency(
      actor.companyId,
      DELETE_COMMAND_EVENT,
      options.idempotencyKey
    )

    if (existingCommandTrace) {
      if (existingCommandTrace.request_hash && existingCommandTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      const existingPayment = await this.loadPayment(actor.companyId, paymentId).catch(() => null)
      if (!existingPayment) {
        return {
          success: true,
          cached: true,
          action: "deleted",
          paymentId,
          transactionId: existingCommandTrace.transaction_id,
          posted: true,
          reversalJournalIds: [],
          journalEntryIds: [],
        }
      }
    }

    const payment = await this.loadPayment(actor.companyId, paymentId)
    this.assertSupplierPaymentScope(actor, payment)
    const allocations = await this.loadAllocations(paymentId)
    const linkedBillIds = dedupe([payment.bill_id, ...allocations.map((allocation) => allocation.bill_id)])

    const commandTraceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "payment",
      sourceId: paymentId,
      eventType: DELETE_COMMAND_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: {
        supplier_id: payment.supplier_id,
        payment_id: paymentId,
        purchase_order_id: payment.purchase_order_id,
        bill_ids: linkedBillIds,
        payment_date: payment.payment_date,
        ui_surface: options.uiSurface || null,
      },
    })

    await this.linkTrace(commandTraceId, "payment", paymentId, "payment", DELETE_COMMAND_EVENT)
    if (payment.purchase_order_id) {
      await this.linkTrace(commandTraceId, "purchase_order", payment.purchase_order_id, "purchase_order", DELETE_COMMAND_EVENT)
    }
    for (const billId of linkedBillIds) {
      await this.linkTrace(commandTraceId, "bill", billId, "bill", DELETE_COMMAND_EVENT)
    }

    const reversalDate = new Date().toISOString().slice(0, 10)
    let reversalJournalIds: string[] = []
    if (payment.status === "approved") {
      await requireOpenFinancialPeriod(actor.companyId, reversalDate)
      const existingJournalIds = await this.collectPostedJournalIds(payment, allocations)
      reversalJournalIds = await this.reverseJournalEntries(actor.companyId, existingJournalIds, reversalDate, actor.actorId)
      for (const reversalJournalId of reversalJournalIds) {
        await this.linkTrace(commandTraceId, "journal_entry", reversalJournalId, "journal_reversal", DELETE_COMMAND_EVENT)
      }
    }

    const allocatedToBills = allocations.reduce((sum, allocation) => sum + asNumber(allocation.allocated_amount), 0)
    const appliedToPurchaseOrder = payment.purchase_order_id
      ? Math.max(asNumber(payment.amount) - asNumber(payment.unallocated_amount) - allocatedToBills, 0)
      : 0

    if (payment.purchase_order_id && appliedToPurchaseOrder > 0) {
      const purchaseOrder = await this.loadPurchaseOrderForAllocation(actor.companyId, payment.purchase_order_id)
      const newReceivedAmount = Math.max(asNumber(purchaseOrder.received_amount) - appliedToPurchaseOrder, 0)
      const newStatus = newReceivedAmount >= asNumber(purchaseOrder.total_amount) ? "received" : "received_partial"

      const { error: poUpdateError } = await this.adminSupabase
        .from("purchase_orders")
        .update({
          received_amount: newReceivedAmount,
          status: newStatus,
        })
        .eq("company_id", actor.companyId)
        .eq("id", payment.purchase_order_id)

      if (poUpdateError) {
        throw new Error(poUpdateError.message || "Failed to update purchase order payment settlement")
      }
    }

    const { error: advanceDeleteError } = await this.adminSupabase
      .from("advance_applications")
      .delete()
      .eq("payment_id", paymentId)

    if (advanceDeleteError) {
      throw new Error(advanceDeleteError.message || "Failed to remove supplier payment applications")
    }

    const { error: paymentDeleteError } = await this.adminSupabase
      .from("payments")
      .delete()
      .eq("company_id", actor.companyId)
      .eq("id", paymentId)

    if (paymentDeleteError) {
      throw new Error(paymentDeleteError.message || "Failed to delete supplier payment")
    }

    return {
      success: true,
      cached: false,
      action: "deleted",
      paymentId,
      transactionId: commandTraceId,
      posted: payment.status === "approved",
      reversalJournalIds,
      journalEntryIds: [],
    }
  }

  private async buildResultFromPayment(
    paymentId: string,
    transactionId: string | null,
    cached: boolean
  ): Promise<SupplierPaymentCommandResult> {
    const payment = await this.loadPayment(undefined, paymentId)
    const postingTrace = await this.findTraceBySource(payment.company_id, "payment", payment.id, SUPPLIER_PAYMENT_EVENT)

    let traceResult: TraceResult = {
      traceId: postingTrace?.transaction_id || transactionId || "",
      journalEntryIds: [],
      billPaymentTraceIds: [],
      billPaymentJournalIds: [],
    }

    if (postingTrace) {
      traceResult = await this.loadTraceArtifacts(payment.company_id, payment.id, postingTrace.transaction_id)
    } else if (transactionId) {
      const linkedJournalIds = await this.getLinkedEntityIds(transactionId, "journal_entry")
      traceResult = {
        traceId: transactionId,
        journalEntryIds: linkedJournalIds,
        billPaymentTraceIds: [],
        billPaymentJournalIds: [],
      }
    }

    const journalEntryId = payment.journal_entry_id
      || traceResult.journalEntryIds[0]
      || traceResult.billPaymentJournalIds[0]
      || null

    return {
      success: true,
      cached,
      paymentId: payment.id,
      status: payment.status,
      approved: payment.status === "approved",
      posted: Boolean(postingTrace || payment.journal_entry_id || traceResult.billPaymentJournalIds.length > 0),
      journalEntryId,
      journalEntryIds: dedupe([
        ...(payment.journal_entry_id ? [payment.journal_entry_id] : []),
        ...traceResult.journalEntryIds,
        ...traceResult.billPaymentJournalIds,
      ]),
      transactionId: traceResult.traceId || transactionId || null,
      eventType: postingTrace ? SUPPLIER_PAYMENT_EVENT : CREATE_COMMAND_EVENT,
      billPaymentTraceIds: traceResult.billPaymentTraceIds,
      billPaymentJournalIds: traceResult.billPaymentJournalIds,
    }
  }

  private async finalizeApprovedPayment(
    payment: PaymentRow,
    actor: ActorContext,
    options: {
      uiSurface?: string | null
      idempotencyKey?: string | null
      requestHash?: string | null
      billPaymentTraceSeed?: string | null
    }
  ): Promise<TraceResult> {
    const allocations = await this.loadAllocations(payment.id)
    const mapping = await getAccrualAccountMapping(this.adminSupabase, payment.company_id)
    const settlementAccountId = payment.account_id || mapping.cash || mapping.bank

    if (!settlementAccountId) {
      throw new Error("Cash or bank account is required to finalize supplier payment")
    }

    const totalAllocated = allocations.reduce((sum, allocation) => sum + asNumber(allocation.allocated_amount), 0)
    const unallocatedAmount = Math.max(asNumber(payment.unallocated_amount ?? payment.amount - totalAllocated), 0)
    const hasAllocations = allocations.length > 0
    const needsAdvanceJournal = !hasAllocations || unallocatedAmount > 0 || allocations.length > 1

    if (needsAdvanceJournal && !mapping.supplier_advance) {
      throw new Error("Supplier advance account is required to finalize allocated supplier payments")
    }

    const paymentEntryDate = payment.payment_date
    const firstBill = allocations[0]?.bills

    let mainJournalEntryId: string | null = null
    if (needsAdvanceJournal) {
      const mainEntry = await createCompleteJournalEntry(
        this.adminSupabase,
        {
          company_id: payment.company_id,
          reference_type: "supplier_payment",
          reference_id: payment.id,
          entry_date: paymentEntryDate,
          description: `دفعة مورد ${payment.reference_number || payment.id}`,
          branch_id: payment.branch_id || firstBill?.branch_id || actor.actorBranchId || null,
          cost_center_id: payment.cost_center_id || firstBill?.cost_center_id || null,
          warehouse_id: payment.warehouse_id || firstBill?.warehouse_id || null,
        },
        [
          {
            account_id: mapping.supplier_advance!,
            debit_amount: asNumber(payment.amount),
            credit_amount: 0,
            description: "سلف للموردين",
            branch_id: payment.branch_id || firstBill?.branch_id || actor.actorBranchId || null,
            cost_center_id: payment.cost_center_id || firstBill?.cost_center_id || null,
          },
          {
            account_id: settlementAccountId,
            debit_amount: 0,
            credit_amount: asNumber(payment.amount),
            description: "نقد/بنك",
            branch_id: payment.branch_id || firstBill?.branch_id || actor.actorBranchId || null,
            cost_center_id: payment.cost_center_id || firstBill?.cost_center_id || null,
          },
        ]
      )

      if (!mainEntry.success || !mainEntry.entryId) {
        throw new Error(mainEntry.error || "Failed to create supplier payment journal entry")
      }

      mainJournalEntryId = mainEntry.entryId
    }

    const billPaymentJournalIds: string[] = []
    for (const allocation of allocations) {
      const branchId = allocation.bills?.branch_id || payment.branch_id || actor.actorBranchId || null
      const costCenterId = allocation.bills?.cost_center_id || payment.cost_center_id || null
      const warehouseId = allocation.bills?.warehouse_id || payment.warehouse_id || null

      const billEntry = await createCompleteJournalEntry(
        this.adminSupabase,
        {
          company_id: payment.company_id,
          reference_type: "bill_payment",
          reference_id: allocation.id,
          entry_date: paymentEntryDate,
          description: `سداد فاتورة مورد ${allocation.bills?.bill_number || allocation.bill_id}`,
          branch_id: branchId,
          cost_center_id: costCenterId,
          warehouse_id: warehouseId,
        },
        [
          {
            account_id: mapping.accounts_payable,
            debit_amount: asNumber(allocation.allocated_amount),
            credit_amount: 0,
            description: "الذمم الدائنة",
            branch_id: branchId,
            cost_center_id: costCenterId,
          },
          {
            account_id: needsAdvanceJournal ? mapping.supplier_advance! : settlementAccountId,
            debit_amount: 0,
            credit_amount: asNumber(allocation.allocated_amount),
            description: needsAdvanceJournal ? "تسوية سلف الموردين" : "نقد/بنك",
            branch_id: branchId,
            cost_center_id: costCenterId,
          },
        ]
      )

      if (!billEntry.success || !billEntry.entryId) {
        throw new Error(billEntry.error || `Failed to create bill payment journal for allocation ${allocation.id}`)
      }

      billPaymentJournalIds.push(billEntry.entryId)

      const { data: existingAdvanceApplication } = await this.adminSupabase
        .from("advance_applications")
        .select("id")
        .eq("payment_id", payment.id)
        .eq("bill_id", allocation.bill_id)
        .maybeSingle()

      if (existingAdvanceApplication?.id) {
        await this.adminSupabase
          .from("advance_applications")
          .update({
            amount_applied: asNumber(allocation.allocated_amount),
            applied_date: payment.payment_date,
            notes: "تطبيق دفعة مورد على فاتورة مشتريات",
          })
          .eq("id", existingAdvanceApplication.id)
      } else {
        await this.adminSupabase
          .from("advance_applications")
          .insert({
            company_id: payment.company_id,
            customer_id: null,
            supplier_id: payment.supplier_id,
            payment_id: payment.id,
            invoice_id: null,
            bill_id: allocation.bill_id,
            amount_applied: asNumber(allocation.allocated_amount),
            applied_date: payment.payment_date,
            notes: "تطبيق دفعة مورد على فاتورة مشتريات",
          })
      }
    }

    const shouldLinkLegacyBill = allocations.length === 1
      && amountsEqual(totalAllocated, asNumber(payment.amount))
      && amountsEqual(unallocatedAmount, 0)

    const primaryJournalEntryId = mainJournalEntryId || billPaymentJournalIds[0] || payment.journal_entry_id || null
    const paymentUpdatePayload: Record<string, unknown> = {
      journal_entry_id: primaryJournalEntryId,
    }

    if (shouldLinkLegacyBill) {
      paymentUpdatePayload.bill_id = allocations[0].bill_id
      paymentUpdatePayload.purchase_order_id = allocations[0].bills?.purchase_order_id || null
    }

    await this.adminSupabase
      .from("payments")
      .update(paymentUpdatePayload)
      .eq("company_id", payment.company_id)
      .eq("id", payment.id)

    const supplierTraceId = await this.createTrace({
      companyId: payment.company_id,
      sourceEntity: "payment",
      sourceId: payment.id,
      eventType: SUPPLIER_PAYMENT_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey || `supplier-payment:${payment.id}`,
      requestHash: options.requestHash || null,
      metadata: buildPostingMetadata(payment, allocations, options.uiSurface || null),
    })

    await this.linkTrace(supplierTraceId, "payment", payment.id, "payment", SUPPLIER_PAYMENT_EVENT)
    if (mainJournalEntryId) {
      await this.linkTrace(supplierTraceId, "journal_entry", mainJournalEntryId, "journal_entry", SUPPLIER_PAYMENT_EVENT)
    }
    if (shouldLinkLegacyBill) {
      await this.linkTrace(supplierTraceId, "bill", allocations[0].bill_id, "bill", SUPPLIER_PAYMENT_EVENT)
    }

    const billPaymentTraceIds: string[] = []
    for (let index = 0; index < allocations.length; index += 1) {
      const allocation = allocations[index]
      const billPaymentJournalId = billPaymentJournalIds[index]
      const traceId = await this.createTrace({
        companyId: payment.company_id,
        sourceEntity: "bill",
        sourceId: allocation.bill_id,
        eventType: BILL_PAYMENT_EVENT,
        actorId: actor.actorId,
        idempotencyKey: options.billPaymentTraceSeed
          ? `${options.billPaymentTraceSeed}:allocation:${allocation.id}`
          : `supplier-payment:${payment.id}:allocation:${allocation.id}`,
        requestHash: null,
        metadata: buildBillPostingMetadata(payment, allocation, options.uiSurface || null),
      })

      billPaymentTraceIds.push(traceId)
      await this.linkTrace(traceId, "bill", allocation.bill_id, "bill", BILL_PAYMENT_EVENT)
      await this.linkTrace(traceId, "payment", payment.id, "payment", BILL_PAYMENT_EVENT)
      await this.linkTrace(traceId, "payment_allocation", allocation.id, "allocation", BILL_PAYMENT_EVENT)
      await this.linkTrace(traceId, "journal_entry", billPaymentJournalId, "journal_entry", BILL_PAYMENT_EVENT)
    }

    return {
      traceId: supplierTraceId,
      journalEntryIds: mainJournalEntryId ? [mainJournalEntryId] : [],
      billPaymentTraceIds,
      billPaymentJournalIds,
    }
  }

  private async resolveBranchId(companyId: string, requestedBranchId: string | null, allocations: SupplierPaymentAllocationCommand[]) {
    if (requestedBranchId) return requestedBranchId

    if (allocations.length > 0) {
      const { data: firstBill } = await this.adminSupabase
        .from("bills")
        .select("branch_id")
        .eq("company_id", companyId)
        .eq("id", allocations[0].billId)
        .maybeSingle()

      if (firstBill?.branch_id) return String(firstBill.branch_id)
    }

    const { data: defaultBranch, error } = await this.adminSupabase
      .from("branches")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("is_main", { ascending: false })
      .order("name")
      .limit(1)
      .maybeSingle()

    if (error || !defaultBranch?.id) {
      throw new Error("Unable to resolve an active branch for supplier payment")
    }

    return String(defaultBranch.id)
  }

  private async ensureApprovedAllocationPosting(
    payment: PaymentRow,
    allocation: AllocationRow,
    actor: ActorContext,
    options: { uiSurface?: string | null }
  ) {
    const mapping = await getAccrualAccountMapping(this.adminSupabase, payment.company_id)
    const settlementAccountId = payment.account_id || mapping.cash || mapping.bank

    if (!settlementAccountId) {
      throw new Error("Cash or bank account is required to allocate approved supplier payments")
    }

    if (!mapping.supplier_advance) {
      throw new Error("Supplier advance account is required to allocate approved supplier payments")
    }

    const supplierTraceId = await this.ensureSupplierPaymentTrace(
      payment,
      [allocation],
      actor,
      options.uiSurface || null
    )

    const existingBillPaymentTrace = await this.findTraceByIdempotency(
      payment.company_id,
      BILL_PAYMENT_EVENT,
      `supplier-payment:${payment.id}:allocation:${allocation.id}`
    )

    if (existingBillPaymentTrace) {
      await this.linkTrace(existingBillPaymentTrace.transaction_id, "payment_allocation", allocation.id, "allocation", BILL_PAYMENT_EVENT)
      return existingBillPaymentTrace.transaction_id
    }

    const branchId = allocation.bills?.branch_id || payment.branch_id || actor.actorBranchId || null
    const costCenterId = allocation.bills?.cost_center_id || payment.cost_center_id || null
    const warehouseId = allocation.bills?.warehouse_id || payment.warehouse_id || null

    const billEntry = await createCompleteJournalEntry(
      this.adminSupabase,
      {
        company_id: payment.company_id,
        reference_type: "bill_payment",
        reference_id: allocation.id,
        entry_date: payment.payment_date,
        description: `سداد فاتورة مورد ${allocation.bills?.bill_number || allocation.bill_id}`,
        branch_id: branchId,
        cost_center_id: costCenterId,
        warehouse_id: warehouseId,
      },
      [
        {
          account_id: mapping.accounts_payable,
          debit_amount: asNumber(allocation.allocated_amount),
          credit_amount: 0,
          description: "الذمم الدائنة",
          branch_id: branchId,
          cost_center_id: costCenterId,
        },
        {
          account_id: mapping.supplier_advance,
          debit_amount: 0,
          credit_amount: asNumber(allocation.allocated_amount),
          description: "تسوية سلف الموردين",
          branch_id: branchId,
          cost_center_id: costCenterId,
        },
      ]
    )

    if (!billEntry.success || !billEntry.entryId) {
      throw new Error(billEntry.error || `Failed to create bill payment journal for allocation ${allocation.id}`)
    }

    const { data: existingAdvanceApplication } = await this.adminSupabase
      .from("advance_applications")
      .select("id")
      .eq("payment_id", payment.id)
      .eq("bill_id", allocation.bill_id)
      .maybeSingle()

    if (existingAdvanceApplication?.id) {
      await this.adminSupabase
        .from("advance_applications")
        .update({
          amount_applied: asNumber(allocation.allocated_amount),
          applied_date: payment.payment_date,
          notes: "تطبيق دفعة مورد على فاتورة مشتريات",
        })
        .eq("id", existingAdvanceApplication.id)
    } else {
      await this.adminSupabase
        .from("advance_applications")
        .insert({
          company_id: payment.company_id,
          customer_id: null,
          supplier_id: payment.supplier_id,
          payment_id: payment.id,
          invoice_id: null,
          bill_id: allocation.bill_id,
          amount_applied: asNumber(allocation.allocated_amount),
          applied_date: payment.payment_date,
          notes: "تطبيق دفعة مورد على فاتورة مشتريات",
        })
    }

    const billTraceId = await this.createTrace({
      companyId: payment.company_id,
      sourceEntity: "bill",
      sourceId: allocation.bill_id,
      eventType: BILL_PAYMENT_EVENT,
      actorId: actor.actorId,
      idempotencyKey: `supplier-payment:${payment.id}:allocation:${allocation.id}`,
      requestHash: null,
      metadata: buildBillPostingMetadata(payment, allocation, options.uiSurface || null),
    })

    await this.linkTrace(billTraceId, "bill", allocation.bill_id, "bill", BILL_PAYMENT_EVENT)
    await this.linkTrace(billTraceId, "payment", payment.id, "payment", BILL_PAYMENT_EVENT)
    await this.linkTrace(billTraceId, "payment_allocation", allocation.id, "allocation", BILL_PAYMENT_EVENT)
    await this.linkTrace(billTraceId, "journal_entry", billEntry.entryId, "journal_entry", BILL_PAYMENT_EVENT)
    await this.linkTrace(supplierTraceId, "bill", allocation.bill_id, "bill", SUPPLIER_PAYMENT_EVENT)

    return billTraceId
  }

  private async ensureSupplierPaymentTrace(
    payment: PaymentRow,
    allocations: AllocationRow[],
    actor: ActorContext,
    uiSurface: string | null
  ) {
    const existingTrace = await this.findTraceBySource(payment.company_id, "payment", payment.id, SUPPLIER_PAYMENT_EVENT)
    if (existingTrace?.transaction_id) {
      return existingTrace.transaction_id
    }

    let journalEntryId = payment.journal_entry_id
    if (!journalEntryId) {
      const existingJournal = await this.adminSupabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", payment.company_id)
        .eq("reference_type", "supplier_payment")
        .eq("reference_id", payment.id)
        .maybeSingle()

      if (existingJournal.data?.id) {
        journalEntryId = String(existingJournal.data.id)
      }
    }

    if (!journalEntryId) {
      const mapping = await getAccrualAccountMapping(this.adminSupabase, payment.company_id)
      const settlementAccountId = payment.account_id || mapping.cash || mapping.bank

      if (!settlementAccountId) {
        throw new Error("Cash or bank account is required to bootstrap supplier payment posting")
      }

      if (!mapping.supplier_advance) {
        throw new Error("Supplier advance account is required to bootstrap supplier payment posting")
      }

      const firstBill = allocations[0]?.bills
      const entry = await createCompleteJournalEntry(
        this.adminSupabase,
        {
          company_id: payment.company_id,
          reference_type: "supplier_payment",
          reference_id: payment.id,
          entry_date: payment.payment_date,
          description: `دفعة مورد ${payment.reference_number || payment.id}`,
          branch_id: payment.branch_id || firstBill?.branch_id || actor.actorBranchId || null,
          cost_center_id: payment.cost_center_id || firstBill?.cost_center_id || null,
          warehouse_id: payment.warehouse_id || firstBill?.warehouse_id || null,
        },
        [
          {
            account_id: mapping.supplier_advance,
            debit_amount: asNumber(payment.amount),
            credit_amount: 0,
            description: "سلف للموردين",
            branch_id: payment.branch_id || firstBill?.branch_id || actor.actorBranchId || null,
            cost_center_id: payment.cost_center_id || firstBill?.cost_center_id || null,
          },
          {
            account_id: settlementAccountId,
            debit_amount: 0,
            credit_amount: asNumber(payment.amount),
            description: "نقد/بنك",
            branch_id: payment.branch_id || firstBill?.branch_id || actor.actorBranchId || null,
            cost_center_id: payment.cost_center_id || firstBill?.cost_center_id || null,
          },
        ]
      )

      if (!entry.success || !entry.entryId) {
        throw new Error(entry.error || "Failed to bootstrap supplier payment journal entry")
      }

      journalEntryId = entry.entryId
      await this.adminSupabase
        .from("payments")
        .update({ journal_entry_id: journalEntryId })
        .eq("company_id", payment.company_id)
        .eq("id", payment.id)
    }

    const traceId = await this.createTrace({
      companyId: payment.company_id,
      sourceEntity: "payment",
      sourceId: payment.id,
      eventType: SUPPLIER_PAYMENT_EVENT,
      actorId: actor.actorId,
      idempotencyKey: `supplier-payment:${payment.id}:bootstrap`,
      requestHash: null,
      metadata: buildPostingMetadata(payment, allocations, uiSurface),
    })

    await this.linkTrace(traceId, "payment", payment.id, "payment", SUPPLIER_PAYMENT_EVENT)
    if (journalEntryId) {
      await this.linkTrace(traceId, "journal_entry", journalEntryId, "journal_entry", SUPPLIER_PAYMENT_EVENT)
    }

    return traceId
  }

  private async loadPayment(companyId: string | undefined, paymentId: string): Promise<PaymentRow> {
    let query = this.adminSupabase
      .from("payments")
      .select(`
        id,
        company_id,
        supplier_id,
        bill_id,
        purchase_order_id,
        payment_date,
        amount,
        payment_method,
        account_id,
        branch_id,
        cost_center_id,
        warehouse_id,
        reference_number,
        notes,
        currency_code,
        exchange_rate,
        exchange_rate_used,
        exchange_rate_id,
        rate_source,
        base_currency_amount,
        original_amount,
        original_currency,
        status,
        approved_by,
        approved_at,
        created_by,
        journal_entry_id,
        unallocated_amount
      `)
      .eq("id", paymentId)

    if (companyId) {
      query = query.eq("company_id", companyId)
    }

    const { data, error } = await query.maybeSingle()
    if (error || !data) {
      throw new Error(error?.message || "Supplier payment not found")
    }

    return data as PaymentRow
  }

  private assertSupplierPaymentScope(actor: ActorContext, payment: PaymentRow) {
    if (!payment.supplier_id) {
      throw new Error("This maintenance command is only available for supplier payments")
    }

    if (!isPrivilegedRole(actor.actorRole) && actor.actorBranchId && payment.branch_id && actor.actorBranchId !== payment.branch_id) {
      throw new Error("Supplier payment is outside your branch scope")
    }
  }

  private async loadBillForAllocation(companyId: string, billId: string): Promise<BillAllocationTarget> {
    const { data, error } = await this.adminSupabase
      .from("bills")
      .select(`
        id,
        company_id,
        bill_number,
        supplier_id,
        purchase_order_id,
        branch_id,
        cost_center_id,
        warehouse_id,
        total_amount,
        paid_amount,
        returned_amount
      `)
      .eq("company_id", companyId)
      .eq("id", billId)
      .maybeSingle()

    if (error || !data) {
      throw new Error(error?.message || "Purchase bill not found")
    }

    return data as BillAllocationTarget
  }

  private async loadPurchaseOrderForAllocation(companyId: string, purchaseOrderId: string): Promise<PurchaseOrderAllocationTarget> {
    const { data, error } = await this.adminSupabase
      .from("purchase_orders")
      .select(`
        id,
        company_id,
        po_number,
        supplier_id,
        branch_id,
        cost_center_id,
        warehouse_id,
        total_amount,
        received_amount,
        status
      `)
      .eq("company_id", companyId)
      .eq("id", purchaseOrderId)
      .maybeSingle()

    if (error || !data) {
      throw new Error(error?.message || "Purchase order not found")
    }

    return data as PurchaseOrderAllocationTarget
  }

  private async collectPostedJournalIds(payment: PaymentRow, allocations: AllocationRow[]) {
    const journalIds = new Set<string>()

    if (payment.journal_entry_id) {
      journalIds.add(payment.journal_entry_id)
    }

    const supplierPaymentEntries = await this.adminSupabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", payment.company_id)
      .eq("reference_type", "supplier_payment")
      .eq("reference_id", payment.id)

    for (const row of supplierPaymentEntries.data || []) {
      if ((row as any)?.id) {
        journalIds.add(String((row as any).id))
      }
    }

    const supplierTrace = await this.findTraceBySource(payment.company_id, "payment", payment.id, SUPPLIER_PAYMENT_EVENT)
    if (supplierTrace?.transaction_id) {
      const traceArtifacts = await this.loadTraceArtifacts(payment.company_id, payment.id, supplierTrace.transaction_id)
      for (const id of [...traceArtifacts.journalEntryIds, ...traceArtifacts.billPaymentJournalIds]) {
        journalIds.add(id)
      }
    }

    const billReferenceIds = dedupe([
      payment.bill_id,
      ...allocations.map((allocation) => allocation.bill_id),
      ...allocations.map((allocation) => allocation.id),
    ])

    if (billReferenceIds.length > 0) {
      const billPaymentEntries = await this.adminSupabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", payment.company_id)
        .eq("reference_type", "bill_payment")
        .in("reference_id", billReferenceIds)

      for (const row of billPaymentEntries.data || []) {
        if ((row as any)?.id) {
          journalIds.add(String((row as any).id))
        }
      }
    }

    if (payment.purchase_order_id) {
      const poEntries = await this.adminSupabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", payment.company_id)
        .eq("reference_type", "po_payment")
        .eq("reference_id", payment.purchase_order_id)

      for (const row of poEntries.data || []) {
        if ((row as any)?.id) {
          journalIds.add(String((row as any).id))
        }
      }
    }

    if (journalIds.size === 0) {
      return []
    }

    const { data: postedJournals } = await this.adminSupabase
      .from("journal_entries")
      .select("id")
      .in("id", Array.from(journalIds))
      .eq("status", "posted")

    return (postedJournals || []).map((row: any) => String(row.id))
  }

  private async reverseJournalEntries(
    companyId: string,
    journalIds: string[],
    reversalDate: string,
    actorId: string
  ) {
    const uniqueJournalIds = dedupe(journalIds)
    const reversalJournalIds: string[] = []

    for (const journalId of uniqueJournalIds) {
      const { data, error } = await this.adminSupabase.rpc("create_reversal_entry", {
        p_original_entry_id: journalId,
        p_reversal_date: reversalDate,
        p_posted_by: actorId,
      })

      if (error) {
        throw new Error(error.message || `Failed to reverse journal entry ${journalId}`)
      }

      if (data) {
        reversalJournalIds.push(String(data))
      }
    }

    return reversalJournalIds
  }

  private async loadAllocations(paymentId: string): Promise<AllocationRow[]> {
    const { data, error } = await this.adminSupabase
      .from("payment_allocations")
      .select(`
        id,
        payment_id,
        bill_id,
        allocated_amount,
        bills!inner(
          id,
          bill_number,
          purchase_order_id,
          branch_id,
          cost_center_id,
          warehouse_id,
          supplier_id
        )
      `)
      .eq("payment_id", paymentId)
      .order("created_at", { ascending: true })

    if (error) {
      throw new Error(error.message || "Failed to load supplier payment allocations")
    }

    return (data || []) as AllocationRow[]
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
      if (isDuplicateTraceError(error.message) && params.idempotencyKey) {
        const existing = await this.findTraceByIdempotency(params.companyId, params.eventType, params.idempotencyKey)
        if (existing?.transaction_id) {
          return existing.transaction_id
        }
      }
      throw new Error(error.message || "Failed to create financial trace")
    }

    return String(data)
  }

  private async linkTrace(
    traceId: string,
    entityType: string,
    entityId: string,
    linkRole: string,
    referenceType: string
  ) {
    await this.adminSupabase
      .from("financial_operation_trace_links")
      .upsert({
        transaction_id: traceId,
        entity_type: entityType,
        entity_id: entityId,
        link_role: linkRole,
        reference_type: referenceType,
      }, {
        onConflict: "transaction_id,entity_type,entity_id",
      })
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

  private async findTraceBySource(
    companyId: string,
    sourceEntity: string,
    sourceId: string,
    eventType: string
  ): Promise<TraceRecord | null> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_traces")
      .select("transaction_id, request_hash")
      .eq("company_id", companyId)
      .eq("source_entity", sourceEntity)
      .eq("source_id", sourceId)
      .eq("event_type", eventType)
      .order("created_at", { ascending: false })
      .limit(1)
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

  private async getLinkedEntityIds(traceId: string, entityType: string): Promise<string[]> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_trace_links")
      .select("entity_id")
      .eq("transaction_id", traceId)
      .eq("entity_type", entityType)

    if (error) return []
    return (data || []).map((row: any) => String(row.entity_id))
  }

  private async loadTraceArtifacts(companyId: string, paymentId: string, supplierTraceId: string): Promise<TraceResult> {
    const billTraces = await this.adminSupabase
      .from("financial_operation_traces")
      .select("transaction_id")
      .eq("company_id", companyId)
      .eq("event_type", BILL_PAYMENT_EVENT)
      .contains("metadata", { payment_id: paymentId })

    const billPaymentTraceIds = (billTraces.data || []).map((row: any) => String(row.transaction_id))
    const billPaymentJournalIds = (
      await Promise.all(
        billPaymentTraceIds.map((traceId: string) => this.getLinkedEntityIds(traceId, "journal_entry"))
      )
    ).flat()

    return {
      traceId: supplierTraceId,
      journalEntryIds: await this.getLinkedEntityIds(supplierTraceId, "journal_entry"),
      billPaymentTraceIds,
      billPaymentJournalIds,
    }
  }
}

export { CREATE_COMMAND_EVENT, SUPPLIER_PAYMENT_EVENT, BILL_PAYMENT_EVENT, willApprovalFinalize, isPrivilegedRole }
