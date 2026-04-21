import { buildNotificationEventKey, normalizeNotificationSeverity } from "@/lib/notification-workflow"
import {
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from "@/lib/services/notification-recipient-resolver.service"

type SupabaseLike = any

type WriteOffNotificationBaseParams = {
  companyId: string
  writeOffId: string
  writeOffNumber: string
  branchId?: string | null
  warehouseId?: string | null
  costCenterId?: string | null
  appLang?: "ar" | "en"
}

export type WriteOffApprovedNotificationParams = WriteOffNotificationBaseParams & {
  createdBy: string
  approvedBy: string
  approvedByName?: string | null
}

export type WriteOffApprovalRequestNotificationParams = WriteOffNotificationBaseParams & {
  createdBy: string
}

export type WriteOffModifiedNotificationParams = WriteOffNotificationBaseParams & {
  modifiedBy: string
}

export type WriteOffRejectedNotificationParams = WriteOffNotificationBaseParams & {
  createdBy: string
  rejectedBy: string
  rejectedByName?: string | null
  rejectionReason?: string | null
}

export type WriteOffCancelledNotificationParams = WriteOffNotificationBaseParams & {
  createdBy: string
  cancelledBy: string
  cancelledByName?: string | null
  cancellationReason?: string | null
}

export class WriteOffNotificationService {
  constructor(private readonly supabase: SupabaseLike) {}

  async notifyApprovalRequested(params: WriteOffApprovalRequestNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    await this.dispatch(
      {
        companyId: params.companyId,
        actorUserId: params.createdBy,
        writeOffId: params.writeOffId,
        branchId: params.branchId || null,
        warehouseId: params.warehouseId || null,
        costCenterId: params.costCenterId || null,
      },
      resolver.resolveLeadershipVisibilityRecipients(
        params.branchId || null,
        params.warehouseId || null,
        params.costCenterId || null
      ),
      {
        referenceType: "inventory_write_off",
        referenceId: params.writeOffId,
        title: params.appLang === "en" ? "New Write-Off Approval Request" : "طلب اعتماد إهلاك جديد",
        message:
          params.appLang === "en"
            ? `A new write-off ${params.writeOffNumber} is pending your approval`
            : `يوجد إهلاك جديد رقم ${params.writeOffNumber} في انتظار اعتمادك`,
        priority: "high",
        severity: "warning",
        category: "inventory",
        eventAction: "approval_requested",
      },
      "⚠️ [WRITE_OFF] Failed to send approval request notification:"
    )
  }

  async notifyModified(params: WriteOffModifiedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    await this.dispatch(
      {
        companyId: params.companyId,
        actorUserId: params.modifiedBy,
        writeOffId: params.writeOffId,
        branchId: params.branchId || null,
        warehouseId: params.warehouseId || null,
        costCenterId: params.costCenterId || null,
      },
      resolver.resolveLeadershipVisibilityRecipients(
        params.branchId || null,
        params.warehouseId || null,
        params.costCenterId || null
      ),
      {
        referenceType: "inventory_write_off",
        referenceId: params.writeOffId,
        title: params.appLang === "en" ? "Write-Off Modified - Re-approval Required" : "تم تعديل إهلاك في انتظار الاعتماد",
        message:
          params.appLang === "en"
            ? `Write-off ${params.writeOffNumber} has been modified and requires re-review and approval`
            : `تم تعديل الإهلاك رقم ${params.writeOffNumber} ويحتاج إعادة مراجعة واعتماد`,
        priority: "high",
        severity: "warning",
        category: "inventory",
        eventAction: "modified_reapproval_required",
      },
      "⚠️ [WRITE_OFF] Failed to send modified write-off notification:"
    )
  }

  async notifyApproved(params: WriteOffApprovedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const recipient = resolver.resolveUserRecipient(
      params.createdBy,
      null,
      params.branchId || null,
      params.warehouseId || null,
      params.costCenterId || null
    )

    const title = params.appLang === "en" ? "Write-Off Approved" : "تم اعتماد الإهلاك"
    const approvedByText = params.approvedByName
      ? params.appLang === "en"
        ? ` by ${params.approvedByName}`
        : ` بواسطة ${params.approvedByName}`
      : ""
    const message =
      params.appLang === "en"
        ? `Write-off ${params.writeOffNumber} has been approved successfully${approvedByText}`
        : `تم اعتماد الإهلاك رقم ${params.writeOffNumber} بنجاح${approvedByText}`

    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.approvedBy,
        writeOffId: params.writeOffId,
        branchId: params.branchId || null,
        warehouseId: params.warehouseId || null,
        costCenterId: params.costCenterId || null,
      },
      recipient,
      {
        referenceType: "inventory_write_off",
        referenceId: params.writeOffId,
        title,
        message,
        priority: "normal",
        severity: "info",
        category: "inventory",
        eventAction: "approved_creator_notified",
      }
    )
  }

  async notifyRejected(params: WriteOffRejectedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const recipient = resolver.resolveUserRecipient(
      params.createdBy,
      null,
      params.branchId || null,
      params.warehouseId || null,
      params.costCenterId || null
    )

    const reasonText = params.rejectionReason
      ? params.appLang === "en"
        ? ` Reason: ${params.rejectionReason}`
        : ` السبب: ${params.rejectionReason}`
      : ""
    const rejectedByText = params.rejectedByName
      ? params.appLang === "en"
        ? ` by ${params.rejectedByName}`
        : ` بواسطة ${params.rejectedByName}`
      : ""

    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.rejectedBy,
        writeOffId: params.writeOffId,
        branchId: params.branchId || null,
        warehouseId: params.warehouseId || null,
        costCenterId: params.costCenterId || null,
      },
      recipient,
      {
        referenceType: "inventory_write_off",
        referenceId: params.writeOffId,
        title: params.appLang === "en" ? "Write-Off Rejected" : "تم رفض الإهلاك",
        message:
          params.appLang === "en"
            ? `Write-off ${params.writeOffNumber} has been rejected${rejectedByText}. Please review the data and resubmit for approval.${reasonText}`
            : `تم رفض الإهلاك رقم ${params.writeOffNumber}${rejectedByText}. يرجى مراجعة البيانات وإعادة الإرسال للاعتماد.${reasonText}`,
        priority: "high",
        severity: "error",
        category: "inventory",
        eventAction: "rejected_creator_notified",
      }
    )
  }

  async notifyCancelled(params: WriteOffCancelledNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const recipient = resolver.resolveUserRecipient(
      params.createdBy,
      null,
      params.branchId || null,
      params.warehouseId || null,
      params.costCenterId || null
    )

    const reasonText = params.cancellationReason
      ? params.appLang === "en"
        ? ` Reason: ${params.cancellationReason}`
        : ` السبب: ${params.cancellationReason}`
      : ""
    const cancelledByText = params.cancelledByName
      ? params.appLang === "en"
        ? ` by ${params.cancelledByName}`
        : ` بواسطة ${params.cancelledByName}`
      : ""

    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.cancelledBy,
        writeOffId: params.writeOffId,
        branchId: params.branchId || null,
        warehouseId: params.warehouseId || null,
        costCenterId: params.costCenterId || null,
      },
      recipient,
      {
        referenceType: "inventory_write_off",
        referenceId: params.writeOffId,
        title: params.appLang === "en" ? "Write-Off Cancelled" : "تم إلغاء الإهلاك",
        message:
          params.appLang === "en"
            ? `Write-off ${params.writeOffNumber} has been cancelled${cancelledByText}. A reversal entry has been created to restore inventory.${reasonText}`
            : `تم إلغاء الإهلاك رقم ${params.writeOffNumber}${cancelledByText}. تم إنشاء قيد عكسي لاستعادة المخزون.${reasonText}`,
        priority: "high",
        severity: "warning",
        category: "inventory",
        eventAction: "cancelled_creator_notified",
      }
    )
  }

  async archiveApprovalNotifications(params: {
    companyId: string
    writeOffId: string
    branchId?: string | null
    warehouseId?: string | null
    costCenterId?: string | null
  }) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const recipients = resolver.resolveLeadershipVisibilityRecipients(
      params.branchId || null,
      params.warehouseId || null,
      params.costCenterId || null
    )

    const compatibleEventKeys = [
      `write_off:${params.writeOffId}:approval_request`,
      `write_off:${params.writeOffId}:modified`,
      ...recipients.flatMap((recipient) => [
        buildNotificationEventKey(
          "inventory",
          "inventory_write_off",
          params.writeOffId,
          "approval_requested",
          ...resolver.buildRecipientScopeSegments(recipient)
        ),
        buildNotificationEventKey(
          "inventory",
          "inventory_write_off",
          params.writeOffId,
          "modified_reapproval_required",
          ...resolver.buildRecipientScopeSegments(recipient)
        ),
      ]),
    ]

    const { data: notifications, error: selectError } = await this.supabase
      .from("notifications")
      .select("id")
      .eq("company_id", params.companyId)
      .eq("reference_type", "inventory_write_off")
      .eq("reference_id", params.writeOffId)
      .in("status", ["unread", "read"])
      .in("event_key", compatibleEventKeys)

    if (selectError) {
      console.error("Error selecting write-off approval notifications to archive:", selectError)
      return
    }

    const notificationIds = (notifications || []).map((notification: { id: string }) => notification.id)
    if (notificationIds.length === 0) {
      return
    }

    const { error: updateError } = await this.supabase
      .from("notifications")
      .update({
        status: "actioned",
        actioned_at: new Date().toISOString(),
      })
      .in("id", notificationIds)

    if (updateError) {
      console.error("Error archiving write-off approval notifications:", updateError)
    }
  }

  private async dispatch(
    params: {
      companyId: string
      actorUserId: string
      writeOffId: string
      branchId?: string | null
      warehouseId?: string | null
      costCenterId?: string | null
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
      writeOffId: string
      branchId?: string | null
      warehouseId?: string | null
      costCenterId?: string | null
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
      p_branch_id: recipient.branchId ?? params.branchId ?? null,
      p_cost_center_id: recipient.costCenterId ?? params.costCenterId ?? null,
      p_warehouse_id: recipient.warehouseId ?? params.warehouseId ?? null,
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
      throw new Error(error.message || "Failed to dispatch write-off notification")
    }
  }
}
