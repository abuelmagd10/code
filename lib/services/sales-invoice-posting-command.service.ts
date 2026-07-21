import { AccountingTransactionService } from "@/lib/accounting-transaction-service"
import { ERPError } from "@/lib/core/errors/erp-errors"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"
import { emitEvent } from "@/lib/event-bus"
import { enterpriseFinanceFlags } from "@/lib/enterprise-finance-flags"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { buildNotificationEventKey, normalizeNotificationSeverity } from "@/lib/notification-workflow"
import { NotificationRecipientResolverService } from "@/lib/services/notification-recipient-resolver.service"
import { SalesInvoiceWarehouseCommandService } from "@/lib/services/sales-invoice-warehouse-command.service"
import { branchHasWarehouseManager, WAREHOUSE_AUTO_APPROVE_NOTE } from "@/lib/services/warehouse-manager-presence"

type SupabaseLike = any

export type SalesInvoicePostingActor = {
  companyId: string
  userId: string
}

export type PostSalesInvoiceCommand = {
  invoiceId: string
  idempotencyKey?: string | null
}

export type PostSalesInvoiceResult = {
  success: true
  idempotent?: boolean
  message?: string
  transactionId?: string | null
  eventType?: string
}

export class SalesInvoicePostingCommandError extends Error {
  constructor(message: string, public readonly status = 500) {
    super(message)
    this.name = "SalesInvoicePostingCommandError"
  }
}

export class SalesInvoicePostingCommandService {
  constructor(private readonly supabase: SupabaseLike) {}

  async postInvoice(actor: SalesInvoicePostingActor, command: PostSalesInvoiceCommand): Promise<PostSalesInvoiceResult> {
    if (!command.invoiceId) throw new SalesInvoicePostingCommandError("معرف الفاتورة مطلوب", 400)

    const idempotencyKey = resolveFinancialIdempotencyKey(
      command.idempotencyKey || null,
      ["invoice-post", actor.companyId, command.invoiceId]
    )

    const { data: invoice } = await this.supabase
      .from("invoices")
      .select("invoice_date, status, invoice_number, branch_id, cost_center_id, warehouse_status, approval_status, approval_reason, approved_by, approval_date, rejected_by, rejected_at, warehouse_rejection_reason, warehouse_rejected_at, sales_order_id")
      .eq("id", command.invoiceId)
      .eq("company_id", actor.companyId)
      .maybeSingle()

    if (!invoice) throw new SalesInvoicePostingCommandError("الفاتورة غير موجودة", 404)

    if (invoice.status === "posted") {
      return {
        success: true,
        idempotent: true,
        message: "الفاتورة مُرحَّلة مسبقاً",
      }
    }

    // v3.74.501 — نفس بوابة المشتريات (v3.74.500): فاتورة بانتظار الاعتماد
    // الإداري لا تُرحَّل ولا يُخطَر المخزن بها. بدون هذه البوابة كان مسار
    // إعادة الترحيل (isRepost) يفرض status='sent' ويرسل "فاتورة جاهزة
    // للشحن" لمسؤول المخزن متجاوزاً اعتماد المالك للتعديل المعلق.
    if (invoice.status === "pending_approval") {
      throw new SalesInvoicePostingCommandError(
        "الفاتورة بانتظار الاعتماد الإداري (المالك / المدير العام). لا يمكن ترحيلها أو إخطار المخزن قبل اعتمادها من صندوق الموافقات.",
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
      // v3.74.782 — the old text sent the accountant to "صندوق الموافقات",
      // a page can_approve_discount refuses them with 403. The block was
      // right; the directions pointed at a locked door. Name who decides.
      throw new SalesInvoicePostingCommandError(
        "يوجد تعديل/خصم معلق بانتظار اعتماد المالك / المدير العام. سيُتاح الترحيل فور البت فيه.",
        409
      )
    }

    // v3.74.782 — SO-sourced invoices no longer carry their own approval rows;
    // the sales order holds the one decision. Check IT, so the accountant gets
    // a truthful message instead of falling through to a raw DB error.
    if ((invoice as any).sales_order_id) {
      const { data: pendingSo } = await this.supabase
        .from("discount_approvals")
        .select("id")
        .eq("company_id", actor.companyId)
        .eq("document_type", "sales_order")
        .eq("document_id", (invoice as any).sales_order_id)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle()

      if (pendingSo) {
        throw new SalesInvoicePostingCommandError(
          "خصم أمر البيع بانتظار اعتماد المالك / المدير العام. سيُتاح الترحيل فور البت فيه.",
          409
        )
      }
    }

    if (invoice.invoice_date) {
      try {
        await requireOpenFinancialPeriod(actor.companyId, invoice.invoice_date)
      } catch (lockError: any) {
        if (lockError instanceof ERPError && lockError.code === "ERR_PERIOD_CLOSED") {
          throw new SalesInvoicePostingCommandError(lockError.message, 400)
        }
        throw new SalesInvoicePostingCommandError(lockError?.message || "فشل التحقق من الفترة المحاسبية", 400)
      }
    }

    const accountingService = new AccountingTransactionService(this.supabase)
    const requestHash = buildFinancialRequestHash({
      invoiceId: command.invoiceId,
      companyId: actor.companyId,
      actorId: actor.userId,
      invoiceDate: invoice.invoice_date,
    })

    const isRepost = invoice.warehouse_status === "rejected"

    if (isRepost) {
      const { error: resetError } = await this.supabase
        .from("invoices")
        .update({
          warehouse_status: "pending",
          approval_status: "pending",
          approval_reason: null,
          approved_by: null,
          approval_date: null,
          rejected_by: null,
          rejected_at: null,
          warehouse_rejection_reason: null,
          warehouse_rejected_at: null,
          posted_by_user_id: actor.userId,
          status: "sent",
        })
        .eq("id", command.invoiceId)
        .eq("company_id", actor.companyId)

      if (resetError) {
        console.warn("⚠️ [INVOICE_POST] Failed to reset warehouse_status to pending:", resetError.message)
      } else {
        console.log("✅ [INVOICE_POST] Re-post after rejection: warehouse_status=pending, status=sent for invoice:", invoice.invoice_number)
      }
    } else {
      const { error: posterError } = await this.supabase
        .from("invoices")
        .update({ posted_by_user_id: actor.userId })
        .eq("id", command.invoiceId)
        .eq("company_id", actor.companyId)

      if (posterError) {
        console.warn("⚠️ [INVOICE_POST] Failed to save posted_by_user_id:", posterError.message)
      }
    }

    let postingResult: Awaited<ReturnType<AccountingTransactionService["postInvoiceAtomic"]>> | null = null
    if (!isRepost) {
      postingResult = await accountingService.postInvoiceAtomic(command.invoiceId, actor.companyId, actor.userId, {
        idempotencyKey,
        requestHash,
      })

      if (!postingResult.success) {
        // DUPLICATE_JOURNAL_VIOLATION means journal already exists (race condition / retry)
        // Treat as idempotent success — the accounting entries are already recorded
        if (postingResult.error?.includes("DUPLICATE_JOURNAL_VIOLATION")) {
          console.log("✅ [INVOICE_POST] Journal already exists (DUPLICATE_JOURNAL_VIOLATION) — treating as idempotent success")
          return {
            success: true,
            idempotent: true,
            message: "القيد المحاسبي موجود مسبقاً — تم الترحيل بنجاح",
          }
        }
        throw new SalesInvoicePostingCommandError(postingResult.error || "فشل ترحيل الفاتورة", 400)
      }
    } else {
      console.log("✅ [INVOICE_POST] Skipping postInvoiceAtomic for re-post (journal entries already exist)")
    }

    if (enterpriseFinanceFlags.observabilityEvents && postingResult?.success) {
      await emitEvent(this.supabase, {
        companyId: actor.companyId,
        eventName: "invoice.posted",
        entityType: "invoice",
        entityId: command.invoiceId,
        actorId: actor.userId,
        idempotencyKey: `invoice.posted:${postingResult.transactionId || idempotencyKey}`,
        payload: {
          transactionId: postingResult.transactionId,
          sourceEntity: postingResult.sourceEntity,
          sourceId: postingResult.sourceId,
          eventType: postingResult.eventType,
          requestHash,
        },
      })
    }

    // v3.74.664 — warehouse-custody governance. Stock issue (إخراج) is the
    // branch warehouse manager's custody. When the invoice branch HAS an
    // assigned warehouse manager → keep it pending and notify them (existing
    // behavior). When the branch has NO warehouse manager → there is no
    // custodian to approve, so the dispatch is auto-approved: we run the SAME
    // full delivery posting (FIFO consumption + COGS + stock-out) a manager
    // would trigger — never a bare status flip, which would leave inventory
    // un-decremented. Applies to WHOEVER posts the invoice, not just the owner.
    const branchHasManager = await branchHasWarehouseManager(
      this.supabase,
      actor.companyId,
      invoice?.branch_id || null
    )

    if (branchHasManager) {
      await this.notifyWarehouseManagers({ actor, invoice, invoiceId: command.invoiceId })
    } else {
      await this.autoApproveDispatchNoManager({ actor, invoice, invoiceId: command.invoiceId })
    }

    return {
      success: true,
      transactionId: postingResult?.transactionId || null,
      eventType: postingResult?.eventType || "invoice_posting",
    }
  }

  /**
   * v3.74.664 — Auto-approve the warehouse dispatch when the invoice branch has
   * no assigned warehouse manager. Only fires when there is real stock to move
   * (warehouse_status still 'pending' after posting; service-only invoices are
   * already auto-approved to 'approved' by the DB trigger and have nothing to
   * dispatch). On an inventory shortage (or any posting failure) we do NOT
   * crash the already-successful invoice posting: we leave the dispatch pending
   * and alert management so a human can resolve it.
   */
  private async autoApproveDispatchNoManager(params: { actor: SalesInvoicePostingActor; invoice: any; invoiceId: string }) {
    const { actor, invoice, invoiceId } = params
    try {
      const { data: fresh } = await this.supabase
        .from("invoices")
        .select("warehouse_status")
        .eq("id", invoiceId)
        .eq("company_id", actor.companyId)
        .maybeSingle()

      // Nothing to dispatch (service-only already 'approved', or 'rejected').
      if (!fresh || fresh.warehouse_status !== "pending") return

      const warehouseService = new SalesInvoiceWarehouseCommandService(this.supabase)
      await warehouseService.approveDelivery(
        { companyId: actor.companyId, userId: actor.userId },
        { invoiceId, notes: WAREHOUSE_AUTO_APPROVE_NOTE, auto: true }
      )
    } catch (autoError: any) {
      console.warn(
        "⚠️ [INVOICE_POST] Auto-dispatch (no warehouse manager) failed — dispatch left pending:",
        autoError?.message || autoError
      )
      // Surface to management so the stuck dispatch is visible (e.g. shortage).
      try {
        const resolver = new NotificationRecipientResolverService(this.supabase)
        const recipients = resolver.resolveLevel1ApproverRecipients(
          invoice?.branch_id || null,
          invoice?.warehouse_id || null,
          null
        )
        for (const recipient of recipients) {
          await this.supabase.rpc("create_notification", {
            p_company_id: actor.companyId,
            p_reference_type: "invoice",
            p_reference_id: invoiceId,
            p_title: "تعذّر الإخراج التلقائي للبضاعة",
            p_message: `الفاتورة رقم (${invoice?.invoice_number || invoiceId}) لا يوجد لفرعها مسؤول مخزن، وتعذّر إخراج البضاعة تلقائياً (قد يكون المخزون غير كافٍ). يلزم تدخل الإدارة.`,
            p_created_by: actor.userId,
            p_branch_id: recipient.branchId ?? invoice?.branch_id ?? null,
            p_cost_center_id: recipient.costCenterId ?? invoice?.cost_center_id ?? null,
            p_warehouse_id: recipient.warehouseId ?? null,
            p_assigned_to_role: recipient.kind === "role" ? recipient.role : null,
            p_assigned_to_user: recipient.kind === "user" ? recipient.userId : null,
            p_priority: "high",
            p_event_key: buildNotificationEventKey(
              "sales",
              "invoice",
              invoiceId,
              "warehouse_auto_dispatch_failed",
              ...resolver.buildRecipientScopeSegments(recipient)
            ),
            p_severity: normalizeNotificationSeverity("error"),
            p_category: "inventory",
            p_kind: "action",
          })
        }
      } catch (notifyError: any) {
        console.warn("⚠️ [INVOICE_POST] Auto-dispatch failure notification failed:", notifyError?.message || notifyError)
      }
    }
  }

  private async notifyWarehouseManagers(params: { actor: SalesInvoicePostingActor; invoice: any; invoiceId: string }) {
    const { actor, invoice, invoiceId } = params
    try {
      const resolver = new NotificationRecipientResolverService(this.supabase)
      const recipients = await resolver.resolveWarehouseRecipientsForBranch(actor.companyId, invoice?.branch_id || null)

      for (const recipient of recipients) {
        const { error: notificationError } = await this.supabase.rpc("create_notification", {
          p_company_id: actor.companyId,
          p_reference_type: "invoice",
          p_reference_id: invoiceId,
          p_title: "فاتورة جاهزة للشحن",
          p_message: `الفاتورة رقم (${invoice?.invoice_number || invoiceId}) اعتُمدت من المحاسبة — يرجى تجهيز البضاعة وتأكيد الإخراج من المخزن`,
          p_created_by: actor.userId,
          p_branch_id: recipient.branchId ?? invoice?.branch_id ?? null,
          p_cost_center_id: recipient.costCenterId ?? invoice?.cost_center_id ?? null,
          p_warehouse_id: recipient.warehouseId ?? null,
          p_assigned_to_role: recipient.kind === "role" ? recipient.role : null,
          p_assigned_to_user: recipient.kind === "user" ? recipient.userId : null,
          p_priority: "high",
          p_event_key: buildNotificationEventKey(
            "sales",
            "invoice",
            invoiceId,
            "warehouse_dispatch_pending",
            ...resolver.buildRecipientScopeSegments(recipient)
          ),
          p_severity: normalizeNotificationSeverity("warning"),
          p_category: "inventory",
          // v3.74.588 — طلب تأكيد إخراج البضاعة من المخزن (مرحلة تنفيذ) — يُغلق تلقائياً عبر trigger حالة المخزن
          p_kind: "action",
        })
        if (notificationError) {
          console.warn(
            `⚠️ [INVOICE_POST] Notification failed for ${recipient.kind === "role" ? recipient.role : recipient.userId}:`,
            notificationError.message
          )
        }
      }
    } catch (notificationError: any) {
      console.warn("⚠️ [INVOICE_POST] Warehouse notification failed:", notificationError.message)
    }
  }
}
