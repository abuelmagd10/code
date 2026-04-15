import { randomUUID } from "crypto"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"

const MANUAL_JOURNAL_CREATE_EVENT = "manual_journal_posting"
const MANUAL_JOURNAL_UPDATE_EVENT = "manual_journal_draft_update"

type SupabaseLike = any
type TraceRecord = { transaction_id: string; request_hash: string | null }

export type ManualJournalActor = {
  actorId: string
  actorRole: string
  actorBranchId?: string | null
  actorCostCenterId?: string | null
}

export type ManualJournalLine = {
  account_id: string
  debit_amount: number
  credit_amount: number
  description?: string | null
  original_debit?: number | null
  original_credit?: number | null
  original_currency?: string | null
  exchange_rate_used?: number | null
  exchange_rate_id?: string | null
  branch_id?: string | null
  cost_center_id?: string | null
}

export type ManualJournalCommand = {
  companyId: string
  entryId?: string | null
  entryDate: string
  description: string
  justification: string
  supportingReference?: string | null
  branchId?: string | null
  costCenterId?: string | null
  lines: ManualJournalLine[]
  uiSurface?: string | null
}

export type ManualJournalResult = {
  success: boolean
  cached: boolean
  journalEntryId: string | null
  journalLineIds: string[]
  transactionId: string | null
  eventType: typeof MANUAL_JOURNAL_CREATE_EVENT | typeof MANUAL_JOURNAL_UPDATE_EVENT
}

const MANUAL_JOURNAL_ROLES = new Set(["owner", "admin", "manager", "general_manager", "accountant"])
const normalizeRole = (role: string | null | undefined) => String(role || "").trim().toLowerCase()
const duplicateTrace = (message?: string | null) =>
  !!message && (message.includes("duplicate key value violates unique constraint") || message.includes("idx_financial_operation_traces_idempotency"))

export class ManualJournalCommandService {
  constructor(private readonly adminSupabase: SupabaseLike) {}

  async createManualJournal(
    actor: ManualJournalActor,
    command: ManualJournalCommand,
    options: { idempotencyKey: string; requestHash: string }
  ): Promise<ManualJournalResult> {
    this.assertActorCanPost(actor)
    const prepared = await this.prepareCommand(command)
    const existingTrace = await this.findTraceByIdempotency(command.companyId, MANUAL_JOURNAL_CREATE_EVENT, options.idempotencyKey)
    if (existingTrace) return this.cachedResult(existingTrace, MANUAL_JOURNAL_CREATE_EVENT, options.requestHash)

    await requireOpenFinancialPeriod(command.companyId, prepared.entryDate)

    const operationId = randomUUID()
    let traceId: string | null = null
    let journalEntryId: string | null = null
    let journalLineIds: string[] = []

    try {
      traceId = await this.createTrace({
        companyId: command.companyId,
        sourceEntity: "manual_journal",
        sourceId: operationId,
        eventType: MANUAL_JOURNAL_CREATE_EVENT,
        actorId: actor.actorId,
        idempotencyKey: options.idempotencyKey,
        requestHash: options.requestHash,
        metadata: this.buildTraceMetadata(command, prepared, {
          origin: "manual",
          command: "create",
        }),
      })

      const { data: entry, error: entryError } = await this.adminSupabase
        .from("journal_entries")
        .insert({
          company_id: command.companyId,
          entry_date: prepared.entryDate,
          description: prepared.description,
          reference_type: "manual_entry",
          reference_id: null,
          branch_id: prepared.branchId,
          cost_center_id: prepared.costCenterId,
          status: "posted",
          created_by: actor.actorId,
        })
        .select("id")
        .single()
      if (entryError || !entry?.id) throw new Error(entryError?.message || "Failed to create manual journal entry")
      journalEntryId = String(entry.id)

      journalLineIds = await this.insertLines(journalEntryId, prepared.lines)
      await this.linkTrace(traceId, "journal_entry", journalEntryId, "manual_journal_entry", "manual_journal")
      for (const lineId of journalLineIds) {
        await this.linkTrace(traceId, "journal_entry_line", lineId, "manual_journal_line", "manual_journal")
      }

      return {
        success: true,
        cached: false,
        journalEntryId,
        journalLineIds,
        transactionId: traceId,
        eventType: MANUAL_JOURNAL_CREATE_EVENT,
      }
    } catch (error) {
      if (journalEntryId) {
        await this.adminSupabase.from("journal_entry_lines").delete().eq("journal_entry_id", journalEntryId)
        await this.adminSupabase.from("journal_entries").delete().eq("id", journalEntryId)
      }
      if (traceId) {
        await this.adminSupabase.from("financial_operation_trace_links").delete().eq("transaction_id", traceId)
        await this.adminSupabase.from("financial_operation_traces").delete().eq("transaction_id", traceId)
      }
      throw error
    }
  }

  async updateDraftManualJournal(
    actor: ManualJournalActor,
    command: ManualJournalCommand,
    options: { idempotencyKey: string; requestHash: string }
  ): Promise<ManualJournalResult> {
    this.assertActorCanPost(actor)
    if (!command.entryId) throw new Error("Journal entry is required for update")

    const prepared = await this.prepareCommand(command)
    const existingTrace = await this.findTraceByIdempotency(command.companyId, MANUAL_JOURNAL_UPDATE_EVENT, options.idempotencyKey)
    if (existingTrace) return this.cachedResult(existingTrace, MANUAL_JOURNAL_UPDATE_EVENT, options.requestHash)

    const entry = await this.loadManualEntry(command.companyId, command.entryId)
    if (!entry) throw new Error("Manual journal entry was not found")
    if (entry.status === "posted") throw new Error("Posted manual journals cannot be edited. Create a reversal and repost instead.")

    await requireOpenFinancialPeriod(command.companyId, String(entry.entry_date || prepared.entryDate).slice(0, 10))
    await requireOpenFinancialPeriod(command.companyId, prepared.entryDate)

    let traceId: string | null = null
    let journalLineIds: string[] = []

    try {
      traceId = await this.createTrace({
        companyId: command.companyId,
        sourceEntity: "manual_journal",
        sourceId: command.entryId,
        eventType: MANUAL_JOURNAL_UPDATE_EVENT,
        actorId: actor.actorId,
        idempotencyKey: options.idempotencyKey,
        requestHash: options.requestHash,
        metadata: this.buildTraceMetadata(command, prepared, {
          origin: "manual",
          command: "update_draft",
          previous_entry_date: entry.entry_date || null,
          previous_description: entry.description || null,
        }),
      })

      const { error: entryError } = await this.adminSupabase
        .from("journal_entries")
        .update({
          entry_date: prepared.entryDate,
          description: prepared.description,
          branch_id: prepared.branchId,
          cost_center_id: prepared.costCenterId,
        })
        .eq("id", command.entryId)
        .eq("company_id", command.companyId)
      if (entryError) throw new Error(entryError.message || "Failed to update manual journal entry")

      const { error: deleteError } = await this.adminSupabase
        .from("journal_entry_lines")
        .delete()
        .eq("journal_entry_id", command.entryId)
      if (deleteError) throw new Error(deleteError.message || "Failed to replace manual journal lines")

      journalLineIds = await this.insertLines(command.entryId, prepared.lines)
      await this.linkTrace(traceId, "journal_entry", command.entryId, "manual_journal_draft_update", "manual_journal")
      for (const lineId of journalLineIds) {
        await this.linkTrace(traceId, "journal_entry_line", lineId, "manual_journal_line", "manual_journal")
      }

      return {
        success: true,
        cached: false,
        journalEntryId: command.entryId,
        journalLineIds,
        transactionId: traceId,
        eventType: MANUAL_JOURNAL_UPDATE_EVENT,
      }
    } catch (error) {
      if (traceId) {
        await this.adminSupabase.from("financial_operation_trace_links").delete().eq("transaction_id", traceId)
        await this.adminSupabase.from("financial_operation_traces").delete().eq("transaction_id", traceId)
      }
      throw error
    }
  }

  private async prepareCommand(command: ManualJournalCommand) {
    if (!command.companyId) throw new Error("Company is required")
    if (!command.entryDate) throw new Error("Entry date is required")
    if (!command.description?.trim()) throw new Error("Manual journal description is required")
    if (!command.justification?.trim()) throw new Error("Manual journal justification is required")
    if (!Array.isArray(command.lines) || command.lines.length < 2) throw new Error("Manual journal must have at least two lines")

    const branchId = command.branchId || null
    const costCenterId = command.costCenterId || null
    await this.validateGovernance(command.companyId, branchId, costCenterId, command.lines)

    const lines = command.lines.map((line) => ({
      ...line,
      account_id: String(line.account_id || "").trim(),
      debit_amount: Number(line.debit_amount || 0),
      credit_amount: Number(line.credit_amount || 0),
      original_debit: Number(line.original_debit ?? line.debit_amount ?? 0),
      original_credit: Number(line.original_credit ?? line.credit_amount ?? 0),
      exchange_rate_used: Number(line.exchange_rate_used || 1),
      branch_id: line.branch_id || branchId,
      cost_center_id: line.cost_center_id || costCenterId,
    }))

    for (const line of lines) {
      if (!line.account_id) throw new Error("Every manual journal line must have an account")
      if (line.debit_amount < 0 || line.credit_amount < 0) throw new Error("Manual journal amounts cannot be negative")
      if (line.debit_amount > 0 && line.credit_amount > 0) throw new Error("A manual journal line cannot have both debit and credit")
      if (line.debit_amount === 0 && line.credit_amount === 0) throw new Error("Every manual journal line must have a debit or credit amount")
    }

    const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit_amount || 0), 0)
    const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) throw new Error("Manual journal must be balanced")

    await this.validateAccounts(command.companyId, lines.map((line) => line.account_id))

    return {
      entryDate: command.entryDate,
      description: command.description.trim(),
      branchId,
      costCenterId,
      lines,
      totalDebit,
      totalCredit,
    }
  }

  private assertActorCanPost(actor: ManualJournalActor) {
    if (!MANUAL_JOURNAL_ROLES.has(normalizeRole(actor.actorRole))) {
      throw new Error("You do not have permission to post manual journals")
    }
  }

  private async validateAccounts(companyId: string, accountIds: string[]) {
    const uniqueIds = Array.from(new Set(accountIds.filter(Boolean)))
    const { data, error } = await this.adminSupabase
      .from("chart_of_accounts")
      .select("id, parent_id, is_active")
      .eq("company_id", companyId)
    if (error) throw new Error(error.message || "Failed to validate manual journal accounts")

    const accounts = data || []
    const parentIds = new Set(accounts.map((account: any) => account.parent_id).filter(Boolean).map(String))
    const byId = new Map(accounts.map((account: any) => [String(account.id), account]))
    for (const accountId of uniqueIds) {
      const account: any = byId.get(accountId)
      if (!account) throw new Error("Manual journal contains an account outside the active company")
      if (account.is_active === false) throw new Error("Manual journal contains an inactive account")
      if (parentIds.has(accountId)) throw new Error("Manual journal can only post to leaf accounts")
    }
  }

  private async validateGovernance(companyId: string, branchId: string | null, costCenterId: string | null, lines: ManualJournalLine[]) {
    if (!branchId) throw new Error("Branch is required for manual journal posting")

    const { data: branch, error: branchError } = await this.adminSupabase
      .from("branches")
      .select("id, company_id, is_active")
      .eq("id", branchId)
      .eq("company_id", companyId)
      .maybeSingle()
    if (branchError || !branch) throw new Error("Manual journal branch is invalid")
    if (branch.is_active === false) throw new Error("Manual journal branch is inactive")

    const costCenterIds = Array.from(new Set([costCenterId, ...lines.map((line) => line.cost_center_id || null)].filter(Boolean).map(String)))
    if (costCenterIds.length === 0) return

    const { data: costCenters, error: costCenterError } = await this.adminSupabase
      .from("cost_centers")
      .select("id, company_id, branch_id, is_active")
      .eq("company_id", companyId)
      .in("id", costCenterIds)
    if (costCenterError) throw new Error(costCenterError.message || "Failed to validate manual journal cost centers")
    if ((costCenters || []).length !== costCenterIds.length) throw new Error("Manual journal contains an invalid cost center")

    for (const costCenter of costCenters || []) {
      if (costCenter.is_active === false) throw new Error("Manual journal contains an inactive cost center")
      if (costCenter.branch_id && costCenter.branch_id !== branchId) throw new Error("Manual journal cost center must belong to the selected branch")
    }
  }

  private async insertLines(journalEntryId: string, lines: ManualJournalLine[]): Promise<string[]> {
    const rows = lines.map((line) => ({
      journal_entry_id: journalEntryId,
      account_id: line.account_id,
      debit_amount: line.debit_amount,
      credit_amount: line.credit_amount,
      description: line.description || null,
      original_debit: line.original_debit ?? line.debit_amount,
      original_credit: line.original_credit ?? line.credit_amount,
      original_currency: line.original_currency || null,
      exchange_rate_used: line.exchange_rate_used || 1,
      exchange_rate_id: line.exchange_rate_id || null,
      branch_id: line.branch_id || null,
      cost_center_id: line.cost_center_id || null,
    }))

    const { data, error } = await this.adminSupabase
      .from("journal_entry_lines")
      .insert(rows)
      .select("id")
    if (error) throw new Error(error.message || "Failed to create manual journal lines")
    return (data || []).map((row: any) => String(row.id)).filter(Boolean)
  }

  private async loadManualEntry(companyId: string, entryId: string) {
    const { data, error } = await this.adminSupabase
      .from("journal_entries")
      .select("id, company_id, entry_date, description, reference_type, reference_id, status")
      .eq("id", entryId)
      .eq("company_id", companyId)
      .maybeSingle()
    if (error || !data) return null
    const referenceType = String(data.reference_type || "")
    if (referenceType !== "manual_entry" && referenceType !== "manual_journal") {
      throw new Error("Only manual journal entries can be edited through this command")
    }
    return data
  }

  private buildTraceMetadata(
    command: ManualJournalCommand,
    prepared: Awaited<ReturnType<ManualJournalCommandService["prepareCommand"]>>,
    extra: Record<string, unknown>
  ) {
    return {
      ...extra,
      origin: "manual",
      justification: command.justification,
      supporting_reference: command.supportingReference || null,
      entry_id: command.entryId || null,
      entry_date: prepared.entryDate,
      branch_id: prepared.branchId,
      cost_center_id: prepared.costCenterId,
      line_count: prepared.lines.length,
      total_debit: prepared.totalDebit,
      total_credit: prepared.totalCredit,
      ui_surface: command.uiSurface || "manual_journal",
    }
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
        const existing = await this.findTraceByIdempotency(params.companyId, params.eventType, params.idempotencyKey)
        if (existing?.transaction_id) return existing.transaction_id
      }
      throw new Error(error.message || "Failed to create manual journal trace")
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

  private async findTraceByIdempotency(companyId: string, eventType: string, idempotencyKey: string): Promise<TraceRecord | null> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_traces")
      .select("transaction_id, request_hash")
      .eq("company_id", companyId)
      .eq("event_type", eventType)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()
    if (error || !data) return null
    return data as TraceRecord
  }

  private async cachedResult(
    trace: TraceRecord,
    eventType: typeof MANUAL_JOURNAL_CREATE_EVENT | typeof MANUAL_JOURNAL_UPDATE_EVENT,
    requestHash: string
  ): Promise<ManualJournalResult> {
    if (trace.request_hash && trace.request_hash !== requestHash) {
      throw new Error("Idempotency key already used with a different manual journal payload")
    }
    return {
      success: true,
      cached: true,
      journalEntryId: await this.findLinkedEntityId(trace.transaction_id, "journal_entry"),
      journalLineIds: await this.findLinkedEntityIds(trace.transaction_id, "journal_entry_line"),
      transactionId: trace.transaction_id,
      eventType,
    }
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

export { MANUAL_JOURNAL_CREATE_EVENT, MANUAL_JOURNAL_UPDATE_EVENT }
