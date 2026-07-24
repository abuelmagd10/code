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
  /**
   * Display name of the creator. v3.74.397 — surfaced inside the
   * approver-facing message so the L1 approver (owner / GM) knows
   * whose request is on their desk without opening the PO.
   * Optional for backwards compatibility; if omitted, the message
   * omits the "by X" clause.
   */
  createdByName?: string | null
  isResubmission?: boolean
  /**
   * v3.74.808 — the creator's justification (purchase_orders.notes),
   * quoted inside the approver-facing message so the owner / GM can
   * see WHY before deciding — the owner: the officer's note is the
   * essence of the approval decision, especially after a rejection.
   * Mirrors v3.74.795 (sales: the employee note travels).
   */
  notes?: string | null
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
    // v3.74.397 — embed the creator's name when available so approvers
    // can triage requests from the notification list directly.
    const creatorClauseEn = params.createdByName ? ` (created by ${params.createdByName})` : ""
    const creatorClauseAr = params.createdByName ? ` (المُنشِئ: ${params.createdByName})` : ""

    // v3.74.808 — quote the creator's note (truncated like v3.74.795)
    // so the approver reads the justification inside the notification.
    const rawNote = (params.notes || "").trim()
    const quotedNote = rawNote.length > 200 ? `${rawNote.slice(0, 200)}…` : rawNote
    const noteClauseEn = quotedNote ? ` — Creator's note: «${quotedNote}»` : ""
    const noteClauseAr = quotedNote ? ` — ملاحظة المُنشِئ: «${quotedNote}»` : ""

    const message =
      params.appLang === "en"
        ? isResubmission
          ? `Purchase Order ${params.poNumber} for ${params.supplierName} (${params.amount} ${params.currency}) has been modified and requires your re-approval${creatorClauseEn}${noteClauseEn}`
          : `Purchase Order ${params.poNumber} for ${params.supplierName} (${params.amount} ${params.currency}) requires your approval${creatorClauseEn}${noteClauseEn}`
        : isResubmission
          ? `تم تعديل أمر الشراء ${params.poNumber} للمورد ${params.supplierName} بقيمة ${params.amount} ${params.currency} ويحتاج إلى إعادة الاعتماد${creatorClauseAr}${noteClauseAr}`
          : `أمر شراء ${params.poNumber} للمورد ${params.supplierName} بقيمة ${params.amount} ${params.currency} يحتاج إلى موافقتك${creatorClauseAr}${noteClauseAr}`

    // v3.74.22 — was resolveLeadershipVisibilityRecipients (admin-only)
    // which silently relied on RPC fan-out to reach owner / general_manager.
    // Replace with the canonical L1 approver list so owner + admin + GM
    // are addressed directly. The separate `manager` block below stays
    // as-is because it's branch-scoped and only fires when branchId is
    // present — resolveLevel1ApproverRecipients already includes manager
    // but using null branchId emits a company-wide manager recipient,
    // which is the wrong scope for PO. Pass branchId here to keep
    // manager branch-scoped; the call below becomes redundant when
    // branchId is set, so drop it under that guard.
    // v3.74.133 — was resolveLevel1ApproverRecipients which fanned out to
    // owner + admin + general_manager. The Owner inbox surfaced admin and
    // general_manager notifications via role inheritance, so a single PO
    // approval request landed as a duplicate in the Owner inbox. Per
    // v3.74.131 the approver list is owner + manager only, so we tighten
    // the dispatch list to match. The branch-scoped manager block below
    // still fires.
    await this.dispatch(
      {
        companyId: params.companyId,
        actorUserId: params.createdBy,
        poId: params.poId,
        branchId: null,
        costCenterId: null,
      },
      resolver.resolveRoleRecipients(["owner"], null, null, null),
      {
        referenceType: "purchase_order",
        referenceId: params.poId,
        title,
        message,
        priority: "high",
        severity: "warning",
        category: "approvals",
        kind: "action", // v3.74.588 — أمر شراء بانتظار الاعتماد (مرحلة طلب)
        eventAction: isResubmission ? "approval_resubmitted" : "approval_requested",
      },
      "⚠️ [PO_NOTIFICATION] Owner approval-request notification failed:"
    )

    // v3.74.138 — Per product spec the "المدير العام" sees ALL branches
    // (not branch-scoped). So manager dispatch goes company-wide with no
    // branch/cost-center filter — matching the owner dispatch above. The
    // old branch-scoped block silently dropped the notification for managers
    // whose company_members.cost_center_id differed from the PO's, which is
    // the same v3.74.136-class bug fixed for the accountant role.
    await this.dispatch(
      {
        companyId: params.companyId,
        actorUserId: params.createdBy,
        poId: params.poId,
        branchId: null,
        costCenterId: null,
      },
      resolver.resolveRoleRecipients(["manager"], null, null, null),
      {
        referenceType: "purchase_order",
        referenceId: params.poId,
        title,
        message,
        priority: "high",
        severity: "warning",
        category: "approvals",
        kind: "action", // v3.74.588 — أمر شراء بانتظار الاعتماد (مرحلة طلب)
        eventAction: isResubmission ? "approval_resubmitted" : "approval_requested",
      },
      "⚠️ [PO_NOTIFICATION] Manager approval-request notification failed:"
    )
  }

  async notifyApprovedWorkflow(params: PurchaseOrderApprovedNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)

    // v3.74.138 — Determine the creator's role so we can dedup the
    // "creator + accountant" pair into a single notification when the
    // creator IS the branch accountant. Without this dedup an accountant
    // who raised a PO would receive two pings on approval (one as user,
    // one as role).
    let creatorRole: string | null = null
    try {
      const { data: creatorMember } = await this.supabase
        .from("company_members")
        .select("role")
        .eq("company_id", params.companyId)
        .eq("user_id", params.createdBy)
        .maybeSingle()
      creatorRole = (creatorMember?.role as string | null) || null
    } catch (e) {
      creatorRole = null
    }

    const creatorIsAccountant = creatorRole === "accountant"

    // Notify the PO creator individually (skip if they will already see
    // the accountant-role ping below — that's the dedup case).
    if (!creatorIsAccountant) {
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
    }

    // v3.74.138 — Removed the "Incoming Goods — PO Approved" leadership
    // visibility ping. The product spec for the procurement cycle lists
    // only 4 recipients at this stage (creator + branch accountant), so
    // this extra inventory-channel ping to admin role is out of scope and
    // contributed to inbox duplication for the owner via role inheritance.

    // v3.74.129 — Tell the branch accountant a draft purchase bill is waiting
    // for them. v3.74.138 — Dropped cost_center_id from the role scope (same
    // fix as v3.74.136 for the accountant rejection ping). When the PO
    // creator IS an accountant, this ping doubles as their "approved"
    // notification (we skipped the user-level ping above to avoid dup).
    if (params.linkedBillId) {
      await this.dispatch(
        {
          companyId: params.companyId,
          actorUserId: params.approvedBy,
          poId: params.poId,
          branchId: params.branchId || null,
          costCenterId: null,
        },
        resolver.resolveRoleRecipients(["accountant"], params.branchId || null, null, null),
        {
          referenceType: "bill",
          referenceId: params.linkedBillId,
          title:
            params.appLang === "en"
              ? "Draft Purchase Bill — Awaiting Your Approval"
              : "فاتورة مشتريات جديدة — تَنتَظِر اعتمادك",
          message:
            params.appLang === "en"
              ? `Purchase Order ${params.poNumber} for ${params.supplierName} (${params.amount} ${params.currency}) was approved and a draft purchase bill has been created. Open it to review and approve so the AP entry can be posted.`
              : `تم اعتماد أمر الشراء ${params.poNumber} للمورد ${params.supplierName} بقيمة ${params.amount} ${params.currency} وتَم إنشاء فاتورة مشتريات بحالة "مسودة". افتَحها لمُراجَعَتها واعتمادها لتَسجيل القَيد المحاسبى.`,
          priority: "high",
          severity: "warning",
          category: "approvals",
          kind: "action", // v3.74.588 — فاتورة مسودة تنتظر اعتماد المحاسب (مرحلة طلب)
          eventAction: "approved_accountant_bill_waiting",
        },
        "⚠️ [PO_NOTIFICATION] Accountant draft-bill notification failed:"
      )
    }
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
      // v3.74.588 — 'action' لمراحل الطلب، الافتراضي 'info'
      kind?: "action" | "info"
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
      // v3.74.588 — 'action' لمراحل الطلب، الافتراضي 'info'
      kind?: "action" | "info"
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
      // v3.74.588 — تمرير نوع الإشعار (DEFAULT 'info' في قاعدة البيانات)
      p_kind: payload.kind || "info",
    })

    if (error) {
      throw new Error(error.message || "Failed to dispatch purchase order notification")
    }
  }
}
