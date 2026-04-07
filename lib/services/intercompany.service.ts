import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { emitEvent } from "@/lib/event-bus"
import { enterpriseFinanceFlags } from "@/lib/enterprise-finance-flags"

type AdminClient = SupabaseClient<any, "public", any>

const MANAGEMENT_ROLES = new Set(["owner", "admin", "general_manager", "manager"])

export interface IntercompanyActor {
  userId: string
  email?: string | null
}

export interface CreateIntercompanyTransactionInput {
  sellerCompanyId: string
  buyerCompanyId: string
  sourceFlowType: "inventory_sale" | "service_charge" | "expense_rebill" | "loan" | "asset_transfer"
  transactionDate: string
  transactionCurrency: string
  transactionAmount: number
  pricingPolicy: "cost_based" | "cost_plus" | "market_based" | "regulated_transfer_price"
  pricingReference?: Record<string, unknown>
  operationalContext?: Record<string, unknown>
  requestedShipDate?: string | null
  sellerExchangeRate?: number | null
  sellerRateSource?: string | null
  sellerRateTimestamp?: string | null
  buyerExchangeRate?: number | null
  buyerRateSource?: string | null
  buyerRateTimestamp?: string | null
  idempotencyKey?: string | null
  requestHash?: string | null
}

export interface CreateConsolidationRunInput {
  hostCompanyId: string
  consolidationGroupId: string
  periodStart: string
  periodEnd: string
  runType: "dry_run" | "period_close" | "rerun" | "audit_replay"
  asOfTimestamp: string
}

type TraceOptions = {
  companyId: string
  sourceEntity: string
  sourceId: string
  eventType: string
  actorUserId: string
  idempotencyKey?: string | null
  requestHash?: string | null
  metadata?: Record<string, unknown>
  auditFlags?: string[]
}

type OperationOptions = {
  idempotencyKey?: string | null
  requestHash?: string | null
}

function nowIso() {
  return new Date().toISOString()
}

function buildNumber(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function normalizeDate(input?: string | null) {
  if (!input) return new Date().toISOString().slice(0, 10)
  return input.slice(0, 10)
}

export class IntercompanyService {
  constructor(
    private readonly adminSupabase: AdminClient,
    private readonly eventSupabase: AdminClient = adminSupabase
  ) {}

  async listTransactionsForActor(actorUserId: string) {
    this.assertIntercompanyEnabled()
    const companyIds = await this.getManagedCompanyIds(actorUserId)
    if (companyIds.length === 0) return []

    const { data, error } = await this.adminSupabase
      .from("intercompany_transactions")
      .select("*")
      .in("seller_company_id", companyIds)
      .in("buyer_company_id", companyIds)
      .order("created_at", { ascending: false })

    if (error) throw new Error(`Failed to list intercompany transactions: ${error.message}`)
    return data || []
  }

  async listConsolidationRunsForActor(actorUserId: string) {
    this.assertConsolidationEnabled()
    const companyIds = await this.getManagedCompanyIds(actorUserId)
    if (companyIds.length === 0) return []

    const { data, error } = await this.adminSupabase
      .from("consolidation_runs")
      .select("*")
      .in("host_company_id", companyIds)
      .order("created_at", { ascending: false })

    if (error) throw new Error(`Failed to list consolidation runs: ${error.message}`)
    return data || []
  }

  async createIntercompanyTransaction(input: CreateIntercompanyTransactionInput, actor: IntercompanyActor) {
    this.assertIntercompanyEnabled()
    await this.assertDualCompanyManagementAccess(input.sellerCompanyId, input.buyerCompanyId, actor.userId)

    if (input.sellerCompanyId === input.buyerCompanyId) {
      throw new Error("Seller and buyer companies must be different")
    }

    if (!input.transactionAmount || Number(input.transactionAmount) <= 0) {
      throw new Error("transactionAmount must be greater than zero")
    }

    const relationship = await this.getActiveRelationship(input.sellerCompanyId, input.buyerCompanyId)
    const sellerRateTimestamp = input.sellerExchangeRate != null || input.sellerRateSource
      ? (input.sellerRateTimestamp || nowIso())
      : null
    const buyerRateTimestamp = input.buyerExchangeRate != null || input.buyerRateSource
      ? (input.buyerRateTimestamp || nowIso())
      : null
    const transactionNumber = buildNumber("IC")
    const payload = {
      transaction_number: transactionNumber,
      intercompany_relationship_id: relationship.id,
      seller_company_id: input.sellerCompanyId,
      buyer_company_id: input.buyerCompanyId,
      seller_legal_entity_id: relationship.seller_legal_entity_id,
      buyer_legal_entity_id: relationship.buyer_legal_entity_id,
      source_flow_type: input.sourceFlowType,
      transaction_date: normalizeDate(input.transactionDate),
      transaction_currency: input.transactionCurrency,
      transaction_amount: Number(input.transactionAmount),
      pricing_policy: input.pricingPolicy,
      pricing_reference: input.pricingReference || {},
      operational_context: input.operationalContext || {},
      seller_exchange_rate: input.sellerExchangeRate ?? null,
      seller_rate_source: input.sellerRateSource ?? null,
      seller_rate_timestamp: sellerRateTimestamp,
      buyer_exchange_rate: input.buyerExchangeRate ?? null,
      buyer_rate_source: input.buyerRateSource ?? null,
      buyer_rate_timestamp: buyerRateTimestamp,
      requested_ship_date: input.requestedShipDate || null,
      status: "draft",
      orchestration_status: "draft",
      idempotency_key: input.idempotencyKey || null,
      created_by: actor.userId,
    }

    const { data, error } = await this.adminSupabase
      .from("intercompany_transactions")
      .insert(payload)
      .select("*")
      .single()

    if (error?.code === "23505" && input.idempotencyKey) {
      const existing = await this.findExistingIntercompanyTransaction(input.sellerCompanyId, input.buyerCompanyId, input.idempotencyKey)
      if (existing) {
        return { transaction: existing, alreadyExists: true }
      }
    }

    if (error) throw new Error(`Failed to create intercompany transaction: ${error.message}`)

    const traceId = await this.createTrace({
      companyId: input.sellerCompanyId,
      sourceEntity: "intercompany_transaction",
      sourceId: data.id,
      eventType: "intercompany_created",
      actorUserId: actor.userId,
      idempotencyKey: input.idempotencyKey || null,
      requestHash: input.requestHash || null,
      metadata: {
        buyer_company_id: input.buyerCompanyId,
        source_flow_type: input.sourceFlowType,
        transaction_currency: input.transactionCurrency,
        transaction_amount: input.transactionAmount,
      },
    })

    await this.linkTrace(traceId, "intercompany_transaction", data.id, "source", "intercompany_transaction")
    await this.emitIntercompanyEvent("intercompany.created", input.sellerCompanyId, data.id, actor.userId, input.idempotencyKey || undefined, {
      buyerCompanyId: input.buyerCompanyId,
      traceId,
    })

    return { transaction: data, traceId, alreadyExists: false }
  }

  async submitIntercompanyTransaction(transactionId: string, actor: IntercompanyActor, options: OperationOptions = {}) {
    this.assertIntercompanyEnabled()
    const transaction = await this.getTransaction(transactionId)
    await this.assertTransactionManagementAccess(transaction, actor.userId)

    if (transaction.status !== "draft" && transaction.status !== "rejected") {
      return { transaction, alreadySubmitted: transaction.status === "pending_approval" }
    }

    const updated = await this.updateTransaction(transactionId, {
      status: "pending_approval",
      orchestration_status: "awaiting_approval",
    })

    const traceId = await this.createTrace({
      companyId: updated.seller_company_id,
      sourceEntity: "intercompany_transaction",
      sourceId: updated.id,
      eventType: "intercompany_submitted",
      actorUserId: actor.userId,
      idempotencyKey: options.idempotencyKey || null,
      requestHash: options.requestHash || null,
      metadata: { status: updated.status },
    })

    await this.linkTrace(traceId, "intercompany_transaction", updated.id, "submit", "intercompany_transaction")
    await this.emitIntercompanyEvent("intercompany.submitted", updated.seller_company_id, updated.id, actor.userId, options.idempotencyKey || undefined, { traceId })
    return { transaction: updated, traceId }
  }

  async approveIntercompanyTransaction(transactionId: string, actor: IntercompanyActor, options: OperationOptions = {}) {
    this.assertIntercompanyEnabled()
    const transaction = await this.getTransaction(transactionId)
    await this.assertTransactionManagementAccess(transaction, actor.userId)
    await this.assertCrossEntityPeriodsOpen(
      transaction.seller_company_id,
      transaction.buyer_company_id,
      normalizeDate(transaction.transaction_date)
    )

    if (["approved", "mirroring", "mirrored", "reconciled", "eliminated", "closed"].includes(transaction.status)) {
      return { transaction, alreadyApproved: true }
    }

    let updated = await this.updateTransaction(transactionId, {
      status: enterpriseFinanceFlags.intercompanyDevAutoMirror ? "mirroring" : "approved",
      orchestration_status: enterpriseFinanceFlags.intercompanyDevAutoMirror ? "mirroring" : "approved",
      approved_by: actor.userId,
    })

    let generatedDocuments: any[] = []
    if (enterpriseFinanceFlags.intercompanyDevAutoMirror) {
      try {
        generatedDocuments = await this.ensureDevMirroredDocuments(updated)
        updated = await this.updateTransaction(transactionId, {
          status: "mirrored",
          orchestration_status: "dev_auto_mirrored",
        })
      } catch (error: any) {
        updated = await this.updateTransaction(transactionId, {
          status: "mirror_failed",
          orchestration_status: "failed",
        })

        await this.createTrace({
          companyId: updated.seller_company_id,
          sourceEntity: "intercompany_transaction",
          sourceId: updated.id,
          eventType: "intercompany_mirror_failed",
          actorUserId: actor.userId,
          idempotencyKey: options.idempotencyKey || null,
          requestHash: options.requestHash || null,
          metadata: {
            buyer_company_id: updated.buyer_company_id,
            failure_stage: "dev_auto_mirror",
            error_message: error?.message || "unknown_error",
          },
          auditFlags: ["INTERCOMPANY_SAGA_COMPENSATION_REQUIRED"],
        })

        throw new Error(`Intercompany mirror failed: ${error?.message || "unknown_error"}`)
      }
    }

    const traceId = await this.createTrace({
      companyId: updated.seller_company_id,
      sourceEntity: "intercompany_transaction",
      sourceId: updated.id,
      eventType: "intercompany_approved",
      actorUserId: actor.userId,
      idempotencyKey: options.idempotencyKey || null,
      requestHash: options.requestHash || null,
      metadata: {
        buyer_company_id: updated.buyer_company_id,
        dev_auto_mirror: enterpriseFinanceFlags.intercompanyDevAutoMirror,
        generated_document_count: generatedDocuments.length,
      },
    })

    await this.linkTrace(traceId, "intercompany_transaction", updated.id, "approval", "intercompany_transaction")
    for (const doc of generatedDocuments) {
      await this.linkTrace(traceId, "intercompany_document", doc.id, "mirrored_document", doc.document_stage)
    }

    await this.emitIntercompanyEvent("intercompany.approved", updated.seller_company_id, updated.id, actor.userId, options.idempotencyKey || undefined, {
      traceId,
      mirrored: updated.status === "mirrored",
    })

    return { transaction: updated, traceId, generatedDocuments }
  }

  async reconcileIntercompany(transactionId: string, actor: IntercompanyActor, options: OperationOptions = {}) {
    this.assertIntercompanyEnabled()
    const transaction = await this.getTransaction(transactionId)
    await this.assertTransactionManagementAccess(transaction, actor.userId)

    if (["reconciled", "eliminated"].includes(String(transaction.status || "").toLowerCase())) {
      const existingResult = await this.getLatestReconciliationResult(transactionId)
      if (existingResult) {
        return { transaction, reconciliation: existingResult, alreadyReconciled: true }
      }
    }

    const { data: documents, error } = await this.adminSupabase
      .from("intercompany_documents")
      .select("*")
      .eq("intercompany_transaction_id", transactionId)
      .eq("link_status", "active")

    if (error) throw new Error(`Failed to load intercompany documents: ${error.message}`)

    const sellerInvoice = (documents || []).find((doc: any) => doc.side === "seller" && doc.document_stage === "invoice")
    const buyerBill = (documents || []).find((doc: any) => doc.side === "buyer" && doc.document_stage === "bill")
    const relationship = await this.getActiveRelationship(transaction.seller_company_id, transaction.buyer_company_id)

    const sellerAmount = Number(sellerInvoice?.document_amount || 0)
    const buyerAmount = Number(buyerBill?.document_amount || 0)
    const amountVariance = Math.abs(sellerAmount - buyerAmount)
    const dateVarianceDays = 0
    const toleranceAmount = Number(relationship.tolerance_amount || 0)
    const tolerancePercent = Number(relationship.tolerance_percent || 0)
    const allowedVariance = Math.max(toleranceAmount, (Number(transaction.transaction_amount || 0) * tolerancePercent) / 100)

    let resultStatus: "matched" | "matched_within_tolerance" | "mismatched" | "blocked" = "blocked"
    let mismatchReason: string | null = null

    if (!sellerInvoice || !buyerBill) {
      mismatchReason = "missing_counter_document"
    } else if (sellerInvoice.transaction_currency && buyerBill.transaction_currency && sellerInvoice.transaction_currency !== buyerBill.transaction_currency) {
      mismatchReason = "currency_mismatch"
      resultStatus = "blocked"
    } else if (amountVariance === 0) {
      resultStatus = "matched"
    } else if (amountVariance <= allowedVariance) {
      resultStatus = "matched_within_tolerance"
    } else {
      resultStatus = "mismatched"
      mismatchReason = "amount_mismatch"
    }

    const reconciliationPayload = {
      intercompany_transaction_id: transactionId,
      seller_invoice_id: sellerInvoice?.document_id || null,
      buyer_bill_id: buyerBill?.document_id || null,
      seller_receipt_id: null,
      buyer_payment_id: null,
      reconciliation_scope: "billing",
      seller_open_amount: sellerAmount,
      buyer_open_amount: buyerAmount,
      amount_variance: amountVariance,
      currency_variance: 0,
      date_variance_days: dateVarianceDays,
      tolerance_applied: {
        tolerance_amount: toleranceAmount,
        tolerance_percent: tolerancePercent,
        allowed_variance: allowedVariance,
      },
      result_status: resultStatus,
      mismatch_reason: mismatchReason,
      alert_generated: resultStatus === "mismatched" || resultStatus === "blocked",
    }

    const { data: result, error: reconcileError } = await this.adminSupabase
      .from("intercompany_reconciliation_results")
      .insert(reconciliationPayload)
      .select("*")
      .single()

    if (reconcileError) throw new Error(`Failed to create reconciliation result: ${reconcileError.message}`)

    const updated = await this.updateTransaction(transactionId, {
      status: resultStatus === "matched" || resultStatus === "matched_within_tolerance" ? "reconciled" : "reconciliation_exception",
      orchestration_status: resultStatus === "matched" || resultStatus === "matched_within_tolerance" ? "reconciled" : "failed",
    })

    const traceId = await this.createTrace({
      companyId: updated.seller_company_id,
      sourceEntity: "intercompany_transaction",
      sourceId: updated.id,
      eventType: "intercompany_reconciled",
      actorUserId: actor.userId,
      idempotencyKey: options.idempotencyKey || null,
      requestHash: options.requestHash || null,
      metadata: {
        result_status: resultStatus,
        amount_variance: amountVariance,
        mismatch_reason: mismatchReason,
      },
      auditFlags: resultStatus === "matched_within_tolerance" ? ["INTERCOMPANY_TOLERANCE_USED"] : [],
    })

    await this.linkTrace(traceId, "intercompany_transaction", updated.id, "reconciliation", "intercompany_transaction")
    await this.linkTrace(traceId, "intercompany_reconciliation_result", result.id, "reconciliation_result", "billing")
    await this.emitIntercompanyEvent("intercompany.reconciled", updated.seller_company_id, updated.id, actor.userId, options.idempotencyKey || undefined, {
      traceId,
      resultStatus,
      reconciliationResultId: result.id,
    })

    return { transaction: updated, reconciliation: result, traceId }
  }

  async createConsolidationRun(input: CreateConsolidationRunInput, actor: IntercompanyActor, options: OperationOptions = {}) {
    this.assertConsolidationEnabled()
    await this.assertManagementAccess(input.hostCompanyId, actor.userId)

    const existingRun = await this.findExistingConsolidationRun(input, actor.userId)
    if (existingRun) {
      return { run: existingRun, alreadyExists: true }
    }

    const runNumber = buildNumber("CRUN")
    const group = await this.getConsolidationGroup(input.consolidationGroupId)
    const payload = {
      run_number: runNumber,
      host_company_id: input.hostCompanyId,
      consolidation_group_id: input.consolidationGroupId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      run_type: input.runType,
      as_of_timestamp: input.asOfTimestamp,
      translation_policy_snapshot: {
        presentation_currency: group.presentation_currency,
        pnl: "average_rate",
        balance_sheet: "closing_rate",
        equity: "historical_rate",
      },
      ownership_policy_snapshot: {},
      scope_snapshot: {},
      status: "draft",
      created_by: actor.userId,
    }

    const { data, error } = await this.adminSupabase
      .from("consolidation_runs")
      .insert(payload)
      .select("*")
      .single()

    if (error) throw new Error(`Failed to create consolidation run: ${error.message}`)

    const traceId = await this.createTrace({
      companyId: input.hostCompanyId,
      sourceEntity: "consolidation_run",
      sourceId: data.id,
      eventType: "consolidation_run_created",
      actorUserId: actor.userId,
      idempotencyKey: options.idempotencyKey || null,
      requestHash: options.requestHash || null,
      metadata: {
        consolidation_group_id: input.consolidationGroupId,
        run_type: input.runType,
      },
    })

    await this.linkTrace(traceId, "consolidation_run", data.id, "source", "consolidation_run")
    await this.emitIntercompanyEvent("consolidation.run_created", input.hostCompanyId, data.id, actor.userId, options.idempotencyKey || undefined, {
      traceId,
      consolidationGroupId: input.consolidationGroupId,
      runType: input.runType,
    })
    return { run: data, traceId }
  }

  async triggerElimination(runId: string, actor: IntercompanyActor, options: OperationOptions = {}) {
    this.assertConsolidationEnabled()
    const { data: run, error: runError } = await this.adminSupabase
      .from("consolidation_runs")
      .select("*")
      .eq("id", runId)
      .single()

    if (runError || !run) throw new Error("Consolidation run not found")
    await this.assertManagementAccess(run.host_company_id, actor.userId)
    if (run.run_type !== "dry_run") {
      throw new Error("Elimination is locked to dry_run mode during Phase 2A.3 activation")
    }

    if (String(run.status || "").toLowerCase() === "completed") {
      const existingEntries = await this.getEliminationEntriesForRun(runId)
      return { run, eliminationEntries: existingEntries, alreadyEliminated: true }
    }

    const { data: groupMembers, error: groupMembersError } = await this.adminSupabase
      .from("consolidation_group_members")
      .select("legal_entity_id, scope_status")
      .eq("consolidation_group_id", run.consolidation_group_id)
      .lte("effective_from", run.period_end)
      .or(`effective_to.is.null,effective_to.gte.${run.period_start}`)

    if (groupMembersError) throw new Error(`Failed to load consolidation group members: ${groupMembersError.message}`)

    const includedEntityIds = new Set(
      (groupMembers || [])
        .filter((row: any) => ["included", "equity_method"].includes(String(row.scope_status || "")))
        .map((row: any) => row.legal_entity_id)
    )

    const { data: matchedRows, error: matchedError } = await this.adminSupabase
      .from("intercompany_reconciliation_results")
      .select(`
        *,
        intercompany_transactions!inner(id, seller_legal_entity_id, buyer_legal_entity_id, seller_company_id, buyer_company_id, transaction_amount, status)
      `)
      .in("result_status", ["matched", "matched_within_tolerance"])

    if (matchedError) throw new Error(`Failed to load reconciliation results: ${matchedError.message}`)

    const entriesCreated: any[] = []

    for (const row of matchedRows || []) {
      const transaction = (row as any).intercompany_transactions
      if (!includedEntityIds.has(transaction.seller_legal_entity_id) || !includedEntityIds.has(transaction.buyer_legal_entity_id)) {
        continue
      }
      const amount = Number(row.seller_open_amount || transaction.transaction_amount || 0)
      const batchKey = buildNumber("ELIM")

      const { data: entry, error: entryError } = await this.adminSupabase
        .from("elimination_entries")
        .insert({
          consolidation_run_id: runId,
          elimination_type: "intercompany_ar_ap",
          reference_type: "intercompany_transaction",
          reference_id: transaction.id,
          batch_key: batchKey,
          status: "posted",
          justification: "Auto-generated Phase 2A.2 intercompany AR/AP elimination",
          created_by: actor.userId,
          approved_by: actor.userId,
        })
        .select("*")
        .single()

      if (entryError) throw new Error(`Failed to create elimination entry: ${entryError.message}`)

      const { error: linesError } = await this.adminSupabase
        .from("elimination_entry_lines")
        .insert([
          {
            elimination_entry_id: entry.id,
            account_code: "IC_AR_ELIM",
            legal_entity_id: transaction.seller_legal_entity_id,
            counterparty_legal_entity_id: transaction.buyer_legal_entity_id,
            debit_amount: 0,
            credit_amount: amount,
            currency_code: run.translation_policy_snapshot?.presentation_currency || "EGP",
            line_metadata: { phase: "2A.2", source: "intercompany_reconciliation" },
          },
          {
            elimination_entry_id: entry.id,
            account_code: "IC_AP_ELIM",
            legal_entity_id: transaction.buyer_legal_entity_id,
            counterparty_legal_entity_id: transaction.seller_legal_entity_id,
            debit_amount: amount,
            credit_amount: 0,
            currency_code: run.translation_policy_snapshot?.presentation_currency || "EGP",
            line_metadata: { phase: "2A.2", source: "intercompany_reconciliation" },
          },
        ])

      if (linesError) throw new Error(`Failed to create elimination entry lines: ${linesError.message}`)

      entriesCreated.push(entry)
      await this.updateTransaction(transaction.id, {
        status: "eliminated",
        orchestration_status: "eliminated",
      })
    }

    const { data: updatedRun, error: updateRunError } = await this.adminSupabase
      .from("consolidation_runs")
      .update({ status: "completed" })
      .eq("id", runId)
      .select("*")
      .single()

    if (updateRunError) throw new Error(`Failed to update consolidation run: ${updateRunError.message}`)

    const traceId = await this.createTrace({
      companyId: run.host_company_id,
      sourceEntity: "consolidation_run",
      sourceId: run.id,
      eventType: "intercompany_elimination_triggered",
      actorUserId: actor.userId,
      idempotencyKey: options.idempotencyKey || null,
      requestHash: options.requestHash || null,
      metadata: { elimination_entry_count: entriesCreated.length },
    })

    await this.linkTrace(traceId, "consolidation_run", run.id, "elimination_run", "consolidation_run")
    for (const entry of entriesCreated) {
      await this.linkTrace(traceId, "elimination_entry", entry.id, "elimination_entry", "intercompany_ar_ap")
    }

    await this.emitIntercompanyEvent("intercompany.elimination_triggered", run.host_company_id, run.id, actor.userId, options.idempotencyKey || undefined, {
      traceId,
      eliminationEntryCount: entriesCreated.length,
    })

    return { run: updatedRun, eliminationEntries: entriesCreated, traceId }
  }

  private async getManagedCompanyIds(actorUserId: string) {
    const [{ data, error }, { data: ownedCompanies, error: ownedError }] = await Promise.all([
      this.adminSupabase
        .from("company_members")
        .select("company_id, role")
        .eq("user_id", actorUserId),
      this.adminSupabase
        .from("companies")
        .select("id")
        .eq("user_id", actorUserId),
    ])

    if (error) throw new Error(`Failed to load company memberships: ${error.message}`)
    if (ownedError) throw new Error(`Failed to load owned companies: ${ownedError.message}`)

    const managedIds = new Set<string>(
      (data || [])
        .filter((row: any) => MANAGEMENT_ROLES.has(String(row.role || "").toLowerCase()))
        .map((row: any) => row.company_id)
    )

    for (const row of ownedCompanies || []) {
      managedIds.add(row.id)
    }

    return Array.from(managedIds)
  }

  private async assertManagementAccess(companyId: string, actorUserId: string) {
    const hasAccess = await this.hasManagementAccess(companyId, actorUserId)
    if (!hasAccess) {
      throw new Error("Actor does not have management access to this company")
    }
  }

  private async assertTransactionManagementAccess(transaction: any, actorUserId: string) {
    await this.assertDualCompanyManagementAccess(transaction.seller_company_id, transaction.buyer_company_id, actorUserId)
  }

  private async assertDualCompanyManagementAccess(sellerCompanyId: string, buyerCompanyId: string, actorUserId: string) {
    const [sellerOk, buyerOk] = await Promise.all([
      this.hasManagementAccess(sellerCompanyId, actorUserId),
      this.hasManagementAccess(buyerCompanyId, actorUserId),
    ])

    if (!sellerOk || !buyerOk) {
      throw new Error("Actor must have management access to both seller and buyer companies")
    }
  }

  private async hasManagementAccess(companyId: string, actorUserId: string) {
    const [{ data: membership, error: membershipError }, { data: company, error: companyError }] = await Promise.all([
      this.adminSupabase
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", actorUserId)
        .maybeSingle(),
      this.adminSupabase
        .from("companies")
        .select("id")
        .eq("id", companyId)
        .eq("user_id", actorUserId)
        .maybeSingle(),
    ])

    if (membershipError) throw new Error(`Failed to verify company membership access: ${membershipError.message}`)
    if (companyError) throw new Error(`Failed to verify company ownership access: ${companyError.message}`)

    return (!!membership && MANAGEMENT_ROLES.has(String(membership.role || "").toLowerCase())) || !!company
  }

  private async getActiveRelationship(sellerCompanyId: string, buyerCompanyId: string) {
    const today = normalizeDate(null)
    const { data, error } = await this.adminSupabase
      .from("intercompany_relationships")
      .select("*")
      .eq("seller_company_id", sellerCompanyId)
      .eq("buyer_company_id", buyerCompanyId)
      .in("relationship_status", ["draft", "active"])
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(`Failed to load intercompany relationship: ${error.message}`)
    if (!data) throw new Error("No active intercompany relationship found for seller/buyer companies")
    return data
  }

  private async getConsolidationGroup(consolidationGroupId: string) {
    const { data, error } = await this.adminSupabase
      .from("consolidation_groups")
      .select("*")
      .eq("id", consolidationGroupId)
      .single()

    if (error || !data) throw new Error("Consolidation group not found")
    return data
  }

  private async getTransaction(transactionId: string) {
    const { data, error } = await this.adminSupabase
      .from("intercompany_transactions")
      .select("*")
      .eq("id", transactionId)
      .single()

    if (error || !data) throw new Error("Intercompany transaction not found")
    return data
  }

  private async findExistingIntercompanyTransaction(sellerCompanyId: string, buyerCompanyId: string, idempotencyKey: string) {
    const { data } = await this.adminSupabase
      .from("intercompany_transactions")
      .select("*")
      .eq("seller_company_id", sellerCompanyId)
      .eq("buyer_company_id", buyerCompanyId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()

    return data || null
  }

  private async findExistingConsolidationRun(input: CreateConsolidationRunInput, actorUserId: string) {
    const { data, error } = await this.adminSupabase
      .from("consolidation_runs")
      .select("*")
      .eq("host_company_id", input.hostCompanyId)
      .eq("consolidation_group_id", input.consolidationGroupId)
      .eq("period_start", input.periodStart)
      .eq("period_end", input.periodEnd)
      .eq("run_type", input.runType)
      .eq("as_of_timestamp", input.asOfTimestamp)
      .eq("created_by", actorUserId)
      .maybeSingle()

    if (error) throw new Error(`Failed to inspect existing consolidation run: ${error.message}`)
    return data || null
  }

  private async getLatestReconciliationResult(transactionId: string) {
    const { data, error } = await this.adminSupabase
      .from("intercompany_reconciliation_results")
      .select("*")
      .eq("intercompany_transaction_id", transactionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(`Failed to load latest reconciliation result: ${error.message}`)
    return data || null
  }

  private async getEliminationEntriesForRun(runId: string) {
    const { data, error } = await this.adminSupabase
      .from("elimination_entries")
      .select("*")
      .eq("consolidation_run_id", runId)
      .order("created_at", { ascending: false })

    if (error) throw new Error(`Failed to load elimination entries: ${error.message}`)
    return data || []
  }

  private async updateTransaction(transactionId: string, patch: Record<string, unknown>) {
    const { data, error } = await this.adminSupabase
      .from("intercompany_transactions")
      .update({ ...patch, updated_at: nowIso() })
      .eq("id", transactionId)
      .select("*")
      .single()

    if (error || !data) throw new Error(`Failed to update intercompany transaction: ${error?.message || "unknown_error"}`)
    return data
  }

  private async ensureDevMirroredDocuments(transaction: any) {
    const { data: existing, error: existingError } = await this.adminSupabase
      .from("intercompany_documents")
      .select("*")
      .eq("intercompany_transaction_id", transaction.id)

    if (existingError) throw new Error(`Failed to inspect existing intercompany documents: ${existingError.message}`)
    if ((existing || []).length > 0) return existing || []

    const shortId = String(transaction.id).slice(0, 8).toUpperCase()
    const docs = [
      {
        intercompany_transaction_id: transaction.id,
        company_id: transaction.seller_company_id,
        side: "seller",
        document_stage: "sales_order",
        document_id: randomUUID(),
        document_number: `DEV-SO-${shortId}`,
        revision_no: 1,
        document_amount: transaction.transaction_amount,
        transaction_currency: transaction.transaction_currency,
        locked_exchange_rate: transaction.seller_exchange_rate ?? 1,
        locked_rate_timestamp: transaction.seller_rate_timestamp || transaction.created_at || nowIso(),
        rate_source: transaction.seller_rate_source || "dev_default",
        reference_role: "seller_source_order",
        metadata: { dev_mode: true },
      },
      {
        intercompany_transaction_id: transaction.id,
        company_id: transaction.seller_company_id,
        side: "seller",
        document_stage: "invoice",
        document_id: randomUUID(),
        document_number: `DEV-INV-${shortId}`,
        revision_no: 1,
        document_amount: transaction.transaction_amount,
        transaction_currency: transaction.transaction_currency,
        locked_exchange_rate: transaction.seller_exchange_rate ?? 1,
        locked_rate_timestamp: transaction.seller_rate_timestamp || transaction.created_at || nowIso(),
        rate_source: transaction.seller_rate_source || "dev_default",
        reference_role: "seller_invoice",
        metadata: { dev_mode: true },
      },
      {
        intercompany_transaction_id: transaction.id,
        company_id: transaction.buyer_company_id,
        side: "buyer",
        document_stage: "purchase_order",
        document_id: randomUUID(),
        document_number: `DEV-PO-${shortId}`,
        revision_no: 1,
        document_amount: transaction.transaction_amount,
        transaction_currency: transaction.transaction_currency,
        locked_exchange_rate: transaction.buyer_exchange_rate ?? 1,
        locked_rate_timestamp: transaction.buyer_rate_timestamp || transaction.created_at || nowIso(),
        rate_source: transaction.buyer_rate_source || "dev_default",
        reference_role: "buyer_order",
        metadata: { dev_mode: true },
      },
      {
        intercompany_transaction_id: transaction.id,
        company_id: transaction.buyer_company_id,
        side: "buyer",
        document_stage: "bill",
        document_id: randomUUID(),
        document_number: `DEV-BILL-${shortId}`,
        revision_no: 1,
        document_amount: transaction.transaction_amount,
        transaction_currency: transaction.transaction_currency,
        locked_exchange_rate: transaction.buyer_exchange_rate ?? 1,
        locked_rate_timestamp: transaction.buyer_rate_timestamp || transaction.created_at || nowIso(),
        rate_source: transaction.buyer_rate_source || "dev_default",
        reference_role: "buyer_bill",
        metadata: { dev_mode: true },
      },
    ]

    const { data, error } = await this.adminSupabase
      .from("intercompany_documents")
      .insert(docs)
      .select("*")

    if (error) throw new Error(`Failed to create dev mirrored documents: ${error.message}`)
    return data || []
  }

  private async assertCrossEntityPeriodsOpen(sellerCompanyId: string, buyerCompanyId: string, effectiveDate: string) {
    await this.assertCompanyPeriodOpen(sellerCompanyId, effectiveDate)
    await this.assertCompanyPeriodOpen(buyerCompanyId, effectiveDate)
  }

  private async assertCompanyPeriodOpen(companyId: string, effectiveDate: string) {
    const { data, error } = await this.adminSupabase
      .from("accounting_periods")
      .select("id, period_name, status, is_locked")
      .eq("company_id", companyId)
      .lte("period_start", effectiveDate)
      .gte("period_end", effectiveDate)
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(`Failed to validate accounting period: ${error.message}`)
    if (!data) throw new Error(`No accounting period covers ${effectiveDate} for company ${companyId}`)
    if (data.is_locked || ["closed", "locked", "audit_lock"].includes(String(data.status || "").toLowerCase())) {
      throw new Error(`Accounting period ${data.period_name || data.id} is locked for company ${companyId}`)
    }
  }

  private async createTrace(options: TraceOptions) {
    const payload = {
      company_id: options.companyId,
      source_entity: options.sourceEntity,
      source_id: options.sourceId,
      event_type: options.eventType,
      idempotency_key: options.idempotencyKey || null,
      actor_id: options.actorUserId,
      request_hash: options.requestHash || null,
      audit_flags: options.auditFlags || [],
      metadata: options.metadata || {},
      created_at: nowIso(),
    }

    const { data, error } = await this.adminSupabase
      .from("financial_operation_traces")
      .insert(payload)
      .select("transaction_id")
      .single()

    if (error?.code === "23505" && options.idempotencyKey) {
      const { data: existing } = await this.adminSupabase
        .from("financial_operation_traces")
        .select("transaction_id")
        .eq("company_id", options.companyId)
        .eq("event_type", options.eventType)
        .eq("idempotency_key", options.idempotencyKey)
        .maybeSingle()

      if (existing?.transaction_id) return existing.transaction_id
    }

    if (error || !data?.transaction_id) {
      throw new Error(`Failed to create financial trace: ${error?.message || "unknown_error"}`)
    }

    return data.transaction_id as string
  }

  private async linkTrace(traceId: string, entityType: string, entityId: string, linkRole?: string, referenceType?: string) {
    await this.adminSupabase
      .from("financial_operation_trace_links")
      .upsert({
        transaction_id: traceId,
        entity_type: entityType,
        entity_id: entityId,
        link_role: linkRole || null,
        reference_type: referenceType || null,
      }, { onConflict: "transaction_id,entity_type,entity_id" })
  }

  private async emitIntercompanyEvent(
    eventName: "intercompany.created" | "intercompany.submitted" | "intercompany.approved" | "intercompany.reconciled" | "intercompany.elimination_triggered" | "consolidation.run_created",
    companyId: string,
    entityId: string,
    actorUserId: string,
    idempotencyKey?: string,
    payload?: Record<string, unknown>
  ) {
    if (!enterpriseFinanceFlags.intercompanyEvents) return

    await emitEvent(this.eventSupabase as any, {
      companyId,
      eventName,
      entityType: eventName === "intercompany.elimination_triggered" || eventName === "consolidation.run_created"
        ? "consolidation_run"
        : "intercompany_transaction",
      entityId,
      actorId: actorUserId,
      idempotencyKey,
      payload: payload || {},
    })
  }

  private assertIntercompanyEnabled() {
    if (!enterpriseFinanceFlags.intercompanyEnabled) {
      throw new Error("Intercompany disabled")
    }
  }

  private assertConsolidationEnabled() {
    if (!enterpriseFinanceFlags.intercompanyConsolidationEnabled) {
      throw new Error("Intercompany consolidation disabled")
    }
  }
}
