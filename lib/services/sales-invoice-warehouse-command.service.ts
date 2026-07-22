import { AccountingTransactionService, type InventoryShortageItem } from "@/lib/accounting-transaction-service"
import { emitEvent } from "@/lib/event-bus"
import { enterpriseFinanceFlags } from "@/lib/enterprise-finance-flags"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { buildNotificationEventKey, normalizeNotificationSeverity } from "@/lib/notification-workflow"
import {
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from "@/lib/services/notification-recipient-resolver.service"

type SupabaseLike = any

export type SalesInvoiceWarehouseActor = {
  companyId: string
  userId: string
}

export type SalesInvoiceWarehouseCommand = {
  invoiceId: string
  notes?: string | null
  idempotencyKey?: string | null
  // v3.74.664 — when true, this dispatch approval ran automatically because the
  // invoice branch has no assigned warehouse manager (no custodian to approve).
  // Only affects notification/audit wording; the posting is identical.
  auto?: boolean
}

export type SalesInvoiceWarehouseResult = {
  success: true
  message: string
  transactionId?: string | null
  eventType?: string
  reverted_to_draft?: boolean
  credit_created?: boolean
  credit_amount?: number
}

export class SalesInvoiceWarehouseCommandError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
    public readonly details?: { shortages?: InventoryShortageItem[] }
  ) {
    super(message)
    this.name = "SalesInvoiceWarehouseCommandError"
  }
}

export class SalesInvoiceWarehouseCommandService {
  constructor(private readonly supabase: SupabaseLike) {}

  async approveDelivery(actor: SalesInvoiceWarehouseActor, command: SalesInvoiceWarehouseCommand): Promise<SalesInvoiceWarehouseResult> {
    const invoice = await this.loadInvoice(actor.companyId, command.invoiceId, "invoice_number, branch_id, cost_center_id, status, warehouse_status, approval_status, created_by_user_id, posted_by_user_id")
    const invoiceSenderId = invoice.posted_by_user_id || invoice.created_by_user_id || null

    // v3.74.501 — نفس بوابة استلام المشتريات (v3.74.499): لا يُعتمد إخراج
    // بضاعة لفاتورة بانتظار الاعتماد الإداري أو عليها تعديل/خصم معلق.
    if (invoice.status === "pending_approval") {
      throw new SalesInvoiceWarehouseCommandError(
        "يجب اعتماد الفاتورة إدارياً أولاً (المالك / المدير العام) قبل اعتماد إخراج البضاعة من المخزن.",
        409
      )
    }

    const { data: pendingAmendment } = await this.supabase
      .from("discount_approvals")
      .select("id")
      .eq("company_id", actor.companyId)
      .eq("document_type", "sales_invoice")
      .eq("document_id", command.invoiceId)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle()

    if (pendingAmendment) {
      throw new SalesInvoiceWarehouseCommandError(
        "يوجد تعديل/خصم معلق على الفاتورة بانتظار اعتماد الإدارة. لا يمكن اعتماد إخراج البضاعة قبل البت فيه.",
        409
      )
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      command.idempotencyKey || null,
      ["warehouse-approval", actor.companyId, command.invoiceId]
    )
    const requestHash = buildFinancialRequestHash({
      invoiceId: command.invoiceId,
      companyId: actor.companyId,
      actorId: actor.userId,
      notes: command.notes || null,
    })

    const accountingService = new AccountingTransactionService(this.supabase)
    const approvalResult = await accountingService.approveSalesDeliveryAtomic({
      invoiceId: command.invoiceId,
      companyId: actor.companyId,
      confirmedBy: actor.userId,
      notes: command.notes || null,
    }, {
      idempotencyKey,
      requestHash,
    })

    if (!approvalResult.success) {
      console.error("[WAREHOUSE_APPROVE] Atomic Error:", approvalResult.error)
      // v3.74.74 — pass structured shortages so the API can return them
      // and dispatch-approvals opens its rich shortage modal instead
      // of a raw error toast.
      if (approvalResult.shortages && approvalResult.shortages.length > 0) {
        throw new SalesInvoiceWarehouseCommandError(
          approvalResult.error || "المَخزون غَير كافٍ",
          400,
          { shortages: approvalResult.shortages }
        )
      }
      throw new SalesInvoiceWarehouseCommandError(approvalResult.error || "Unknown error", 400)
    }

    if (enterpriseFinanceFlags.observabilityEvents) {
      await emitEvent(this.supabase, {
        companyId: actor.companyId,
        eventName: "delivery.approved",
        entityType: "invoice",
        entityId: command.invoiceId,
        actorId: actor.userId,
        idempotencyKey: `delivery.approved:${approvalResult.transactionId || idempotencyKey}`,
        payload: {
          transactionId: approvalResult.transactionId,
          sourceEntity: approvalResult.sourceEntity,
          sourceId: approvalResult.sourceId,
          eventType: approvalResult.eventType,
          requestHash,
        },
      })
    }

    await this.writeWarehouseApprovalAudit(actor, command, invoice)
    await this.notifyWarehouseApproved(actor, command, invoice, invoiceSenderId)

    return {
      success: true,
      message: "تم اعتماد إخراج البضاعة بنجاح",
      transactionId: approvalResult.transactionId || null,
      eventType: approvalResult.eventType || "warehouse_approval",
    }
  }

  async rejectDelivery(actor: SalesInvoiceWarehouseActor, command: SalesInvoiceWarehouseCommand): Promise<SalesInvoiceWarehouseResult> {
    // v3.74.787 — sales_order_id added: the rejection ACTION notification goes
    // to the SOURCE document's creator (sales order / booking), per owner spec.
    const invoice = await this.loadInvoice(actor.companyId, command.invoiceId, "invoice_number, branch_id, cost_center_id, customer_id, paid_amount, created_by_user_id, posted_by_user_id, status, warehouse_status, approval_status, sales_order_id")
    const invoiceSenderId = invoice.posted_by_user_id || invoice.created_by_user_id

    const { data: rpcData, error: rpcError } = await this.supabase.rpc("reject_sales_delivery", {
      p_invoice_id: command.invoiceId,
      p_confirmed_by: actor.userId,
      p_notes: command.notes || null,
    })

    if (rpcError) {
      console.error("[WAREHOUSE_REJECT] RPC Error:", rpcError)
      throw new SalesInvoiceWarehouseCommandError(rpcError.message || "Unknown error", 400)
    }

    if (!rpcData?.success) {
      throw new SalesInvoiceWarehouseCommandError(rpcData?.error || "Unknown error", 400)
    }

    const creditCreated = Boolean(rpcData?.credit_created ?? false)
    const creditAmount = Number(rpcData?.credit_amount ?? 0)
    const revertedToDraft = Boolean(rpcData?.reverted_to_draft ?? false)

    await this.writeWarehouseRejectAudit(actor, command, invoice, {
      creditCreated,
      creditAmount,
      revertedToDraft,
    })

    if (revertedToDraft) {
      await this.notifyWarehouseRejectedDraft(actor, command, invoice, invoiceSenderId)
      return {
        success: true,
        message: "تم رفض التسليم وإرجاع الفاتورة إلى مسودة (لا توجد دفعات — لا تأثير محاسبي)",
        reverted_to_draft: true,
        credit_created: false,
        credit_amount: 0,
      }
    }

    await this.notifyWarehouseRejectedPaid(actor, command, invoice, invoiceSenderId, creditAmount)
    return {
      success: true,
      message: "تم رفض التسليم وتحويل الدفعة إلى رصيد دائن للعميل",
      reverted_to_draft: false,
      credit_created: creditCreated,
      credit_amount: creditAmount,
    }
  }

  private async loadInvoice(companyId: string, invoiceId: string, select: string) {
    const { data: invoice } = await this.supabase
      .from("invoices")
      .select(select)
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (!invoice) {
      throw new SalesInvoiceWarehouseCommandError("الفاتورة غير موجودة", 404)
    }
    return invoice
  }

  private async writeWarehouseApprovalAudit(actor: SalesInvoiceWarehouseActor, command: SalesInvoiceWarehouseCommand, invoice: any) {
    try {
      await this.supabase.from("audit_logs").insert({
        company_id: actor.companyId,
        user_id: actor.userId,
        action: "UPDATE",
        target_table: "invoices",
        record_id: command.invoiceId,
        record_identifier: invoice.invoice_number,
        old_data: {
          warehouse_status: invoice.warehouse_status || "pending",
          approval_status: invoice.approval_status || invoice.warehouse_status || "pending",
        },
        new_data: {
          warehouse_status: "approved",
          approval_status: "approved",
          approval_reason: command.notes || null,
          approved_by: actor.userId,
          approval_date: new Date().toISOString(),
        },
      })
    } catch (auditError: any) {
      console.warn("⚠️ [WAREHOUSE_APPROVE] Audit log failed:", auditError.message)
    }
  }

  private async writeWarehouseRejectAudit(
    actor: SalesInvoiceWarehouseActor,
    command: SalesInvoiceWarehouseCommand,
    invoice: any,
    result: { revertedToDraft: boolean; creditCreated: boolean; creditAmount: number },
  ) {
    try {
      await this.supabase.from("audit_logs").insert({
        company_id: actor.companyId,
        user_id: actor.userId,
        action: "UPDATE",
        target_table: "invoices",
        record_id: command.invoiceId,
        record_identifier: invoice.invoice_number,
        old_data: {
          status: invoice.status,
          warehouse_status: invoice.warehouse_status || "pending",
          approval_status: invoice.approval_status || invoice.warehouse_status || "pending",
        },
        new_data: {
          status: result.revertedToDraft ? "draft" : invoice.status,
          warehouse_status: "rejected",
          approval_status: "rejected",
          approval_reason: command.notes || null,
          rejected_by: actor.userId,
          rejected_at: new Date().toISOString(),
          approval_date: new Date().toISOString(),
          reverted_to_draft: result.revertedToDraft,
          credit_created: result.creditCreated,
          credit_amount: result.creditAmount,
        },
      })
    } catch (auditError: any) {
      console.warn("⚠️ [WAREHOUSE_REJECT] Audit log failed:", auditError.message)
    }
  }

  private async createNotification(params: Record<string, unknown>, warningLabel: string) {
    try {
      const { error } = await this.supabase.rpc("create_notification", params)
      if (error) console.warn(warningLabel, error.message)
    } catch (error: any) {
      console.warn(warningLabel, error.message)
    }
  }

  private async dispatchWorkflowNotification(
    actor: SalesInvoiceWarehouseActor,
    invoice: any,
    recipients: ResolvedNotificationRecipient[],
    payload: {
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
      await this.createNotification({
        p_company_id: actor.companyId,
        p_reference_type: "invoice",
        p_reference_id: invoice.id,
        p_title: payload.title,
        p_message: payload.message,
        p_created_by: actor.userId,
        p_branch_id: recipient.branchId ?? null,
        p_cost_center_id: recipient.costCenterId ?? null,
        p_warehouse_id: recipient.warehouseId ?? null,
        p_assigned_to_role: recipient.kind === "role" ? recipient.role : null,
        p_assigned_to_user: recipient.kind === "user" ? recipient.userId : null,
        p_priority: payload.priority,
        p_event_key: buildNotificationEventKey(
          "sales",
          "invoice",
          invoice.id,
          payload.eventAction,
          ...resolver.buildRecipientScopeSegments(recipient)
        ),
        p_severity: normalizeNotificationSeverity(payload.severity),
        p_category: payload.category,
      }, warningLabel)
    }
  }

  private async notifyWarehouseApproved(actor: SalesInvoiceWarehouseActor, command: SalesInvoiceWarehouseCommand, invoice: any, invoiceSenderId: string | null) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    // v3.74.664 — accurate wording: an auto dispatch (no branch warehouse
    // manager) must not claim it was approved "by the warehouse manager".
    const by = command.auto ? "تلقائياً (لا يوجد مسؤول مخزن لفرع الفاتورة)" : "من قِبل مسؤول المخزن"
    await this.dispatchWorkflowNotification(
      actor,
      { ...invoice, id: command.invoiceId },
      resolver.resolveBranchAccountantRecipients(invoice?.branch_id || null, invoice?.cost_center_id || null),
      {
        title: "تم إخراج البضاعة",
        message: `تم اعتماد إخراج البضاعة للفاتورة رقم (${invoice?.invoice_number}) ${by}`,
        priority: "normal",
        severity: "info",
        category: "inventory",
        eventAction: "warehouse_approved_accountant",
      },
      "⚠️ [WAREHOUSE_APPROVE] Notification failed:"
    )

    if (invoiceSenderId) {
      await this.dispatchWorkflowNotification(
        actor,
        { ...invoice, id: command.invoiceId },
        resolver.resolveInvoiceOriginatorRecipient(invoiceSenderId, invoice?.branch_id || null, invoice?.cost_center_id || null),
        {
          title: "تم اعتماد إخراج بضاعة فاتورتك",
          message: `تم اعتماد إخراج البضاعة للفاتورة رقم (${invoice.invoice_number}) ${by}، وأصبحت جاهزة للمتابعة والتحصيل.`,
          priority: "normal",
          severity: "info",
          category: "inventory",
          eventAction: "warehouse_approved_sender",
        },
        "⚠️ [WAREHOUSE_APPROVE] Sender notification failed:"
      )
    }

    await this.dispatchWorkflowNotification(
      actor,
      { ...invoice, id: command.invoiceId },
      // v3.74.22 — was resolveExecutiveRecipients (admin + GM only),
      // which silently dropped owner and branch manager. Replace with
      // the canonical Level-1 approver list so management visibility
      // is symmetric: owner / admin / GM company-wide + branch manager
      // scoped to the invoice's branch.
      resolver.resolveLevel1ApproverRecipients(invoice.branch_id || null, invoice.warehouse_id || null, null),
      {
        title: "تم اعتماد إخراج فاتورة بيع",
        message: command.auto
          ? `تم إخراج البضاعة للفاتورة رقم (${invoice.invoice_number}) تلقائياً لعدم وجود مسؤول مخزن لفرع الفاتورة.`
          : `تم اعتماد إخراج البضاعة للفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن لفرع الفاتورة.`,
        priority: "normal",
        severity: "info",
        category: "inventory",
        eventAction: "warehouse_approved_management",
      },
      "⚠️ [WAREHOUSE_APPROVE] Management notification failed:"
    )
  }

  private async notifyWarehouseRejectedDraft(actor: SalesInvoiceWarehouseActor, command: SalesInvoiceWarehouseCommand, invoice: any, invoiceSenderId: string | null) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    await this.dispatchWorkflowNotification(
      actor,
      { ...invoice, id: command.invoiceId },
      resolver.resolveBranchAccountantRecipients(invoice.branch_id || null, invoice.cost_center_id || null),
      {
        title: "تم إرجاع الفاتورة إلى مسودة",
        message: `تم إرجاع الفاتورة رقم (${invoice.invoice_number}) إلى حالة المسودة بسبب رفض مسؤول المخزن إخراج البضاعة. لا توجد دفعات مسجلة — لا يوجد أي تأثير محاسبي. ملاحظات: ${command.notes || "لا يوجد"}`,
        priority: "normal",
        severity: "warning",
        category: "inventory",
        eventAction: "warehouse_rejected_draft_accountant",
      },
      "⚠️ [WAREHOUSE_REJECT] Accountant draft-revert notification failed:"
    )

    // v3.74.787 — owner spec: the FIX starts at the SOURCE document. For an
    // SO-sourced invoice the action notification goes to the SALES ORDER
    // creator (edit the order → the edit mirrors onto the invoice → the
    // accountant is notified to re-send). For a booking-linked service
    // invoice it goes to the booking creator (edit the SOLD products in the
    // booking; service-consumed products are outside this cycle — they were
    // already used performing the service). Standalone invoices keep the
    // old sender notification as the fallback.
    let sourceEditorNotified = false

    if ((invoice as any).sales_order_id) {
      const { data: so } = await this.supabase
        .from("sales_orders")
        .select("so_number, created_by_user_id")
        .eq("id", (invoice as any).sales_order_id)
        .eq("company_id", actor.companyId)
        .maybeSingle()

      if (so?.created_by_user_id) {
        await this.dispatchWorkflowNotification(
          actor,
          { ...invoice, id: command.invoiceId },
          resolver.resolveInvoiceOriginatorRecipient(so.created_by_user_id, invoice.branch_id || null, invoice.cost_center_id || null),
          {
            title: "رفض المخزن صرف البضاعة — عدّل أمر البيع",
            message: `رفض مسؤول المخزن صرف بضاعة الفاتورة رقم (${invoice.invoice_number}) المرتبطة بأمر البيع (${so.so_number}). سبب الرفض: ${command.notes || "لم يتم تحديد سبب"}. عدّل أمر البيع (المنتجات / الكميات) وسيسرى تعديلك على الفاتورة تلقائياً، ثم يتولى محاسب الفرع إعادة إرسالها.`,
            priority: "high",
            severity: "error",
            category: "inventory",
            eventAction: "warehouse_rejected_edit_sales_order",
          },
          "⚠️ [WAREHOUSE_REJECT] SO-editor notification failed:"
        )
        sourceEditorNotified = true
      }
    } else {
      const { data: booking } = await this.supabase
        .from("bookings")
        .select("booking_no, created_by_user_id, staff_user_id")
        .eq("invoice_id", command.invoiceId)
        .eq("company_id", actor.companyId)
        .maybeSingle()

      const bookingEditor = booking?.created_by_user_id || booking?.staff_user_id || null
      if (bookingEditor) {
        await this.dispatchWorkflowNotification(
          actor,
          { ...invoice, id: command.invoiceId },
          resolver.resolveInvoiceOriginatorRecipient(bookingEditor, invoice.branch_id || null, invoice.cost_center_id || null),
          {
            title: "رفض المخزن صرف المنتجات المباعة — عدّل أمر الحجز",
            message: `رفض مسؤول المخزن صرف المنتجات المباعة فى فاتورة الخدمة رقم (${invoice.invoice_number}) المرتبطة بأمر الحجز (${booking?.booking_no || ""}). سبب الرفض: ${command.notes || "لم يتم تحديد سبب"}. عدّل المنتجات المباعة فى أمر الحجز وسيسرى التعديل على الفاتورة، ثم يتولى محاسب الفرع إعادة إرسالها. (المنتجات المستهلكة فى تنفيذ الخدمة خارج هذه الدورة — استُخدمت فى التنفيذ بالفعل.)`,
            priority: "high",
            severity: "error",
            category: "inventory",
            eventAction: "warehouse_rejected_edit_booking",
          },
          "⚠️ [WAREHOUSE_REJECT] Booking-editor notification failed:"
        )
        sourceEditorNotified = true
      }
    }

    if (!sourceEditorNotified && invoiceSenderId) {
      await this.dispatchWorkflowNotification(
        actor,
        { ...invoice, id: command.invoiceId },
        resolver.resolveInvoiceOriginatorRecipient(invoiceSenderId, invoice.branch_id || null, invoice.cost_center_id || null),
        {
          title: "رفض المخزن إخراج بضاعة فاتورتك",
          message: `تم رفض إخراج بضاعة الفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن. الفاتورة لم تكن مدفوعة وتم إرجاعها إلى مسودة تلقائياً. سبب الرفض: ${command.notes || "لم يتم تحديد سبب"}. يمكنك مراجعة الفاتورة وإعادة إرسالها.`,
          priority: "high",
          severity: "error",
          category: "inventory",
          eventAction: "warehouse_rejected_draft_sender",
        },
        "⚠️ [WAREHOUSE_REJECT] Sender draft-revert notification failed:"
      )
    }

    await this.dispatchWorkflowNotification(
      actor,
      { ...invoice, id: command.invoiceId },
      // v3.74.22 — was resolveExecutiveRecipients (admin + GM only),
      // which silently dropped owner and branch manager. Replace with
      // the canonical Level-1 approver list so management visibility
      // is symmetric: owner / admin / GM company-wide + branch manager
      // scoped to the invoice's branch.
      resolver.resolveLevel1ApproverRecipients(invoice.branch_id || null, invoice.warehouse_id || null, null),
      {
        title: "رفض تسليم فاتورة — إرجاع إلى مسودة",
        message: `تم رفض تسليم الفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن. الفاتورة لم تكن مدفوعة وتم إرجاعها إلى مسودة تلقائياً بدون تأثير محاسبي. سبب الرفض: ${command.notes || "لم يتم تحديد سبب"}`,
        priority: "normal",
        severity: "info",
        category: "inventory",
        eventAction: "warehouse_rejected_draft_management",
      },
      "⚠️ [WAREHOUSE_REJECT] Management draft-revert notification failed:"
    )
  }

  private async notifyWarehouseRejectedPaid(actor: SalesInvoiceWarehouseActor, command: SalesInvoiceWarehouseCommand, invoice: any, invoiceSenderId: string | null, creditAmount: number) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    await this.dispatchWorkflowNotification(
      actor,
      { ...invoice, id: command.invoiceId },
      resolver.resolveBranchAccountantRecipients(invoice.branch_id || null, invoice.cost_center_id || null),
      {
        title: "تم رفض إخراج البضاعة — رصيد دائن للعميل",
        message: `تم رفض إخراج البضاعة للفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن. تم تحويل مبلغ ${creditAmount} إلى رصيد دائن للعميل تلقائياً. ملاحظات: ${command.notes || "لا يوجد"}`,
        priority: "high",
        severity: "error",
        category: "inventory",
        eventAction: "warehouse_rejected_paid_accountant",
      },
      "⚠️ [WAREHOUSE_REJECT] Accountant notification failed:"
    )

    if (invoiceSenderId) {
      await this.dispatchWorkflowNotification(
        actor,
        { ...invoice, id: command.invoiceId },
        resolver.resolveInvoiceOriginatorRecipient(invoiceSenderId, invoice.branch_id || null, invoice.cost_center_id || null),
        {
          title: "رفض المخزن إخراج بضاعة فاتورتك المدفوعة",
          message: `تم رفض إخراج بضاعة الفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن. الفاتورة كانت مدفوعة جزئياً مبلغ ${creditAmount} وتم تحويل هذا المبلغ إلى رصيد دائن للعميل. سبب الرفض: ${command.notes || "لم يتم تحديد سبب"}.`,
          priority: "high",
          severity: "error",
          category: "inventory",
          eventAction: "warehouse_rejected_paid_sender",
        },
        "⚠️ [WAREHOUSE_REJECT] Sender notification failed:"
      )
    }

    await this.dispatchWorkflowNotification(
      actor,
      { ...invoice, id: command.invoiceId },
      // v3.74.22 — was resolveExecutiveRecipients (admin + GM only),
      // which silently dropped owner and branch manager. Replace with
      // the canonical Level-1 approver list so management visibility
      // is symmetric: owner / admin / GM company-wide + branch manager
      // scoped to the invoice's branch.
      resolver.resolveLevel1ApproverRecipients(invoice.branch_id || null, invoice.warehouse_id || null, null),
      {
        title: "رفض تسليم فاتورة مدفوعة",
        message: `الفاتورة رقم (${invoice.invoice_number}) كانت مدفوعة جزئياً (${creditAmount}) وتم رفض تسليمها من المخزن. تم تحويل مبلغ الدفعة إلى رصيد دائن للعميل تلقائياً. سبب الرفض: ${command.notes || "لم يتم تحديد سبب"}`,
        priority: "high",
        severity: "warning",
        category: "finance",
        eventAction: "warehouse_rejected_paid_management",
      },
      "⚠️ [WAREHOUSE_REJECT] Management notification failed:"
    )
  }
}
