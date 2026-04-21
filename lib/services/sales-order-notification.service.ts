import { buildNotificationEventKey, normalizeNotificationSeverity } from "@/lib/notification-workflow"
import {
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from "@/lib/services/notification-recipient-resolver.service"

type SupabaseLike = any

export type SalesOrderCreatedNotificationParams = {
  companyId: string
  createdBy: string
  salesOrderId: string
  salesOrderNumber: string
  branchId?: string | null
  costCenterId?: string | null
  warehouseId?: string | null
  branchName?: string | null
  linkedInvoiceId?: string | null
  linkedInvoiceNumber?: string | null
}

export class SalesOrderNotificationService {
  constructor(private readonly supabase: SupabaseLike) {}

  async notifySalesOrderCreated(params: SalesOrderCreatedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)

    const accountantRecipients = resolver.resolveBranchAccountantRecipients(
      params.branchId || null,
      params.costCenterId || null
    )

    const accountantRefType = params.linkedInvoiceId ? "invoice" : "sales_order"
    const accountantRefId = params.linkedInvoiceId || params.salesOrderId
    const accountantTitle = params.linkedInvoiceId ? "فاتورة بيع جديدة في فرعكم" : "أمر بيع جديد في فرعكم"
    const accountantMessage = params.linkedInvoiceId
      ? `تم إنشاء فاتورة بيع جديدة رقم (${params.linkedInvoiceNumber || params.linkedInvoiceId}) في فرعكم وبانتظار المتابعة`
      : `تم إنشاء أمر بيع جديد في فرعكم رقم (${params.salesOrderNumber}) وبانتظار المتابعة`

    await this.dispatch(
      params,
      accountantRecipients,
      {
        referenceType: accountantRefType,
        referenceId: accountantRefId,
        title: accountantTitle,
        message: accountantMessage,
        priority: "normal",
        severity: "info",
        category: "finance",
        eventAction: params.linkedInvoiceId ? "created_branch_invoice_followup" : "created_branch_order_followup",
      },
      "⚠️ [SALES_ORDER] Branch accountant notification failed:"
    )

    await this.dispatch(
      params,
      resolver.resolveLeadershipVisibilityRecipients(),
      {
        referenceType: "sales_order",
        referenceId: params.salesOrderId,
        title: "أمر بيع جديد",
        message: `تم إنشاء أمر بيع جديد رقم (${params.salesOrderNumber}) في فرع (${params.branchName || "غير محدد"})`,
        priority: "normal",
        severity: "info",
        category: "sales",
        eventAction: "created_management_visibility",
      },
      "⚠️ [SALES_ORDER] Leadership notification failed:"
    )
  }

  private async dispatch(
    params: SalesOrderCreatedNotificationParams,
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
    const resolver = new NotificationRecipientResolverService(this.supabase)
    for (const recipient of recipients) {
      const { error } = await this.supabase.rpc("create_notification", {
        p_company_id: params.companyId,
        p_reference_type: payload.referenceType,
        p_reference_id: payload.referenceId,
        p_title: payload.title,
        p_message: payload.message,
        p_created_by: params.createdBy,
        p_branch_id: recipient.branchId ?? params.branchId ?? null,
        p_cost_center_id: recipient.costCenterId ?? params.costCenterId ?? null,
        p_warehouse_id: recipient.warehouseId ?? params.warehouseId ?? null,
        p_assigned_to_role: recipient.kind === "role" ? recipient.role : null,
        p_assigned_to_user: recipient.kind === "user" ? recipient.userId : null,
        p_priority: payload.priority,
        p_event_key: buildNotificationEventKey(
          "sales",
          payload.referenceType,
          payload.referenceId,
          payload.eventAction,
          ...resolver.buildRecipientScopeSegments(recipient)
        ),
        p_severity: normalizeNotificationSeverity(payload.severity),
        p_category: payload.category,
      })

      if (error) {
        console.error(warningLabel, error.message)
      }
    }
  }
}
