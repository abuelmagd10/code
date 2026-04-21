import { buildNotificationEventKey, normalizeNotificationSeverity } from "@/lib/notification-workflow"
import {
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from "@/lib/services/notification-recipient-resolver.service"

type SupabaseLike = any

type BankVoucherNotificationBaseParams = {
  companyId: string
  requestId: string
  voucherType: "deposit" | "withdraw"
  amount: number
  currency: string
  branchId?: string | null
  costCenterId?: string | null
  appLang?: "ar" | "en"
}

export type BankVoucherApprovalRequestNotificationParams = BankVoucherNotificationBaseParams & {
  createdBy: string
}

export type BankVoucherApprovedNotificationParams = BankVoucherNotificationBaseParams & {
  createdBy: string
  approvedBy: string
}

export type BankVoucherRejectedNotificationParams = BankVoucherNotificationBaseParams & {
  createdBy: string
  rejectedBy: string
  reason: string
}

export class BankVoucherNotificationService {
  constructor(private readonly supabase: SupabaseLike) {}

  async notifyApprovalRequested(params: BankVoucherApprovalRequestNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const typeNamesAr: Record<string, string> = { deposit: "إيداع", withdraw: "سحب" }
    const typeNamesEn: Record<string, string> = { deposit: "Deposit", withdraw: "Withdrawal" }
    const title =
      params.appLang === "en"
        ? `New ${typeNamesEn[params.voucherType]} Request`
        : `طلب ${typeNamesAr[params.voucherType]} جديد`
    const message =
      params.appLang === "en"
        ? `A new ${typeNamesEn[params.voucherType]} request for ${params.amount} ${params.currency} requires your approval.`
        : `طلب ${typeNamesAr[params.voucherType]} جديد بقيمة ${params.amount} ${params.currency} يحتاج لاعتمادك.`

    await this.archiveApprovalRequestNotifications({
      companyId: params.companyId,
      requestId: params.requestId,
      branchId: params.branchId || null,
      costCenterId: params.costCenterId || null,
    })

    const roleRecipients = [
      ...resolver.resolveRoleRecipients(["manager"], params.branchId || null, null, params.costCenterId || null),
      ...resolver.resolveLeadershipRecipients(),
    ]

    await this.dispatch(
      {
        companyId: params.companyId,
        actorUserId: params.createdBy,
        requestId: params.requestId,
        branchId: params.branchId || null,
        costCenterId: params.costCenterId || null,
      },
      roleRecipients,
      {
        referenceType: "bank_voucher",
        referenceId: params.requestId,
        title,
        message,
        priority: "high",
        severity: "warning",
        category: "approvals",
        eventAction: "approval_requested",
      },
      "⚠️ [BANK_VOUCHER_NOTIFICATION] Approval-request notification failed:"
    )
  }

  async notifyApproved(params: BankVoucherApprovedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const typeNamesAr: Record<string, string> = { deposit: "إيداع", withdraw: "سحب" }
    const typeNamesEn: Record<string, string> = { deposit: "Deposit", withdraw: "Withdrawal" }

    await this.archiveApprovalRequestNotifications({
      companyId: params.companyId,
      requestId: params.requestId,
      branchId: params.branchId || null,
      costCenterId: params.costCenterId || null,
    })

    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.approvedBy,
        requestId: params.requestId,
        branchId: params.branchId || null,
        costCenterId: params.costCenterId || null,
      },
      resolver.resolveUserRecipient(params.createdBy),
      {
        referenceType: "bank_voucher",
        referenceId: params.requestId,
        title:
          params.appLang === "en"
            ? `${typeNamesEn[params.voucherType]} Request Approved`
            : `تم اعتماد طلب الـ ${typeNamesAr[params.voucherType]}`,
        message:
          params.appLang === "en"
            ? `Your ${typeNamesEn[params.voucherType]} request for ${params.amount} ${params.currency} has been approved.`
            : `تمت الموافقة على طلب الـ ${typeNamesAr[params.voucherType]} الخاص بك بقيمة ${params.amount} ${params.currency}.`,
        priority: "normal",
        severity: "info",
        category: "approvals",
        eventAction: "approved_creator_notified",
      }
    )
  }

  async notifyRejected(params: BankVoucherRejectedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const typeNamesAr: Record<string, string> = { deposit: "إيداع", withdraw: "سحب" }
    const typeNamesEn: Record<string, string> = { deposit: "Deposit", withdraw: "Withdrawal" }

    await this.archiveApprovalRequestNotifications({
      companyId: params.companyId,
      requestId: params.requestId,
      branchId: params.branchId || null,
      costCenterId: params.costCenterId || null,
    })

    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.rejectedBy,
        requestId: params.requestId,
        branchId: params.branchId || null,
        costCenterId: params.costCenterId || null,
      },
      resolver.resolveUserRecipient(params.createdBy),
      {
        referenceType: "bank_voucher",
        referenceId: params.requestId,
        title:
          params.appLang === "en"
            ? `${typeNamesEn[params.voucherType]} Request Rejected`
            : `تم رفض طلب الـ ${typeNamesAr[params.voucherType]}`,
        message:
          params.appLang === "en"
            ? `Your ${typeNamesEn[params.voucherType]} request for ${params.amount} ${params.currency} was rejected. Reason: ${params.reason}`
            : `تم رفض طلب الـ ${typeNamesAr[params.voucherType]} الخاص بك بقيمة ${params.amount} ${params.currency}. السبب: ${params.reason}`,
        priority: "high",
        severity: "error",
        category: "approvals",
        eventAction: "rejected_creator_notified",
      }
    )
  }

  async archiveApprovalRequestNotifications(params: {
    companyId: string
    requestId: string
    branchId?: string | null
    costCenterId?: string | null
  }) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const recipients = [
      ...resolver.resolveRoleRecipients(["manager"], params.branchId || null, null, params.costCenterId || null),
      ...resolver.resolveLeadershipRecipients(),
    ]

    const compatibleEventKeys = [
      `bank_voucher:${params.requestId}:created:manager`,
      `bank_voucher:${params.requestId}:created:owner`,
      ...recipients.map((recipient) =>
        buildNotificationEventKey(
          "finance",
          "bank_voucher",
          params.requestId,
          "approval_requested",
          ...resolver.buildRecipientScopeSegments(recipient)
        )
      ),
    ]

    const { data: notifications, error: selectError } = await this.supabase
      .from("notifications")
      .select("id")
      .eq("company_id", params.companyId)
      .eq("reference_type", "bank_voucher")
      .eq("reference_id", params.requestId)
      .in("status", ["unread", "read"])
      .in("event_key", compatibleEventKeys)

    if (selectError) {
      console.error("Error selecting bank voucher approval notifications to archive:", selectError)
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
      console.error("Error archiving bank voucher approval notifications:", updateError)
    }
  }

  private async dispatch(
    params: {
      companyId: string
      actorUserId: string
      requestId: string
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
      requestId: string
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
      throw new Error(error.message || "Failed to dispatch bank voucher notification")
    }
  }
}
