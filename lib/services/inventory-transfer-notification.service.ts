import { buildNotificationEventKey, normalizeNotificationSeverity } from "@/lib/notification-workflow"
import {
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from "@/lib/services/notification-recipient-resolver.service"

type SupabaseLike = any

type InventoryTransferNotificationBaseParams = {
  companyId: string
  transferId: string
  transferNumber: string
  sourceBranchId?: string | null
  destinationBranchId?: string | null
  destinationWarehouseId?: string | null
  appLang?: "ar" | "en"
}

export type InventoryTransferApprovalRequestNotificationParams = InventoryTransferNotificationBaseParams & {
  createdBy: string
  createdByName?: string | null
  isResubmission?: boolean
}

export type InventoryTransferModifiedNotificationParams = InventoryTransferNotificationBaseParams & {
  modifiedBy: string
  modifiedByName?: string | null
}

export type InventoryTransferApprovedNotificationParams = InventoryTransferNotificationBaseParams & {
  createdBy: string
  approvedBy: string
  approvedByName?: string | null
}

export type InventoryTransferRejectedNotificationParams = InventoryTransferNotificationBaseParams & {
  createdBy: string
  rejectedBy: string
  rejectedByName?: string | null
  rejectionReason?: string | null
}

export type InventoryTransferStartedNotificationParams = InventoryTransferNotificationBaseParams & {
  createdBy: string
  startedBy: string
  startedByName?: string | null
}

export type InventoryTransferReceivedNotificationParams = InventoryTransferNotificationBaseParams & {
  createdBy: string
  receivedBy: string
  receivedByName?: string | null
}

export type InventoryTransferDestinationRequestNotificationParams = InventoryTransferNotificationBaseParams & {
  createdBy: string
}

export class InventoryTransferNotificationService {
  constructor(private readonly supabase: SupabaseLike) {}

  async notifyApprovalRequested(params: InventoryTransferApprovalRequestNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const isResubmission = Boolean(params.isResubmission)

    await this.archiveApprovalWorkflowNotifications({
      companyId: params.companyId,
      transferId: params.transferId,
      sourceBranchId: params.sourceBranchId || null,
    })

    await this.dispatch(
      {
        companyId: params.companyId,
        actorUserId: params.createdBy,
        transferId: params.transferId,
        sourceBranchId: params.sourceBranchId || null,
        destinationBranchId: params.destinationBranchId || null,
        destinationWarehouseId: params.destinationWarehouseId || null,
      },
      resolver.resolveLeadershipVisibilityRecipients(params.sourceBranchId || null, null, null),
      {
        referenceType: "stock_transfer",
        referenceId: params.transferId,
        title:
          params.appLang === "en"
            ? "Transfer Request Pending Approval"
            : "طلب نقل مخزون يحتاج اعتماد",
        message:
          params.appLang === "en"
            ? `Transfer request ${params.transferNumber} created by ${params.createdByName || "Accountant"} ${
                isResubmission ? "was resubmitted and " : ""
              }requires your approval`
            : `طلب نقل ${params.transferNumber} من ${params.createdByName || "المحاسب"} ${
                isResubmission ? "أُعيد إرساله و" : ""
              }يحتاج إلى موافقتك`,
        priority: "high",
        severity: "warning",
        category: "approvals",
        eventAction: isResubmission ? "approval_resubmitted" : "approval_requested",
      },
      "⚠️ [TRANSFER_NOTIFICATION] Approval request notification failed:"
    )
  }

  async notifyModified(params: InventoryTransferModifiedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)

    await this.archiveApprovalWorkflowNotifications({
      companyId: params.companyId,
      transferId: params.transferId,
      sourceBranchId: params.sourceBranchId || null,
    })

    await this.dispatch(
      {
        companyId: params.companyId,
        actorUserId: params.modifiedBy,
        transferId: params.transferId,
        sourceBranchId: params.sourceBranchId || null,
        destinationBranchId: params.destinationBranchId || null,
        destinationWarehouseId: params.destinationWarehouseId || null,
      },
      resolver.resolveLeadershipVisibilityRecipients(params.sourceBranchId || null, null, null),
      {
        referenceType: "stock_transfer",
        referenceId: params.transferId,
        title: params.appLang === "en" ? "Transfer Request Modified" : "تم تعديل طلب النقل",
        message:
          params.appLang === "en"
            ? `Transfer request ${params.transferNumber} has been modified and requires approval${
                params.modifiedByName ? ` (by ${params.modifiedByName})` : ""
              }`
            : `تم تعديل طلب النقل ${params.transferNumber} ويحتاج إلى اعتماد${
                params.modifiedByName ? ` (بواسطة ${params.modifiedByName})` : ""
              }`,
        priority: "high",
        severity: "warning",
        category: "approvals",
        eventAction: "modified_reapproval_required",
      },
      "⚠️ [TRANSFER_NOTIFICATION] Modified notification failed:"
    )
  }

  async notifyApproved(params: InventoryTransferApprovedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)

    await this.archiveApprovalWorkflowNotifications({
      companyId: params.companyId,
      transferId: params.transferId,
      sourceBranchId: params.sourceBranchId || null,
    })

    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.approvedBy,
        transferId: params.transferId,
        sourceBranchId: null,
        destinationBranchId: params.destinationBranchId || null,
        destinationWarehouseId: params.destinationWarehouseId || null,
      },
      resolver.resolveUserRecipient(params.createdBy),
      {
        referenceType: "stock_transfer",
        referenceId: params.transferId,
        title: params.appLang === "en" ? "Transfer Request Approved" : "تم اعتماد طلب النقل",
        message:
          params.appLang === "en"
            ? `Your transfer request ${params.transferNumber} has been approved by ${params.approvedByName || "Management"}`
            : `تم اعتماد طلب النقل ${params.transferNumber} بواسطة ${params.approvedByName || "الإدارة"}`,
        priority: "normal",
        severity: "info",
        category: "inventory",
        eventAction: "approved_creator_notified",
      }
    )
  }

  async notifyRejected(params: InventoryTransferRejectedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const reasonText = params.rejectionReason
      ? params.appLang === "en"
        ? `\nReason: ${params.rejectionReason}`
        : `\nالسبب: ${params.rejectionReason}`
      : ""

    await this.archiveApprovalWorkflowNotifications({
      companyId: params.companyId,
      transferId: params.transferId,
      sourceBranchId: params.sourceBranchId || null,
    })

    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.rejectedBy,
        transferId: params.transferId,
        sourceBranchId: null,
        destinationBranchId: params.destinationBranchId || null,
        destinationWarehouseId: params.destinationWarehouseId || null,
      },
      resolver.resolveUserRecipient(params.createdBy),
      {
        referenceType: "stock_transfer",
        referenceId: params.transferId,
        title: params.appLang === "en" ? "Transfer Request Rejected" : "تم رفض طلب النقل",
        message:
          params.appLang === "en"
            ? `Your transfer request ${params.transferNumber} has been rejected by ${params.rejectedByName || "Management"}${reasonText}`
            : `تم رفض طلب النقل ${params.transferNumber} بواسطة ${params.rejectedByName || "الإدارة"}${reasonText}`,
        priority: "high",
        severity: "error",
        category: "inventory",
        eventAction: "rejected_creator_notified",
      }
    )
  }

  async notifyDestinationRequestCreated(params: InventoryTransferDestinationRequestNotificationParams) {
    await this.dispatchDestinationWarehouseNotification(
      params,
      {
        title: params.appLang === "en" ? "New Stock Transfer Request" : "طلب نقل مخزون جديد",
        message:
          params.appLang === "en"
            ? "A new stock transfer request requires your approval"
            : "طلب نقل مخزون جديد يحتاج إلى موافقتك",
        eventAction: "destination_request_created",
      },
      "⚠️ [TRANSFER_NOTIFICATION] Destination request notification failed:"
    )
  }

  async notifyDestinationTransferStarted(params: InventoryTransferDestinationRequestNotificationParams) {
    await this.archiveDestinationWorkflowNotifications({
      companyId: params.companyId,
      transferId: params.transferId,
      destinationBranchId: params.destinationBranchId || null,
      destinationWarehouseId: params.destinationWarehouseId || null,
    })

    await this.dispatchDestinationWarehouseNotification(
      params,
      {
        title: params.appLang === "en" ? "Transfer In Transit to Your Warehouse" : "نقل مخزون في الطريق إلى مخزنك",
        message:
          params.appLang === "en"
            ? `Transfer ${params.transferNumber} is now in transit and your warehouse should prepare to receive it`
            : `طلب النقل ${params.transferNumber} أصبح في الطريق وعلى مخزنك الاستعداد للاستلام`,
        eventAction: "destination_transfer_started",
      },
      "⚠️ [TRANSFER_NOTIFICATION] Destination started notification failed:"
    )
  }

  async notifyStarted(params: InventoryTransferStartedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    if (params.createdBy === params.startedBy) return

    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.startedBy,
        transferId: params.transferId,
        sourceBranchId: null,
        destinationBranchId: params.destinationBranchId || null,
        destinationWarehouseId: params.destinationWarehouseId || null,
      },
      resolver.resolveUserRecipient(params.createdBy),
      {
        referenceType: "stock_transfer",
        referenceId: params.transferId,
        title: params.appLang === "en" ? "Transfer Started" : "تم بدء النقل",
        message:
          params.appLang === "en"
            ? `Transfer ${params.transferNumber} has been started${params.startedByName ? ` by ${params.startedByName}` : ""}`
            : `تم بدء نقل الطلب ${params.transferNumber}${params.startedByName ? ` بواسطة ${params.startedByName}` : ""}`,
        priority: "normal",
        severity: "info",
        category: "inventory",
        eventAction: "started_creator_notified",
      }
    )
  }

  async notifyReceived(params: InventoryTransferReceivedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    if (params.createdBy === params.receivedBy) return

    await this.archiveDestinationWorkflowNotifications({
      companyId: params.companyId,
      transferId: params.transferId,
      destinationBranchId: params.destinationBranchId || null,
      destinationWarehouseId: params.destinationWarehouseId || null,
    })

    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.receivedBy,
        transferId: params.transferId,
        sourceBranchId: null,
        destinationBranchId: params.destinationBranchId || null,
        destinationWarehouseId: params.destinationWarehouseId || null,
      },
      resolver.resolveUserRecipient(params.createdBy),
      {
        referenceType: "stock_transfer",
        referenceId: params.transferId,
        title: params.appLang === "en" ? "Transfer Received" : "تم استلام النقل",
        message:
          params.appLang === "en"
            ? `Transfer ${params.transferNumber} has been received successfully${params.receivedByName ? ` by ${params.receivedByName}` : ""}`
            : `تم استلام طلب النقل ${params.transferNumber} بنجاح${params.receivedByName ? ` بواسطة ${params.receivedByName}` : ""}`,
        priority: "normal",
        severity: "info",
        category: "inventory",
        eventAction: "received_creator_notified",
      }
    )
  }

  async archiveApprovalWorkflowNotifications(params: {
    companyId: string
    transferId: string
    sourceBranchId?: string | null
  }) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const compatibleEventKeys = [
      `transfer_approval:${params.transferId}:requested`,
      `transfer_approval:${params.transferId}:modified`,
      ...resolver.resolveLeadershipVisibilityRecipients(params.sourceBranchId || null, null, null).flatMap((recipient) => [
        buildNotificationEventKey(
          "inventory",
          "stock_transfer",
          params.transferId,
          "approval_requested",
          ...resolver.buildRecipientScopeSegments(recipient)
        ),
        buildNotificationEventKey(
          "inventory",
          "stock_transfer",
          params.transferId,
          "approval_resubmitted",
          ...resolver.buildRecipientScopeSegments(recipient)
        ),
        buildNotificationEventKey(
          "inventory",
          "stock_transfer",
          params.transferId,
          "modified_reapproval_required",
          ...resolver.buildRecipientScopeSegments(recipient)
        ),
      ]),
    ]

    await this.archiveByEventKeys(params.companyId, "stock_transfer", params.transferId, compatibleEventKeys)
  }

  async archiveDestinationWorkflowNotifications(params: {
    companyId: string
    transferId: string
    destinationBranchId?: string | null
    destinationWarehouseId?: string | null
  }) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const recipients = await resolver.resolveWarehouseRecipients(
      params.companyId,
      params.destinationBranchId || null,
      params.destinationWarehouseId || null
    )

    const compatibleEventKeys = [
      `stock_transfer_request:${params.transferId}:created`,
      ...recipients.flatMap((recipient) => [
        buildNotificationEventKey(
          "inventory",
          "stock_transfer",
          params.transferId,
          "destination_request_created",
          ...resolver.buildRecipientScopeSegments(recipient)
        ),
        buildNotificationEventKey(
          "inventory",
          "stock_transfer",
          params.transferId,
          "destination_transfer_started",
          ...resolver.buildRecipientScopeSegments(recipient)
        ),
      ]),
    ]

    await this.archiveByEventKeys(params.companyId, "stock_transfer", params.transferId, compatibleEventKeys)
  }

  private async dispatchDestinationWarehouseNotification(
    params: InventoryTransferDestinationRequestNotificationParams,
    payload: {
      title: string
      message: string
      eventAction: string
    },
    warningLabel: string
  ) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const recipients = await resolver.resolveWarehouseRecipients(
      params.companyId,
      params.destinationBranchId || null,
      params.destinationWarehouseId || null
    )

    await this.dispatch(
      {
        companyId: params.companyId,
        actorUserId: params.createdBy,
        transferId: params.transferId,
        sourceBranchId: params.sourceBranchId || null,
        destinationBranchId: params.destinationBranchId || null,
        destinationWarehouseId: params.destinationWarehouseId || null,
      },
      recipients,
      {
        referenceType: "stock_transfer",
        referenceId: params.transferId,
        title: payload.title,
        message: payload.message,
        priority: "high",
        severity: "info",
        category: "inventory",
        eventAction: payload.eventAction,
      },
      warningLabel
    )
  }

  private async archiveByEventKeys(
    companyId: string,
    referenceType: string,
    referenceId: string,
    eventKeys: string[]
  ) {
    const { data: notifications, error: selectError } = await this.supabase
      .from("notifications")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", referenceType)
      .eq("reference_id", referenceId)
      .in("status", ["unread", "read"])
      .in("event_key", eventKeys)

    if (selectError) {
      console.error("Error selecting transfer workflow notifications to archive:", selectError)
      return
    }

    const ids = (notifications || []).map((notification: { id: string }) => notification.id)
    if (ids.length === 0) return

    const { error: updateError } = await this.supabase
      .from("notifications")
      .update({
        status: "actioned",
        actioned_at: new Date().toISOString(),
      })
      .in("id", ids)

    if (updateError) {
      console.error("Error archiving transfer workflow notifications:", updateError)
    }
  }

  private async dispatch(
    params: {
      companyId: string
      actorUserId: string
      transferId: string
      sourceBranchId?: string | null
      destinationBranchId?: string | null
      destinationWarehouseId?: string | null
    },
    recipients: ResolvedNotificationRecipient[],
    payload: {
      referenceType: string
      referenceId: string
      title: string
      message: string
      priority: "low" | "normal" | "high" | "urgent"
      severity: "info" | "warning" | "error" | "critical"
      category: "finance" | "inventory" | "sales" | "approvals" | "system"
      eventAction: string
    },
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
    params: {
      companyId: string
      actorUserId: string
      transferId: string
      sourceBranchId?: string | null
      destinationBranchId?: string | null
      destinationWarehouseId?: string | null
    },
    recipient: ResolvedNotificationRecipient,
    payload: {
      referenceType: string
      referenceId: string
      title: string
      message: string
      priority: "low" | "normal" | "high" | "urgent"
      severity: "info" | "warning" | "error" | "critical"
      category: "finance" | "inventory" | "sales" | "approvals" | "system"
      eventAction: string
    }
  ) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const { error } = await this.supabase.rpc("create_notification", {
      p_company_id: params.companyId,
      p_reference_type: payload.referenceType,
      p_reference_id: payload.referenceId,
      p_title: payload.title,
      p_message: payload.message,
      p_created_by: params.actorUserId,
      p_branch_id:
        recipient.branchId ??
        params.destinationBranchId ??
        params.sourceBranchId ??
        null,
      p_cost_center_id: recipient.costCenterId ?? null,
      p_warehouse_id: recipient.warehouseId ?? params.destinationWarehouseId ?? null,
      p_assigned_to_role: recipient.kind === "role" ? recipient.role : null,
      p_assigned_to_user: recipient.kind === "user" ? recipient.userId : null,
      p_priority: payload.priority,
      p_event_key: buildNotificationEventKey(
        "inventory",
        payload.referenceType,
        payload.referenceId,
        payload.eventAction,
        ...resolver.buildRecipientScopeSegments(recipient)
      ),
      p_severity: normalizeNotificationSeverity(payload.severity),
      p_category: payload.category,
    })

    if (error) {
      throw new Error(error.message || "Failed to dispatch inventory transfer notification")
    }
  }
}
