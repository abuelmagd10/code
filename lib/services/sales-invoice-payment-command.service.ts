import { asyncAuditLog } from "@/lib/core"
import { ERPError } from "@/lib/core/errors/erp-errors"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"
import { emitEvent } from "@/lib/event-bus"
import { enterpriseFinanceFlags } from "@/lib/enterprise-finance-flags"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"

type SupabaseLike = any

export type SalesInvoicePaymentActor = {
  companyId: string
  userId: string
  userEmail?: string | null
}

export type RecordInvoicePaymentCommand = {
  invoiceId: string
  amount: number
  paymentDate: string
  paymentMethod: string
  referenceNumber?: string | null
  notes?: string | null
  accountId?: string | null
  branchId?: string | null
  costCenterId?: string | null
  warehouseId?: string | null
  bodyCompanyId?: string | null
  idempotencyKey?: string | null
}

export type RecordInvoicePaymentResult = {
  success: true
  paymentId: string | null
  newPaidAmount: number | null
  newStatus: string | null
  netInvoiceAmount: number | null
  remaining: number | null
  invoiceJournalCreated: boolean | null
  transactionId: string | null
  eventType: string
}

type InvoicePaymentRpcResult = {
  success?: boolean
  error?: string
  payment_id?: string | null
  new_paid_amount?: number | null
  new_status?: string | null
  net_invoice_amount?: number | null
  remaining?: number | null
  invoice_journal_created?: boolean | null
  transaction_id?: string | null
  source_entity?: string | null
  source_id?: string | null
  event_type?: string | null
}

type InvoicePaymentRpcExecution = {
  data: InvoicePaymentRpcResult | null
  error: { message?: string | null } | null
  rpcName: "process_invoice_payment_atomic_v2" | "process_invoice_payment_atomic"
}

export class SalesInvoicePaymentCommandError extends Error {
  constructor(message: string, public readonly status = 500) {
    super(message)
    this.name = "SalesInvoicePaymentCommandError"
  }
}

function knownRpcError(message: string): SalesInvoicePaymentCommandError | null {
  const normalized = message.toLowerCase()

  if (message.includes("DUPLICATE_PAYMENT")) {
    return new SalesInvoicePaymentCommandError("توجد دفعة مشابهة مسجلة بالفعل لهذه الفاتورة", 409)
  }

  if (message.includes("INVOICE_NOT_FOUND")) {
    return new SalesInvoicePaymentCommandError("الفاتورة غير موجودة", 404)
  }

  if (message.includes("NO_BRANCH")) {
    return new SalesInvoicePaymentCommandError("لا يوجد فرع نشط للشركة. يرجى إنشاء فرع أولاً.", 400)
  }

  if (
    normalized.includes("warehouse_id")
    && normalized.includes("payments")
    && normalized.includes("column")
  ) {
    return new SalesInvoicePaymentCommandError("قاعدة البيانات تحتاج تحديثًا قبل تسجيل الدفعات: عمود warehouse_id غير موجود في جدول payments", 500)
  }

  return null
}

function isMissingPaymentV2Rpc(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("process_invoice_payment_atomic_v2")
    && (
      normalized.includes("schema cache")
      || normalized.includes("does not exist")
      || normalized.includes("could not find the function")
      || normalized.includes("pgrst")
    )
  )
}

function badRequest(message: string) {
  throw new SalesInvoicePaymentCommandError(message, 400)
}

export class SalesInvoicePaymentCommandService {
  constructor(private readonly authSupabase: SupabaseLike, private readonly adminSupabase: SupabaseLike) {}

  async recordPayment(actor: SalesInvoicePaymentActor, command: RecordInvoicePaymentCommand): Promise<RecordInvoicePaymentResult> {
    const amount = Number(command.amount || 0)
    if (!command.invoiceId) badRequest("معرف الفاتورة مطلوب")
    if (!Number.isFinite(amount) || amount <= 0) badRequest("مبلغ الدفعة يجب أن يكون أكبر من صفر")
    if (!command.paymentDate) badRequest("تاريخ الدفعة مطلوب")
    if (!command.paymentMethod) badRequest("طريقة الدفع مطلوبة")

    const resolvedCompanyId = command.bodyCompanyId || actor.companyId
    if (!resolvedCompanyId) badRequest("معرف الشركة مطلوب")

    if (command.bodyCompanyId && command.bodyCompanyId !== actor.companyId) {
      const { data: membership } = await this.authSupabase
        .from("company_members")
        .select("id")
        .eq("user_id", actor.userId)
        .eq("company_id", command.bodyCompanyId)
        .maybeSingle()
      if (!membership) {
        throw new SalesInvoicePaymentCommandError("غير مسموح: المستخدم ليس عضواً في هذه الشركة", 403)
      }
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      command.idempotencyKey || null,
      [
        "invoice-payment",
        command.invoiceId,
        command.paymentDate,
        amount.toFixed(2),
        command.paymentMethod,
        command.referenceNumber || "none",
      ]
    )

    const { data: invoice, error: invoiceError } = await this.adminSupabase
      .from("invoices")
      .select("id, customer_id, invoice_date, status, company_id, branch_id, cost_center_id, warehouse_id, warehouse_status, approval_status")
      .eq("id", command.invoiceId)
      .eq("company_id", resolvedCompanyId)
      .maybeSingle()

    if (invoiceError || !invoice) {
      throw new SalesInvoicePaymentCommandError("الفاتورة غير موجودة", 404)
    }

    const lockDate = command.paymentDate || invoice.invoice_date
    if (lockDate) {
      try {
        await requireOpenFinancialPeriod(resolvedCompanyId, lockDate)
      } catch (lockError: any) {
        if (lockError instanceof ERPError && lockError.code === "ERR_PERIOD_CLOSED") {
          throw new SalesInvoicePaymentCommandError(lockError.message, 400)
        }
        throw lockError
      }
    }

    const requestHash = buildFinancialRequestHash({
      invoiceId: command.invoiceId,
      companyId: resolvedCompanyId,
      customerId: invoice.customer_id,
      amount,
      paymentDate: command.paymentDate,
      paymentMethod: command.paymentMethod,
      referenceNumber: command.referenceNumber || null,
      accountId: command.accountId || null,
      branchId: command.branchId || invoice.branch_id || null,
      costCenterId: command.costCenterId || invoice.cost_center_id || null,
      warehouseId: command.warehouseId || invoice.warehouse_id || null,
    })

    const preferV2 = enterpriseFinanceFlags.paymentV2
      || invoice.warehouse_status === "approved"
      || invoice.approval_status === "approved"

    let execution = await this.executePaymentRpc(preferV2, {
      command,
      invoice,
      resolvedCompanyId,
      amount,
      actor,
      idempotencyKey,
      requestHash,
    })

    if (execution.error) {
      execution = await this.handleRpcFailure(execution, preferV2, {
        command,
        invoice,
        resolvedCompanyId,
        amount,
        actor,
        idempotencyKey,
        requestHash,
      })
    }

    const result = execution.data
    if (!result?.success) {
      throw new SalesInvoicePaymentCommandError(result?.error || "فشل غير معروف في معالجة الدفعة", 400)
    }

    if (enterpriseFinanceFlags.observabilityEvents) {
      await emitEvent(this.authSupabase, {
        companyId: resolvedCompanyId,
        eventName: "payment.recorded",
        entityType: "invoice",
        entityId: command.invoiceId,
        actorId: actor.userId || undefined,
        idempotencyKey: `payment.recorded:${result.transaction_id || idempotencyKey}`,
        payload: {
          transactionId: result.transaction_id || null,
          paymentId: result.payment_id,
          sourceEntity: result.source_entity || "invoice",
          sourceId: result.source_id || command.invoiceId,
          eventType: result.event_type || "invoice_payment",
          requestHash,
        },
      })
    }

    asyncAuditLog({
      companyId: resolvedCompanyId,
      userId: actor.userId,
      userEmail: actor.userEmail || undefined,
      action: "CREATE",
      table: "invoice_payments",
      recordId: result.payment_id || command.invoiceId,
      recordIdentifier: command.invoiceId,
      newData: {
        payment_id: result.payment_id,
        amount,
        paymentDate: command.paymentDate,
        paymentMethod: command.paymentMethod,
        new_status: result.new_status,
      },
      reason: "Invoice Payment Recorded",
    })

    return {
      success: true,
      paymentId: result.payment_id || null,
      newPaidAmount: result.new_paid_amount ?? null,
      newStatus: result.new_status || null,
      netInvoiceAmount: result.net_invoice_amount ?? null,
      remaining: result.remaining ?? null,
      invoiceJournalCreated: result.invoice_journal_created ?? null,
      transactionId: result.transaction_id || null,
      eventType: result.event_type || "invoice_payment",
    }
  }

  private async handleRpcFailure(
    execution: InvoicePaymentRpcExecution,
    preferV2: boolean,
    context: Parameters<SalesInvoicePaymentCommandService["executePaymentRpc"]>[1],
  ): Promise<InvoicePaymentRpcExecution> {
    const primaryMessage = execution.error?.message || ""
    const knownPrimaryError = knownRpcError(primaryMessage)
    if (knownPrimaryError) throw knownPrimaryError

    const shouldFallback = preferV2
      ? isMissingPaymentV2Rpc(primaryMessage)
      : true

    if (!shouldFallback) {
      console.error(`[RECORD_PAYMENT] Payment RPC ${execution.rpcName} failed without fallback`, {
        message: primaryMessage,
        invoiceId: context.command.invoiceId,
        companyId: context.resolvedCompanyId,
      })
      throw new SalesInvoicePaymentCommandError(`فشل تسجيل الدفعة: ${primaryMessage}`, 500)
    }

    const fallback = await this.executePaymentRpc(!preferV2, context)
    if (!fallback.error) {
      console.warn(`[RECORD_PAYMENT] Primary RPC ${execution.rpcName} failed; fallback ${fallback.rpcName} succeeded:`, primaryMessage)
      return fallback
    }

    const fallbackMessage = fallback.error.message || ""
    const knownFallbackError = knownRpcError(fallbackMessage)
    if (knownFallbackError) throw knownFallbackError

    console.error(`[RECORD_PAYMENT] Both payment RPCs failed. Primary=${execution.rpcName}, Fallback=${fallback.rpcName}`, {
      primaryMessage,
      fallbackMessage,
      invoiceId: context.command.invoiceId,
      companyId: context.resolvedCompanyId,
    })

    throw new SalesInvoicePaymentCommandError(`فشل تسجيل الدفعة: ${fallbackMessage || primaryMessage}`, 500)
  }

  private async executePaymentRpc(
    useV2: boolean,
    context: {
      command: RecordInvoicePaymentCommand
      invoice: any
      resolvedCompanyId: string
      amount: number
      actor: SalesInvoicePaymentActor
      idempotencyKey: string
      requestHash: string
    },
  ): Promise<InvoicePaymentRpcExecution> {
    const rpcName = useV2
      ? "process_invoice_payment_atomic_v2"
      : "process_invoice_payment_atomic"

    const params = useV2
      ? {
          p_invoice_id: context.command.invoiceId,
          p_company_id: context.resolvedCompanyId,
          p_customer_id: context.invoice.customer_id,
          p_amount: context.amount,
          p_payment_date: context.command.paymentDate,
          p_payment_method: context.command.paymentMethod,
          p_reference_number: context.command.referenceNumber || null,
          p_notes: context.command.notes || null,
          p_account_id: context.command.accountId || null,
          p_branch_id: context.command.branchId || context.invoice.branch_id || null,
          p_cost_center_id: context.command.costCenterId || context.invoice.cost_center_id || null,
          p_warehouse_id: context.command.warehouseId || context.invoice.warehouse_id || null,
          p_user_id: context.actor.userId || null,
          p_idempotency_key: context.idempotencyKey,
          p_request_hash: context.requestHash,
        }
      : {
          p_invoice_id: context.command.invoiceId,
          p_company_id: context.resolvedCompanyId,
          p_customer_id: context.invoice.customer_id,
          p_amount: context.amount,
          p_payment_date: context.command.paymentDate,
          p_payment_method: context.command.paymentMethod,
          p_reference_number: context.command.referenceNumber || null,
          p_notes: context.command.notes || null,
          p_account_id: context.command.accountId || null,
          p_branch_id: context.command.branchId || context.invoice.branch_id || null,
          p_cost_center_id: context.command.costCenterId || context.invoice.cost_center_id || null,
          p_warehouse_id: context.command.warehouseId || context.invoice.warehouse_id || null,
          p_user_id: context.actor.userId || null,
        }

    const { data, error } = await this.adminSupabase.rpc(rpcName, params)
    return { data, error, rpcName }
  }
}
