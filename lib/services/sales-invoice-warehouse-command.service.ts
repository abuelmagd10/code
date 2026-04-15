import { AccountingTransactionService } from "@/lib/accounting-transaction-service"
import { emitEvent } from "@/lib/event-bus"
import { enterpriseFinanceFlags } from "@/lib/enterprise-finance-flags"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"

type SupabaseLike = any

export type SalesInvoiceWarehouseActor = {
  companyId: string
  userId: string
}

export type SalesInvoiceWarehouseCommand = {
  invoiceId: string
  notes?: string | null
  idempotencyKey?: string | null
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
  constructor(message: string, public readonly status = 500) {
    super(message)
    this.name = "SalesInvoiceWarehouseCommandError"
  }
}

export class SalesInvoiceWarehouseCommandService {
  constructor(private readonly supabase: SupabaseLike) {}

  async approveDelivery(actor: SalesInvoiceWarehouseActor, command: SalesInvoiceWarehouseCommand): Promise<SalesInvoiceWarehouseResult> {
    const invoice = await this.loadInvoice(actor.companyId, command.invoiceId, "invoice_number, branch_id, warehouse_status, approval_status, created_by_user_id, posted_by_user_id")
    const invoiceSenderId = invoice.posted_by_user_id || invoice.created_by_user_id || null

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
    const invoice = await this.loadInvoice(actor.companyId, command.invoiceId, "invoice_number, branch_id, customer_id, paid_amount, created_by_user_id, posted_by_user_id, status, warehouse_status, approval_status")
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

  private async notifyWarehouseApproved(actor: SalesInvoiceWarehouseActor, command: SalesInvoiceWarehouseCommand, invoice: any, invoiceSenderId: string | null) {
    const nowTs = Date.now()
    await this.createNotification({
      p_company_id: actor.companyId,
      p_reference_type: "invoice",
      p_reference_id: command.invoiceId,
      p_title: "تم إخراج البضاعة",
      p_message: `تم اعتماد إخراج البضاعة للفاتورة رقم (${invoice?.invoice_number}) من قِبل مسؤول المخزن`,
      p_created_by: actor.userId,
      p_branch_id: invoice?.branch_id || null,
      p_cost_center_id: null,
      p_warehouse_id: null,
      p_assigned_to_role: "accountant",
      p_assigned_to_user: null,
      p_priority: "normal",
      p_event_key: `invoice:${command.invoiceId}:warehouse_approved:accountant:${nowTs}`,
      p_severity: "success",
      p_category: "inventory",
    }, "⚠️ [WAREHOUSE_APPROVE] Notification failed:")

    if (invoiceSenderId) {
      await this.createNotification({
        p_company_id: actor.companyId,
        p_reference_type: "invoice",
        p_reference_id: command.invoiceId,
        p_title: "تم اعتماد إخراج بضاعة فاتورتك",
        p_message: `تم اعتماد إخراج البضاعة للفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن، وأصبحت جاهزة للمتابعة والتحصيل.`,
        p_created_by: actor.userId,
        p_branch_id: invoice?.branch_id || null,
        p_cost_center_id: null,
        p_warehouse_id: null,
        p_assigned_to_role: null,
        p_assigned_to_user: invoiceSenderId,
        p_priority: "normal",
        p_event_key: `invoice:${command.invoiceId}:warehouse_approved:sender:${nowTs}`,
        p_severity: "success",
        p_category: "inventory",
      }, "⚠️ [WAREHOUSE_APPROVE] Sender notification failed:")
    }

    for (const role of ["owner", "admin", "general_manager"]) {
      await this.createNotification({
        p_company_id: actor.companyId,
        p_reference_type: "invoice",
        p_reference_id: command.invoiceId,
        p_title: "تم اعتماد إخراج فاتورة بيع",
        p_message: `تم اعتماد إخراج البضاعة للفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن لفرع الفاتورة.`,
        p_created_by: actor.userId,
        p_branch_id: invoice?.branch_id || null,
        p_cost_center_id: null,
        p_warehouse_id: null,
        p_assigned_to_role: role,
        p_assigned_to_user: null,
        p_priority: "normal",
        p_event_key: `invoice:${command.invoiceId}:warehouse_approved:${role}:${nowTs}`,
        p_severity: "info",
        p_category: "inventory",
      }, `⚠️ [WAREHOUSE_APPROVE] ${role} notification failed:`)
    }
  }

  private async notifyWarehouseRejectedDraft(actor: SalesInvoiceWarehouseActor, command: SalesInvoiceWarehouseCommand, invoice: any, invoiceSenderId: string | null) {
    const nowTs = Date.now()
    await this.createNotification({
      p_company_id: actor.companyId,
      p_reference_type: "invoice",
      p_reference_id: command.invoiceId,
      p_title: "تم إرجاع الفاتورة إلى مسودة",
      p_message: `تم إرجاع الفاتورة رقم (${invoice.invoice_number}) إلى حالة المسودة بسبب رفض مسؤول المخزن إخراج البضاعة. لا توجد دفعات مسجلة — لا يوجد أي تأثير محاسبي. ملاحظات: ${command.notes || "لا يوجد"}`,
      p_created_by: actor.userId,
      p_branch_id: invoice.branch_id || null,
      p_cost_center_id: null,
      p_warehouse_id: null,
      p_assigned_to_role: "accountant",
      p_assigned_to_user: null,
      p_priority: "normal",
      p_event_key: `invoice:${command.invoiceId}:warehouse_rejected_draft:accountant:${nowTs}`,
      p_severity: "warning",
      p_category: "inventory",
    }, "⚠️ [WAREHOUSE_REJECT] Accountant draft-revert notification failed:")

    if (invoiceSenderId) {
      await this.createNotification({
        p_company_id: actor.companyId,
        p_reference_type: "invoice",
        p_reference_id: command.invoiceId,
        p_title: "رفض المخزن إخراج بضاعة فاتورتك",
        p_message: `تم رفض إخراج بضاعة الفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن. الفاتورة لم تكن مدفوعة وتم إرجاعها إلى مسودة تلقائياً. سبب الرفض: ${command.notes || "لم يتم تحديد سبب"}. يمكنك مراجعة الفاتورة وإعادة إرسالها.`,
        p_created_by: actor.userId,
        p_branch_id: invoice.branch_id || null,
        p_cost_center_id: null,
        p_warehouse_id: null,
        p_assigned_to_role: null,
        p_assigned_to_user: invoiceSenderId,
        p_priority: "high",
        p_event_key: `invoice:${command.invoiceId}:warehouse_rejected_draft:sender:${nowTs}`,
        p_severity: "error",
        p_category: "inventory",
      }, "⚠️ [WAREHOUSE_REJECT] Sender draft-revert notification failed:")
    }

    await this.createNotification({
      p_company_id: actor.companyId,
      p_reference_type: "invoice",
      p_reference_id: command.invoiceId,
      p_title: "رفض تسليم فاتورة — إرجاع إلى مسودة",
      p_message: `تم رفض تسليم الفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن. الفاتورة لم تكن مدفوعة وتم إرجاعها إلى مسودة تلقائياً بدون تأثير محاسبي. سبب الرفض: ${command.notes || "لم يتم تحديد سبب"}`,
      p_created_by: actor.userId,
      p_branch_id: invoice.branch_id || null,
      p_cost_center_id: null,
      p_warehouse_id: null,
      p_assigned_to_role: "owner",
      p_assigned_to_user: null,
      p_priority: "normal",
      p_event_key: `invoice:${command.invoiceId}:warehouse_rejected_draft:owner:${nowTs}`,
      p_severity: "info",
      p_category: "inventory",
    }, "⚠️ [WAREHOUSE_REJECT] Owner draft-revert notification failed:")
  }

  private async notifyWarehouseRejectedPaid(actor: SalesInvoiceWarehouseActor, command: SalesInvoiceWarehouseCommand, invoice: any, invoiceSenderId: string | null, creditAmount: number) {
    const nowTs = Date.now()
    await this.createNotification({
      p_company_id: actor.companyId,
      p_reference_type: "invoice",
      p_reference_id: command.invoiceId,
      p_title: "تم رفض إخراج البضاعة — رصيد دائن للعميل",
      p_message: `تم رفض إخراج البضاعة للفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن. تم تحويل مبلغ ${creditAmount} إلى رصيد دائن للعميل تلقائياً. ملاحظات: ${command.notes || "لا يوجد"}`,
      p_created_by: actor.userId,
      p_branch_id: invoice.branch_id || null,
      p_cost_center_id: null,
      p_warehouse_id: null,
      p_assigned_to_role: "accountant",
      p_assigned_to_user: null,
      p_priority: "high",
      p_event_key: `invoice:${command.invoiceId}:warehouse_rejected:accountant:${nowTs}`,
      p_severity: "error",
      p_category: "inventory",
    }, "⚠️ [WAREHOUSE_REJECT] Accountant notification failed:")

    if (invoiceSenderId) {
      await this.createNotification({
        p_company_id: actor.companyId,
        p_reference_type: "invoice",
        p_reference_id: command.invoiceId,
        p_title: "رفض المخزن إخراج بضاعة فاتورتك المدفوعة",
        p_message: `تم رفض إخراج بضاعة الفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن. الفاتورة كانت مدفوعة جزئياً مبلغ ${creditAmount} وتم تحويل هذا المبلغ إلى رصيد دائن للعميل. سبب الرفض: ${command.notes || "لم يتم تحديد سبب"}.`,
        p_created_by: actor.userId,
        p_branch_id: invoice.branch_id || null,
        p_cost_center_id: null,
        p_warehouse_id: null,
        p_assigned_to_role: null,
        p_assigned_to_user: invoiceSenderId,
        p_priority: "high",
        p_event_key: `invoice:${command.invoiceId}:warehouse_rejected:sender:${nowTs}`,
        p_severity: "error",
        p_category: "inventory",
      }, "⚠️ [WAREHOUSE_REJECT] Sender notification failed:")
    }

    await this.createNotification({
      p_company_id: actor.companyId,
      p_reference_type: "invoice",
      p_reference_id: command.invoiceId,
      p_title: "رفض تسليم فاتورة مدفوعة",
      p_message: `الفاتورة رقم (${invoice.invoice_number}) كانت مدفوعة جزئياً (${creditAmount}) وتم رفض تسليمها من المخزن. تم تحويل مبلغ الدفعة إلى رصيد دائن للعميل تلقائياً. سبب الرفض: ${command.notes || "لم يتم تحديد سبب"}`,
      p_created_by: actor.userId,
      p_branch_id: invoice.branch_id || null,
      p_cost_center_id: null,
      p_warehouse_id: null,
      p_assigned_to_role: "owner",
      p_assigned_to_user: null,
      p_priority: "high",
      p_event_key: `invoice:${command.invoiceId}:warehouse_rejected_paid:owner:${nowTs}`,
      p_severity: "warning",
      p_category: "finance",
    }, "⚠️ [WAREHOUSE_REJECT] Owner notification failed:")
  }
}
