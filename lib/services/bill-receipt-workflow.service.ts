type SupabaseLike = any

const BILL_RECEIPT_SUBMISSION_EVENT = "bill_receipt_submission"
const BILL_RECEIPT_REJECTION_EVENT = "bill_receipt_rejection"
const BILL_ADMIN_APPROVAL_EVENT = "bill_admin_approval"
const BILL_ADMIN_REJECTION_EVENT = "bill_admin_rejection"
const BILL_DRAFT_DELETE_EVENT = "bill_draft_delete"

const SUBMISSION_ROLES = new Set(["owner", "admin", "general_manager", "manager", "accountant"])
const RECEIPT_ROLES = new Set(["owner", "admin", "general_manager", "store_manager"])
const ADMIN_APPROVAL_ROLES = new Set(["owner", "admin", "general_manager"])

type ActorContext = {
  companyId: string
  actorId: string
  actorRole: string
  actorBranchId?: string | null
  actorWarehouseId?: string | null
}

type BillRecord = {
  id: string
  bill_number: string | null
  status: string | null
  approval_status: string | null
  approved_by?: string | null
  approved_at?: string | null
  rejection_reason?: string | null
  rejected_by?: string | null
  rejected_at?: string | null
  receipt_status: string | null
  receipt_rejection_reason: string | null
  received_by: string | null
  received_at: string | null
  company_id: string
  branch_id: string | null
  warehouse_id: string | null
  cost_center_id: string | null
  supplier_id: string | null
  purchase_order_id: string | null
}

type TraceRecord = {
  transaction_id: string
  request_hash: string | null
}

export type BillReceiptWorkflowResult = {
  success: boolean
  cached: boolean
  eventType: string
  transactionId: string | null
  billId: string
  status: string
  receiptStatus: string | null
  receiptRejectionReason: string | null
}

function normalizeRole(role: unknown) {
  return String(role || "").trim().toLowerCase()
}

function asString(value: unknown) {
  return String(value || "").trim()
}

function isDuplicateTraceError(message?: string | null) {
  if (!message) return false
  return (
    message.includes("duplicate key value violates unique constraint") ||
    message.includes("idx_financial_operation_traces_idempotency")
  )
}

export class BillReceiptWorkflowService {
  constructor(private adminSupabase: SupabaseLike) {}

  async deleteDraftBill(
    actor: ActorContext,
    billId: string,
    options: { idempotencyKey: string; requestHash: string; uiSurface?: string | null }
  ): Promise<BillReceiptWorkflowResult> {
    const existingTrace = await this.findTraceByIdempotency(actor.companyId, BILL_DRAFT_DELETE_EVENT, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      return {
        success: true,
        cached: true,
        eventType: BILL_DRAFT_DELETE_EVENT,
        transactionId: existingTrace.transaction_id,
        billId,
        status: "deleted",
        receiptStatus: null,
        receiptRejectionReason: null,
      }
    }

    const bill = await this.loadBill(billId, actor.companyId)
    this.assertBranchScope(actor, bill.branch_id)

    if (asString(bill.status) !== "draft") {
      throw new Error("Only draft purchase bills can be permanently deleted")
    }

    const hasLinkedPayments = await this.hasLinkedPayments(billId)
    if (hasLinkedPayments) {
      throw new Error("Purchase bill cannot be deleted while linked payments exist")
    }

    const traceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "bill",
      sourceId: billId,
      eventType: BILL_DRAFT_DELETE_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: {
        purchase_order_id: bill.purchase_order_id,
        supplier_id: bill.supplier_id,
        branch_id: bill.branch_id,
        warehouse_id: bill.warehouse_id,
        cost_center_id: bill.cost_center_id,
        ui_surface: options.uiSurface || null,
      },
    })

    await this.linkTrace(traceId, "bill", billId, "bill", BILL_DRAFT_DELETE_EVENT)

    const { error: deleteItemsError } = await this.adminSupabase
      .from("bill_items")
      .delete()
      .eq("bill_id", billId)

    if (deleteItemsError) {
      throw new Error(deleteItemsError.message || "Failed to delete bill items")
    }

    const { error: deleteBillError } = await this.adminSupabase
      .from("bills")
      .delete()
      .eq("company_id", actor.companyId)
      .eq("id", billId)

    if (deleteBillError) {
      throw new Error(deleteBillError.message || "Failed to delete purchase bill")
    }

    if (bill.purchase_order_id) {
      await this.syncPurchaseOrderStatusAfterBillDelete(actor.companyId, bill.purchase_order_id)
      await this.linkTrace(traceId, "purchase_order", bill.purchase_order_id, "purchase_order", BILL_DRAFT_DELETE_EVENT)
    }

    await this.insertAuditLog(actor.companyId, actor.actorId, "bill_draft_deleted", bill)

    return {
      success: true,
      cached: false,
      eventType: BILL_DRAFT_DELETE_EVENT,
      transactionId: traceId,
      billId,
      status: "deleted",
      receiptStatus: null,
      receiptRejectionReason: null,
    }
  }

  async approveBill(
    actor: ActorContext,
    billId: string,
    options: { idempotencyKey: string; requestHash: string; uiSurface?: string | null }
  ): Promise<BillReceiptWorkflowResult> {
    if (!ADMIN_APPROVAL_ROLES.has(normalizeRole(actor.actorRole))) {
      throw new Error("You do not have permission to approve this purchase bill")
    }

    const existingTrace = await this.findTraceByIdempotency(actor.companyId, BILL_ADMIN_APPROVAL_EVENT, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      return await this.buildResult(billId, BILL_ADMIN_APPROVAL_EVENT, existingTrace.transaction_id, true)
    }

    const bill = await this.loadBill(billId, actor.companyId)
    const alreadyApproved = bill.approval_status === "approved" && bill.status === "draft"

    if (!alreadyApproved) {
      const { error } = await this.adminSupabase
        .from("bills")
        .update({
          status: "draft",
          approval_status: "approved",
          approved_by: actor.actorId,
          approved_at: new Date().toISOString(),
          rejection_reason: null,
          rejected_by: null,
          rejected_at: null,
        })
        .eq("company_id", actor.companyId)
        .eq("id", billId)

      if (error) {
        throw new Error(error.message || "Failed to approve purchase bill")
      }
    }

    const refreshedBill = alreadyApproved ? bill : await this.loadBill(billId, actor.companyId)
    const traceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "bill",
      sourceId: billId,
      eventType: BILL_ADMIN_APPROVAL_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: {
        purchase_order_id: refreshedBill.purchase_order_id,
        supplier_id: refreshedBill.supplier_id,
        branch_id: refreshedBill.branch_id,
        warehouse_id: refreshedBill.warehouse_id,
        cost_center_id: refreshedBill.cost_center_id,
        ui_surface: options.uiSurface || null,
        adopted_existing_state: alreadyApproved,
      },
    })

    await this.linkTrace(traceId, "bill", billId, "bill", BILL_ADMIN_APPROVAL_EVENT)
    await this.insertAuditLog(actor.companyId, actor.actorId, "bill_admin_approved", refreshedBill)

    return await this.buildResult(billId, BILL_ADMIN_APPROVAL_EVENT, traceId, alreadyApproved)
  }

  async rejectBill(
    actor: ActorContext,
    billId: string,
    rejectionReason: string,
    options: { idempotencyKey: string; requestHash: string; uiSurface?: string | null }
  ): Promise<BillReceiptWorkflowResult> {
    if (!ADMIN_APPROVAL_ROLES.has(normalizeRole(actor.actorRole))) {
      throw new Error("You do not have permission to reject this purchase bill")
    }

    const existingTrace = await this.findTraceByIdempotency(actor.companyId, BILL_ADMIN_REJECTION_EVENT, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      return await this.buildResult(billId, BILL_ADMIN_REJECTION_EVENT, existingTrace.transaction_id, true)
    }

    const bill = await this.loadBill(billId, actor.companyId)
    const alreadyRejected =
      bill.approval_status === "rejected" &&
      bill.status === "rejected" &&
      asString(bill.rejection_reason) === asString(rejectionReason)

    if (!alreadyRejected) {
      const { error } = await this.adminSupabase
        .from("bills")
        .update({
          status: "rejected",
          approval_status: "rejected",
          rejection_reason: rejectionReason,
          rejected_by: actor.actorId,
          rejected_at: new Date().toISOString(),
        })
        .eq("company_id", actor.companyId)
        .eq("id", billId)

      if (error) {
        throw new Error(error.message || "Failed to reject purchase bill")
      }
    }

    const refreshedBill = alreadyRejected ? bill : await this.loadBill(billId, actor.companyId)
    const traceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "bill",
      sourceId: billId,
      eventType: BILL_ADMIN_REJECTION_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: {
        purchase_order_id: refreshedBill.purchase_order_id,
        supplier_id: refreshedBill.supplier_id,
        branch_id: refreshedBill.branch_id,
        warehouse_id: refreshedBill.warehouse_id,
        cost_center_id: refreshedBill.cost_center_id,
        ui_surface: options.uiSurface || null,
        rejection_reason: rejectionReason,
        adopted_existing_state: alreadyRejected,
      },
    })

    await this.linkTrace(traceId, "bill", billId, "bill", BILL_ADMIN_REJECTION_EVENT)
    await this.insertAuditLog(actor.companyId, actor.actorId, "bill_admin_rejected", refreshedBill, { rejection_reason: rejectionReason })

    return await this.buildResult(billId, BILL_ADMIN_REJECTION_EVENT, traceId, alreadyRejected)
  }

  async submitForReceipt(
    actor: ActorContext,
    billId: string,
    options: { idempotencyKey: string; requestHash: string; uiSurface?: string | null }
  ): Promise<BillReceiptWorkflowResult> {
    if (!SUBMISSION_ROLES.has(normalizeRole(actor.actorRole))) {
      throw new Error("You do not have permission to submit this bill for warehouse receipt")
    }

    const existingTrace = await this.findTraceByIdempotency(actor.companyId, BILL_RECEIPT_SUBMISSION_EVENT, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      return await this.buildResult(billId, BILL_RECEIPT_SUBMISSION_EVENT, existingTrace.transaction_id, true)
    }

    const bill = await this.loadBill(billId, actor.companyId)
    this.assertBranchScope(actor, bill.branch_id)

    const alreadyPending = bill.status === "sent" && bill.receipt_status === "pending"
    if (!alreadyPending) {
      const approved = bill.approval_status === "approved" || bill.status === "approved" || bill.status === "rejected"
      if (!approved) {
        throw new Error("Bill must be approved before sending it for warehouse receipt")
      }

      const { error } = await this.adminSupabase
        .from("bills")
        .update({
          status: "sent",
          receipt_status: "pending",
          receipt_rejection_reason: null,
        })
        .eq("company_id", actor.companyId)
        .eq("id", billId)

      if (error) {
        throw new Error(error.message || "Failed to submit bill for receipt")
      }
    }

    const refreshedBill = alreadyPending ? bill : await this.loadBill(billId, actor.companyId)

    const traceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "bill",
      sourceId: billId,
      eventType: BILL_RECEIPT_SUBMISSION_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: {
        purchase_order_id: refreshedBill.purchase_order_id,
        supplier_id: refreshedBill.supplier_id,
        branch_id: refreshedBill.branch_id,
        warehouse_id: refreshedBill.warehouse_id,
        cost_center_id: refreshedBill.cost_center_id,
        ui_surface: options.uiSurface || null,
        adopted_existing_state: alreadyPending,
      },
    })

    await this.linkTrace(traceId, "bill", billId, "bill", BILL_RECEIPT_SUBMISSION_EVENT)
    await this.insertAuditLog(actor.companyId, actor.actorId, "bill_receipt_submitted", refreshedBill)

    return await this.buildResult(billId, BILL_RECEIPT_SUBMISSION_EVENT, traceId, alreadyPending)
  }

  async rejectReceipt(
    actor: ActorContext,
    billId: string,
    rejectionReason: string,
    options: { idempotencyKey: string; requestHash: string; uiSurface?: string | null }
  ): Promise<BillReceiptWorkflowResult> {
    if (!RECEIPT_ROLES.has(normalizeRole(actor.actorRole))) {
      throw new Error("You do not have permission to reject this goods receipt")
    }

    const existingTrace = await this.findTraceByIdempotency(actor.companyId, BILL_RECEIPT_REJECTION_EVENT, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      return await this.buildResult(billId, BILL_RECEIPT_REJECTION_EVENT, existingTrace.transaction_id, true)
    }

    const bill = await this.loadBill(billId, actor.companyId)
    this.assertReceiptPermission(actor, bill)

    const alreadyRejected =
      bill.receipt_status === "rejected" &&
      asString(bill.receipt_rejection_reason) === asString(rejectionReason) &&
      bill.status === "rejected"

    if (!alreadyRejected) {
      const { error } = await this.adminSupabase
        .from("bills")
        .update({
          status: "rejected",
          receipt_status: "rejected",
          receipt_rejection_reason: rejectionReason,
          received_by: null,
          received_at: null,
        })
        .eq("company_id", actor.companyId)
        .eq("id", billId)

      if (error) {
        throw new Error(error.message || "Failed to reject goods receipt")
      }
    }

    const refreshedBill = alreadyRejected ? bill : await this.loadBill(billId, actor.companyId)

    const traceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "bill",
      sourceId: billId,
      eventType: BILL_RECEIPT_REJECTION_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: {
        purchase_order_id: refreshedBill.purchase_order_id,
        supplier_id: refreshedBill.supplier_id,
        branch_id: refreshedBill.branch_id,
        warehouse_id: refreshedBill.warehouse_id,
        cost_center_id: refreshedBill.cost_center_id,
        ui_surface: options.uiSurface || null,
        rejection_reason: rejectionReason,
        adopted_existing_state: alreadyRejected,
      },
    })

    await this.linkTrace(traceId, "bill", billId, "bill", BILL_RECEIPT_REJECTION_EVENT)
    await this.insertAuditLog(actor.companyId, actor.actorId, "bill_receipt_rejected", refreshedBill, { rejection_reason: rejectionReason })

    return await this.buildResult(billId, BILL_RECEIPT_REJECTION_EVENT, traceId, alreadyRejected)
  }

  private assertBranchScope(actor: ActorContext, billBranchId: string | null) {
    const role = normalizeRole(actor.actorRole)
    if (role === "owner" || role === "admin" || role === "general_manager") {
      return
    }

    if (actor.actorBranchId && billBranchId && actor.actorBranchId !== billBranchId) {
      throw new Error("Bill is outside your branch scope")
    }
  }

  private assertReceiptPermission(actor: ActorContext, bill: BillRecord) {
    const role = normalizeRole(actor.actorRole)
    if (role === "owner" || role === "admin" || role === "general_manager") {
      return
    }

    if (role === "store_manager") {
      if (!actor.actorWarehouseId || actor.actorWarehouseId !== bill.warehouse_id) {
        throw new Error("You do not have permission to process this warehouse receipt")
      }
      return
    }

    throw new Error("You do not have permission to process this warehouse receipt")
  }

  private async buildResult(
    billId: string,
    eventType: string,
    transactionId: string | null,
    cached: boolean
  ): Promise<BillReceiptWorkflowResult> {
    const bill = await this.loadBill(billId)
    return {
      success: true,
      cached,
      eventType,
      transactionId,
      billId,
      status: asString(bill.status),
      receiptStatus: bill.receipt_status || null,
      receiptRejectionReason: bill.receipt_rejection_reason || null,
    }
  }

  private async loadBill(billId: string, companyId?: string): Promise<BillRecord> {
    let query = this.adminSupabase
      .from("bills")
      .select(`
        id,
        bill_number,
        status,
        approval_status,
        approved_by,
        approved_at,
        rejection_reason,
        rejected_by,
        rejected_at,
        receipt_status,
        receipt_rejection_reason,
        received_by,
        received_at,
        company_id,
        branch_id,
        warehouse_id,
        cost_center_id,
        supplier_id,
        purchase_order_id
      `)
      .eq("id", billId)

    if (companyId) {
      query = query.eq("company_id", companyId)
    }

    const { data, error } = await query.maybeSingle()
    if (error || !data) {
      throw new Error(error?.message || "Bill not found")
    }

    return data as BillRecord
  }

  private async hasLinkedPayments(billId: string) {
    const { data: legacyPayment } = await this.adminSupabase
      .from("payments")
      .select("id")
      .eq("bill_id", billId)
      .limit(1)
      .maybeSingle()

    if (legacyPayment?.id) {
      return true
    }

    const { data: allocation } = await this.adminSupabase
      .from("payment_allocations")
      .select("id")
      .eq("bill_id", billId)
      .limit(1)
      .maybeSingle()

    return Boolean(allocation?.id)
  }

  private async syncPurchaseOrderStatusAfterBillDelete(companyId: string, purchaseOrderId: string) {
    const { data: poItems } = await this.adminSupabase
      .from("purchase_order_items")
      .select("product_id, quantity")
      .eq("purchase_order_id", purchaseOrderId)

    const { data: linkedBills } = await this.adminSupabase
      .from("bills")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("purchase_order_id", purchaseOrderId)
      .not("status", "in", "(voided,cancelled)")

    const billIds = (linkedBills || []).map((bill: any) => String(bill.id))
    const billedQtyMap: Record<string, number> = {}

    if (billIds.length > 0) {
      const { data: allBillItems } = await this.adminSupabase
        .from("bill_items")
        .select("product_id, quantity, returned_quantity")
        .in("bill_id", billIds)

      for (const item of allBillItems || []) {
        const productId = String((item as any).product_id || "")
        if (!productId) continue
        const netQty = Number((item as any).quantity || 0) - Number((item as any).returned_quantity || 0)
        billedQtyMap[productId] = (billedQtyMap[productId] || 0) + netQty
      }
    }

    let newStatus = "draft"
    if (billIds.length > 0) {
      const allFullyBilled = (poItems || []).every((item: any) => {
        const productId = String(item.product_id || "")
        const ordered = Number(item.quantity || 0)
        const billed = billedQtyMap[productId] || 0
        return billed >= ordered
      })

      const anyBilled = Object.values(billedQtyMap).some((qty) => qty > 0)

      if (allFullyBilled) {
        newStatus = "billed"
      } else if (anyBilled) {
        newStatus = "partially_billed"
      }
    }

    await this.adminSupabase
      .from("purchase_orders")
      .update({
        status: newStatus,
        bill_id: billIds.length > 0 ? billIds[0] : null,
      })
      .eq("company_id", companyId)
      .eq("id", purchaseOrderId)
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
      if (isDuplicateTraceError(error.message)) {
        const existing = await this.findTraceByIdempotency(params.companyId, params.eventType, params.idempotencyKey)
        if (existing?.transaction_id) {
          return existing.transaction_id
        }
      }
      throw new Error(error.message || "Failed to create workflow trace")
    }

    return asString(data)
  }

  private async linkTrace(
    traceId: string,
    entityType: string,
    entityId: string,
    linkRole: string,
    referenceType: string
  ) {
    await this.adminSupabase.rpc("link_financial_operation_trace", {
      p_transaction_id: traceId,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_link_role: linkRole,
      p_reference_type: referenceType,
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

  private async insertAuditLog(
    companyId: string,
    actorId: string,
    action: string,
    bill: BillRecord,
    extraData: Record<string, unknown> = {}
  ) {
    try {
      await this.adminSupabase.from("audit_logs").insert({
        company_id: companyId,
        user_id: actorId,
        action,
        target_table: "bills",
        record_id: bill.id,
        record_identifier: bill.bill_number,
        new_data: {
          status: bill.status,
          receipt_status: bill.receipt_status,
          purchase_order_id: bill.purchase_order_id,
          branch_id: bill.branch_id,
          warehouse_id: bill.warehouse_id,
          ...extraData,
        },
      })
    } catch (error) {
      console.warn("[BILL_RECEIPT_WORKFLOW_AUDIT]", error)
    }
  }
}

export {
  BILL_RECEIPT_SUBMISSION_EVENT,
  BILL_RECEIPT_REJECTION_EVENT,
  BILL_ADMIN_APPROVAL_EVENT,
  BILL_ADMIN_REJECTION_EVENT,
  BILL_DRAFT_DELETE_EVENT,
}
