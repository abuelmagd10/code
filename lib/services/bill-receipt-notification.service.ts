import {
  buildNotificationEventKey,
  normalizeNotificationKeySegment,
  normalizeNotificationSeverity,
} from "@/lib/notification-workflow"
import {
  buildNotificationRecipientScopeSegments,
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from "@/lib/services/notification-recipient-resolver.service"

type SupabaseLike = any

type BillReceiptNotificationActor = {
  companyId: string
  actorId: string
}

export type BillReceiptNotificationBill = {
  id: string
  bill_number: string | null
  branch_id: string | null
  warehouse_id: string | null
  cost_center_id: string | null
  purchase_order_id: string | null
  created_by?: string | null
  created_by_user_id?: string | null
}

type NotificationPayload = {
  referenceType: string
  referenceId: string
  title: string
  message: string
  branchId?: string | null
  warehouseId?: string | null
  costCenterId?: string | null
  assignedToRole?: string | null
  assignedToUser?: string | null
  priority?: "low" | "normal" | "high" | "urgent"
  eventKey: string
  severity?: "info" | "warning" | "error" | "critical"
  category?: "finance" | "inventory" | "sales" | "approvals" | "system"
}

export type BillReceiptNotificationIntent = NotificationPayload & {
  eventDomain: "procurement"
  eventAction: "warehouse_receipt_confirmed"
  recipient: ResolvedNotificationRecipient
  recipientScopeSegments: string[]
}

function cleanScope(value: string | null | undefined) {
  return value || null
}

function eventCycle(cycleKey: string | null | undefined) {
  return normalizeNotificationKeySegment(cycleKey || "current")
}

function buildConfirmedRoleIntent(
  bill: BillReceiptNotificationBill,
  recipient: ResolvedNotificationRecipient,
  cycle: string
): BillReceiptNotificationIntent {
  const recipientScopeSegments = buildNotificationRecipientScopeSegments(recipient)

  return {
    eventDomain: "procurement",
    eventAction: "warehouse_receipt_confirmed",
    referenceType: "bill",
    referenceId: bill.id,
    title: "تم اعتماد استلام البضاعة وتحديث المخزون",
    message: `تم استلام البضاعة لفاتورة المشتريات رقم ${bill.bill_number || bill.id} وتم تحديث مخزون الفرع.`,
    branchId: recipient.branchId || null,
    warehouseId: recipient.warehouseId || null,
    costCenterId: recipient.costCenterId || null,
    assignedToRole: recipient.kind === "role" ? recipient.role : null,
    assignedToUser: recipient.kind === "user" ? recipient.userId : null,
    priority: "normal",
    eventKey: buildNotificationEventKey(
      "procurement",
      "bill",
      bill.id,
      "warehouse_receipt_confirmed",
      ...recipientScopeSegments,
      cycle
    ),
    severity: "info",
    category: "inventory",
    recipient,
    recipientScopeSegments,
  }
}

function buildConfirmedCreatorIntent(
  bill: BillReceiptNotificationBill,
  recipient: ResolvedNotificationRecipient,
  cycle: string
): BillReceiptNotificationIntent {
  const recipientScopeSegments = buildNotificationRecipientScopeSegments(recipient)

  return {
    eventDomain: "procurement",
    eventAction: "warehouse_receipt_confirmed",
    referenceType: "bill",
    referenceId: bill.id,
    title: "أمر شرائك: تم استلام البضاعة وتحديث المخزون",
    message: `تم استلام البضاعة وتحديث المخزون بنجاح لفاتورة المشتريات رقم ${bill.bill_number || bill.id}.`,
    branchId: recipient.branchId || null,
    warehouseId: recipient.warehouseId || null,
    costCenterId: recipient.costCenterId || null,
    assignedToRole: recipient.kind === "role" ? recipient.role : null,
    assignedToUser: recipient.kind === "user" ? recipient.userId : null,
    priority: "normal",
    eventKey: buildNotificationEventKey(
      "procurement",
      "bill",
      bill.id,
      "warehouse_receipt_confirmed",
      ...recipientScopeSegments,
      cycle
    ),
    severity: "info",
    category: "inventory",
    recipient,
    recipientScopeSegments,
  }
}

export function buildBillReceiptConfirmedNotificationIntents(input: {
  resolver: Pick<
    NotificationRecipientResolverService,
    "resolveRoleRecipients" | "resolveUserRecipient"
  >
  bill: BillReceiptNotificationBill
  cycleKey: string | null
  actorId?: string | null
  purchaseOrderCreatorUserId?: string | null
}): BillReceiptNotificationIntent[] {
  const cycle = eventCycle(input.cycleKey)
  const intents: BillReceiptNotificationIntent[] = []

  for (const recipient of input.resolver.resolveRoleRecipients(
    ["accountant", "manager"],
    input.bill.branch_id,
    input.bill.warehouse_id,
    input.bill.cost_center_id
  )) {
    intents.push(buildConfirmedRoleIntent(input.bill, recipient, cycle))
  }

  for (const recipient of input.resolver.resolveRoleRecipients(
    ["owner", "general_manager"],
    null,
    null,
    null
  )) {
    intents.push(buildConfirmedRoleIntent(input.bill, recipient, cycle))
  }

  if (
    input.purchaseOrderCreatorUserId &&
    input.purchaseOrderCreatorUserId !== input.actorId
  ) {
    intents.push(
      buildConfirmedCreatorIntent(
        input.bill,
        input.resolver.resolveUserRecipient(
          input.purchaseOrderCreatorUserId,
          null,
          null,
          null,
          null
        ),
        cycle
      )
    )
  }

  const seen = new Set<string>()
  return intents.filter((intent) => {
    if (seen.has(intent.eventKey)) return false
    seen.add(intent.eventKey)
    return true
  })
}

export class BillReceiptNotificationService {
  constructor(private supabase: SupabaseLike) {}

  async notifySubmittedForReceipt(
    actor: BillReceiptNotificationActor,
    bill: BillReceiptNotificationBill,
    cycleKey: string | null
  ) {
    const cycle = eventCycle(cycleKey)
    await this.createNotification(actor, {
      referenceType: "bill",
      referenceId: bill.id,
      title: "مطلوب اعتماد استلام البضاعة",
      message: `فاتورة المشتريات رقم ${bill.bill_number || bill.id} بانتظار اعتماد الاستلام في المخزن. يرجى مراجعة واعتماد استلام البضاعة.`,
      branchId: bill.branch_id,
      warehouseId: bill.warehouse_id,
      costCenterId: bill.cost_center_id,
      assignedToRole: "store_manager",
      priority: "high",
      eventKey: buildNotificationEventKey(
        "procurement",
        "bill",
        bill.id,
        "warehouse_receipt_pending",
        "role",
        "store_manager",
        cycle
      ),
      severity: "warning",
      category: "inventory",
    })
  }

  async notifyReceiptRejected(
    actor: BillReceiptNotificationActor,
    bill: BillReceiptNotificationBill,
    rejectionReason: string,
    cycleKey: string | null
  ) {
    const cycle = eventCycle(cycleKey)
    const title = "تم رفض استلام البضاعة"
    const message = `تم رفض استلام البضاعة للفاتورة رقم ${bill.bill_number || bill.id}. السبب: ${rejectionReason}`
    const targetUserId = await this.resolvePurchaseOrderCreator(bill) || bill.created_by_user_id || bill.created_by || null

    if (targetUserId) {
      await this.createNotification(actor, {
        referenceType: "bill",
        referenceId: bill.id,
        title,
        message,
        branchId: bill.branch_id,
        warehouseId: bill.warehouse_id,
        costCenterId: bill.cost_center_id,
        assignedToUser: targetUserId,
        priority: "high",
        eventKey: buildNotificationEventKey(
          "procurement",
          "bill",
          bill.id,
          "warehouse_receipt_rejected",
          "user",
          targetUserId,
          cycle
        ),
        severity: "error",
        category: "inventory",
      })
    }

    for (const role of ["owner", "general_manager"]) {
      await this.createNotification(actor, {
        referenceType: "bill",
        referenceId: bill.id,
        title,
        message,
        branchId: bill.branch_id,
        warehouseId: bill.warehouse_id,
        costCenterId: bill.cost_center_id,
        assignedToRole: role,
        priority: "high",
        eventKey: buildNotificationEventKey(
          "procurement",
          "bill",
          bill.id,
          "warehouse_receipt_rejected",
          "role",
          role,
          cycle
        ),
        severity: "error",
        category: "inventory",
      })
    }
  }

  async notifyBillAdminRejected(
    actor: BillReceiptNotificationActor,
    bill: BillReceiptNotificationBill,
    rejectionReason: string,
    cycleKey: string | null
  ) {
    const cycle = eventCycle(cycleKey)
    const title = "تم رفض فاتورة المشتريات"
    const message = `تم رفض فاتورة المشتريات رقم ${bill.bill_number || bill.id}. السبب: ${rejectionReason}`
    const creatorUserId = bill.created_by_user_id || bill.created_by || null

    if (creatorUserId) {
      await this.createNotification(actor, {
        referenceType: "bill",
        referenceId: bill.id,
        title,
        message,
        branchId: bill.branch_id,
        warehouseId: bill.warehouse_id,
        costCenterId: bill.cost_center_id,
        assignedToUser: creatorUserId,
        priority: "high",
        eventKey: buildNotificationEventKey(
          "procurement",
          "bill",
          bill.id,
          "admin_rejected",
          "user",
          creatorUserId,
          cycle
        ),
        severity: "error",
        category: "approvals",
      })
    }

    await this.createNotification(actor, {
      referenceType: "bill",
      referenceId: bill.id,
      title,
      message,
      branchId: bill.branch_id,
      warehouseId: bill.warehouse_id,
      costCenterId: bill.cost_center_id,
      assignedToRole: "accountant",
      priority: "high",
      eventKey: buildNotificationEventKey(
        "procurement",
        "bill",
        bill.id,
        "admin_rejected",
        "role",
        "accountant",
        cycle
      ),
      severity: "error",
      category: "approvals",
    })
  }

  async notifyApprovalRestartAfterReceiptRejection(
    actor: BillReceiptNotificationActor,
    bill: BillReceiptNotificationBill,
    cycleKey: string | null
  ) {
    const cycle = eventCycle(cycleKey)
    const title = "تعديل الفاتورة بانتظار الاعتماد"
    const message = `تم تعديل فاتورة المشتريات رقم ${bill.bill_number || bill.id} بعد رفض الاستلام وبانتظار اعتمادكم`

    for (const role of ["owner", "general_manager"]) {
      await this.createNotification(actor, {
        referenceType: "bill",
        referenceId: bill.id,
        title,
        message,
        branchId: null,
        warehouseId: null,
        costCenterId: null,
        assignedToRole: role,
        priority: "high",
        eventKey: buildNotificationEventKey(
          "procurement",
          "bill",
          bill.id,
          "approval_restart_after_receipt_rejection",
          "role",
          role,
          cycle
        ),
        severity: "warning",
        category: "approvals",
      })
    }
  }

  async notifyBillApprovedToPurchaseOrderCreator(
    actor: BillReceiptNotificationActor,
    bill: BillReceiptNotificationBill,
    cycleKey: string | null,
    appLang: "ar" | "en" = "ar"
  ) {
    if (!bill.purchase_order_id) return

    const purchaseOrderInfo = await this.loadPurchaseOrderInfo(bill.purchase_order_id)
    if (!purchaseOrderInfo?.createdByUserId) return

    const cycle = eventCycle(cycleKey)
    await this.createNotification(actor, {
      referenceType: "bill",
      referenceId: bill.id,
      title:
        appLang === "en"
          ? `Purchase Bill #${bill.bill_number || bill.id} Approved`
          : `تم اعتماد فاتورة الشراء #${bill.bill_number || bill.id}`,
      message:
        appLang === "en"
          ? `Your purchase bill #${bill.bill_number || bill.id} linked to PO #${purchaseOrderInfo.poNumber || bill.purchase_order_id} has been approved by management and is ready for inventory receipt.`
          : `تم اعتماد فاتورة الشراء رقم ${bill.bill_number || bill.id} المرتبطة بأمر الشراء ${purchaseOrderInfo.poNumber || bill.purchase_order_id} من قبل الإدارة وأصبحت جاهزة لاستلام المخزون.`,
      branchId: bill.branch_id,
      warehouseId: bill.warehouse_id,
      costCenterId: bill.cost_center_id,
      assignedToUser: purchaseOrderInfo.createdByUserId,
      priority: "normal",
      eventKey: buildNotificationEventKey(
        "procurement",
        "bill",
        bill.id,
        "admin_approved_po_creator_notified",
        "user",
        purchaseOrderInfo.createdByUserId,
        cycle
      ),
      severity: "info",
      category: "approvals",
    })
  }

  async notifyReceiptConfirmed(
    actor: BillReceiptNotificationActor,
    bill: BillReceiptNotificationBill,
    cycleKey: string | null
  ) {
    const poCreatorId = await this.resolvePurchaseOrderCreator(bill)
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const intents = buildBillReceiptConfirmedNotificationIntents({
      resolver,
      bill,
      cycleKey,
      actorId: actor.actorId,
      purchaseOrderCreatorUserId: poCreatorId,
    })

    for (const intent of intents) {
      await this.createNotification(actor, intent)
    }
  }

  private async resolvePurchaseOrderCreator(bill: BillReceiptNotificationBill): Promise<string | null> {
    if (!bill.purchase_order_id) return null

    const info = await this.loadPurchaseOrderInfo(bill.purchase_order_id)
    return info?.createdByUserId || null
  }

  private async loadPurchaseOrderInfo(purchaseOrderId: string): Promise<{ createdByUserId: string | null; poNumber: string | null } | null> {
    const { data, error } = await this.supabase
      .from("purchase_orders")
      .select("created_by_user_id, po_number")
      .eq("id", purchaseOrderId)
      .maybeSingle()

    if (error) {
      console.warn("[BILL_RECEIPT_NOTIFICATION] Failed to resolve purchase-order info:", error.message)
      return null
    }

    return {
      createdByUserId: data?.created_by_user_id || null,
      poNumber: data?.po_number || null,
    }
  }

  private async createNotification(actor: BillReceiptNotificationActor, payload: NotificationPayload) {
    const { error } = await this.supabase.rpc("create_notification", {
      p_company_id: actor.companyId,
      p_reference_type: payload.referenceType,
      p_reference_id: payload.referenceId,
      p_title: payload.title,
      p_message: payload.message,
      p_created_by: actor.actorId,
      p_branch_id: cleanScope(payload.branchId),
      p_cost_center_id: cleanScope(payload.costCenterId),
      p_warehouse_id: cleanScope(payload.warehouseId),
      p_assigned_to_role: payload.assignedToRole || null,
      p_assigned_to_user: payload.assignedToUser || null,
      p_priority: payload.priority || "normal",
      p_event_key: payload.eventKey,
      p_severity: normalizeNotificationSeverity(payload.severity),
      p_category: payload.category || "system",
    })

    if (error) {
      console.warn("[BILL_RECEIPT_NOTIFICATION] Notification dispatch failed:", error.message)
    }
  }
}
