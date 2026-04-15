import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"

const CREATE_COMMAND_EVENT = "purchase_return_command"
const DECISION_EVENT = "purchase_return_decision"
const WAREHOUSE_DECISION_EVENT = "purchase_return_warehouse_decision"
const PURCHASE_RETURN_EVENT = "purchase_return_posting"
const PURCHASE_RETURN_ALLOCATION_EVENT = "purchase_return_allocation_posting"
const VENDOR_CREDIT_EVENT = "vendor_credit_posting"
const PURCHASE_RETURN_REFUND_EVENT = "purchase_return_refund_received"

const PRIVILEGED_ROLES = new Set(["owner", "admin", "general_manager"])

type SupabaseLike = any

export type PurchaseReturnCommandMode = "create" | "resubmit"
export type PurchaseReturnStrategy = "single" | "multi"
export type PurchaseReturnDecisionAction = "APPROVE" | "REJECT"

type ActorContext = {
  companyId: string
  actorId: string
  actorRole: string
  actorBranchId?: string | null
  actorWarehouseId?: string | null
}

export type CreatePurchaseReturnCommand = {
  mode: PurchaseReturnCommandMode
  strategy: PurchaseReturnStrategy
  supplierId: string
  billId: string
  returnId?: string | null
  purchaseReturn: Record<string, any>
  returnItems?: any[]
  warehouseGroups?: any[]
  uiSurface?: string | null
}

export type ConfirmPurchaseReturnCommand = {
  allocationId?: string | null
  notes?: string | null
  uiSurface?: string | null
}

type TraceRecord = {
  transaction_id: string
  request_hash: string | null
}

type PurchaseReturnRow = {
  id: string
  company_id: string
  supplier_id: string | null
  bill_id: string | null
  return_number: string | null
  return_date: string | null
  status: string | null
  workflow_status: string | null
  financial_status: string | null
  branch_id: string | null
  cost_center_id: string | null
  warehouse_id: string | null
  created_by: string | null
  journal_entry_id: string | null
  settlement_method: string | null
  total_amount: number | null
  reason: string | null
  notes: string | null
}

type AllocationRow = {
  id: string
  company_id: string
  purchase_return_id: string
  warehouse_id: string | null
  branch_id: string | null
  cost_center_id: string | null
  journal_entry_id: string | null
  workflow_status: string | null
  total_amount: number | null
  confirmed_by: string | null
  confirmed_at: string | null
}

type PostingArtifacts = {
  journalEntryIds: string[]
  inventoryTransactionIds: string[]
  vendorCreditId: string | null
}

export type PurchaseReturnCommandResult = {
  success: boolean
  cached: boolean
  eventType: string
  transactionId: string | null
  purchaseReturnId: string
  status: string
  workflowStatus: string
  financialStatus: string | null
  journalEntryIds: string[]
  inventoryTransactionIds: string[]
  vendorCreditId: string | null
  allocationIds: string[]
  adoptedExistingPosting?: boolean
}

function normalizeRole(role: unknown) {
  return String(role || "").trim().toLowerCase()
}

function isPrivilegedRole(role: unknown) {
  return PRIVILEGED_ROLES.has(normalizeRole(role))
}

function isStoreManagerRole(role: unknown) {
  return normalizeRole(role) === "store_manager"
}

function isDuplicateTraceError(message?: string | null) {
  if (!message) return false
  return (
    message.includes("duplicate key value violates unique constraint") ||
    message.includes("idx_financial_operation_traces_idempotency")
  )
}

function asString(value: unknown) {
  return String(value || "").trim()
}

function dedupe(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]))
}

function workflowState(value?: string | null) {
  return String(value || "").trim().toLowerCase()
}

function buildCreateMetadata(command: CreatePurchaseReturnCommand) {
  return {
    mode: command.mode,
    strategy: command.strategy,
    supplier_id: command.supplierId,
    bill_id: command.billId,
    return_id: command.returnId || null,
    branch_id: command.purchaseReturn?.branch_id || null,
    cost_center_id: command.purchaseReturn?.cost_center_id || null,
    warehouse_id: command.purchaseReturn?.warehouse_id || null,
    total_amount: command.purchaseReturn?.total_amount ?? null,
    return_number: command.purchaseReturn?.return_number || null,
    ui_surface: command.uiSurface || null,
    items_count: Array.isArray(command.returnItems) ? command.returnItems.length : 0,
    warehouse_groups_count: Array.isArray(command.warehouseGroups) ? command.warehouseGroups.length : 0,
  }
}

export class PurchaseReturnCommandService {
  constructor(
    private authSupabase: SupabaseLike,
    private adminSupabase: SupabaseLike
  ) {}

  async createReturn(
    actor: ActorContext,
    command: CreatePurchaseReturnCommand,
    options: { idempotencyKey: string; requestHash: string }
  ): Promise<PurchaseReturnCommandResult> {
    const sourceEntity = command.mode === "resubmit" ? "purchase_return" : "bill"
    const sourceId = command.mode === "resubmit" ? asString(command.returnId) : asString(command.billId)

    const existingTrace = await this.findTraceByIdempotency(actor.companyId, CREATE_COMMAND_EVENT, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      const linkedReturnId = await this.findLinkedEntityId(existingTrace.transaction_id, "purchase_return")
      if (!linkedReturnId) {
        throw new Error("Purchase return command is already in progress")
      }

      return await this.buildResultFromReturn(linkedReturnId, CREATE_COMMAND_EVENT, existingTrace.transaction_id, true)
    }

    const traceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity,
      sourceId,
      eventType: CREATE_COMMAND_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: buildCreateMetadata(command),
    })

    let result: any = null
    if (command.mode === "resubmit") {
      const response = await this.authSupabase.rpc("resubmit_purchase_return", {
        p_return_id: command.returnId,
        p_user_id: actor.actorId,
        p_purchase_return: command.purchaseReturn,
        p_return_items: command.returnItems || [],
      })

      if (response.error || !(response.data as any)?.success) {
        throw new Error(response.error?.message || (response.data as any)?.error || "Failed to resubmit purchase return")
      }
      result = response.data
    } else if (command.strategy === "multi") {
      const response = await this.authSupabase.rpc("process_purchase_return_multi_warehouse", {
        p_company_id: actor.companyId,
        p_supplier_id: command.supplierId,
        p_bill_id: command.billId,
        p_purchase_return: command.purchaseReturn,
        p_warehouse_groups: command.warehouseGroups || [],
        p_created_by: actor.actorId,
      })

      if (response.error) {
        throw new Error(response.error.message || "Failed to create multi-warehouse purchase return")
      }
      result = response.data
    } else {
      const response = await this.authSupabase.rpc("process_purchase_return_atomic", {
        p_company_id: actor.companyId,
        p_supplier_id: command.supplierId,
        p_bill_id: command.billId,
        p_purchase_return: command.purchaseReturn,
        p_return_items: command.returnItems || [],
        p_journal_entry: null,
        p_journal_lines: null,
        p_vendor_credit: null,
        p_vendor_credit_items: null,
        p_bill_update: null,
      })

      if (response.error) {
        throw new Error(response.error.message || "Failed to create purchase return")
      }
      result = response.data
    }

    const purchaseReturnId = asString(result?.purchase_return_id || command.returnId)
    if (!purchaseReturnId) {
      throw new Error("Purchase return command completed without a return id")
    }

    await this.linkTrace(traceId, "purchase_return", purchaseReturnId, "purchase_return", CREATE_COMMAND_EVENT)
    await this.linkTrace(traceId, "bill", command.billId, "bill", CREATE_COMMAND_EVENT)

    const journalEntryId = asString(result?.journal_entry_id)
    if (journalEntryId) {
      await this.linkTrace(traceId, "journal_entry", journalEntryId, "draft_journal_entry", CREATE_COMMAND_EVENT)
    }

    for (const allocationId of Array.isArray(result?.allocation_ids) ? result.allocation_ids.map((value: any) => asString(value)).filter(Boolean) : []) {
      await this.linkTrace(traceId, "purchase_return_allocation", allocationId, "allocation", CREATE_COMMAND_EVENT)
    }

    return await this.buildResultFromReturn(purchaseReturnId, CREATE_COMMAND_EVENT, traceId, false)
  }

  async processDecision(
    actor: ActorContext,
    purchaseReturnId: string,
    action: PurchaseReturnDecisionAction,
    reason: string | null,
    options: { idempotencyKey: string; requestHash: string; uiSurface?: string | null }
  ): Promise<PurchaseReturnCommandResult> {
    if (!isPrivilegedRole(actor.actorRole)) {
      throw new Error("Only privileged roles can process purchase return admin decisions")
    }

    const purchaseReturn = await this.loadPurchaseReturn(purchaseReturnId)
    const existingTrace = await this.findTraceByIdempotency(actor.companyId, DECISION_EVENT, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      return await this.buildResultFromReturn(purchaseReturnId, DECISION_EVENT, existingTrace.transaction_id, true)
    }

    const traceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "purchase_return",
      sourceId: purchaseReturnId,
      eventType: DECISION_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: {
        action,
        reason,
        ui_surface: options.uiSurface || null,
        bill_id: purchaseReturn.bill_id,
        supplier_id: purchaseReturn.supplier_id,
        branch_id: purchaseReturn.branch_id,
        warehouse_id: purchaseReturn.warehouse_id,
      },
    })

    const response = await this.authSupabase.rpc("approve_purchase_return_atomic", {
      p_pr_id: purchaseReturnId,
      p_user_id: actor.actorId,
      p_company_id: actor.companyId,
      p_action: action.toLowerCase(),
      p_reason: reason,
    })

    if (response.error || !(response.data as any)?.success) {
      throw new Error(response.error?.message || (response.data as any)?.error || "Failed to process purchase return decision")
    }

    await this.linkTrace(traceId, "purchase_return", purchaseReturnId, "purchase_return", DECISION_EVENT)
    if (purchaseReturn.bill_id) {
      await this.linkTrace(traceId, "bill", purchaseReturn.bill_id, "bill", DECISION_EVENT)
    }

    return await this.buildResultFromReturn(purchaseReturnId, DECISION_EVENT, traceId, false)
  }

  async rejectWarehouse(
    actor: ActorContext,
    purchaseReturnId: string,
    reason: string,
    options: { idempotencyKey: string; requestHash: string; uiSurface?: string | null }
  ): Promise<PurchaseReturnCommandResult> {
    const purchaseReturn = await this.loadPurchaseReturn(purchaseReturnId)
    this.assertWarehousePermission(actor, purchaseReturn.warehouse_id)

    const existingTrace = await this.findTraceByIdempotency(actor.companyId, WAREHOUSE_DECISION_EVENT, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      return await this.buildResultFromReturn(purchaseReturnId, WAREHOUSE_DECISION_EVENT, existingTrace.transaction_id, true)
    }

    const traceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "purchase_return",
      sourceId: purchaseReturnId,
      eventType: WAREHOUSE_DECISION_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: {
        action: "REJECT",
        reason,
        ui_surface: options.uiSurface || null,
        bill_id: purchaseReturn.bill_id,
        supplier_id: purchaseReturn.supplier_id,
        branch_id: purchaseReturn.branch_id,
        warehouse_id: purchaseReturn.warehouse_id,
      },
    })

    const response = await this.authSupabase.rpc("reject_warehouse_return", {
      p_purchase_return_id: purchaseReturnId,
      p_rejected_by: actor.actorId,
      p_reason: reason,
    })

    if (response.error || !(response.data as any)?.success) {
      throw new Error(response.error?.message || (response.data as any)?.error || "Failed to reject warehouse purchase return")
    }

    await this.linkTrace(traceId, "purchase_return", purchaseReturnId, "purchase_return", WAREHOUSE_DECISION_EVENT)
    if (purchaseReturn.bill_id) {
      await this.linkTrace(traceId, "bill", purchaseReturn.bill_id, "bill", WAREHOUSE_DECISION_EVENT)
    }

    return await this.buildResultFromReturn(purchaseReturnId, WAREHOUSE_DECISION_EVENT, traceId, false)
  }

  async confirmDelivery(
    actor: ActorContext,
    purchaseReturnId: string,
    command: ConfirmPurchaseReturnCommand,
    options: { idempotencyKey: string; requestHash: string }
  ): Promise<PurchaseReturnCommandResult> {
    if (command.allocationId) {
      return await this.confirmAllocation(actor, purchaseReturnId, command, options)
    }

    const purchaseReturn = await this.loadPurchaseReturn(purchaseReturnId)
    this.assertWarehousePermission(actor, purchaseReturn.warehouse_id)

    const existingTrace = await this.findTraceByIdempotency(actor.companyId, PURCHASE_RETURN_EVENT, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      return await this.buildResultFromReturn(purchaseReturnId, PURCHASE_RETURN_EVENT, existingTrace.transaction_id, true)
    }

    await requireOpenFinancialPeriod(actor.companyId, purchaseReturn.return_date || new Date().toISOString().slice(0, 10))

    const alreadyCompleted = ["completed", "confirmed"].includes(workflowState(purchaseReturn.workflow_status))
    if (!alreadyCompleted) {
      const response = await this.authSupabase.rpc("confirm_purchase_return_delivery_v2", {
        p_purchase_return_id: purchaseReturnId,
        p_confirmed_by: actor.actorId,
        p_notes: command.notes || null,
      })

      if (response.error) {
        throw new Error(response.error.message || "Failed to confirm purchase return delivery")
      }

      await this.adminSupabase
        .from("purchase_returns")
        .update({ confirmed_by: actor.actorId, confirmed_at: new Date().toISOString() })
        .eq("id", purchaseReturnId)
        .is("confirmed_by", null)
    }

    const refreshed = await this.loadPurchaseReturn(purchaseReturnId)
    const artifacts = await this.fetchPostingArtifactsForReturn(actor.companyId, refreshed)
    const traceId = await this.ensurePostingTrace(
      {
        companyId: actor.companyId,
        actorId: actor.actorId,
        eventType: PURCHASE_RETURN_EVENT,
        sourceEntity: "purchase_return",
        sourceId: purchaseReturnId,
        idempotencyKey: options.idempotencyKey,
        requestHash: options.requestHash,
        metadata: {
          bill_id: refreshed.bill_id,
          supplier_id: refreshed.supplier_id,
          branch_id: refreshed.branch_id,
          warehouse_id: refreshed.warehouse_id,
          cost_center_id: refreshed.cost_center_id,
          ui_surface: command.uiSurface || null,
          adopted_existing_posting: alreadyCompleted,
        },
      },
      artifacts,
      refreshed.bill_id ? [{ entityType: "bill", entityId: refreshed.bill_id, linkRole: "bill" }] : []
    )

    if (artifacts.vendorCreditId) {
      await this.ensureVendorCreditTrace({
        companyId: actor.companyId,
        actorId: actor.actorId,
        sourceEntity: "purchase_return",
        sourceId: purchaseReturnId,
        idempotencyKey: `${options.idempotencyKey}:vendor-credit`,
        requestHash: options.requestHash,
        vendorCreditId: artifacts.vendorCreditId,
        purchaseReturnId,
        billId: refreshed.bill_id,
        journalEntryId: refreshed.journal_entry_id,
        metadata: {
          supplier_id: refreshed.supplier_id,
          ui_surface: command.uiSurface || null,
          adopted_existing_posting: alreadyCompleted,
        },
      })
    }

    return await this.buildResultFromReturn(
      purchaseReturnId,
      PURCHASE_RETURN_EVENT,
      traceId,
      alreadyCompleted,
      alreadyCompleted
    )
  }

  async recordRefundReceipt(
    actor: ActorContext,
    purchaseReturnId: string,
    notes: string | null,
    options: { idempotencyKey: string; requestHash: string; uiSurface?: string | null }
  ): Promise<PurchaseReturnCommandResult> {
    if (!isPrivilegedRole(actor.actorRole)) {
      throw new Error("Only privileged roles can record purchase return refund receipts")
    }

    const purchaseReturn = await this.loadPurchaseReturn(purchaseReturnId)
    const existingTrace = await this.findTraceByIdempotency(actor.companyId, PURCHASE_RETURN_REFUND_EVENT, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      return await this.buildResultFromReturn(purchaseReturnId, PURCHASE_RETURN_REFUND_EVENT, existingTrace.transaction_id, true)
    }

    const alreadyRecorded =
      workflowState(purchaseReturn.workflow_status) === "closed" &&
      workflowState(purchaseReturn.financial_status) === "refund_recorded"

    const traceNotes = notes || null
    let refreshed = purchaseReturn

    if (!alreadyRecorded) {
      const updatedNotes = `${purchaseReturn.reason || ""}${traceNotes ? ` | استلام الاسترداد: ${traceNotes}` : " | تم استلام الاسترداد"}`

      const { error } = await this.adminSupabase
        .from("purchase_returns")
        .update({
          status: "closed",
          workflow_status: "closed",
          financial_status: "refund_recorded",
          notes: updatedNotes,
        })
        .eq("id", purchaseReturnId)
        .eq("company_id", actor.companyId)

      if (error) {
        throw new Error(error.message || "Failed to record purchase return refund receipt")
      }

      refreshed = await this.loadPurchaseReturn(purchaseReturnId)

      try {
        await this.adminSupabase.from("audit_logs").insert({
          company_id: actor.companyId,
          user_id: actor.actorId,
          action: "purchase_return_refund_received",
          entity: "purchase_return",
          entity_id: purchaseReturnId,
          new_data: {
            return_number: refreshed.return_number,
            total_amount: refreshed.total_amount,
            settlement_method: refreshed.settlement_method,
            notes: traceNotes,
            recorded_by: actor.actorId,
            timestamp: new Date().toISOString(),
          },
        })
      } catch (auditError) {
        console.warn("[PURCHASE_RETURN_REFUND_AUDIT]", auditError)
      }

      try {
        await this.adminSupabase.rpc("emit_system_event_manual", {
          p_company_id: actor.companyId,
          p_event_type: "purchase_return.closed",
          p_reference_type: "purchase_return",
          p_reference_id: purchaseReturnId,
          p_user_id: actor.actorId,
          p_payload: { return_number: refreshed.return_number },
        })
      } catch (eventError) {
        console.warn("[PURCHASE_RETURN_REFUND_EVENT]", eventError)
      }
    }

    const vendorCreditId = await this.findVendorCreditId(purchaseReturnId)
    const traceId = await this.createTrace({
      companyId: actor.companyId,
      sourceEntity: "purchase_return",
      sourceId: purchaseReturnId,
      eventType: PURCHASE_RETURN_REFUND_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: {
        bill_id: refreshed.bill_id,
        supplier_id: refreshed.supplier_id,
        branch_id: refreshed.branch_id,
        warehouse_id: refreshed.warehouse_id,
        cost_center_id: refreshed.cost_center_id,
        settlement_method: refreshed.settlement_method,
        ui_surface: options.uiSurface || null,
        notes: traceNotes,
        adopted_existing_posting: alreadyRecorded,
      },
    })

    await this.linkTrace(traceId, "purchase_return", purchaseReturnId, "purchase_return", PURCHASE_RETURN_REFUND_EVENT)
    if (refreshed.bill_id) {
      await this.linkTrace(traceId, "bill", refreshed.bill_id, "bill", PURCHASE_RETURN_REFUND_EVENT)
    }
    if (vendorCreditId) {
      await this.linkTrace(traceId, "vendor_credit", vendorCreditId, "vendor_credit", PURCHASE_RETURN_REFUND_EVENT)
    }

    return await this.buildResultFromReturn(
      purchaseReturnId,
      PURCHASE_RETURN_REFUND_EVENT,
      traceId,
      alreadyRecorded,
      alreadyRecorded
    )
  }

  private async confirmAllocation(
    actor: ActorContext,
    purchaseReturnId: string,
    command: ConfirmPurchaseReturnCommand,
    options: { idempotencyKey: string; requestHash: string }
  ) {
    const allocation = await this.loadAllocation(command.allocationId!)
    if (allocation.purchase_return_id !== purchaseReturnId) {
      throw new Error("Allocation does not belong to the specified purchase return")
    }

    this.assertWarehousePermission(actor, allocation.warehouse_id)

    const purchaseReturn = await this.loadPurchaseReturn(purchaseReturnId)
    const existingTrace = await this.findTraceByIdempotency(actor.companyId, PURCHASE_RETURN_ALLOCATION_EVENT, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different request payload")
      }

      return await this.buildResultFromReturn(purchaseReturnId, PURCHASE_RETURN_ALLOCATION_EVENT, existingTrace.transaction_id, true)
    }

    await requireOpenFinancialPeriod(actor.companyId, purchaseReturn.return_date || new Date().toISOString().slice(0, 10))

    const alreadyConfirmed = workflowState(allocation.workflow_status) === "confirmed"
    if (!alreadyConfirmed) {
      const response = await this.authSupabase.rpc("confirm_warehouse_allocation", {
        p_allocation_id: allocation.id,
        p_confirmed_by: actor.actorId,
        p_notes: command.notes || null,
      })

      if (response.error) {
        throw new Error(response.error.message || "Failed to confirm purchase return allocation")
      }
    }

    const refreshedAllocation = await this.loadAllocation(allocation.id)
    const refreshedReturn = await this.loadPurchaseReturn(purchaseReturnId)
    const artifacts = await this.fetchPostingArtifactsForAllocation(actor.companyId, refreshedReturn, refreshedAllocation)

    const traceId = await this.ensurePostingTrace(
      {
        companyId: actor.companyId,
        actorId: actor.actorId,
        eventType: PURCHASE_RETURN_ALLOCATION_EVENT,
        sourceEntity: "purchase_return_allocation",
        sourceId: allocation.id,
        idempotencyKey: options.idempotencyKey,
        requestHash: options.requestHash,
        metadata: {
          purchase_return_id: purchaseReturnId,
          allocation_id: allocation.id,
          bill_id: refreshedReturn.bill_id,
          supplier_id: refreshedReturn.supplier_id,
          branch_id: refreshedAllocation.branch_id,
          warehouse_id: refreshedAllocation.warehouse_id,
          cost_center_id: refreshedAllocation.cost_center_id,
          ui_surface: command.uiSurface || null,
          adopted_existing_posting: alreadyConfirmed,
        },
      },
      artifacts,
      [
        { entityType: "purchase_return", entityId: purchaseReturnId, linkRole: "purchase_return" },
        refreshedReturn.bill_id ? { entityType: "bill", entityId: refreshedReturn.bill_id, linkRole: "bill" } : null,
        { entityType: "purchase_return_allocation", entityId: allocation.id, linkRole: "allocation" },
      ].filter(Boolean) as Array<{ entityType: string; entityId: string; linkRole: string }>
    )

    if (artifacts.vendorCreditId) {
      await this.ensureVendorCreditTrace({
        companyId: actor.companyId,
        actorId: actor.actorId,
        sourceEntity: "purchase_return_allocation",
        sourceId: allocation.id,
        idempotencyKey: `${options.idempotencyKey}:vendor-credit`,
        requestHash: options.requestHash,
        vendorCreditId: artifacts.vendorCreditId,
        purchaseReturnId,
        billId: refreshedReturn.bill_id,
        journalEntryId: refreshedAllocation.journal_entry_id,
        allocationId: allocation.id,
        metadata: {
          supplier_id: refreshedReturn.supplier_id,
          ui_surface: command.uiSurface || null,
          adopted_existing_posting: alreadyConfirmed,
        },
      })
    }

    return await this.buildResultFromReturn(
      purchaseReturnId,
      PURCHASE_RETURN_ALLOCATION_EVENT,
      traceId,
      alreadyConfirmed,
      alreadyConfirmed
    )
  }

  private assertWarehousePermission(actor: ActorContext, warehouseId: string | null) {
    if (isPrivilegedRole(actor.actorRole)) return
    if (isStoreManagerRole(actor.actorRole) && actor.actorWarehouseId && actor.actorWarehouseId === warehouseId) {
      return
    }
    throw new Error("You do not have permission to process this warehouse return step")
  }

  private async buildResultFromReturn(
    purchaseReturnId: string,
    eventType: string,
    transactionId: string | null,
    cached: boolean,
    adoptedExistingPosting = false
  ): Promise<PurchaseReturnCommandResult> {
    const purchaseReturn = await this.loadPurchaseReturn(purchaseReturnId)
    const allocationIds = await this.getAllocationIds(purchaseReturnId)

    let journalEntryIds: string[] = []
    let inventoryTransactionIds: string[] = []
    let vendorCreditId: string | null = null

    if (eventType === PURCHASE_RETURN_EVENT || eventType === PURCHASE_RETURN_ALLOCATION_EVENT) {
      const artifacts = await this.fetchPostingArtifactsForReturn(purchaseReturn.company_id, purchaseReturn)
      journalEntryIds = artifacts.journalEntryIds
      inventoryTransactionIds = artifacts.inventoryTransactionIds
      vendorCreditId = artifacts.vendorCreditId
    } else {
      journalEntryIds = dedupe([purchaseReturn.journal_entry_id])
      vendorCreditId = await this.findVendorCreditId(purchaseReturnId)
    }

    return {
      success: true,
      cached,
      eventType,
      transactionId,
      purchaseReturnId,
      status: asString(purchaseReturn.status || "pending_approval"),
      workflowStatus: asString(purchaseReturn.workflow_status || "pending_admin_approval"),
      financialStatus: purchaseReturn.financial_status || null,
      journalEntryIds,
      inventoryTransactionIds,
      vendorCreditId,
      allocationIds,
      adoptedExistingPosting,
    }
  }

  private async fetchPostingArtifactsForReturn(companyId: string, purchaseReturn: PurchaseReturnRow): Promise<PostingArtifacts> {
    const [inventoryTransactions, vendorCreditId] = await Promise.all([
      this.adminSupabase
        .from("inventory_transactions")
        .select("id")
        .eq("company_id", companyId)
        .eq("reference_type", "purchase_return")
        .eq("reference_id", purchaseReturn.id)
        .eq("transaction_type", "purchase_return")
        .eq("is_deleted", false),
      this.findVendorCreditId(purchaseReturn.id),
    ])

    return {
      journalEntryIds: dedupe([purchaseReturn.journal_entry_id]),
      inventoryTransactionIds: (inventoryTransactions.data || []).map((row: any) => asString(row.id)).filter(Boolean),
      vendorCreditId,
    }
  }

  private async fetchPostingArtifactsForAllocation(companyId: string, purchaseReturn: PurchaseReturnRow, allocation: AllocationRow): Promise<PostingArtifacts> {
    const [inventoryTransactions, vendorCreditId] = await Promise.all([
      this.adminSupabase
        .from("inventory_transactions")
        .select("id")
        .eq("company_id", companyId)
        .eq("reference_type", "purchase_return")
        .eq("reference_id", purchaseReturn.id)
        .eq("transaction_type", "purchase_return")
        .eq("journal_entry_id", allocation.journal_entry_id)
        .eq("warehouse_id", allocation.warehouse_id)
        .eq("is_deleted", false),
      this.findVendorCreditId(purchaseReturn.id),
    ])

    return {
      journalEntryIds: dedupe([allocation.journal_entry_id]),
      inventoryTransactionIds: (inventoryTransactions.data || []).map((row: any) => asString(row.id)).filter(Boolean),
      vendorCreditId,
    }
  }

  private async ensurePostingTrace(
    params: {
      companyId: string
      actorId: string
      eventType: string
      sourceEntity: string
      sourceId: string
      idempotencyKey: string
      requestHash: string
      metadata: Record<string, unknown>
    },
    artifacts: PostingArtifacts,
    extraLinks: Array<{ entityType: string; entityId: string; linkRole: string }>
  ) {
    const existing = await this.findTraceBySource(params.companyId, params.sourceEntity, params.sourceId, params.eventType)
    if (existing?.transaction_id) {
      return existing.transaction_id
    }

    const traceId = await this.createTrace({
      companyId: params.companyId,
      sourceEntity: params.sourceEntity,
      sourceId: params.sourceId,
      eventType: params.eventType,
      actorId: params.actorId,
      idempotencyKey: params.idempotencyKey,
      requestHash: params.requestHash,
      metadata: params.metadata,
    })

    for (const link of extraLinks) {
      await this.linkTrace(traceId, link.entityType, link.entityId, link.linkRole, params.eventType)
    }

    for (const journalEntryId of artifacts.journalEntryIds) {
      await this.linkTrace(traceId, "journal_entry", journalEntryId, "journal_entry", params.eventType)
    }

    for (const inventoryTransactionId of artifacts.inventoryTransactionIds) {
      await this.linkTrace(traceId, "inventory_transaction", inventoryTransactionId, "inventory_transaction", params.eventType)
    }

    if (artifacts.vendorCreditId) {
      await this.linkTrace(traceId, "vendor_credit", artifacts.vendorCreditId, "vendor_credit", params.eventType)
    }

    return traceId
  }

  private async ensureVendorCreditTrace(params: {
    companyId: string
    actorId: string
    sourceEntity: string
    sourceId: string
    idempotencyKey: string
    requestHash: string
    vendorCreditId: string
    purchaseReturnId: string
    billId?: string | null
    journalEntryId?: string | null
    allocationId?: string | null
    metadata?: Record<string, unknown>
  }) {
    const existing = await this.findTraceBySource(params.companyId, params.sourceEntity, params.sourceId, VENDOR_CREDIT_EVENT)
    if (existing?.transaction_id) {
      return existing.transaction_id
    }

    const traceId = await this.createTrace({
      companyId: params.companyId,
      sourceEntity: params.sourceEntity,
      sourceId: params.sourceId,
      eventType: VENDOR_CREDIT_EVENT,
      actorId: params.actorId,
      idempotencyKey: params.idempotencyKey,
      requestHash: params.requestHash,
      metadata: {
        purchase_return_id: params.purchaseReturnId,
        allocation_id: params.allocationId || null,
        bill_id: params.billId || null,
        vendor_credit_id: params.vendorCreditId,
        ...(params.metadata || {}),
      },
    })

    await this.linkTrace(traceId, "vendor_credit", params.vendorCreditId, "vendor_credit", VENDOR_CREDIT_EVENT)
    await this.linkTrace(traceId, "purchase_return", params.purchaseReturnId, "purchase_return", VENDOR_CREDIT_EVENT)
    if (params.allocationId) {
      await this.linkTrace(traceId, "purchase_return_allocation", params.allocationId, "allocation", VENDOR_CREDIT_EVENT)
    }
    if (params.billId) {
      await this.linkTrace(traceId, "bill", params.billId, "bill", VENDOR_CREDIT_EVENT)
    }
    if (params.journalEntryId) {
      await this.linkTrace(traceId, "journal_entry", params.journalEntryId, "journal_entry", VENDOR_CREDIT_EVENT)
    }

    return traceId
  }

  private async loadPurchaseReturn(purchaseReturnId: string): Promise<PurchaseReturnRow> {
    const { data, error } = await this.adminSupabase
      .from("purchase_returns")
      .select(`
        id,
        company_id,
        supplier_id,
        bill_id,
        return_number,
        return_date,
        status,
        workflow_status,
        financial_status,
        branch_id,
        cost_center_id,
        warehouse_id,
        created_by,
        journal_entry_id,
        settlement_method,
        total_amount,
        reason,
        notes
      `)
      .eq("id", purchaseReturnId)
      .maybeSingle()

    if (error || !data) {
      throw new Error(error?.message || "Purchase return not found")
    }

    return data as PurchaseReturnRow
  }

  private async loadAllocation(allocationId: string): Promise<AllocationRow> {
    const { data, error } = await this.adminSupabase
      .from("purchase_return_warehouse_allocations")
      .select(`
        id,
        company_id,
        purchase_return_id,
        warehouse_id,
        branch_id,
        cost_center_id,
        journal_entry_id,
        workflow_status,
        total_amount,
        confirmed_by,
        confirmed_at
      `)
      .eq("id", allocationId)
      .maybeSingle()

    if (error || !data) {
      throw new Error(error?.message || "Purchase return allocation not found")
    }

    return data as AllocationRow
  }

  private async getAllocationIds(purchaseReturnId: string) {
    const { data, error } = await this.adminSupabase
      .from("purchase_return_warehouse_allocations")
      .select("id")
      .eq("purchase_return_id", purchaseReturnId)

    if (error) return []
    return (data || []).map((row: any) => asString(row.id)).filter(Boolean)
  }

  private async findVendorCreditId(purchaseReturnId: string) {
    const { data, error } = await this.adminSupabase
      .from("vendor_credits")
      .select("id")
      .eq("source_purchase_return_id", purchaseReturnId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data?.id) return null
    return asString(data.id)
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

    return asString(data)
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

  private async findTraceBySource(companyId: string, sourceEntity: string, sourceId: string, eventType: string): Promise<TraceRecord | null> {
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
      .limit(1)
      .maybeSingle()

    if (error || !data?.entity_id) return null
    return asString(data.entity_id)
  }
}

export {
  CREATE_COMMAND_EVENT,
  DECISION_EVENT,
  WAREHOUSE_DECISION_EVENT,
  PURCHASE_RETURN_EVENT,
  PURCHASE_RETURN_ALLOCATION_EVENT,
  VENDOR_CREDIT_EVENT,
  PURCHASE_RETURN_REFUND_EVENT,
  isPrivilegedRole,
}
