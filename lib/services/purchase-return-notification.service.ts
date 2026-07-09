import { buildNotificationEventKey, normalizeNotificationSeverity } from "@/lib/notification-workflow"
import {
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from "@/lib/services/notification-recipient-resolver.service"

type SupabaseLike = any

type PurchaseReturnNotificationContext = {
  id: string
  company_id: string
  return_number: string | null
  total_amount: number | null
  original_currency: string | null
  branch_id: string | null
  cost_center_id: string | null
  warehouse_id: string | null
  created_by: string | null
  workflow_status: string | null
  suppliers?: { name: string | null } | null
  allocations?: PurchaseReturnAllocationContext[] | null
}

type PurchaseReturnAllocationContext = {
  id: string
  warehouse_id: string | null
  branch_id: string | null
  cost_center_id: string | null
  workflow_status: string | null
  total_amount: number | null
  warehouses?: { name: string | null } | null
}

type BaseParams = {
  companyId: string
  purchaseReturnId: string
  actorUserId: string
  appLang?: "ar" | "en"
}

type ApprovalRequestedParams = BaseParams & {
  isResubmission?: boolean
}

type RejectedParams = BaseParams & {
  rejectionReason: string
}

type ConfirmedParams = BaseParams & {
  allocationId?: string | null
}

type NotificationPayload = {
  referenceType: string
  referenceId: string
  title: string
  message: string
  priority: "low" | "normal" | "high" | "urgent"
  severity: "info" | "warning" | "error" | "critical"
  category: "finance" | "inventory" | "sales" | "approvals" | "system"
  // v3.74.588 — 'action' لمراحل الطلب، الافتراضي 'info'
  kind?: "action" | "info"
  eventAction: string
}

type RecipientDispatchContext = {
  companyId: string
  actorUserId: string
  purchaseReturnId: string
  branchId?: string | null
  warehouseId?: string | null
  costCenterId?: string | null
}

type WarehousePendingContext = {
  warehouseId: string | null
  branchId: string | null
  costCenterId: string | null
  warehouseName: string | null
}

function formatAmount(amount: number | null | undefined, currency: string | null | undefined) {
  const normalizedAmount = Number(amount || 0)
  const normalizedCurrency = String(currency || "").trim()
  if (!normalizedCurrency) return `${normalizedAmount}`
  return `${normalizedAmount} ${normalizedCurrency}`
}

function normalizeLanguage(appLang?: "ar" | "en") {
  return appLang === "en" ? "en" : "ar"
}

function workflowState(value?: string | null) {
  return String(value || "").trim().toLowerCase()
}

function dedupeRecipients(recipients: ResolvedNotificationRecipient[]) {
  const seen = new Set<string>()
  const unique: ResolvedNotificationRecipient[] = []

  for (const recipient of recipients) {
    const key =
      recipient.kind === "role"
        ? ["role", recipient.role, recipient.branchId || "", recipient.warehouseId || "", recipient.costCenterId || ""].join(":")
        : ["user", recipient.userId, recipient.role || "", recipient.branchId || "", recipient.warehouseId || "", recipient.costCenterId || ""].join(":")

    if (seen.has(key)) continue
    seen.add(key)
    unique.push(recipient)
  }

  return unique
}

export class PurchaseReturnNotificationService {
  constructor(private readonly supabase: SupabaseLike) {}

  async notifyApprovalRequested(params: ApprovalRequestedParams) {
    const appLang = normalizeLanguage(params.appLang)
    const purchaseReturn = await this.loadPurchaseReturnContext(params.companyId, params.purchaseReturnId)
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const recipients = resolver.resolveRoleRecipients(
      // v3.74.169 — only target 'admin'. NotificationCenter's
      // shouldShowNotification already lets every upper role
      // (owner / admin / general_manager) read each other's
      // notifications, so adding 'general_manager' here just creates a
      // duplicate row that owners and GMs both see in their inbox.
      ["admin"],
      purchaseReturn.branch_id || null,
      null,
      purchaseReturn.cost_center_id || null
    )

    const amountText = formatAmount(purchaseReturn.total_amount, purchaseReturn.original_currency)
    const supplierName = purchaseReturn.suppliers?.name || (appLang === "en" ? "Supplier" : "المورد")
    const isResubmission = Boolean(params.isResubmission)

    await this.dispatch(
      {
        companyId: params.companyId,
        actorUserId: params.actorUserId,
        purchaseReturnId: purchaseReturn.id,
        branchId: purchaseReturn.branch_id,
        costCenterId: purchaseReturn.cost_center_id,
      },
      recipients,
      {
        referenceType: "purchase_return",
        referenceId: purchaseReturn.id,
        title:
          appLang === "en"
            ? isResubmission
              ? "Purchase Return Resubmitted for Approval"
              : "Purchase Return Pending Admin Approval"
            : isResubmission
              ? "تمت إعادة إرسال مرتجع مشتريات للاعتماد"
              : "مطلوب اعتماد مرتجع مشتريات",
        message:
          appLang === "en"
            ? `Purchase return ${purchaseReturn.return_number || purchaseReturn.id} from supplier ${supplierName} for ${amountText} requires your approval`
            : `مرتجع المشتريات ${purchaseReturn.return_number || purchaseReturn.id} للمورد ${supplierName} بقيمة ${amountText} يحتاج إلى اعتمادك`,
        priority: "high",
        severity: "warning",
        category: "approvals",
        kind: "action", // v3.74.588 — مرتجع مشتريات بانتظار اعتماد الإدارة (مرحلة طلب)
        eventAction: isResubmission ? "approval_resubmitted" : "approval_requested",
      },
      "⚠️ [PURCHASE_RETURN_NOTIFICATION] Failed to send approval-request notification:"
    )
  }

  async notifyApproved(params: BaseParams) {
    const appLang = normalizeLanguage(params.appLang)
    const purchaseReturn = await this.loadPurchaseReturnContext(params.companyId, params.purchaseReturnId)
    if (!purchaseReturn.created_by) return

    const resolver = new NotificationRecipientResolverService(this.supabase)
    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.actorUserId,
        purchaseReturnId: purchaseReturn.id,
        branchId: purchaseReturn.branch_id,
        costCenterId: purchaseReturn.cost_center_id,
      },
      resolver.resolveUserRecipient(
        purchaseReturn.created_by,
        null,
        purchaseReturn.branch_id || null,
        null,
        purchaseReturn.cost_center_id || null
      ),
      {
        referenceType: "purchase_return",
        referenceId: purchaseReturn.id,
        title: appLang === "en" ? "Purchase Return Approved" : "تم اعتماد مرتجع المشتريات",
        message:
          appLang === "en"
            ? `Purchase return ${purchaseReturn.return_number || purchaseReturn.id} has been approved and moved to warehouse review.`
            : `تم اعتماد مرتجع المشتريات ${purchaseReturn.return_number || purchaseReturn.id} ونقله إلى مراجعة المخزن.`,
        priority: "normal",
        severity: "info",
        category: "approvals",
        eventAction: "approved_creator_notified",
      }
    )
  }

  async notifyWarehousePending(params: BaseParams) {
    const appLang = normalizeLanguage(params.appLang)
    const purchaseReturn = await this.loadPurchaseReturnContext(params.companyId, params.purchaseReturnId)
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const supplierName = purchaseReturn.suppliers?.name || (appLang === "en" ? "Supplier" : "المورد")
    const amountText = formatAmount(purchaseReturn.total_amount, purchaseReturn.original_currency)
    const contexts = this.buildWarehousePendingContexts(purchaseReturn)
    const dispatchedScopes = new Set<string>()

    for (const context of contexts) {
      const warehouseRecipients = await resolver.resolveWarehouseRecipients(
        params.companyId,
        context.branchId,
        context.warehouseId
      )

      for (const recipient of dedupeRecipients(warehouseRecipients)) {
        const scopeKey = buildNotificationEventKey(
          "procurement",
          "purchase_return",
          purchaseReturn.id,
          "warehouse_pending",
          ...resolver.buildRecipientScopeSegments(recipient)
        )
        if (dispatchedScopes.has(scopeKey)) continue
        dispatchedScopes.add(scopeKey)

        try {
          await this.createNotification(
            {
              companyId: params.companyId,
              actorUserId: params.actorUserId,
              purchaseReturnId: purchaseReturn.id,
              branchId: context.branchId,
              warehouseId: context.warehouseId,
              costCenterId: context.costCenterId,
            },
            recipient,
            {
              referenceType: "purchase_return",
              referenceId: purchaseReturn.id,
              title: appLang === "en" ? "Purchase Return Requires Your Approval" : "مرتجع مشتريات يحتاج اعتمادك",
              message:
                appLang === "en"
                  ? `Return ${purchaseReturn.return_number || purchaseReturn.id} for supplier ${supplierName} (${amountText}) requires warehouse confirmation${context.warehouseName ? ` in ${context.warehouseName}` : ""}.`
                  : `المرتجع ${purchaseReturn.return_number || purchaseReturn.id} للمورد ${supplierName} (${amountText}) يحتاج اعتماد المخزن${context.warehouseName ? ` في ${context.warehouseName}` : ""}.`,
              priority: "high",
              severity: "warning",
              category: "inventory",
              kind: "action", // v3.74.588 — طلب تأكيد تسليم البضاعة من المخزن (مرحلة طلب)
              eventAction: "warehouse_pending",
            }
          )
        } catch (error: any) {
          console.error(
            "⚠️ [PURCHASE_RETURN_NOTIFICATION] Failed to send warehouse-pending notification:",
            error?.message || error
          )
        }
      }

      const accountantRecipients = dedupeRecipients(
        resolver.resolveBranchAccountantRecipients(context.branchId, context.costCenterId)
      )

      for (const recipient of accountantRecipients) {
        const scopeKey = buildNotificationEventKey(
          "procurement",
          "purchase_return",
          purchaseReturn.id,
          "warehouse_pending",
          ...resolver.buildRecipientScopeSegments(recipient)
        )
        if (dispatchedScopes.has(scopeKey)) continue
        dispatchedScopes.add(scopeKey)

        try {
          await this.createNotification(
            {
              companyId: params.companyId,
              actorUserId: params.actorUserId,
              purchaseReturnId: purchaseReturn.id,
              branchId: context.branchId,
              warehouseId: context.warehouseId,
              costCenterId: context.costCenterId,
            },
            recipient,
            {
              referenceType: "purchase_return",
              referenceId: purchaseReturn.id,
              title: appLang === "en" ? "Purchase Return Created - Pending Delivery" : "مرتجع مشتريات جديد - بانتظار التسليم",
              message:
                appLang === "en"
                  ? `Return ${purchaseReturn.return_number || purchaseReturn.id} is pending warehouse confirmation${context.warehouseName ? ` for ${context.warehouseName}` : ""}.`
                  : `المرتجع ${purchaseReturn.return_number || purchaseReturn.id} بانتظار اعتماد المخزن${context.warehouseName ? ` للمخزن ${context.warehouseName}` : ""}.`,
              priority: "normal",
              severity: "info",
              category: "inventory",
              eventAction: "warehouse_pending",
            }
          )
        } catch (error: any) {
          console.error(
            "⚠️ [PURCHASE_RETURN_NOTIFICATION] Failed to send accountant warehouse-pending notification:",
            error?.message || error
          )
        }
      }
    }
  }

  async notifyRejected(params: RejectedParams) {
    const appLang = normalizeLanguage(params.appLang)
    const purchaseReturn = await this.loadPurchaseReturnContext(params.companyId, params.purchaseReturnId)
    if (!purchaseReturn.created_by) return

    const resolver = new NotificationRecipientResolverService(this.supabase)
    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.actorUserId,
        purchaseReturnId: purchaseReturn.id,
        branchId: purchaseReturn.branch_id,
        costCenterId: purchaseReturn.cost_center_id,
      },
      resolver.resolveUserRecipient(
        purchaseReturn.created_by,
        null,
        purchaseReturn.branch_id || null,
        null,
        purchaseReturn.cost_center_id || null
      ),
      {
        referenceType: "purchase_return",
        referenceId: purchaseReturn.id,
        title: appLang === "en" ? "Purchase Return Rejected" : "تم رفض مرتجع المشتريات",
        message:
          appLang === "en"
            ? `Purchase return ${purchaseReturn.return_number || purchaseReturn.id} was rejected. Reason: ${params.rejectionReason}`
            : `تم رفض مرتجع المشتريات ${purchaseReturn.return_number || purchaseReturn.id}. السبب: ${params.rejectionReason}`,
        priority: "high",
        severity: "error",
        category: "approvals",
        eventAction: "rejected_creator_notified",
      }
    )
  }

  async notifyWarehouseRejected(params: RejectedParams) {
    const appLang = normalizeLanguage(params.appLang)
    const purchaseReturn = await this.loadPurchaseReturnContext(params.companyId, params.purchaseReturnId)
    const resolver = new NotificationRecipientResolverService(this.supabase)

    if (purchaseReturn.created_by) {
      await this.createNotification(
        {
          companyId: params.companyId,
          actorUserId: params.actorUserId,
          purchaseReturnId: purchaseReturn.id,
          branchId: purchaseReturn.branch_id,
          costCenterId: purchaseReturn.cost_center_id,
        },
        resolver.resolveUserRecipient(
          purchaseReturn.created_by,
          null,
          purchaseReturn.branch_id || null,
          null,
          purchaseReturn.cost_center_id || null
        ),
        {
          referenceType: "purchase_return",
          referenceId: purchaseReturn.id,
          title:
            appLang === "en"
              ? "Purchase Return Rejected by Warehouse"
              : "رفض مسؤول المخزن مرتجع المشتريات",
          message:
            appLang === "en"
              ? `Warehouse rejected purchase return ${purchaseReturn.return_number || purchaseReturn.id}. Reason: ${params.rejectionReason}. Please edit and resubmit.`
              : `رفض المخزن مرتجع المشتريات ${purchaseReturn.return_number || purchaseReturn.id}. السبب: ${params.rejectionReason}. يرجى التعديل وإعادة الإرسال.`,
          priority: "high",
          severity: "error",
          category: "approvals",
          eventAction: "warehouse_rejected_creator_notified",
        }
      )
    }

    await this.dispatch(
      {
        companyId: params.companyId,
        actorUserId: params.actorUserId,
        purchaseReturnId: purchaseReturn.id,
        branchId: purchaseReturn.branch_id,
        costCenterId: purchaseReturn.cost_center_id,
      },
      resolver.resolveRoleRecipients(
        // v3.74.169 — only target 'admin'. NotificationCenter's
      // shouldShowNotification already lets every upper role
      // (owner / admin / general_manager) read each other's
      // notifications, so adding 'general_manager' here just creates a
      // duplicate row that owners and GMs both see in their inbox.
      ["admin"],
        purchaseReturn.branch_id || null,
        null,
        purchaseReturn.cost_center_id || null
      ),
      {
        referenceType: "purchase_return",
        referenceId: purchaseReturn.id,
        title:
          appLang === "en"
            ? "Purchase Return Rejected by Warehouse"
            : "رفض مسؤول المخزن مرتجع مشتريات",
        message:
          appLang === "en"
            ? `Warehouse rejected purchase return ${purchaseReturn.return_number || purchaseReturn.id}. Reason: ${params.rejectionReason}.`
            : `رفض المخزن مرتجع المشتريات ${purchaseReturn.return_number || purchaseReturn.id}. السبب: ${params.rejectionReason}.`,
        priority: "high",
        severity: "warning",
        category: "approvals",
        eventAction: "warehouse_rejected_management_notified",
      },
      "⚠️ [PURCHASE_RETURN_NOTIFICATION] Failed to send warehouse-rejection management notification:"
    )
  }

  async notifyConfirmed(params: ConfirmedParams) {
    const appLang = normalizeLanguage(params.appLang)
    const purchaseReturn = await this.loadPurchaseReturnContext(params.companyId, params.purchaseReturnId)
    const allocation = params.allocationId
      ? (purchaseReturn.allocations || []).find((entry) => entry.id === params.allocationId) || null
      : null

    const confirmedState = workflowState(purchaseReturn.workflow_status)
    const pendingAllocations = (purchaseReturn.allocations || []).filter(
      (entry) => entry.id !== params.allocationId && workflowState(entry.workflow_status) !== "confirmed"
    ).length
    const isFullyConfirmed =
      confirmedState === "confirmed" ||
      confirmedState === "completed" ||
      ((purchaseReturn.allocations || []).length > 0 &&
        (purchaseReturn.allocations || []).every((entry) => workflowState(entry.workflow_status) === "confirmed"))

    if (purchaseReturn.created_by) {
      const resolver = new NotificationRecipientResolverService(this.supabase)
      if (allocation && !isFullyConfirmed) {
        await this.createNotification(
          {
            companyId: params.companyId,
            actorUserId: params.actorUserId,
            purchaseReturnId: purchaseReturn.id,
          },
          resolver.resolveUserRecipient(purchaseReturn.created_by, null, null, allocation.warehouse_id || null, null),
          {
            referenceType: "purchase_return",
            referenceId: purchaseReturn.id,
            title:
              appLang === "en"
                ? "Warehouse Confirmed - Return Partially Approved"
                : "تم اعتماد مخزن - مرتجع معتمد جزئياً",
            message:
              appLang === "en"
                ? `Warehouse ${allocation.warehouses?.name || allocation.warehouse_id || ""} confirmed return ${purchaseReturn.return_number || purchaseReturn.id}. ${pendingAllocations} warehouse(s) still pending.`
                : `اعتمد المخزن ${allocation.warehouses?.name || allocation.warehouse_id || ""} المرتجع ${purchaseReturn.return_number || purchaseReturn.id}. ما زال ${pendingAllocations} مخزن بانتظار الاعتماد.`,
            priority: "normal",
            severity: "info",
            category: "inventory",
            eventAction: "allocation_confirmed_creator_notified",
          }
        )
      } else {
        await this.createNotification(
          {
            companyId: params.companyId,
            actorUserId: params.actorUserId,
            purchaseReturnId: purchaseReturn.id,
          },
          resolver.resolveUserRecipient(purchaseReturn.created_by),
          {
            referenceType: "purchase_return",
            referenceId: purchaseReturn.id,
            title: appLang === "en" ? "Purchase Return Confirmed" : "تم اعتماد مرتجع المشتريات",
            message:
              appLang === "en"
                ? `Purchase return ${purchaseReturn.return_number || purchaseReturn.id} has been confirmed and completed.`
                : `تم اعتماد مرتجع المشتريات ${purchaseReturn.return_number || purchaseReturn.id} واكتمال الدورة التشغيلية له.`,
            priority: "normal",
            severity: "info",
            category: "inventory",
            eventAction: isFullyConfirmed ? "fully_confirmed_creator_notified" : "confirmed_creator_notified",
          }
        )
      }
    }

    if (!allocation) {
      const resolver = new NotificationRecipientResolverService(this.supabase)
      await this.dispatch(
        {
          companyId: params.companyId,
          actorUserId: params.actorUserId,
          purchaseReturnId: purchaseReturn.id,
        },
        // v3.74.170 — was resolveLevel1ApproverRecipients which emits four
        // role rows (owner, admin, general_manager, manager). Owner inboxes
        // then surfaced three identical "تم اعتماد مرتجع مشتريات من المخزن"
        // notifications because shouldShowNotification grants every upper
        // role (owner/admin/general_manager) cross-visibility into each
        // other's rows. Use leadership-visibility (single 'admin' row
        // covers all three upper roles) plus a separate branch-scoped
        // 'manager' row so the branch manager still sees it.
        [
          ...resolver.resolveLeadershipVisibilityRecipients(null, null, null),
          resolver.resolveBranchRoleRecipient(
            "manager",
            purchaseReturn.branch_id || null,
            null,
            purchaseReturn.cost_center_id || null
          ),
        ],
        {
          referenceType: "purchase_return",
          referenceId: purchaseReturn.id,
          title:
            appLang === "en"
              ? "Purchase Return Confirmed by Warehouse"
              : "تم اعتماد مرتجع مشتريات من المخزن",
          message:
            appLang === "en"
              ? `Warehouse confirmed purchase return ${purchaseReturn.return_number || purchaseReturn.id}. Inventory and financial effects are now complete.`
              : `اعتمد المخزن مرتجع المشتريات ${purchaseReturn.return_number || purchaseReturn.id}. تم استكمال الأثر المخزني والمالي.`,
          priority: "normal",
          severity: "info",
          category: "approvals",
          eventAction: "confirmed_management_visibility",
        },
        "⚠️ [PURCHASE_RETURN_NOTIFICATION] Failed to send management confirmation notification:"
      )
    }
  }

  async archiveApprovalRequestNotifications(params: {
    companyId: string
    purchaseReturnId: string
    branchId?: string | null
    costCenterId?: string | null
  }) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const recipients = resolver.resolveRoleRecipients(
      // v3.74.169 — only target 'admin'. NotificationCenter's
      // shouldShowNotification already lets every upper role
      // (owner / admin / general_manager) read each other's
      // notifications, so adding 'general_manager' here just creates a
      // duplicate row that owners and GMs both see in their inbox.
      ["admin"],
      params.branchId || null,
      null,
      params.costCenterId || null
    )

    const compatibleEventKeys = [
      `purchase_return:${params.purchaseReturnId}:pending_admin_approval:admin`,
      `purchase_return:${params.purchaseReturnId}:pending_admin_approval:general_manager`,
      `purchase_return:${params.purchaseReturnId}:pending_admin_approval:resubmit:admin`,
      `purchase_return:${params.purchaseReturnId}:pending_admin_approval:resubmit:general_manager`,
      ...recipients.flatMap((recipient) => [
        buildNotificationEventKey(
          "procurement",
          "purchase_return",
          params.purchaseReturnId,
          "approval_requested",
          ...resolver.buildRecipientScopeSegments(recipient)
        ),
        buildNotificationEventKey(
          "procurement",
          "purchase_return",
          params.purchaseReturnId,
          "approval_resubmitted",
          ...resolver.buildRecipientScopeSegments(recipient)
        ),
      ]),
    ]

    await this.archiveNotifications(params.companyId, params.purchaseReturnId, compatibleEventKeys)
  }

  async archiveWarehousePendingNotifications(params: {
    companyId: string
    purchaseReturnId: string
  }) {
    const purchaseReturn = await this.loadPurchaseReturnContext(params.companyId, params.purchaseReturnId)
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const contexts = this.buildWarehousePendingContexts(purchaseReturn)
    const compatibleEventKeys = new Set<string>([
      `purchase_return:${params.purchaseReturnId}:pending_approval:store_manager`,
      `purchase_return:${params.purchaseReturnId}:pending_approval:accountant`,
    ])

    for (const context of contexts) {
      if (context.warehouseId) {
        compatibleEventKeys.add(
          `purchase_return:${params.purchaseReturnId}:pending_approval:${context.warehouseId}:store_manager`
        )
        compatibleEventKeys.add(
          `purchase_return:${params.purchaseReturnId}:pending_approval:${context.warehouseId}:accountant`
        )
      }

      const warehouseRecipients = await resolver.resolveWarehouseRecipients(
        params.companyId,
        context.branchId,
        context.warehouseId
      )
      const accountantRecipients = resolver.resolveBranchAccountantRecipients(
        context.branchId,
        context.costCenterId
      )

      for (const recipient of dedupeRecipients([...warehouseRecipients, ...accountantRecipients])) {
        compatibleEventKeys.add(
          buildNotificationEventKey(
            "procurement",
            "purchase_return",
            params.purchaseReturnId,
            "warehouse_pending",
            ...resolver.buildRecipientScopeSegments(recipient)
          )
        )
      }
    }

    await this.archiveNotifications(params.companyId, params.purchaseReturnId, Array.from(compatibleEventKeys))
  }

  private async archiveNotifications(companyId: string, purchaseReturnId: string, eventKeys: string[]) {
    // v3.74.167 — also archive 'actioned' rows. The previous list missed
    // them, which broke the warehouse-pending notification on the second
    // cycle: after warehouse rejection the row goes to 'actioned'; on
    // resubmission + admin approval we re-call notifyWarehousePending,
    // which then hits create_notification's dedup branch (existing row
    // with same event_key, status != 'archived') and silently returns
    // the old id instead of inserting a fresh notification. The warehouse
    // user gets nothing. Archiving 'actioned' too clears the way for the
    // fresh insert.
    const { data: notifications, error: selectError } = await this.supabase
      .from("notifications")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "purchase_return")
      .eq("reference_id", purchaseReturnId)
      .in("status", ["unread", "read", "actioned"])
      .in("event_key", eventKeys)

    if (selectError) {
      console.error("Error selecting purchase-return notifications to archive:", selectError)
      return
    }

    const ids = (notifications || []).map((notification: { id: string }) => notification.id)
    if (ids.length === 0) return

    // v3.74.167 part 2 — write 'archived', not 'actioned'.
    // create_notification's dedup branch returns the OLD notification id
    // when it finds any row with the same event_key whose status is NOT
    // 'archived'. We were writing 'actioned' here, which counted as live,
    // so the next warehouse_pending call silently returned the old id and
    // the warehouse user got no fresh row. The contract is: archive ==
    // status='archived'. actioned_at is reused as the timestamp of the
    // status change (no archived_at column on this table).
    const { error: updateError } = await this.supabase
      .from("notifications")
      .update({
        status: "archived",
        actioned_at: new Date().toISOString(),
      })
      .in("id", ids)

    if (updateError) {
      console.error("Error archiving purchase-return notifications:", updateError)
    }
  }

  private buildWarehousePendingContexts(purchaseReturn: PurchaseReturnNotificationContext): WarehousePendingContext[] {
    const allocations = purchaseReturn.allocations || []
    if (allocations.length === 0) {
      return [
        {
          warehouseId: purchaseReturn.warehouse_id || null,
          branchId: purchaseReturn.branch_id || null,
          costCenterId: purchaseReturn.cost_center_id || null,
          warehouseName: null,
        },
      ]
    }

    return allocations.map((allocation) => ({
      warehouseId: allocation.warehouse_id || null,
      branchId: allocation.branch_id || purchaseReturn.branch_id || null,
      costCenterId: allocation.cost_center_id || purchaseReturn.cost_center_id || null,
      warehouseName: allocation.warehouses?.name || null,
    }))
  }

  private async loadPurchaseReturnContext(companyId: string, purchaseReturnId: string): Promise<PurchaseReturnNotificationContext> {
    const { data, error } = await this.supabase
      .from("purchase_returns")
      .select(`
        id,
        company_id,
        return_number,
        total_amount,
        original_currency,
        branch_id,
        cost_center_id,
        warehouse_id,
        created_by,
        workflow_status,
        suppliers(name),
        allocations:purchase_return_warehouse_allocations(
          id,
          warehouse_id,
          branch_id,
          cost_center_id,
          workflow_status,
          total_amount,
          warehouses(name)
        )
      `)
      .eq("company_id", companyId)
      .eq("id", purchaseReturnId)
      .maybeSingle()

    if (error || !data) {
      throw new Error(error?.message || "Purchase return not found for notifications")
    }

    return data as PurchaseReturnNotificationContext
  }

  private async dispatch(
    params: RecipientDispatchContext,
    recipients: ResolvedNotificationRecipient[],
    payload: NotificationPayload,
    warningLabel: string
  ) {
    for (const recipient of recipients) {
      try {
        await this.createNotification(params, recipient, payload)
      } catch (error: any) {
        console.error(warningLabel, error?.message || error)
      }
    }
  }

  private async createNotification(
    params: RecipientDispatchContext,
    recipient: ResolvedNotificationRecipient,
    payload: NotificationPayload
  ) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const { error } = await this.supabase.rpc("create_notification", {
      p_company_id: params.companyId,
      p_reference_type: payload.referenceType,
      p_reference_id: payload.referenceId,
      p_title: payload.title,
      p_message: payload.message,
      p_created_by: params.actorUserId,
      p_branch_id: recipient.branchId ?? params.branchId ?? null,
      p_cost_center_id: recipient.costCenterId ?? params.costCenterId ?? null,
      p_warehouse_id: recipient.warehouseId ?? params.warehouseId ?? null,
      p_assigned_to_role: recipient.kind === "role" ? recipient.role : null,
      p_assigned_to_user: recipient.kind === "user" ? recipient.userId : null,
      p_priority: payload.priority,
      p_event_key: buildNotificationEventKey(
        "procurement",
        payload.referenceType,
        payload.referenceId,
        payload.eventAction,
        ...resolver.buildRecipientScopeSegments(recipient)
      ),
      p_severity: normalizeNotificationSeverity(payload.severity),
      p_category: payload.category,
      // v3.74.588 — تمرير نوع الإشعار (DEFAULT 'info' في قاعدة البيانات)
      p_kind: payload.kind || "info",
    })

    if (error) {
      throw new Error(error.message || "Failed to dispatch purchase-return notification")
    }
  }
}
