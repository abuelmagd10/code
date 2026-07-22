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

    // v3.74.783 — the accountant is notified about INVOICES, never sales orders.
    //
    // The owner's rule, verbatim: the accountant's work starts once the invoice
    // linked to the sales order exists — sales orders are not his concern.
    //
    // The fallback that notified him about the bare order was a leftover of the
    // old flow, where order and invoice were born together in one request. In
    // the single-approval cycle (v3.74.782) an order with a pending discount
    // has NO invoice yet — and may be rejected and never get one — so that
    // notification was noise about a document outside his role. When the
    // invoice IS born (immediately for no-discount orders, at approval
    // otherwise), he is notified about it here or by the approval path.
    if (params.linkedInvoiceId) {
      await this.dispatch(
        params,
        accountantRecipients,
        {
          referenceType: "invoice",
          referenceId: params.linkedInvoiceId,
          title: "فاتورة بيع جديدة في فرعكم",
          message: `تم إنشاء فاتورة بيع جديدة رقم (${params.linkedInvoiceNumber || params.linkedInvoiceId}) في فرعكم وبانتظار المتابعة`,
          priority: "normal",
          severity: "info",
          category: "finance",
          eventAction: "created_branch_invoice_followup",
        },
        "⚠️ [SALES_ORDER] Branch accountant notification failed:"
      )
    }

    // v3.74.789 — the owner, upon receiving "أمر بيع جديد" for SO-0003:
    // «ما فائدة هذا الإشعار إلى المالك؟». Decision: routine creation is the
    // BRANCH MANAGER's operational concern — and he already gets his own
    // notification from the DB trigger so_branch_manager_notify_trg
    // («نشاط فرعك: تم إنشاء طلب مبيعات»). Owner and GM are summoned only
    // when a DECISION is theirs (discount approval) or something exceptional
    // happens (warehouse rejection, integrity findings). This leadership
    // broadcast was pure noise on top of the branch manager's channel, so it
    // is removed entirely rather than re-targeted — re-targeting would have
    // DOUBLED the branch manager's notifications for every order.
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
