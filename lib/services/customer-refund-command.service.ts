import { randomUUID } from "crypto"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"
import { rollbackJournalEntry } from "@/lib/services/rollback-journal-entry"

const CUSTOMER_REFUND_EVENT = "customer_credit_refund_posting"

type SupabaseLike = any
type TraceRecord = { transaction_id: string; request_hash: string | null }

export type CustomerRefundCommand = {
  companyId: string
  customerId: string
  amount: number
  currencyCode: string
  exchangeRate: number
  baseAmount: number
  refundAccountId: string
  refundDate: string
  refundMethod: string
  notes?: string | null
  invoiceId?: string | null
  invoiceNumber?: string | null
  branchId?: string | null
  costCenterId?: string | null
  exchangeRateId?: string | null
  rateSource?: string | null
  uiSurface?: string | null
  // v3.74.200 — Account FX. Lets the caller pre-compute the cash line in
  // the account's native currency (e.g. refunding 3 EGP from a USD bank
  // account at the current rate yields 0.06 USD). The service stores those
  // values directly on the cash JE line so the bank ledger reads correctly
  // in its own currency. When omitted (same-currency refund or callers
  // that don't know the account FX), the service falls back to the
  // pre-v3.74.200 behaviour: cash line in base currency with rate 1.
  accountCurrency?: string | null
  accountFxRate?: number | null
  accountFxRateId?: string | null
  accountFxSource?: string | null
  accountNativeAmount?: number | null
}

export type CustomerRefundActor = {
  actorId: string
  actorRole: string
  actorBranchId?: string | null
  actorCostCenterId?: string | null
}

export type CustomerRefundResult = {
  success: boolean
  cached: boolean
  journalEntryId: string | null
  paymentId: string | null
  transactionId: string | null
  eventType: typeof CUSTOMER_REFUND_EVENT
  updatedCreditIds: string[]
}

const duplicateTrace = (message?: string | null) =>
  !!message && (message.includes("duplicate key value violates unique constraint") || message.includes("idx_financial_operation_traces_idempotency"))

export class CustomerRefundCommandService {
  constructor(private readonly adminSupabase: SupabaseLike) {}

  async recordRefund(
    actor: CustomerRefundActor,
    command: CustomerRefundCommand,
    options: { idempotencyKey: string; requestHash: string }
  ): Promise<CustomerRefundResult> {
    if (!command.companyId) throw new Error("Company is required")
    if (!command.customerId) throw new Error("Customer is required")
    if (!command.refundAccountId) throw new Error("Refund account is required")
    if (!command.refundDate) throw new Error("Refund date is required")
    if (!Number.isFinite(command.amount) || command.amount <= 0) throw new Error("Refund amount must be greater than zero")
    if (!Number.isFinite(command.baseAmount) || command.baseAmount <= 0) throw new Error("Refund base amount must be greater than zero")

    // v3.26.0: Enterprise rule — prevent cash overdraft on customer refunds
    {
      const { assertCashOutflowAllowed } = await import("@/lib/accounting/cash-balance-validator")
      await assertCashOutflowAllowed(this.adminSupabase, {
        accountId: command.refundAccountId,
        amount: command.baseAmount,
        nativeAmount: command.amount,
        companyId: command.companyId,
        description: `Customer refund ${command.customerId}`,
      })
    }

    const existingTrace = await this.findTraceByIdempotency(command.companyId, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different customer refund payload")
      }
      return {
        success: true,
        cached: true,
        journalEntryId: await this.findLinkedEntityId(existingTrace.transaction_id, "journal_entry"),
        paymentId: await this.findLinkedEntityId(existingTrace.transaction_id, "payment"),
        transactionId: existingTrace.transaction_id,
        eventType: CUSTOMER_REFUND_EVENT,
        updatedCreditIds: await this.findLinkedEntityIds(existingTrace.transaction_id, "customer_credit"),
      }
    }

    await requireOpenFinancialPeriod(command.companyId, command.refundDate)

    const customer = await this.loadCustomer(command.companyId, command.customerId)
    if (!customer) throw new Error("Customer was not found")
    const refundAccount = await this.loadAccount(command.companyId, command.refundAccountId)
    if (!refundAccount) throw new Error("Refund account was not found")
    const customerCreditAccount = await this.loadCustomerCreditAccount(command.companyId)
    if (!customerCreditAccount) throw new Error("Customer credit/advance account was not found")

    const accountBalance = await this.getAccountBalance(command.companyId, command.refundAccountId)
    if (accountBalance < command.baseAmount) {
      throw new Error(`Insufficient account balance. Available ${accountBalance.toFixed(2)}, required ${command.baseAmount.toFixed(2)}`)
    }

    const branchId = command.branchId || actor.actorBranchId || null
    const costCenterId = command.costCenterId || actor.actorCostCenterId || null
    const operationId = randomUUID()
    const description = command.invoiceNumber
      ? `Customer credit refund - ${customer.name || command.customerId} - Invoice #${command.invoiceNumber}`
      : command.notes || `Customer credit refund - ${customer.name || command.customerId}`
    const paymentNotes = command.invoiceNumber
      ? `Credit refund to customer ${customer.name || command.customerId} - Invoice #${command.invoiceNumber}`
      : command.notes || `Credit refund to customer ${customer.name || command.customerId}`

    let traceId: string | null = null
    let journalEntryId: string | null = null
    let paymentId: string | null = null
    const updatedCredits: Array<{ id: string; used_amount: number; status: string | null }> = []
    try {
      traceId = await this.createTrace({
        companyId: command.companyId,
        sourceEntity: command.invoiceId ? "invoice_credit_refund" : "customer_credit_refund",
        sourceId: operationId,
        eventType: CUSTOMER_REFUND_EVENT,
        actorId: actor.actorId,
        idempotencyKey: options.idempotencyKey,
        requestHash: options.requestHash,
        metadata: {
          customer_id: command.customerId,
          customer_name: customer.name || null,
          invoice_id: command.invoiceId || null,
          invoice_number: command.invoiceNumber || null,
          amount: command.amount,
          base_amount: command.baseAmount,
          currency_code: command.currencyCode,
          exchange_rate: command.exchangeRate,
          exchange_rate_id: command.exchangeRateId || null,
          rate_source: command.rateSource || null,
          refund_account_id: command.refundAccountId,
          customer_credit_account_id: customerCreditAccount.id,
          refund_date: command.refundDate,
          refund_method: command.refundMethod,
          branch_id: branchId,
          cost_center_id: costCenterId,
          ui_surface: command.uiSurface || "customer_refund_dialog",
        },
      })

      // v3.74.182 — reference_id must be unique per refund event. The old
      // code wrote command.invoiceId || command.customerId, which collided
      // with prevent_duplicate_journal_entry_v2 on the second refund for
      // the same customer (or the same invoice). Use the locally-generated
      // operationId as the JE reference: it's already issued per refund,
      // matches the trace's sourceId, and never collides.
      const { data: journalEntry, error: journalError } = await this.adminSupabase
        .from("journal_entries")
        .insert({
          company_id: command.companyId,
          reference_type: command.invoiceId ? "invoice_credit_refund" : "customer_credit_refund",
          reference_id: operationId,
          entry_date: command.refundDate,
          description,
          branch_id: branchId,
          cost_center_id: costCenterId,
          status: "draft",
        })
        .select("id")
        .single()
      if (journalError || !journalEntry?.id) throw new Error(journalError?.message || "Failed to create customer refund journal entry")
      journalEntryId = String(journalEntry.id)

      // v3.27.2 Multi-Currency Customer Refund Support
      // -----------------------------------------------
      // Customer credits are typically held in base currency. The refund cash/bank
      // account may have its OWN native currency (e.g., refunding a USD account).
      // Each line records its own native amount + rate for IAS 21.
      //
      // - Customer credit line (Dr): native = command.amount (in refund currency)
      // - Cash/bank line (Cr): native depends on the refund account's currency:
      //     • same as refund currency → command.amount
      //     • base currency           → command.baseAmount
      //     • cross-currency          → command.baseAmount (best-effort)
      const { data: companyRow } = await this.adminSupabase
        .from("companies")
        .select("base_currency")
        .eq("id", command.companyId)
        .maybeSingle()
      const baseCurrency = String(companyRow?.base_currency || "EGP").toUpperCase()
      const refundCurrency = String(command.currencyCode || baseCurrency).toUpperCase()

      // v3.74.200 — Resolve the account's native currency. Prefer what the
      // caller passed (the dialog already looked it up and presented an
      // FX picker to the user), and fall back to the chart_of_accounts
      // row only when the caller didn't tell us.
      let refundAccountCurrency: string | null = command.accountCurrency
        ? String(command.accountCurrency).toUpperCase()
        : null
      if (!refundAccountCurrency) {
        try {
          const { data: refundAcc } = await this.adminSupabase
            .from("chart_of_accounts")
            .select("original_currency")
            .eq("id", refundAccount.id)
            .maybeSingle()
          refundAccountCurrency = refundAcc?.original_currency ? String(refundAcc.original_currency).toUpperCase() : null
        } catch { /* ignore — fall back below */ }
      }

      // Three cases for the cash line:
      //   1. Account currency == refund currency  → native = command.amount,
      //      rate = command.exchangeRate.
      //   2. Cross-currency AND the caller passed accountNativeAmount /
      //      accountFxRate (v3.74.200 dialog) → use them. The cash line
      //      shows the right value in the bank's own currency and the
      //      bank ledger stays accurate even after the refund.
      //   3. Cross-currency, no FX provided (legacy callers) → fall back
      //      to the old behaviour: store the base amount, rate = 1. Not
      //      ideal for the bank ledger but the GL totals are correct.
      const sameCcy = refundAccountCurrency === refundCurrency
      const callerProvidedAccountFx = Number(command.accountFxRate || 0) > 0
        && command.accountNativeAmount != null
      const refundCashNative = sameCcy
        ? command.amount
        : callerProvidedAccountFx
          ? Number(command.accountNativeAmount)
          : command.baseAmount
      const refundCashRate = sameCcy
        ? command.exchangeRate
        : callerProvidedAccountFx
          ? Number(command.accountFxRate)
          : 1
      const refundCashRateId = sameCcy
        ? (command.exchangeRateId || null)
        : callerProvidedAccountFx
          ? (command.accountFxRateId || null)
          : null

      const { error: linesError } = await this.adminSupabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: journalEntryId,
          account_id: customerCreditAccount.id,
          debit_amount: command.baseAmount,
          credit_amount: 0,
          description: "Customer credit refund",
          original_currency: refundCurrency,
          original_debit: command.amount,
          original_credit: 0,
          exchange_rate_used: command.exchangeRate,
          exchange_rate_id: command.exchangeRateId || null,
          branch_id: branchId,
          cost_center_id: costCenterId,
        },
        {
          journal_entry_id: journalEntryId,
          account_id: refundAccount.id,
          debit_amount: 0,
          credit_amount: command.baseAmount,
          description: `Cash/Bank payment to customer${refundAccountCurrency && refundAccountCurrency !== baseCurrency ? ` (${refundAccountCurrency})` : ""}`,
          original_currency: refundAccountCurrency || refundCurrency,
          original_debit: 0,
          original_credit: refundCashNative,
          exchange_rate_used: refundCashRate,
          exchange_rate_id: refundCashRateId,
          branch_id: branchId,
          cost_center_id: costCenterId,
        },
      ])
      if (linesError) throw new Error(linesError.message || "Failed to create customer refund journal lines")

      // v3.74.223 — customer_credits is denominated in base currency, so
      // a 0.01 USD refund at rate 55 must deduct 0.55 EGP from used_amount,
      // not 0.01. The previous code passed command.amount (USD) instead of
      // command.baseAmount (EGP), so used_amount drifted from the GL on
      // every foreign-currency refund — the integrity check reported a
      // 0.54 EGP discrepancy after the user paid 0.01 USD on a 0.67 EGP
      // credit.
      await this.applyCustomerCredits(command.companyId, command.customerId, command.baseAmount, updatedCredits)

      // v3.74.100 — write the refund row into customer_credit_ledger so the
      // ledger-based balance (used by /api/customer-credits and the invoice
      // detail banner) reflects the disbursement immediately. Without this,
      // /invoices/[id] still shows the old credit as "available" because the
      // ledger balance never decreased to match used_amount.
      // v3.74.223 — same currency fix: ledger is base-currency.
      try {
        await this.adminSupabase.from("customer_credit_ledger").insert({
          company_id: command.companyId,
          customer_id: command.customerId,
          source_type: "customer_refund",
          source_id: operationId,
          amount: -Math.abs(Number(command.baseAmount || 0)),
          description: command.invoiceNumber
            ? `صَرف رَصيد دائن للعَميل — مرتبط بفاتورة ${command.invoiceNumber}`
            : `صَرف رَصيد دائن للعَميل`,
        })
      } catch (err: any) {
        // Non-fatal: the GL/customer_credits are still consistent. Surface the
        // error so we notice if the constraint or schema drifts.
        console.error("[CUSTOMER_REFUND_LEDGER] Failed to write ledger row:", err?.message || err)
      }

      // v3.74.103 - resolve source invoice numbers from consumed credits so the
      // refund payment notes spell out where the credit originated. v3.74.104
      // tightens this: the credit may have been born from a sale-return OR from
      // an overpayment - both put INV-XXX into customer_credits.notes, but the
      // reference_type tells us which family to label.
      let sourceInvoiceNote = ""
      try {
        const ids = updatedCredits.map(c => c.id)
        if (ids.length > 0) {
          const { data: srcCredits } = await this.adminSupabase
            .from("customer_credits")
            .select("notes, reference_type")
            .in("id", ids)
          const returnInvs = new Set<string>()
          const overpayInvs = new Set<string>()
          for (const c of srcCredits || []) {
            const refType = String((c as any).reference_type || "")
            const matches = String((c as any).notes || "").match(/INV-\d+/g) || []
            for (const inv of matches) {
              if (refType === "invoice_overpayment") overpayInvs.add(inv)
              else returnInvs.add(inv) // invoice_return + legacy
            }
          }
          const parts: string[] = []
          if (returnInvs.size > 0) parts.push(`مَرتَجَع ${Array.from(returnInvs).join(", ")}`)
          if (overpayInvs.size > 0) parts.push(`زيادَة دَفع عَلى ${Array.from(overpayInvs).join(", ")}`)
          if (parts.length > 0) {
            sourceInvoiceNote = ` (مَصدَر الرَّصيد: ${parts.join(" + ")})`
          }
        }
      } catch { /* non-critical enrichment */ }

      const enrichedNotes = `${paymentNotes}${sourceInvoiceNote}`

      const { data: payment, error: paymentError } = await this.insertRefundPayment({
        companyId: command.companyId,
        customerId: command.customerId,
        refundDate: command.refundDate,
        amount: command.amount,
        baseAmount: command.baseAmount,
        currencyCode: refundCurrency,
        exchangeRate: command.exchangeRate,
        exchangeRateId: command.exchangeRateId || null,
        rateSource: command.rateSource || null,
        refundMethod: command.refundMethod,
        referenceNumber: command.invoiceNumber ? `REF-INV-${command.invoiceNumber}-${Date.now()}` : `REF-${Date.now()}`,
        notes: enrichedNotes,
        branchId,
        costCenterId,
        accountId: command.refundAccountId,
        createdBy: actor.actorId,
      })
      if (paymentError) throw new Error(paymentError.message || "Failed to create customer refund payment record")
      paymentId = payment?.id ? String(payment.id) : null

      const { error: postError } = await this.adminSupabase
        .from("journal_entries")
        .update({ status: "posted" })
        .eq("id", journalEntryId)
      if (postError) throw new Error(postError.message || "Failed to post customer refund journal entry")

      await this.linkTrace(traceId, "journal_entry", journalEntryId, "customer_refund_journal", "customer_credit_refund")
      if (paymentId) await this.linkTrace(traceId, "payment", paymentId, "customer_refund_payment", "customer_credit_refund")
      for (const credit of updatedCredits) {
        await this.linkTrace(traceId, "customer_credit", credit.id, "customer_refund_credit_usage", "customer_credit_refund")
      }

      // v3.27.8 IAS 21 FX Adjustment Hook for Customer Refund
      // If the refund is linked to an FC invoice and refund rate differs from
      // invoice rate, post FX gain/loss. Side-effect only; failures are logged.
      if (command.invoiceId && command.exchangeRate > 0) {
        await this.postFXRefundAdjustment({
          companyId: command.companyId,
          invoiceId: command.invoiceId,
          refundPaymentId: paymentId,
          refundDate: command.refundDate,
          refundExchangeRate: command.exchangeRate,
          refundNativeAmount: command.amount,
          baseCurrency: baseCurrency,
          userId: actor.actorId,
          branchId: branchId,
          costCenterId: costCenterId,
        }).catch((err) => {
          console.error("[FX_ADJUSTMENT_REFUND] Failed:", { invoiceId: command.invoiceId, paymentId, error: err?.message || err })
        })
      }

      return {
        success: true,
        cached: false,
        journalEntryId,
        paymentId,
        transactionId: traceId,
        eventType: CUSTOMER_REFUND_EVENT,
        updatedCreditIds: updatedCredits.map((credit) => credit.id),
      }
    } catch (error) {
      for (const credit of updatedCredits.reverse()) {
        await this.adminSupabase
          .from("customer_credits")
          .update({ used_amount: credit.used_amount, status: credit.status, updated_at: new Date().toISOString() })
          .eq("id", credit.id)
      }
      if (paymentId) await this.adminSupabase.from("payments").delete().eq("id", paymentId)
      if (journalEntryId) {
        // v3.74.756 — see rollback-journal-entry.ts: a silent failure here left
        // a refund's journal entry in the ledger after the refund was undone.
        await rollbackJournalEntry(this.adminSupabase as any, journalEntryId, "customer refund")
      }
      if (traceId) {
        await this.adminSupabase.from("financial_operation_trace_links").delete().eq("transaction_id", traceId)
        await this.adminSupabase.from("financial_operation_traces").delete().eq("transaction_id", traceId)
      }
      throw error
    }
  }

  /**
   * v3.27.8: Post FX gain/loss adjustment for a customer refund linked to an FC invoice.
   * Compares invoice's original rate vs refund rate, posts diff to 4320/5310.
   */
  private async postFXRefundAdjustment(params: {
    companyId: string
    invoiceId: string
    refundPaymentId: string | null
    refundDate: string
    refundExchangeRate: number
    refundNativeAmount: number
    baseCurrency: string
    userId: string
    branchId: string | null
    costCenterId: string | null
  }): Promise<void> {
    const { data: inv } = await this.adminSupabase
      .from("invoices")
      .select("currency_code, exchange_rate, branch_id, cost_center_id")
      .eq("id", params.invoiceId)
      .maybeSingle()
    if (!inv) return

    const invoiceCurrency = String(inv.currency_code || params.baseCurrency).toUpperCase()
    const baseCur = String(params.baseCurrency || "EGP").toUpperCase()
    if (invoiceCurrency === baseCur) return

    const originalRate = Number(inv.exchange_rate || 0)
    if (originalRate <= 0 || params.refundExchangeRate <= 0) return

    const creditBookBase = params.refundNativeAmount * originalRate
    const cashOutBase = params.refundNativeAmount * params.refundExchangeRate
    const fxDiff = cashOutBase - creditBookBase
    if (Math.abs(fxDiff) < 0.01) return

    const { getFXAccounts } = await import("@/lib/currency-service")
    const { gainId, lossId } = await getFXAccounts(this.adminSupabase as any, params.companyId)

    const { data: accounts } = await this.adminSupabase
      .from("chart_of_accounts")
      .select("id, account_name, sub_type, account_code")
      .eq("company_id", params.companyId)
      .eq("is_active", true)
    // v3.74.711 — the sub_type is "customer_credit" (singular). The plural never
    // existed in the chart, so this always fell through to the name regex — and
    // that regex matches "سلف ومقدمات للموظفين" (employee advances, an ASSET)
    // and "سلف من العملاء" just as readily as the real credit account. Which one
    // it picked depended on row order, so an FX adjustment on a customer refund
    // could land in an unrelated account, differently each time.
    const ccRecord = (accounts as any[] | null)?.find((x: any) => x.sub_type === "customer_credit")
      || (accounts as any[] | null)?.find((x: any) => x.account_code === "2155")
      || (accounts as any[] | null)?.find((x: any) => /رصيد العملاء الدائن|customer credit/i.test(String(x.account_name || "")))
    const ccAccountId = ccRecord?.id as string | undefined
    if (!ccAccountId) return

    let branchId = params.branchId || inv.branch_id || null
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
    if (!branchId) return

    const refUuid = (typeof crypto !== "undefined" && (crypto as any).randomUUID)
      ? (crypto as any).randomUUID()
      : Date.now().toString() + Math.random().toString(36).slice(2)
    const entryNumber = "FX-REFUND-" + (params.refundPaymentId || params.invoiceId) + "-" + Date.now()

    const { data: entry } = await (this.adminSupabase as any)
      .from("journal_entries")
      .insert({
        company_id: params.companyId,
        branch_id: branchId,
        cost_center_id: params.costCenterId || inv.cost_center_id || null,
        entry_date: params.refundDate,
        entry_number: entryNumber,
        description: "فرق سعر العملة - استرداد عميل (" + invoiceCurrency + " -> " + baseCur + ")",
        reference_type: "fx_refund_adjustment",
        reference_id: refUuid,
        status: "posted",
        posted_at: new Date().toISOString(),
        posted_by: params.userId,
      })
      .select()
      .single()
    if (!entry) return

    const lines: any[] = []
    if (fxDiff > 0) {
      // FX LOSS: Dr 5310 / Cr Customer Credit
      lines.push({ journal_entry_id: entry.id, account_id: lossId, debit_amount: fxDiff, credit_amount: 0, description: "خسارة فروق العملة - استرداد عميل" })
      lines.push({ journal_entry_id: entry.id, account_id: ccAccountId, debit_amount: 0, credit_amount: fxDiff, description: "تسوية فرق العملة - رصيد العميل" })
    } else {
      const abs = Math.abs(fxDiff)
      // FX GAIN: Dr Customer Credit / Cr 4320
      lines.push({ journal_entry_id: entry.id, account_id: ccAccountId, debit_amount: abs, credit_amount: 0, description: "تسوية فرق العملة - رصيد العميل" })
      lines.push({ journal_entry_id: entry.id, account_id: gainId, debit_amount: 0, credit_amount: abs, description: "ربح فروق العملة - استرداد عميل" })
    }
    await (this.adminSupabase as any).from("journal_entry_lines").insert(lines)
  }

  private async insertRefundPayment(params: {
    companyId: string
    customerId: string
    refundDate: string
    amount: number
    baseAmount?: number
    currencyCode?: string | null
    exchangeRate?: number | null
    exchangeRateId?: string | null
    rateSource?: string | null
    refundMethod: string
    referenceNumber: string
    notes: string
    branchId: string | null
    costCenterId: string | null
    accountId: string
    createdBy?: string | null
  }) {
    // v3.74.225 — persist FX context so the /payments list and details
    // modal show "0.01 $ ≈ 0.55 £" instead of just "-0.55 £" for cross-
    // currency refunds. Mirrors v3.74.219 on the invoice-payment side.
    const ccy = String(params.currencyCode || 'EGP').toUpperCase()
    const baseAmt = Number(params.baseAmount ?? params.amount)
    const rate = Number(params.exchangeRate || 1) || 1
    const payload: Record<string, any> = {
      company_id: params.companyId,
      customer_id: params.customerId,
      payment_date: params.refundDate,
      amount: -baseAmt,
      currency_code: ccy,
      exchange_rate: rate,
      exchange_rate_used: rate,
      exchange_rate_id: params.exchangeRateId || null,
      rate_source: params.rateSource || null,
      base_currency_amount: -baseAmt,
      original_amount: -Math.abs(params.amount),
      original_currency: ccy,
      payment_method: params.refundMethod === "bank" ? "bank" : "cash",
      reference_number: params.referenceNumber,
      notes: params.notes,
      branch_id: params.branchId,
      cost_center_id: params.costCenterId,
      // v3.74.226 — propagate the actor so the /payments details modal can
      // show the creator name and the audit log can attribute the CREATE
      // event. Without this, both surfaces fell back to "غَير مُسَجَّل" /
      // "Unknown user" and the approval trail showed an empty author row.
      created_by: params.createdBy || null,
    }
    const { data, error } = await this.adminSupabase.from("payments").insert({ ...payload, account_id: params.accountId }).select("id").single()
    if (!error) return { data, error: null }

    const msg = String(error.message || "").toLowerCase()
    if (msg.includes("account_id")) {
      return await this.adminSupabase.from("payments").insert(payload).select("id").single()
    }
    return { data: null, error }
  }

  private async applyCustomerCredits(companyId: string, customerId: string, amount: number, updatedCredits: Array<{ id: string; used_amount: number; status: string | null }>) {
    // v3.74.199 — include 'partially_used' rows. The filter used to be
    // 'active' only, so a customer whose credit had been touched even once
    // (status flipped to 'partially_used' by the trigger) became invisible
    // to the refund executor: the JE posted, but used_amount never moved
    // and the customers page kept showing the old available_credits.
    // Same fix the customers-page balance calc got in v3.74.121.
    const { data: credits, error } = await this.adminSupabase
      .from("customer_credits")
      .select("id, amount, used_amount, applied_amount, status")
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .in("status", ["active", "partially_used"])
      .order("credit_date", { ascending: true })
    if (error) throw new Error(error.message || "Failed to load customer credits")

    let remainingToDeduct = amount
    for (const credit of credits || []) {
      if (remainingToDeduct <= 0) break
      const usedAmount = Number(credit.used_amount || 0)
      const appliedAmount = Number(credit.applied_amount || 0)
      const total = Number(credit.amount || 0)
      const available = total - usedAmount - appliedAmount
      if (available <= 0) continue
      const deductAmount = Math.min(available, remainingToDeduct)
      const newUsedAmount = usedAmount + deductAmount
      // v3.74.199 — three terminal states, not two. used / partially_used /
      // active. Without the partially_used branch, a row that started at
      // 'partially_used' would flip back to 'active' here even though
      // a portion of it was already gone.
      const consumed = newUsedAmount + appliedAmount
      const newStatus =
        consumed >= total ? "used"
        : consumed > 0   ? "partially_used"
        : "active"
      updatedCredits.push({ id: String(credit.id), used_amount: usedAmount, status: credit.status || null })
      const { error: updateError } = await this.adminSupabase
        .from("customer_credits")
        .update({ used_amount: newUsedAmount, status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", credit.id)
      if (updateError) throw new Error(updateError.message || "Failed to update customer credit")
      remainingToDeduct -= deductAmount
    }
  }

  private async getAccountBalance(companyId: string, accountId: string) {
    const { data, error } = await this.adminSupabase
      .from("journal_entry_lines")
      .select("debit_amount, credit_amount, journal_entries!inner(company_id, status)")
      .eq("account_id", accountId)
      .eq("journal_entries.company_id", companyId)
      .eq("journal_entries.status", "posted")
    if (error) throw new Error(error.message || "Failed to validate refund account balance")
    return (data || []).reduce((sum: number, line: any) => sum + Number(line.debit_amount || 0) - Number(line.credit_amount || 0), 0)
  }

  private async loadCustomer(companyId: string, customerId: string) {
    const { data, error } = await this.adminSupabase
      .from("customers")
      .select("id, name")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .maybeSingle()
    if (error || !data) return null
    return data
  }

  private async loadAccount(companyId: string, accountId: string) {
    const { data, error } = await this.adminSupabase
      .from("chart_of_accounts")
      .select("id, account_name, account_type, sub_type, is_active")
      .eq("id", accountId)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle()
    if (error || !data) return null
    return data
  }

  private async loadCustomerCreditAccount(companyId: string) {
    const { data, error } = await this.adminSupabase
      .from("chart_of_accounts")
      .select("id, account_name, account_type, sub_type, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true)
    if (error || !data) return null
    return (data || []).find((account: any) => {
      const subType = String(account.sub_type || "").toLowerCase()
      const accountType = String(account.account_type || "").toLowerCase()
      const name = String(account.account_name || "").toLowerCase()
      return (accountType === "liability" && (subType === "customer_credit" || subType === "customer_advance")) ||
        subType === "customer_credit" ||
        subType === "customer_advance" ||
        name.includes("سلف العملاء") ||
        name.includes("رصيد العملاء")
    }) || null
  }

  private async createTrace(params: {
    companyId: string
    sourceEntity: string
    sourceId: string
    eventType: string
    actorId: string
    idempotencyKey: string
    requestHash: string
    metadata: Record<string, unknown>
  }) {
    const { data, error } = await this.adminSupabase.rpc("create_financial_operation_trace", {
      p_company_id: params.companyId,
      p_source_entity: params.sourceEntity,
      p_source_id: params.sourceId,
      p_event_type: params.eventType,
      p_actor_id: params.actorId,
      p_idempotency_key: params.idempotencyKey,
      p_request_hash: params.requestHash,
      p_metadata: params.metadata,
      p_audit_flags: [],
    })
    if (error) {
      if (duplicateTrace(error.message)) {
        const existing = await this.findTraceByIdempotency(params.companyId, params.idempotencyKey)
        if (existing?.transaction_id) return existing.transaction_id
      }
      throw new Error(error.message || "Failed to create customer refund trace")
    }
    return String(data)
  }

  private async linkTrace(traceId: string, entityType: string, entityId: string, linkRole: string, referenceType: string) {
    await this.adminSupabase.from("financial_operation_trace_links").upsert({
      transaction_id: traceId,
      entity_type: entityType,
      entity_id: entityId,
      link_role: linkRole,
      reference_type: referenceType,
    }, { onConflict: "transaction_id,entity_type,entity_id" })
  }

  private async findTraceByIdempotency(companyId: string, idempotencyKey: string): Promise<TraceRecord | null> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_traces")
      .select("transaction_id, request_hash")
      .eq("company_id", companyId)
      .eq("event_type", CUSTOMER_REFUND_EVENT)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()
    if (error || !data) return null
    return data as TraceRecord
  }

  private async findLinkedEntityId(traceId: string, entityType: string): Promise<string | null> {
    const ids = await this.findLinkedEntityIds(traceId, entityType)
    return ids[0] || null
  }
  private async findLinkedEntityIds(traceId: string, entityType: string): Promise<string[]> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_trace_links")
      .select("entity_id")
      .eq("transaction_id", traceId)
      .eq("entity_type", entityType)
      .order("created_at", { ascending: true })
    if (error || !data) return []
    return data.map((row: any) => String(row.entity_id)).filter(Boolean)
  }
}

export { CUSTOMER_REFUND_EVENT }
