import { buildNotificationEventKey, normalizeNotificationSeverity } from "@/lib/notification-workflow"
import {
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from "@/lib/services/notification-recipient-resolver.service"

type SupabaseLike = any

type RecipientDispatchContext = {
  companyId: string
  actorUserId: string
  referenceId: string
  branchId?: string | null
  costCenterId?: string | null
}

type NotificationPayload = {
  referenceType: string
  referenceId: string
  title: string
  message: string
  priority: "low" | "normal" | "high" | "urgent"
  severity: "info" | "warning" | "error" | "critical"
  category: "finance" | "inventory" | "sales" | "approvals" | "system"
  eventAction: string
}

type BaseParams = {
  companyId: string
  actorUserId: string
  appLang?: "ar" | "en"
}

type VendorCreditRow = {
  id: string
  branch_id: string | null
  cost_center_id: string | null
}

type CustomerDebitNoteRow = {
  id: string
  branch_id: string | null
  cost_center_id: string | null
}

type VendorRefundRequestRow = {
  id: string
  branch_id: string | null
  created_by: string | null
  amount: number | null
  currency: string | null
  suppliers?: { name: string | null } | null
}

function normalizeLanguage(appLang?: "ar" | "en") {
  return appLang === "en" ? "en" : "ar"
}

export class FinancialDocumentNotificationService {
  constructor(private readonly supabase: SupabaseLike) {}

  async notifyVendorCreditCreated(params: BaseParams & { vendorCreditId: string }) {
    const appLang = normalizeLanguage(params.appLang)
    const vendorCredit = await this.loadVendorCredit(params.companyId, params.vendorCreditId)
    const resolver = new NotificationRecipientResolverService(this.supabase)

    await this.dispatch(
      {
        companyId: params.companyId,
        actorUserId: params.actorUserId,
        referenceId: vendorCredit.id,
        branchId: vendorCredit.branch_id,
        costCenterId: vendorCredit.cost_center_id,
      },
      resolver.resolveRoleRecipients(
        ["accountant", "manager"],
        vendorCredit.branch_id || null,
        null,
        vendorCredit.cost_center_id || null
      ),
      {
        referenceType: "vendor_credit",
        referenceId: vendorCredit.id,
        title: appLang === "en" ? "New Vendor Credit" : "إشعار دائن مورد جديد",
        message:
          appLang === "en"
            ? "A new vendor credit has been created and requires review."
            : "تم إنشاء إشعار دائن مورد جديد ويحتاج إلى مراجعة.",
        priority: "normal",
        severity: "info",
        category: "finance",
        eventAction: "created",
      },
      "⚠️ [FINANCIAL_NOTIFICATION] Failed to send vendor-credit notification:"
    )
  }

  async notifyCustomerDebitNoteCreated(params: BaseParams & { debitNoteId: string }) {
    const appLang = normalizeLanguage(params.appLang)
    const debitNote = await this.loadCustomerDebitNote(params.companyId, params.debitNoteId)
    const resolver = new NotificationRecipientResolverService(this.supabase)

    await this.dispatch(
      {
        companyId: params.companyId,
        actorUserId: params.actorUserId,
        referenceId: debitNote.id,
        branchId: debitNote.branch_id,
        costCenterId: debitNote.cost_center_id,
      },
      resolver.resolveRoleRecipients(
        ["accountant", "manager"],
        debitNote.branch_id || null,
        null,
        debitNote.cost_center_id || null
      ),
      {
        referenceType: "customer_debit_note",
        referenceId: debitNote.id,
        title: appLang === "en" ? "New Customer Debit Note" : "إشعار مدين عميل جديد",
        message:
          appLang === "en"
            ? "A new customer debit note has been created and requires review."
            : "تم إنشاء إشعار مدين عميل جديد ويحتاج إلى مراجعة.",
        priority: "normal",
        severity: "info",
        category: "finance",
        eventAction: "created",
      },
      "⚠️ [FINANCIAL_NOTIFICATION] Failed to send customer-debit-note notification:"
    )
  }

  async notifyVendorRefundDecision(
    params: BaseParams & {
      requestId: string
      action: "approved" | "rejected"
      rejectionReason?: string | null
    }
  ) {
    const appLang = normalizeLanguage(params.appLang)
    const request = await this.loadVendorRefundRequest(params.companyId, params.requestId)
    if (!request.created_by) return

    const resolver = new NotificationRecipientResolverService(this.supabase)
    const supplierName = request.suppliers?.name || (appLang === "en" ? "Supplier" : "المورد")
    const amountText = `${Number(request.amount || 0).toLocaleString()} ${request.currency || ""}`.trim()
    const isApproved = params.action === "approved"

    await this.createNotification(
      {
        companyId: params.companyId,
        actorUserId: params.actorUserId,
        referenceId: request.id,
        branchId: request.branch_id,
      },
      resolver.resolveUserRecipient(request.created_by, null, request.branch_id || null, null, null),
      {
        referenceType: "vendor_refund_request",
        referenceId: request.id,
        title:
          appLang === "en"
            ? isApproved
              ? `Refund Approved - ${supplierName}`
              : `Refund Rejected - ${supplierName}`
            : isApproved
              ? `تم اعتماد الاسترداد - ${supplierName}`
              : `تم رفض الاسترداد - ${supplierName}`,
        message:
          appLang === "en"
            ? isApproved
              ? `Your refund request of ${amountText} for "${supplierName}" has been approved and processed.`
              : `Your refund request of ${amountText} for "${supplierName}" was rejected. Reason: ${params.rejectionReason || "No reason provided"}`
            : isApproved
              ? `تم اعتماد طلب الاسترداد البالغ ${amountText} للمورد "${supplierName}" وتنفيذه.`
              : `تم رفض طلب الاسترداد البالغ ${amountText} للمورد "${supplierName}". السبب: ${params.rejectionReason || "لم يُذكر سبب"}`,
        priority: isApproved ? "normal" : "high",
        severity: isApproved ? "info" : "warning",
        category: "finance",
        eventAction: isApproved ? "approved_requester_notified" : "rejected_requester_notified",
      }
    )
  }

  async archiveVendorRefundApprovalNotifications(params: {
    companyId: string
    requestId: string
    branchId?: string | null
  }) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const recipients = resolver.resolveRoleRecipients(
      ["owner", "admin", "general_manager"],
      params.branchId || null,
      null,
      null
    )

    const compatibleEventKeys = [
      `vendor_refund_request:${params.requestId}:created:owner`,
      `vendor_refund_request:${params.requestId}:created:admin`,
      `vendor_refund_request:${params.requestId}:created:general_manager`,
      ...recipients.map((recipient) =>
        buildNotificationEventKey(
          "finance",
          "vendor_refund_request",
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
      .eq("reference_type", "vendor_refund_request")
      .eq("reference_id", params.requestId)
      .in("status", ["unread", "read"])
      .in("event_key", compatibleEventKeys)

    if (selectError) {
      console.error("Error selecting vendor refund approval notifications to archive:", selectError)
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
      console.error("Error archiving vendor refund approval notifications:", updateError)
    }
  }

  private async loadVendorCredit(companyId: string, vendorCreditId: string): Promise<VendorCreditRow> {
    const { data, error } = await this.supabase
      .from("vendor_credits")
      .select("id, branch_id, cost_center_id")
      .eq("company_id", companyId)
      .eq("id", vendorCreditId)
      .maybeSingle()

    if (error || !data) {
      throw new Error(error?.message || "Vendor credit not found for notifications")
    }

    return data as VendorCreditRow
  }

  private async loadCustomerDebitNote(companyId: string, debitNoteId: string): Promise<CustomerDebitNoteRow> {
    const { data, error } = await this.supabase
      .from("customer_debit_notes")
      .select("id, branch_id, cost_center_id")
      .eq("company_id", companyId)
      .eq("id", debitNoteId)
      .maybeSingle()

    if (error || !data) {
      throw new Error(error?.message || "Customer debit note not found for notifications")
    }

    return data as CustomerDebitNoteRow
  }

  private async loadVendorRefundRequest(companyId: string, requestId: string): Promise<VendorRefundRequestRow> {
    const { data, error } = await this.supabase
      .from("vendor_refund_requests")
      .select("id, branch_id, created_by, amount, currency, suppliers(name)")
      .eq("company_id", companyId)
      .eq("id", requestId)
      .maybeSingle()

    if (error || !data) {
      throw new Error(error?.message || "Vendor refund request not found for notifications")
    }

    return data as VendorRefundRequestRow
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
      throw new Error(error.message || "Failed to dispatch financial document notification")
    }
  }
}
