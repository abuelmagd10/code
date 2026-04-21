import { buildNotificationEventKey, normalizeNotificationSeverity } from "@/lib/notification-workflow"
import {
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from "@/lib/services/notification-recipient-resolver.service"

type SupabaseLike = any

type PurchaseOrderNotificationBaseParams = {
  companyId: string
  poId: string
  poNumber: string
  supplierName: string
  amount: number
  currency: string
  branchId?: string | null
  costCenterId?: string | null
  appLang?: "ar" | "en"
}

export type PurchaseOrderApprovalRequestNotificationParams = PurchaseOrderNotificationBaseParams & {
  createdBy: string
  isResubmission?: boolean
}

export type PurchaseOrderApprovedNotificationParams = PurchaseOrderNotificationBaseParams & {
  createdBy: string
  approvedBy: string
  linkedBillId?: string | null
}

export type PurchaseOrderRejectedNotificationParams = PurchaseOrderNotificationBaseParams & {
  createdBy: string
  rejectedBy: string
  reason: string
}

export class PurchaseOrderNotificationService {
  constructor(private readonly supabase: SupabaseLike) {}

  async notifyApprovalRequested(params: PurchaseOrderApprovalRequestNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const isResubmission = Boolean(params.isResubmission)
    const title =
      params.appLang === "en"
        ? isResubmission
          ? "Resubmitted Purchase Order Approval Required"
          : "Purchase Order Approval Required"
        : isResubmission
          ? "إعادة طلب موافقة على أمر شراء (بعد التعديل)"
          : "طلب موافقة على أمر شراء"
    const message =
      params.appLang === "en"
        ? isResubmission
          ? `Purchase Order ${params.poNumber} for ${params.supplierName} (${params.amount} ${params.currency}) has been modified and requires your re-approval`
          : `Purchase Order ${params.poNumber} for ${params.supplierName} (${params.amount} ${params.currency}) requires your approval`
        : isResubmission
          ? `تم تعديل أمر الشراء ${params.poNumber} للمورد ${params.supplierName} بقيمة ${params.amount} ${params.currency} ويحتاج إلى إعادة الاعتماد`
          : `أمر شراء ${params.poNumber} للمورد ${params.supplierName} بقيمة ${params.amount} ${params.currency} يحتاج إلى موافقتك`

    await this.dispatch(
      {
        companyId: params.companyId,
        actorUserId: params.createdBy,
        poId: params.poId,
        branchId: null,
        costCenterId: null,
      },
      resolver.resolveLeadershipVisibilityRecipients(),
      {
        referenceType: "purchase_order",
        referenceId: params.poId,
        title,
        message,
        priority: "high",
        severity: "warning",
        category: "approvals",
        eventAction: isResubmission ? "approval_resubmitted" : "approval_requested",
      },
      "⚠️ [PO_NOTIFICATION] Leadership approval-request notification failed:"
    )

    if (params.branchId) {
      await this.dispatch(
        {
          companyId: params.companyId,
          actorUserId: params.createdBy,
          poId: params.poId,
          branchId: params.branchId || null,
          costCenterId: params.costCenterId || null,
        },
        resolver.resolveRoleRecipients(["manager"], params.branchId || null, null, params.costCenterId || null),
        {
          referenceType: "purchase_order",
          referenceId: params.poId,
          title,
          message,
          priority: "high",
          severity: "warning",
          category: "approvals",
          eventAction: isResubmission ? "approval_resubmitted" : "approval_requested",
        },
        "⚠️ [PO_NOTIFICATION] Branch approval-request notification failed:"
      )
    }
  }

  async notifyApprovedWorkflow(params: PurchaseOrderApprovedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)

    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.approvedBy,
        poId: params.poId,
        branchId: null,
        costCenterId: null,
      },
      resolver.resolveUserRecipient(params.createdBy),
      {
        referenceType: params.linkedBillId ? "bill" : "purchase_order",
        referenceId: params.linkedBillId || params.poId,
        title: params.appLang === "en" ? "Purchase Order Approved" : "تم اعتماد أمر الشراء",
        message:
          params.appLang === "en"
            ? `Your Purchase Order ${params.poNumber} for ${params.supplierName} (${params.amount} ${params.currency}) has been approved.`
            : `تمت الموافقة على أمر الشراء ${params.poNumber} للمورد ${params.supplierName} بقيمة ${params.amount} ${params.currency}.`,
        priority: "normal",
        severity: "info",
        category: "approvals",
        eventAction: "approved_creator_notified",
      }
    )

    await this.dispatch(
      {
        companyId: params.companyId,
        actorUserId: params.approvedBy,
        poId: params.poId,
        branchId: null,
        costCenterId: null,
      },
      resolver.resolveLeadershipVisibilityRecipients(),
      {
        referenceType: "purchase_order",
        referenceId: params.poId,
        title: params.appLang === "en" ? "Incoming Goods — Purchase Order Approved" : "بضاعة قادمة — تم اعتماد أمر الشراء",
        message:
          params.appLang === "en"
            ? `Purchase Order ${params.poNumber} for ${params.supplierName} (${params.amount} ${params.currency}) has been approved. Please prepare to receive the goods.`
            : `تم اعتماد أمر الشراء ${params.poNumber} للمورد ${params.supplierName} بقيمة ${params.amount} ${params.currency}. يرجى الاستعداد لاستلام البضاعة.`,
        priority: "normal",
        severity: "info",
        category: "inventory",
        eventAction: "approved_management_visibility",
      },
      "⚠️ [PO_NOTIFICATION] Management approved notification failed:"
    )
  }

  async notifyRejected(params: PurchaseOrderRejectedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.rejectedBy,
        poId: params.poId,
        branchId: null,
        costCenterId: null,
      },
      resolver.resolveUserRecipient(params.createdBy),
      {
        referenceType: "purchase_order",
        referenceId: params.poId,
        title: params.appLang === "en" ? "Purchase Order Rejected" : "تم رفض أمر الشراء",
        message:
          params.appLang === "en"
            ? `Your Purchase Order ${params.poNumber} for ${params.supplierName} (${params.amount} ${params.currency}) was rejected. Reason: ${params.reason}`
            : `تم رفض أمر الشراء ${params.poNumber} للمورد ${params.supplierName} بقيمة ${params.amount} ${params.currency}. السبب: ${params.reason}`,
        priority: "high",
        severity: "error",
        category: "approvals",
        eventAction: "rejected_creator_notified",
      }
    )
  }

  async archiveApprovalRequestNotifications(params: {
    companyId: string
    poId: string
    branchId?: string | null
    costCenterId?: string | null
  }) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const compatibleEventKeys = [
      `purchase_order:${params.poId}:approval_request:admin`,
      `purchase_order:${params.poId}:approval_request:admin:resubmission`,
      `purchase_order:${params.poId}:approval_request:manager`,
      `purchase_order:${params.poId}:approval_request:manager:resubmission`,
      ...resolver.resolveLeadershipVisibilityRecipients().flatMap((recipient) => [
        buildNotificationEventKey(
          "procurement",
          "purchase_order",
          params.poId,
          "approval_requested",
          ...resolver.buildRecipientScopeSegments(recipient)
        ),
        buildNotificationEventKey(
          "procurement",
          "purchase_order",
          params.poId,
          "approval_resubmitted",
          ...resolver.buildRecipientScopeSegments(recipient)
        ),
      ]),
      ...(params.branchId
        ? resolver
            .resolveRoleRecipients(["manager"], params.branchId || null, null, params.costCenterId || null)
            .flatMap((recipient) => [
              buildNotificationEventKey(
                "procurement",
                "purchase_order",
                params.poId,
                "approval_requested",
                ...resolver.buildRecipientScopeSegments(recipient)
              ),
              buildNotificationEventKey(
                "procurement",
                "purchase_order",
                params.poId,
                "approval_resubmitted",
                ...resolver.buildRecipientScopeSegments(recipient)
              ),
            ])
        : []),
    ]

    const { data: notifications, error: selectError } = await this.supabase
      .from("notifications")
      .select("id")
      .eq("company_id", params.companyId)
      .eq("reference_type", "purchase_order")
      .eq("reference_id", params.poId)
      .in("status", ["unread", "read"])
      .in("event_key", compatibleEventKeys)

    if (selectError) {
      console.error("Error selecting PO approval notifications to archive:", selectError)
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
      console.error("Error archiving PO approval notifications:", updateError)
    }
  }

  private async dispatch(
    params: {
      companyId: string
      actorUserId: string
      poId: string
      branchId?: string | null
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
      poId: string
      branchId?: string | null
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
      p_warehouse_id: recipient.kind === "user" ? recipient.warehouseId ?? null : null,
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
    })

    if (error) {
      throw new Error(error.message || "Failed to dispatch purchase order notification")
    }
  }
}
