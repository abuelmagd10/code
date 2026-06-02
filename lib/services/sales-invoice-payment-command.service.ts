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
  // Multi-currency (IAS 21) — when both are provided AND the invoice is in a
  // foreign currency, a separate FX adjustment journal entry is created after
  // the main payment journal succeeds.
  exchangeRate?: number | null
  originalCurrencyAmount?: number | null
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
  constructor(
    message: string,
    public readonly status = 500,
    /**
     * Optional machine-readable code so the UI can branch (e.g. show a
     * "open accounting period" CTA instead of a generic alert). v3.74.9.
     */
    public readonly code?: string,
    /**
     * Optional structured details (e.g. the date that triggered the lock).
     */
    public readonly details?: Record<string, unknown>,
  ) {
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
          // v3.74.9 — replace the raw English DB message with a human-readable
          // Arabic one and attach a machine-readable code so the UI can render
          // a "open the period" CTA instead of an alert dialog with technical
          // jargon.
          const rawMsg = lockError.message || ""
          const isMissing = rawMsg.includes("NO_ACTIVE_FINANCIAL_PERIOD")
          const isLocked  = rawMsg.includes("FINANCIAL_PERIOD_LOCKED")

          const friendly = isMissing
            ? `لا توجد فترة محاسبية مفتوحة تغطى تاريخ ${lockDate}. الرجاء فتح الفترة من صفحة "الفترات المحاسبية" ثم إعادة المحاولة.`
            : isLocked
              ? `الفترة المحاسبية المغطية لتاريخ ${lockDate} مغلقة أو مقفولة. الرجاء فتحها من صفحة "الفترات المحاسبية" أو اختيار تاريخ ضمن فترة مفتوحة.`
              : rawMsg

          throw new SalesInvoicePaymentCommandError(
            friendly,
            400,
            "ERR_PERIOD_CLOSED",
            { effectiveDate: lockDate, missing: isMissing, locked: isLocked },
          )
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

    // ===== IAS 21 FX Adjustment Hook =====
    // If the caller passed exchangeRate + originalCurrencyAmount AND the
    // invoice is in a foreign currency, create a separate journal entry
    // recording the FX gain/loss on this payment. This runs AFTER the main
    // payment journal so it does not affect existing payment flow on failure.
    if (
      command.exchangeRate != null &&
      command.exchangeRate > 0 &&
      command.originalCurrencyAmount != null &&
      command.originalCurrencyAmount > 0
    ) {
      await this.postFXPaymentAdjustment({
        companyId: resolvedCompanyId,
        invoiceId: command.invoiceId,
        paymentId: result.payment_id || null,
        paymentDate: command.paymentDate,
        paymentExchangeRate: Number(command.exchangeRate),
        originalCurrencyAmount: Number(command.originalCurrencyAmount),
        userId: actor.userId,
        branchId: command.branchId || invoice.branch_id || null,
        costCenterId: command.costCenterId || invoice.cost_center_id || null,
      }).catch((err) => {
        // Non-fatal: payment already recorded, FX adjustment failed.
        // We log loudly so it can be re-run manually.
        console.error("[FX_ADJUSTMENT] Failed for invoice payment:", {
          invoiceId: command.invoiceId,
          paymentId: result.payment_id,
          error: err?.message || err,
        })
      })
    }

    // ===== v3.74.11 — Server-side bonus trigger =====
    // When this payment closes the invoice (status → "paid"), the bonus must
    // be calculated for the SALESPERSON (sales_orders.created_by_user_id),
    // not for the user who pressed "Record Payment". Previously this lived
    // in the client and required the actor to have bonuses:write — which
    // failed every time an accountant or warehouse clerk closed a sale,
    // silently denying the salesperson their commission.
    //
    // Calling the shared service from here, using the admin (service-role)
    // client, makes the calculation INDEPENDENT of the actor's role. Bonus
    // attribution stays in the service. Failures are logged but never
    // bubble up — the payment is already committed.
    if (result.new_status === "paid") {
      try {
        const { calculateBonusForPaidInvoice } = await import("./bonus-calculator.service")
        const bonusResult = await calculateBonusForPaidInvoice({
          admin: this.adminSupabase as any,
          invoiceId: command.invoiceId,
          companyId: resolvedCompanyId,
          actorUserId: actor.userId,
        })
        if (bonusResult.ok) {
          console.log(
            `[Bonus] Calculated for invoice ${command.invoiceId} -> user ${bonusResult.beneficiaryUserId} (creator: ${bonusResult.creatorSource}, config: ${bonusResult.configSource})`
          )
        } else if (bonusResult.skipped) {
          console.log(`[Bonus] Skipped for invoice ${command.invoiceId}: ${bonusResult.reason}`)
        } else {
          console.warn(`[Bonus] Failed for invoice ${command.invoiceId}: ${bonusResult.error}`)
        }
      } catch (err: any) {
        // Non-fatal: payment already recorded; bonus can be recalculated
        // manually by an owner/admin from the bonuses page.
        console.error("[Bonus] Unexpected error after payment:", {
          invoiceId: command.invoiceId,
          paymentId: result.payment_id,
          error: err?.message || err,
        })
      }
    }

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

  /**
   * Post a journal entry for FX gain/loss on an invoice payment.
   *
   * Runs after the main payment RPC succeeds. Reads the invoice's original
   * exchange_rate, compares with the payment-time rate provided in the command,
   * and posts the difference to 4320 (gain) or 5310 (loss) via getFXAccounts().
   *
   * Side-effect-only — does not throw upward; failures are logged.
   */
  private async postFXPaymentAdjustment(params: {
    companyId: string
    invoiceId: string
    paymentId: string | null
    paymentDate: string
    paymentExchangeRate: number
    originalCurrencyAmount: number
    userId: string
    branchId?: string | null
    costCenterId?: string | null
  }): Promise<void> {
    // Lookup invoice's recorded currency + rate
    const { data: inv, error: invErr } = await this.adminSupabase
      .from("invoices")
      .select("currency_code, exchange_rate, company_id")
      .eq("id", params.invoiceId)
      .maybeSingle()
    if (invErr || !inv) return

    // Company base currency for sanity check
    const { data: company } = await this.adminSupabase
      .from("companies")
      .select("base_currency")
      .eq("id", params.companyId)
      .maybeSingle()
    const baseCurrency = String(company?.base_currency || "EGP").toUpperCase()
    const invoiceCurrency = String(inv.currency_code || baseCurrency).toUpperCase()
    if (invoiceCurrency === baseCurrency) return  // not an FC invoice
    const originalRate = Number(inv.exchange_rate || 0)
    if (originalRate <= 0) return

    // FX diff (base currency)
    const arBase = params.originalCurrencyAmount * originalRate
    const cashBase = params.originalCurrencyAmount * params.paymentExchangeRate
    const fxDiff = cashBase - arBase
    if (Math.abs(fxDiff) < 0.01) return  // rounding noise

    // Resolve FX accounts
    const { getFXAccounts } = await import("@/lib/currency-service")
    const { gainId, lossId } = await getFXAccounts(this.adminSupabase as any, params.companyId)

    // Resolve AR account from chart_of_accounts — prefer sub_type, fall back to name
    const { data: accounts } = await this.adminSupabase
      .from("chart_of_accounts")
      .select("id, account_name, sub_type, account_code")
      .eq("company_id", params.companyId)
      .eq("is_active", true)
    const arRecord = (accounts as any[] | null)?.find((x: any) => x.sub_type === "accounts_receivable")
      || (accounts as any[] | null)?.find((x: any) => /عملاء|مدين|receivable/i.test(String(x.account_name || "")))
    const arAccountId = arRecord?.id as string | undefined
    if (!arAccountId) return  // can't post FX adjustment without AR account

    // Create journal entry — flagged as fx_payment_adjustment, requires approval
    // Schema:
    //   - status='draft' (no is_approved column on this table)
    //   - branch_id is NOT NULL — fall back to the first company branch if not provided
    //   - reference_id must be UUID — store descriptive id in entry_number instead
    //   - posted_by (not created_by)
    let branchId = params.branchId
    if (!branchId) {
      const { data: firstBranch } = await (this.adminSupabase as any)
        .from("branches")
        .select("id")
        .eq("company_id", params.companyId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      branchId = firstBranch?.id || null
    }
    if (!branchId) return  // cannot create entry without branch

    const refUuid = (typeof crypto !== "undefined" && (crypto as any).randomUUID)
      ? (crypto as any).randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const entryNumber = `FX-PAY-${params.paymentId || params.invoiceId}-${Date.now()}`

    const { data: entry, error: entryErr } = await (this.adminSupabase as any)
      .from("journal_entries")
      .insert({
        company_id: params.companyId,
        branch_id: branchId,
        cost_center_id: params.costCenterId,
        entry_date: params.paymentDate,
        entry_number: entryNumber,
        description: `فرق سعر العملة - دفعة فاتورة (${invoiceCurrency} → ${baseCurrency}) [${entryNumber}]`,
        reference_type: "fx_payment_adjustment",
        reference_id: refUuid,
        status: "draft",
        posted_by: params.userId,
      })
      .select()
      .single()
    if (entryErr || !entry) return

    const lines: any[] = []
    if (fxDiff > 0) {
      // Cash > AR → FX Gain
      lines.push({
        journal_entry_id: entry.id,
        account_id: arAccountId,
        debit_amount: fxDiff,
        credit_amount: 0,
        description: "تسوية فرق العملة - زيادة AR",
      })
      lines.push({
        journal_entry_id: entry.id,
        account_id: gainId,
        debit_amount: 0,
        credit_amount: fxDiff,
        description: "مكسب فروق العملة",
      })
    } else {
      const abs = Math.abs(fxDiff)
      lines.push({
        journal_entry_id: entry.id,
        account_id: lossId,
        debit_amount: abs,
        credit_amount: 0,
        description: "خسارة فروق العملة",
      })
      lines.push({
        journal_entry_id: entry.id,
        account_id: arAccountId,
        debit_amount: 0,
        credit_amount: abs,
        description: "تسوية فرق العملة - نقص AR",
      })
    }
    await (this.adminSupabase as any).from("journal_entry_lines").insert(lines)
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
