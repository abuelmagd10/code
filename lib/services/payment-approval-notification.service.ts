import { buildNotificationEventKey, normalizeNotificationSeverity } from "@/lib/notification-workflow"
import {
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from "@/lib/services/notification-recipient-resolver.service"

type SupabaseLike = any

type PaymentApprovalNotificationBaseParams = {
  companyId: string
  paymentId: string
  partyName: string
  amount: number
  currency: string
  branchId?: string | null
  costCenterId?: string | null
  paymentType: "supplier" | "customer"
  appLang?: "ar" | "en"
}

export type PaymentApprovalRequestNotificationParams = PaymentApprovalNotificationBaseParams & {
  createdBy: string
}

export type PaymentApprovedNotificationParams = PaymentApprovalNotificationBaseParams & {
  createdBy: string
  approvedBy: string
}

export type PaymentRejectedNotificationParams = PaymentApprovalNotificationBaseParams & {
  createdBy: string
  rejectedBy: string
  reason: string
}

export class PaymentApprovalNotificationService {
  constructor(private readonly supabase: SupabaseLike) {}

  async notifyApprovalRequested(params: PaymentApprovalRequestNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const isSupplier = params.paymentType === "supplier"
    const title = params.appLang === "en" ? "Payment Pending Approval" : "طلب اعتماد دفعة"
    const message =
      params.appLang === "en"
        ? `A ${isSupplier ? "supplier payment" : "customer receipt"} of ${params.amount.toFixed(2)} ${params.currency} for "${params.partyName}" requires your approval.`
        : `تحتاج ${isSupplier ? "دفعة بمبلغ" : "سند قبض بمبلغ"} ${params.amount.toFixed(2)} ${params.currency} ل${isSupplier ? "مورد" : "عميل"} "${params.partyName}" إلى اعتمادك.`

    await this.archiveApprovalNotifications({
      companyId: params.companyId,
      paymentId: params.paymentId,
      branchId: params.branchId || null,
      costCenterId: params.costCenterId || null,
    })

    await this.dispatch(
      {
        companyId: params.companyId,
        actorUserId: params.createdBy,
        paymentId: params.paymentId,
        branchId: params.branchId || null,
        costCenterId: params.costCenterId || null,
      },
      resolver.resolveRoleRecipients(["admin", "general_manager"], params.branchId || null, null, params.costCenterId || null),
      {
        referenceType: "payment_approval",
        referenceId: params.paymentId,
        title,
        message,
        priority: "high",
        severity: "warning",
        category: "approvals",
        eventAction: "approval_requested",
      },
      "⚠️ [PAYMENT_NOTIFICATION] Approval-request notification failed:"
    )
  }

  async notifyApproved(params: PaymentApprovedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const isSupplier = params.paymentType === "supplier"

    await this.archiveApprovalNotifications({
      companyId: params.companyId,
      paymentId: params.paymentId,
      branchId: params.branchId || null,
      costCenterId: params.costCenterId || null,
    })

    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.approvedBy,
        paymentId: params.paymentId,
        branchId: null,
        costCenterId: null,
      },
      resolver.resolveUserRecipient(params.createdBy),
      {
        referenceType: "payment_approval",
        referenceId: params.paymentId,
        title: params.appLang === "en" ? "Payment Approved" : "تم اعتماد الدفعة",
        message:
          params.appLang === "en"
            ? `Your ${isSupplier ? "supplier payment" : "customer receipt"} of ${params.amount.toFixed(2)} ${params.currency} for "${params.partyName}" has been approved.`
            : `تم اعتماد ${isSupplier ? "الدفعة" : "سند القبض"} بمبلغ ${params.amount.toFixed(2)} ${params.currency} ل${isSupplier ? "مورد" : "عميل"} "${params.partyName}".`,
        priority: "normal",
        severity: "info",
        category: "approvals",
        eventAction: "approved_creator_notified",
      }
    )
  }

  async notifyRejected(params: PaymentRejectedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const isSupplier = params.paymentType === "supplier"

    await this.archiveApprovalNotifications({
      companyId: params.companyId,
      paymentId: params.paymentId,
      branchId: params.branchId || null,
      costCenterId: params.costCenterId || null,
    })

    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.rejectedBy,
        paymentId: params.paymentId,
        branchId: null,
        costCenterId: null,
      },
      resolver.resolveUserRecipient(params.createdBy),
      {
        referenceType: "payment_approval",
        referenceId: params.paymentId,
        title: params.appLang === "en" ? "Payment Rejected" : "تم رفض الدفعة",
        message:
          params.appLang === "en"
            ? `Your ${isSupplier ? "supplier payment" : "customer receipt"} of ${params.amount.toFixed(2)} ${params.currency} for "${params.partyName}" was rejected. Reason: ${params.reason}`
            : `تم رفض ${isSupplier ? "الدفعة" : "سند القبض"} بمبلغ ${params.amount.toFixed(2)} ${params.currency} ل${isSupplier ? "مورد" : "عميل"} "${params.partyName}". السبب: ${params.reason}`,
        priority: "high",
        severity: "error",
        category: "approvals",
        eventAction: "rejected_creator_notified",
      }
    )
  }

  async archiveApprovalNotifications(params: {
    companyId: string
    paymentId: string
    branchId?: string | null
    costCenterId?: string | null
  }) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const recipients = resolver.resolveRoleRecipients(
      ["admin", "general_manager"],
      params.branchId || null,
      null,
      params.costCenterId || null
    )

    const compatibleEventKeys = [
      `payment_approval:${params.paymentId}:request:admin`,
      `payment_approval:${params.paymentId}:request:general_manager`,
      ...recipients.map((recipient) =>
        buildNotificationEventKey(
          "finance",
          "payment_approval",
          params.paymentId,
          "approval_requested",
          ...resolver.buildRecipientScopeSegments(recipient)
        )
      ),
    ]

    const { data: notifications, error: selectError } = await this.supabase
      .from("notifications")
      .select("id")
      .eq("company_id", params.companyId)
      .eq("reference_type", "payment_approval")
      .eq("reference_id", params.paymentId)
      .in("status", ["unread", "read"])
      .in("event_key", compatibleEventKeys)

    if (selectError) {
      console.error("Error selecting payment approval notifications to archive:", selectError)
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
      console.error("Error archiving payment approval notifications:", updateError)
    }
  }

  private async dispatch(
    params: {
      companyId: string
      actorUserId: string
      paymentId: string
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
      paymentId: string
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
      p_warehouse_id: recipient.warehouseId ?? null,
      p_assigned_to_role: recipient.kind === "role" ? recipient.role : null,
      p_assigned_to_user: recipient.kind === "user" ? recipient.userId : null,
      p_priority: payload.priority,
      p_event_key: buildNotificationEventKey(
        "finance",
        payload.referenceType,
        payload.referenceId,
        payload.eventAction,
        ...resolver.buildRecipientScopeSegments(recipient)
      ),
      p_severity: normalizeNotificationSeverity(payload.severity),
      p_category: payload.category,
    })

    if (error) {
      throw new Error(error.message || "Failed to dispatch payment approval notification")
    }
  }
}
