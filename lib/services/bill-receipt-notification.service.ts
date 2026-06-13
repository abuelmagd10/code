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
  // v3.74.141 — set by /bills/[id]/edit on save. Used as the primary
  // target for bill-edit rejection notifications so the actual editor
  // (typically the accountant) gets the rejection rather than the PO
  // creator.
  last_edited_by_user_id?: string | null
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

  // v3.74.138 — Per spec the receipt-confirmation recipients are:
  // owner + manager (company-wide) + accountant (branch-scoped, no cost
  // center filter) + PO creator. Dropped general_manager (duplication via
  // role inheritance) and dropped cost_center scope from accountant/manager
  // (silent filter that hid the row when member.cost_center diverged from
  // bill.cost_center).
  for (const recipient of input.resolver.resolveRoleRecipients(
    ["accountant"],
    input.bill.branch_id,
    input.bill.warehouse_id,
    null
  )) {
    intents.push(buildConfirmedRoleIntent(input.bill, recipient, cycle))
  }

  for (const recipient of input.resolver.resolveRoleRecipients(
    ["owner", "manager"],
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
    // v3.74.138 — dropped cost_center_id from the store_manager role scope.
    // Same v3.74.136 silent-filter bug pattern: branch + warehouse is the
    // correct governance for store_manager visibility; cost_center on the
    // member record commonly differs from the bill's and used to hide the
    // "بانتظار الاستلام" ping from the very person who needs to act.
    await this.createNotification(actor, {
      referenceType: "bill",
      referenceId: bill.id,
      title: "مطلوب اعتماد استلام البضاعة",
      message: `فاتورة المشتريات رقم ${bill.bill_number || bill.id} بانتظار اعتماد الاستلام في المخزن. يرجى مراجعة واعتماد استلام البضاعة.`,
      branchId: bill.branch_id,
      warehouseId: bill.warehouse_id,
      costCenterId: null,
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
    // v3.74.138 — Resolve the ACTUAL PO creator (not the bill creator).
    // bills.created_by_user_id is the owner who approved the PO when the
    // bill was auto-created, so falling back to it pings the wrong person.
    // Only use the PO creator; if there's no PO link, fall back to the
    // bill creator.
    const poCreatorId = await this.resolvePurchaseOrderCreator(bill)
    const targetUserId = poCreatorId || bill.created_by_user_id || bill.created_by || null

    if (targetUserId && targetUserId !== actor.actorId) {
      await this.createNotification(actor, {
        referenceType: "bill",
        referenceId: bill.id,
        title,
        message,
        branchId: bill.branch_id,
        warehouseId: bill.warehouse_id,
        costCenterId: null,
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

    // v3.74.138 — Per the product spec the recipients on receipt rejection
    // are owner + manager + accountant + PO creator. Dropped admin and
    // general_manager (caused inbox duplication via role inheritance on the
    // owner row, same as v3.74.133). Added accountant. Owner + manager are
    // company-wide (no branch/warehouse scope); accountant is scoped to the
    // bill's branch + warehouse only, no cost_center filter (same fix as
    // v3.74.136).
    const roleRecipients: Array<{
      role: string
      branchId: string | null
      warehouseId: string | null
    }> = [
      { role: "owner", branchId: null, warehouseId: null },
      { role: "manager", branchId: null, warehouseId: null },
      { role: "accountant", branchId: bill.branch_id, warehouseId: bill.warehouse_id },
    ]

    for (const recipient of roleRecipients) {
      // Skip accountant role ping if the PO creator (already pinged above)
      // is an accountant in the same branch — they'd get two rows otherwise.
      // We can't easily check role here without an extra query; rely on the
      // create_notification dedup safety net (event_key is unique per role).
      await this.createNotification(actor, {
        referenceType: "bill",
        referenceId: bill.id,
        title,
        message,
        branchId: recipient.branchId,
        warehouseId: recipient.warehouseId,
        costCenterId: null,
        assignedToRole: recipient.role,
        priority: "high",
        eventKey: buildNotificationEventKey(
          "procurement",
          "bill",
          bill.id,
          "warehouse_receipt_rejected",
          "role",
          recipient.role,
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

    // v3.74.141 — Recipient priority for bill-edit rejection:
    //   1) last_edited_by_user_id   — the person who just edited the bill.
    //      This is what the spec actually wants: the rejection should
    //      land on whoever made the change that was rejected.
    //   2) purchase_orders.created_by_user_id — fall back for legacy
    //      bills that pre-date the last_edited_by_user_id column and for
    //      the rare case where the bill has never been edited (rejection
    //      of an auto-created draft straight after PO approval).
    //   3) bills.created_by_user_id — last-resort fallback (in the auto-
    //      created-from-PO flow this is the owner who approved the PO,
    //      so it is rarely the right target).
    let creatorUserId: string | null = bill.last_edited_by_user_id || null
    if (!creatorUserId && bill.purchase_order_id) {
      const info = await this.loadPurchaseOrderInfo(bill.purchase_order_id)
      creatorUserId = info?.createdByUserId || null
    }
    if (!creatorUserId) {
      creatorUserId = bill.created_by_user_id || bill.created_by || null
    }

    if (creatorUserId && creatorUserId !== actor.actorId) {
      await this.createNotification(actor, {
        referenceType: "bill",
        referenceId: bill.id,
        title,
        message,
        branchId: bill.branch_id,
        warehouseId: bill.warehouse_id,
        costCenterId: null,
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

    // v3.74.138 — Removed the role-level accountant notification. Spec
    // says "creator only" on edit rejection. If the PO creator is the
    // accountant, the user-level ping above already reaches them. The
    // restart-of-cycle (re-opening the bill for edit) happens through the
    // bill detail screen the creator opens from their inbox.
  }

  async notifyApprovalRestartAfterReceiptRejection(
    actor: BillReceiptNotificationActor,
    bill: BillReceiptNotificationBill,
    cycleKey: string | null,
    reasonKind: "receipt_rejection" | "draft_edit" = "receipt_rejection"
  ) {
    const cycle = eventCycle(cycleKey)

    // v3.74.134 — message now matches the actual reason. The user pointed
    // out that the bill-edit-on-draft scenario was misreported as 'after
    // receipt rejection' even though no warehouse rejection had occurred.
    const title = "تعديل الفاتورة بانتظار الاعتماد"
    const message = reasonKind === "draft_edit"
      ? `قام مُحاسِب الفَرع بتَعديل فاتورة المشتريات رقم ${bill.bill_number || bill.id} وَهى الآن بانتظار اعتمادكم لإعادة تَشغيل دورة الاستلام`
      : `تم تعديل فاتورة المشتريات رقم ${bill.bill_number || bill.id} بعد رفض الاستلام وبانتظار اعتمادكم`

    // v3.74.134 — was ["owner", "admin", "general_manager", "manager"].
    // The Owner inbox surfaced admin and general_manager rows via role
    // inheritance, so a single edit fired 2-3 duplicates in the owner
    // mailbox. Per v3.74.131 only owner + manager can act on bill
    // approval, so we tighten the dispatch list to match that.
    for (const role of ["owner", "manager"]) {
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
          reasonKind === "draft_edit"
            ? "approval_restart_after_draft_edit"
            : "approval_restart_after_receipt_rejection",
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
    const cycle = eventCycle(cycleKey)
    const title =
      appLang === "en"
        ? `Purchase Bill #${bill.bill_number || bill.id} Approved`
        : `تم اعتماد فاتورة الشراء #${bill.bill_number || bill.id}`

    // Notify the actual PO creator (purchasing_officer or accountant).
    // We also need to determine if they are the branch accountant, so the
    // role-level accountant ping below can dedup against them.
    let poCreatorId: string | null = null
    let poNumber: string | null = null
    let poCreatorRole: string | null = null
    if (bill.purchase_order_id) {
      const purchaseOrderInfo = await this.loadPurchaseOrderInfo(bill.purchase_order_id)
      poCreatorId = purchaseOrderInfo?.createdByUserId || null
      poNumber = purchaseOrderInfo?.poNumber || null

      if (poCreatorId) {
        try {
          const { data: creatorMember } = await this.supabase
            .from("company_members")
            .select("role")
            .eq("company_id", actor.companyId)
            .eq("user_id", poCreatorId)
            .maybeSingle()
          poCreatorRole = (creatorMember?.role as string | null) || null
        } catch (e) {
          poCreatorRole = null
        }
      }
    }

    const messageForUser =
      appLang === "en"
        ? `Your purchase bill #${bill.bill_number || bill.id} linked to PO #${poNumber || bill.purchase_order_id} has been approved by management and is ready for inventory receipt.`
        : `تم اعتماد فاتورة الشراء رقم ${bill.bill_number || bill.id} المرتبطة بأمر الشراء ${poNumber || bill.purchase_order_id} من قبل الإدارة وأصبحت جاهزة لاستلام المخزون.`

    const messageForAccountant =
      appLang === "en"
        ? `Purchase bill #${bill.bill_number || bill.id} for PO #${poNumber || bill.purchase_order_id || ""} has been approved by management and is ready for inventory receipt.`
        : `تم اعتماد فاتورة الشراء رقم ${bill.bill_number || bill.id} ${poNumber ? `(أمر الشراء ${poNumber})` : ""} من قبل الإدارة وأصبحت جاهزة لإرسالها للاستلام في المخزن.`

    // v3.74.138 — Spec for Step 2/5: notify PO creator + branch accountant.
    // If the creator IS an accountant, suppress the role-level accountant
    // ping (the creator already gets the user-level ping above).
    if (poCreatorId && poCreatorId !== actor.actorId) {
      await this.createNotification(actor, {
        referenceType: "bill",
        referenceId: bill.id,
        title,
        message: messageForUser,
        branchId: bill.branch_id,
        warehouseId: bill.warehouse_id,
        costCenterId: null,
        assignedToUser: poCreatorId,
        priority: "normal",
        eventKey: buildNotificationEventKey(
          "procurement",
          "bill",
          bill.id,
          "admin_approved_po_creator_notified",
          "user",
          poCreatorId,
          cycle
        ),
        severity: "info",
        category: "approvals",
      })
    }

    // Branch accountant role ping — skip if PO creator is themselves an
    // accountant (the user-level ping above is enough).
    if (poCreatorRole !== "accountant") {
      await this.createNotification(actor, {
        referenceType: "bill",
        referenceId: bill.id,
        title,
        message: messageForAccountant,
        branchId: bill.branch_id,
        warehouseId: bill.warehouse_id,
        costCenterId: null,
        assignedToRole: "accountant",
        priority: "normal",
        eventKey: buildNotificationEventKey(
          "procurement",
          "bill",
          bill.id,
          "admin_approved_accountant_notified",
          "role",
          "accountant",
          cycle
        ),
        severity: "info",
        category: "approvals",
      })
    }
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
