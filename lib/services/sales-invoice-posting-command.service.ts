import { AccountingTransactionService } from "@/lib/accounting-transaction-service"
import { ERPError } from "@/lib/core/errors/erp-errors"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"
import { emitEvent } from "@/lib/event-bus"
import { enterpriseFinanceFlags } from "@/lib/enterprise-finance-flags"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"

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
      .select("invoice_date, status, invoice_number, branch_id, warehouse_status, approval_status, approval_reason, approved_by, approval_date, rejected_by, rejected_at, warehouse_rejection_reason, warehouse_rejected_at")
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

    await this.notifyWarehouseManagers({
      actor,
      invoice,
      invoiceId: command.invoiceId,
    })

    return {
      success: true,
      transactionId: postingResult?.transactionId || null,
      eventType: postingResult?.eventType || "invoice_posting",
    }
  }

  private async notifyWarehouseManagers(params: { actor: SalesInvoicePostingActor; invoice: any; invoiceId: string }) {
    const { actor, invoice, invoiceId } = params
    try {
      const warehouseRoles = ["warehouse_manager", "store_manager"]
      const { data: warehouseManagers } = await this.supabase
        .from("company_members")
        .select("user_id, role")
        .eq("company_id", actor.companyId)
        .in("role", warehouseRoles)
        .eq("branch_id", invoice?.branch_id || "")

      if (warehouseManagers && warehouseManagers.length > 0) {
        for (const manager of warehouseManagers) {
          const nowTs = Date.now()
          const { error: notificationError } = await this.supabase.rpc("create_notification", {
            p_company_id: actor.companyId,
            p_reference_type: "invoice",
            p_reference_id: invoiceId,
            p_title: "فاتورة جاهزة للشحن",
            p_message: `الفاتورة رقم (${invoice?.invoice_number || invoiceId}) اعتُمدت من المحاسبة — يرجى تجهيز البضاعة وتأكيد الإخراج من المخزن`,
            p_created_by: actor.userId,
            p_branch_id: invoice?.branch_id || null,
            p_cost_center_id: null,
            p_warehouse_id: null,
            p_assigned_to_role: manager.role,
            p_assigned_to_user: manager.user_id,
            p_priority: "high",
            p_event_key: `invoice:${invoiceId}:sent:${manager.user_id}:${nowTs}`,
            p_severity: "warning",
            p_category: "inventory",
          })
          if (notificationError) {
            console.warn(`⚠️ [INVOICE_POST] Notification failed for user ${manager.user_id}:`, notificationError.message)
          } else {
            console.log(`✅ [INVOICE_POST] Notification sent to ${manager.role} (${manager.user_id}) for invoice:`, invoice?.invoice_number)
          }
        }
        return
      }

      console.warn(`⚠️ [INVOICE_POST] No warehouse/store managers found in branch ${invoice?.branch_id}. Sending role-based fallback notification.`)
      await this.supabase.rpc("create_notification", {
        p_company_id: actor.companyId,
        p_reference_type: "invoice",
        p_reference_id: invoiceId,
        p_title: "فاتورة جاهزة للشحن",
        p_message: `الفاتورة رقم (${invoice?.invoice_number || invoiceId}) اعتُمدت من المحاسبة — يرجى تجهيز البضاعة وتأكيد الإخراج من المخزن`,
        p_created_by: actor.userId,
        p_branch_id: invoice?.branch_id || null,
        p_cost_center_id: null,
        p_warehouse_id: null,
        p_assigned_to_role: "store_manager",
        p_assigned_to_user: null,
        p_priority: "high",
        p_event_key: `invoice:${invoiceId}:sent:store_manager:${Date.now()}`,
        p_severity: "warning",
        p_category: "inventory",
      })
    } catch (notificationError: any) {
      console.warn("⚠️ [INVOICE_POST] Warehouse notification failed:", notificationError.message)
    }
  }
}
