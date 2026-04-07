import { createHash } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { emitEvent } from "@/lib/event-bus"
import { enterpriseFinanceFlags } from "@/lib/enterprise-finance-flags"

type AdminClient = SupabaseClient<any, "public", any>
const MANAGEMENT_ROLES = new Set(["owner", "admin", "general_manager", "manager"])
const DEFAULT_BATCH_SIZE = 500
const MAX_DRY_RUN_ENTITIES = Math.max(1, Number(process.env.ERP_PHASE2B_DRY_RUN_MAX_ENTITIES || 25))
const MAX_DRY_RUN_LINES = Math.max(10, Number(process.env.ERP_PHASE2B_DRY_RUN_MAX_LINES || 5000))

export type ConsolidationExecutionMode = "dry_run" | "commit_run"
export type ConsolidationRunType = "dry_run" | "period_close" | "rerun" | "audit_replay"
export type ConsolidationStatementType = "trial_balance" | "income_statement" | "balance_sheet" | "cash_flow" | "equity_statement"
export type ConsolidationStepName = "extract" | "translate" | "eliminate" | "post" | "statements" | "validate" | "finalize"
export type ConsolidationScopeMode = "full_group" | "entity_subset" | "manual_selection"

export interface ConsolidationActor { userId: string; email?: string | null }
export interface ConsolidationEntityScope {
  scopeMode: ConsolidationScopeMode
  legalEntityIds?: string[]
  excludeLegalEntityIds?: string[]
  includeEquityMethodEntities?: boolean
}
export interface ConsolidationRateSetLock {
  rateSetCode: string
  rateSource: string
  asOfTimestamp: string
  closingRateDate: string
  averageRateWindowStart: string
  averageRateWindowEnd: string
}
export interface ConsolidationIdempotencyContext { idempotencyKey?: string | null; requestHash?: string | null; replayFromRunId?: string | null }
export interface CreateConsolidationRunInput {
  hostCompanyId: string
  consolidationGroupId: string
  periodStart: string
  periodEnd: string
  runType: ConsolidationRunType
  executionMode: ConsolidationExecutionMode
  asOfTimestamp: string
  runVersion?: number
  parentRunId?: string | null
  scope: ConsolidationEntityScope
  rateSetLock: ConsolidationRateSetLock
  statementMappingVersion: string
  eliminationRuleSetCode: string
}
export interface ExecuteConsolidationRunInput {
  runId: string
  executionMode: ConsolidationExecutionMode
  steps?: ConsolidationStepName[]
  statementTypes?: ConsolidationStatementType[]
}

const nowIso = () => new Date().toISOString()
const hash = (payload: unknown) => createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex")
const uniq = <T,>(items: T[]) => Array.from(new Set(items))
const buildNumber = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
const normalizeScope = (scope: ConsolidationEntityScope) => ({
  scopeMode: scope.scopeMode,
  legalEntityIds: [...(scope.legalEntityIds || [])].sort(),
  excludeLegalEntityIds: [...(scope.excludeLegalEntityIds || [])].sort(),
  includeEquityMethodEntities: !!scope.includeEquityMethodEntities,
})
const inferTranslationMethod = (statementCategory: string): "average_rate" | "closing_rate" | "historical_rate" => {
  const value = String(statementCategory || "").trim().toLowerCase()
  if (["revenue", "expense", "income", "pnl"].includes(value)) return "average_rate"
  if (value === "equity") return "historical_rate"
  return "closing_rate"
}

export class ConsolidationService {
  constructor(private readonly adminSupabase: AdminClient, private readonly eventSupabase: AdminClient = adminSupabase) {}

  async listRunsForActor(actorUserId: string) {
    this.assertEngine()
    const companyIds = await this.getManagedCompanyIds(actorUserId)
    if (companyIds.length === 0) return []
    const { data, error } = await this.adminSupabase.from("consolidation_runs").select("*").in("host_company_id", companyIds).order("created_at", { ascending: false })
    if (error) throw new Error(`Failed to list consolidation runs: ${error.message}`)
    return data || []
  }

  async createRun(input: CreateConsolidationRunInput, actor: ConsolidationActor, ctx: ConsolidationIdempotencyContext = {}) {
    this.assertEngine()
    await this.assertManagementAccess(input.hostCompanyId, actor.userId)
    if (input.executionMode === "commit_run") this.assertPosting()
    if (input.runType === "dry_run" && input.executionMode === "commit_run") throw new Error("dry_run type cannot be created as commit_run")
    if (ctx.idempotencyKey) {
      const { data: existing } = await this.adminSupabase.from("consolidation_runs").select("*").eq("consolidation_group_id", input.consolidationGroupId).eq("idempotency_key", ctx.idempotencyKey).maybeSingle()
      if (existing) return { run: existing, traceId: null, alreadyExists: true }
    }

    const group = await this.getGroup(input.consolidationGroupId)
    const scopeDefinition = normalizeScope(input.scope)
    const payload = {
      run_number: buildNumber("CRUN"),
      host_company_id: input.hostCompanyId,
      consolidation_group_id: input.consolidationGroupId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      run_type: input.runType,
      as_of_timestamp: input.asOfTimestamp,
      translation_policy_snapshot: { presentation_currency: group.presentation_currency, rate_set_code: input.rateSetLock.rateSetCode, rate_source: input.rateSetLock.rateSource },
      ownership_policy_snapshot: {},
      scope_snapshot: scopeDefinition,
      status: "draft",
      created_by: actor.userId,
      run_version: input.runVersion || 1,
      parent_run_id: input.parentRunId || null,
      run_family_key: hash({ group: input.consolidationGroupId, start: input.periodStart, end: input.periodEnd, scopeDefinition, mapping: input.statementMappingVersion, rules: input.eliminationRuleSetCode }),
      execution_mode: input.executionMode,
      scope_mode: input.scope.scopeMode,
      scope_definition: scopeDefinition,
      scope_hash: hash(scopeDefinition),
      fx_snapshot_hash: hash(input.rateSetLock),
      input_hash: hash({ input, scopeDefinition }),
      statement_mapping_version: input.statementMappingVersion,
      elimination_rule_set_code: input.eliminationRuleSetCode,
      idempotency_key: ctx.idempotencyKey || null,
      request_hash: ctx.requestHash || hash(input),
      replay_of_run_id: ctx.replayFromRunId || null,
    }
    const { data: run, error } = await this.adminSupabase.from("consolidation_runs").insert(payload).select("*").single()
    if (error) throw new Error(`Failed to create consolidation run: ${error.message}`)

    await this.snapshot(run.id, "entity_scope", "scope", scopeDefinition, actor.userId)
    await this.snapshot(run.id, "translation_rates", "rate_set_lock", input.rateSetLock as unknown as Record<string, unknown>, actor.userId)
    await this.snapshot(run.id, "statement_mapping", "statement_mapping_version", { version: input.statementMappingVersion }, actor.userId)
    await this.snapshot(run.id, "elimination_seed", "rule_set_code", { code: input.eliminationRuleSetCode }, actor.userId)

    const traceId = await this.trace(input.hostCompanyId, run.id, "consolidation_run_created", actor.userId, ctx.idempotencyKey || null, payload.request_hash, { execution_mode: input.executionMode })
    await this.linkTrace(traceId, "consolidation_run", run.id, "source", "consolidation_run")
    await this.emit("consolidation.run_created", input.hostCompanyId, run.id, actor.userId, ctx.idempotencyKey || undefined, { traceId })
    return { run, traceId, alreadyExists: false }
  }

  async extractTrialBalance(runId: string) {
    const run = await this.getRun(runId)
    const entities = await this.resolveEntities(run)
    if (entities.length > MAX_DRY_RUN_ENTITIES) {
      await this.check(run.id, "extract_trial_balance", "run", "failed", {
        entity_count: entities.length,
        entity_limit: MAX_DRY_RUN_ENTITIES,
      })
      throw new Error(`Entity scope exceeds dry-run limit (${entities.length}/${MAX_DRY_RUN_ENTITIES})`)
    }
    const rows = entities.map((entity: any, index: number) => ({
      consolidation_run_id: run.id,
      run_version: run.run_version || 1,
      legal_entity_id: entity.legal_entity_id,
      company_id: entity.company_id,
      account_code: "SKELETON-TB",
      account_name: "Skeleton Trial Balance Marker",
      account_type: "equity",
      statement_category: "equity",
      functional_currency: entity.functional_currency || "EGP",
      balance_functional: 0,
      source_reference_count: 0,
      source_lineage: { skeleton_mode: true, batch_size: DEFAULT_BATCH_SIZE, entity_index: index + 1 },
      extract_hash: hash({ runId, entity }),
      batch_key: "TB-BATCH-1",
    }))
    if (rows.length) {
      const { error } = await this.adminSupabase.from("consolidation_trial_balance_lines").upsert(rows, { onConflict: "consolidation_run_id,legal_entity_id,company_id,account_code" })
      if (error) throw new Error(`Failed to persist consolidation trial balance lines: ${error.message}`)
    }
    await this.snapshot(run.id, "trial_balance_extract", "extract_summary", { row_count: rows.length, batch_size: DEFAULT_BATCH_SIZE }, null)
    await this.check(run.id, "extract_trial_balance", "run", rows.length ? "passed" : "warning", { row_count: rows.length })
    return { run, rows }
  }

  async applyTranslation(runId: string) {
    const run = await this.getRun(runId)
    const rateSet = await this.getRateSet(run.id)
    if (!rateSet.rateSetCode || !rateSet.rateSource || !rateSet.asOfTimestamp) {
      await this.check(run.id, "apply_translation", "fx_rate_lock", "failed", {
        rateSetCode: rateSet.rateSetCode || null,
        rateSource: rateSet.rateSource || null,
        asOfTimestamp: rateSet.asOfTimestamp || null,
      })
      throw new Error("Consolidation rate set lock is incomplete")
    }
    const { data: lines, error } = await this.adminSupabase.from("consolidation_trial_balance_lines").select("*").eq("consolidation_run_id", run.id)
    if (error) throw new Error(`Failed to load consolidation trial balance lines: ${error.message}`)
    if ((lines || []).length > MAX_DRY_RUN_LINES) {
      await this.check(run.id, "apply_translation", "run", "failed", {
        line_count: (lines || []).length,
        line_limit: MAX_DRY_RUN_LINES,
      })
      throw new Error(`Trial balance line count exceeds dry-run limit (${(lines || []).length}/${MAX_DRY_RUN_LINES})`)
    }
    const rows = (lines || []).map((line: any) => ({
      consolidation_run_id: run.id,
      run_version: run.run_version || 1,
      legal_entity_id: line.legal_entity_id,
      company_id: line.company_id,
      account_code: line.account_code,
      statement_category: line.statement_category,
      translation_method: inferTranslationMethod(line.statement_category),
      source_currency: line.functional_currency,
      presentation_currency: run.translation_policy_snapshot?.presentation_currency || "EGP",
      exchange_rate: 1,
      rate_source: rateSet.rateSource,
      rate_timestamp: rateSet.asOfTimestamp,
      rate_set_code: rateSet.rateSetCode,
      rate_snapshot_hash: run.fx_snapshot_hash || hash(rateSet),
      balance_source: Number(line.balance_functional || 0),
      balance_translated: Number(line.balance_functional || 0),
      translation_difference: 0,
      batch_key: "TR-BATCH-1",
    }))
    const invalidRateLine = rows.find((line) => !line.rate_source || !line.rate_timestamp || Number(line.exchange_rate || 0) <= 0)
    if (invalidRateLine) {
      await this.check(run.id, "apply_translation", "fx_rate_lock", "failed", {
        invalid_account_code: invalidRateLine.account_code,
        invalid_line: invalidRateLine,
      })
      throw new Error(`FX rate validation failed for account ${invalidRateLine.account_code}`)
    }
    if (rows.length) {
      const { error: insertError } = await this.adminSupabase.from("consolidation_translation_lines").upsert(rows, { onConflict: "consolidation_run_id,legal_entity_id,company_id,account_code" })
      if (insertError) throw new Error(`Failed to persist consolidation translation lines: ${insertError.message}`)
    }
    await this.check(run.id, "apply_translation", "run", "passed", { row_count: rows.length, batch_size: DEFAULT_BATCH_SIZE, rate_set_code: rateSet.rateSetCode })
    return { run, rows }
  }

  async generateEliminations(runId: string) {
    const run = await this.getRun(runId)
    const rule = await this.ensureDefaultRule(run.elimination_rule_set_code || "DEFAULT_ELIM_RULES")
    const { data: rows, error } = await this.adminSupabase
      .from("intercompany_reconciliation_results")
      .select("id, result_status, intercompany_transactions!inner(id, seller_legal_entity_id, buyer_legal_entity_id, transaction_amount)")
      .in("result_status", ["matched", "matched_within_tolerance"])
    if (error) throw new Error(`Failed to load intercompany reconciliations: ${error.message}`)
    const entityIds = new Set((await this.resolveEntities(run)).map((item: any) => item.legal_entity_id))
    const candidates = (rows || [])
      .filter((row: any) => entityIds.has(row.intercompany_transactions.seller_legal_entity_id) && entityIds.has(row.intercompany_transactions.buyer_legal_entity_id))
      .map((row: any) => ({
        consolidation_run_id: run.id,
        rule_id: rule.id,
        reference_type: "intercompany_transaction",
        reference_id: row.intercompany_transactions.id,
        source_intercompany_transaction_id: row.intercompany_transactions.id,
        source_reconciliation_result_id: row.id,
        seller_legal_entity_id: row.intercompany_transactions.seller_legal_entity_id,
        buyer_legal_entity_id: row.intercompany_transactions.buyer_legal_entity_id,
        candidate_currency: run.translation_policy_snapshot?.presentation_currency || "EGP",
        candidate_amount: Number(row.intercompany_transactions.transaction_amount || 0),
        candidate_payload: { skeleton_mode: true, result_status: row.result_status },
        status: "draft",
        candidate_hash: hash({ runId, ruleId: rule.id, refId: row.intercompany_transactions.id }),
      }))
    if (candidates.length) {
      const { error: insertError } = await this.adminSupabase.from("consolidation_elimination_candidates").upsert(candidates, { onConflict: "consolidation_run_id,candidate_hash" })
      if (insertError) throw new Error(`Failed to persist elimination candidates: ${insertError.message}`)
    }
    await this.check(run.id, "generate_eliminations", "run", "passed", { candidate_count: candidates.length })
    return { run, candidates }
  }

  async postConsolidationEntries(runId: string, executionMode: ConsolidationExecutionMode) {
    const run = await this.getRun(runId)
    if (executionMode !== "commit_run") {
      await this.check(run.id, "post_consolidation_entries", "run", "passed", { skipped: true, reason: "dry_run" })
      return { run, entries: [], skipped: true }
    }
    this.assertPosting()
    const book = await this.ensureDefaultBook(run.consolidation_group_id, run.translation_policy_snapshot?.presentation_currency || "EGP")
    const { data: candidates, error } = await this.adminSupabase.from("consolidation_elimination_candidates").select("*").eq("consolidation_run_id", run.id).in("status", ["draft", "approved"])
    if (error) throw new Error(`Failed to load elimination candidates: ${error.message}`)
    const entries: any[] = []
    for (const candidate of candidates || []) {
      const postingHash = hash({ runId: run.id, candidateId: candidate.id })
      const { data: existing } = await this.adminSupabase.from("consolidation_book_entries").select("*").eq("consolidation_run_id", run.id).eq("posting_hash", postingHash).maybeSingle()
      const entry = existing || (await this.insertBookEntry(run, book.id, candidate, postingHash))
      entries.push(entry)
    }
    await this.check(run.id, "post_consolidation_entries", "run", "passed", { entry_count: entries.length })
    return { run, entries, skipped: false }
  }

  async generateStatements(runId: string, statementTypes: ConsolidationStatementType[] = ["trial_balance"]) {
    this.assertStatements()
    const run = await this.getRun(runId)
    const { data: translationLines, error } = await this.adminSupabase.from("consolidation_translation_lines").select("*").eq("consolidation_run_id", run.id)
    if (error) throw new Error(`Failed to load translation lines: ${error.message}`)
    const outputs: any[] = []
    const requestedStatementTypes = uniq<ConsolidationStatementType>(
      statementTypes.length ? statementTypes : ["trial_balance"]
    )
    for (const statementType of requestedStatementTypes) {
      const template = await this.ensureDefaultTemplate(statementType)
      const generationHash = hash({ runId: run.id, statementType, runVersion: run.run_version || 1, rowCount: (translationLines || []).length })
      const { data: existing } = await this.adminSupabase.from("consolidated_statement_runs").select("*").eq("consolidation_run_id", run.id).eq("statement_type", statementType).eq("generation_hash", generationHash).maybeSingle()
      const statementRun = existing || (await this.insertStatementRun(run.id, run.run_version || 1, template.id, statementType, generationHash))
      if (!existing) await this.insertStatementLines(statementRun.id, statementType, translationLines || [], run.translation_policy_snapshot?.presentation_currency || "EGP")
      outputs.push(statementRun)
    }
    await this.runStatementSanityChecks(run.id, translationLines || [])
    await this.check(run.id, "generate_statements", "run", "passed", { statement_run_count: outputs.length })
    return { run, statementRuns: outputs }
  }

  async executeRun(input: ExecuteConsolidationRunInput, actor: ConsolidationActor) {
    this.assertEngine()
    const run = await this.getRun(input.runId)
    await this.assertManagementAccess(run.host_company_id, actor.userId)
    if (run.status === "completed") return { run, executedSteps: [], statementRuns: await this.loadStatementRuns(run.id), traceId: null, alreadyCompleted: true }

    const mode = input.executionMode || run.execution_mode || "dry_run"
    if (mode === "commit_run") this.assertPosting()
    if (mode === "commit_run") await this.assertDryRunBaseline(run)
    await this.updateRun(run.id, { status: "extracting", execution_mode: mode })

    const steps: ConsolidationStepName[] = input.steps?.length
      ? input.steps
      : ["extract", "translate", "eliminate", "post", "statements", "validate", "finalize"]
    const executedSteps: ConsolidationStepName[] = []
    for (const step of steps) {
      const stepStartedAt = Date.now()
      if (step === "extract") await this.extractTrialBalance(run.id)
      if (step === "translate") await this.applyTranslation(run.id)
      if (step === "eliminate") await this.generateEliminations(run.id)
      if (step === "post") await this.postConsolidationEntries(run.id, mode)
      if (step === "statements") await this.generateStatements(run.id, input.statementTypes || ["trial_balance"])
      if (step === "validate") await this.check(run.id, "validate_run", "run", "passed", { skeleton_mode: true })
      if (step === "finalize") await this.updateRun(run.id, { status: "completed", last_completed_step: "finalize" })
      else await this.updateRun(run.id, { last_completed_step: step, status: step === "translate" ? "translating" : step === "extract" ? "extracting" : "approved" })
      await this.stepTrace(run.host_company_id, run.id, step, actor.userId, {
        duration_ms: Date.now() - stepStartedAt,
        execution_mode: mode,
      })
      executedSteps.push(step)
    }

    const finalRun = await this.getRun(run.id)
    const traceId = await this.trace(finalRun.host_company_id, finalRun.id, "consolidation_run_executed", actor.userId, null, null, { executed_steps: executedSteps, execution_mode: mode })
    await this.linkTrace(traceId, "consolidation_run", finalRun.id, "execution", "consolidation_run")
    await this.emit("consolidation.executed", finalRun.host_company_id, finalRun.id, actor.userId, undefined, { traceId, executedSteps })
    if (finalRun.status === "completed") await this.emit("consolidation.completed", finalRun.host_company_id, finalRun.id, actor.userId, undefined, { traceId })
    return { run: finalRun, executedSteps, statementRuns: await this.loadStatementRuns(finalRun.id), traceId, alreadyCompleted: false }
  }

  async fetchStatements(runId: string, statementType?: ConsolidationStatementType) {
    this.assertStatements()
    const run = await this.getRun(runId)
    let query = this.adminSupabase.from("consolidated_statement_runs").select("*, consolidated_statement_lines(*)").eq("consolidation_run_id", run.id).order("generated_at", { ascending: false })
    if (statementType) query = query.eq("statement_type", statementType)
    const { data, error } = await query
    if (error) throw new Error(`Failed to load consolidated statements: ${error.message}`)
    return { run, statements: data || [] }
  }

  private async insertBookEntry(run: any, bookId: string, candidate: any, postingHash: string) {
    const { data: entry, error } = await this.adminSupabase.from("consolidation_book_entries").insert({
      consolidation_run_id: run.id, consolidation_book_id: bookId, entry_number: buildNumber("CBE"), entry_date: run.period_end, entry_type: "elimination",
      reference_type: candidate.reference_type, reference_id: candidate.reference_id, candidate_id: candidate.id, source_intercompany_transaction_id: candidate.source_intercompany_transaction_id,
      source_reconciliation_result_id: candidate.source_reconciliation_result_id, description: "Phase 2B.2 skeleton elimination posting", status: "posted", posting_hash: postingHash, posted_at: nowIso(),
    }).select("*").single()
    if (error) throw new Error(`Failed to create consolidation book entry: ${error.message}`)
    const { error: lineError } = await this.adminSupabase.from("consolidation_book_entry_lines").insert([
      { consolidation_book_entry_id: entry.id, legal_entity_id: candidate.seller_legal_entity_id, counterparty_legal_entity_id: candidate.buyer_legal_entity_id, account_code: "IC_ELIM_DR", account_name: "Intercompany Elimination Debit", debit_amount: Number(candidate.candidate_amount || 0), credit_amount: 0, currency_code: candidate.candidate_currency, line_type: "elimination", line_metadata: { skeleton_mode: true } },
      { consolidation_book_entry_id: entry.id, legal_entity_id: candidate.buyer_legal_entity_id, counterparty_legal_entity_id: candidate.seller_legal_entity_id, account_code: "IC_ELIM_CR", account_name: "Intercompany Elimination Credit", debit_amount: 0, credit_amount: Number(candidate.candidate_amount || 0), currency_code: candidate.candidate_currency, line_type: "elimination", line_metadata: { skeleton_mode: true } },
    ])
    if (lineError) throw new Error(`Failed to create consolidation book entry lines: ${lineError.message}`)
    return entry
  }

  private async insertStatementRun(runId: string, runVersion: number, templateId: string, statementType: ConsolidationStatementType, generationHash: string) {
    const { data, error } = await this.adminSupabase.from("consolidated_statement_runs").insert({
      consolidation_run_id: runId, run_version: runVersion, statement_type: statementType, template_id: templateId, status: "generated", generation_hash: generationHash, generated_at: nowIso(),
    }).select("*").single()
    if (error) throw new Error(`Failed to create consolidated statement run: ${error.message}`)
    return data
  }

  private async insertStatementLines(statementRunId: string, statementType: ConsolidationStatementType, translationLines: any[], presentationCurrency: string) {
    const lines = statementType === "trial_balance"
      ? translationLines.map((line: any, index: number) => ({ consolidated_statement_run_id: statementRunId, section_code: "trial_balance", line_code: line.account_code, line_label: line.account_code, legal_entity_id: line.legal_entity_id, account_code: line.account_code, amount: Number(line.balance_translated || 0), presentation_currency: presentationCurrency, display_order: index + 1, line_metadata: { skeleton_mode: true } }))
      : [{ consolidated_statement_run_id: statementRunId, section_code: statementType, line_code: `${statementType}_total`, line_label: `${statementType} total`, legal_entity_id: null, account_code: null, amount: translationLines.reduce((sum: number, line: any) => sum + Number(line.balance_translated || 0), 0), presentation_currency: presentationCurrency, display_order: 1, line_metadata: { skeleton_mode: true } }]
    if (!lines.length) return
    const { error } = await this.adminSupabase.from("consolidated_statement_lines").insert(lines)
    if (error) throw new Error(`Failed to create consolidated statement lines: ${error.message}`)
  }

  private async ensureDefaultRule(ruleSetCode: string) {
    let { data: ruleSet } = await this.adminSupabase.from("elimination_rule_sets").select("*").eq("rule_set_code", ruleSetCode).maybeSingle()
    if (!ruleSet) ({ data: ruleSet } = await this.adminSupabase.from("elimination_rule_sets").insert({ rule_set_code: ruleSetCode, rule_set_name: "Default Elimination Rule Set", reporting_standard: "IFRS", status: "active" }).select("*").single())
    let { data: rule } = await this.adminSupabase.from("elimination_rules").select("*").eq("rule_set_id", ruleSet.id).eq("rule_code", "DEFAULT_AR_AP").maybeSingle()
    if (!rule) ({ data: rule } = await this.adminSupabase.from("elimination_rules").insert({ rule_set_id: ruleSet.id, rule_code: "DEFAULT_AR_AP", rule_type: "ar_ap", match_strategy: "matched_reconciliation_only", rule_config: { skeleton_mode: true }, status: "active" }).select("*").single())
    return rule
  }

  private async ensureDefaultBook(groupId: string, currency: string) {
    let { data: book } = await this.adminSupabase.from("consolidation_books").select("*").eq("consolidation_group_id", groupId).eq("book_code", `BOOK-${groupId}`).maybeSingle()
    if (!book) ({ data: book } = await this.adminSupabase.from("consolidation_books").insert({ consolidation_group_id: groupId, book_code: `BOOK-${groupId}`, book_name: "Default Consolidation Book", presentation_currency: currency, reporting_standard: "IFRS", status: "active" }).select("*").single())
    return book
  }

  private async ensureDefaultTemplate(statementType: ConsolidationStatementType) {
    const code = `GROUP_${statementType.toUpperCase()}_V1`
    let { data: template } = await this.adminSupabase.from("consolidation_statement_templates").select("*").eq("template_code", code).maybeSingle()
    if (!template) ({ data: template } = await this.adminSupabase.from("consolidation_statement_templates").insert({ template_code: code, statement_type: statementType, reporting_standard: "IFRS", version_no: 1, status: "active", template_payload: { skeleton_mode: true } }).select("*").single())
    return template
  }

  private async resolveEntities(run: any) {
    const { data, error } = await this.adminSupabase.from("consolidation_group_members").select("legal_entity_id, scope_status, legal_entities(functional_currency), company_legal_entity_map!inner(company_id)").eq("consolidation_group_id", run.consolidation_group_id)
    if (error) throw new Error(`Failed to resolve consolidation entities: ${error.message}`)
    const scope = normalizeScope((run.scope_definition || { scopeMode: run.scope_mode || "full_group" }) as ConsolidationEntityScope)
    const include = new Set(scope.legalEntityIds || [])
    const exclude = new Set(scope.excludeLegalEntityIds || [])
    return (data || []).filter((row: any) => scope.includeEquityMethodEntities ? ["included", "equity_method"].includes(String(row.scope_status || "")) : row.scope_status === "included")
      .filter((row: any) => scope.scopeMode === "full_group" || include.size === 0 || include.has(row.legal_entity_id))
      .filter((row: any) => !exclude.has(row.legal_entity_id))
      .map((row: any) => ({ legal_entity_id: row.legal_entity_id, company_id: row.company_legal_entity_map?.company_id, functional_currency: row.legal_entities?.functional_currency || "EGP" }))
      .filter((row: any) => !!row.company_id)
  }

  private async snapshot(runId: string, snapshotType: string, snapshotKey: string, payload: Record<string, unknown>, createdBy?: string | null) {
    await this.adminSupabase.from("consolidation_run_snapshots").upsert({ consolidation_run_id: runId, snapshot_type: snapshotType, snapshot_key: snapshotKey, snapshot_hash: hash(payload), snapshot_payload: payload, created_by: createdBy || null }, { onConflict: "consolidation_run_id,snapshot_type,snapshot_key" })
  }

  private async check(runId: string, checkName: string, checkScope: string, status: "passed" | "warning" | "failed", details: Record<string, unknown>) {
    await this.adminSupabase.from("consolidation_run_checks").insert({ consolidation_run_id: runId, check_name: checkName, check_scope: checkScope, status, details })
  }

  private async runStatementSanityChecks(runId: string, translationLines: any[]) {
    const totals = translationLines.reduce((acc: any, line: any) => {
      const key = String(line.statement_category || "unknown").trim().toLowerCase()
      acc[key] = Number(((acc[key] || 0) + Number(line.balance_translated || 0)).toFixed(4))
      return acc
    }, {})

    const assets = Number(totals.asset || totals.assets || 0)
    const liabilities = Number(totals.liability || totals.liabilities || 0)
    const equity = Number(totals.equity || 0)
    const revenue = Number(totals.revenue || totals.income || 0)
    const expenses = Number(totals.expense || totals.expenses || 0)
    const balanceSheetDiff = Number((assets - (liabilities + equity)).toFixed(4))
    const pnlNet = Number((revenue - expenses).toFixed(4))

    await this.check(runId, "statement_balance_sheet_balance", "statement", Math.abs(balanceSheetDiff) <= 0.01 ? "passed" : "failed", {
      assets,
      liabilities,
      equity,
      difference: balanceSheetDiff,
    })

    await this.check(runId, "statement_pnl_sanity", "statement", Number.isFinite(pnlNet) ? "passed" : "failed", {
      revenue,
      expenses,
      net_income: pnlNet,
    })
  }

  private async getRateSet(runId: string) {
    const { data, error } = await this.adminSupabase.from("consolidation_run_snapshots").select("snapshot_payload").eq("consolidation_run_id", runId).eq("snapshot_type", "translation_rates").eq("snapshot_key", "rate_set_lock").maybeSingle()
    if (error || !data?.snapshot_payload) throw new Error("Consolidation rate set lock snapshot is missing")
    return data.snapshot_payload as ConsolidationRateSetLock
  }

  private async getRun(runId: string) {
    const { data, error } = await this.adminSupabase.from("consolidation_runs").select("*").eq("id", runId).single()
    if (error || !data) throw new Error("Consolidation run not found")
    return data
  }

  private async getGroup(groupId: string) {
    const { data, error } = await this.adminSupabase.from("consolidation_groups").select("*").eq("id", groupId).single()
    if (error || !data) throw new Error("Consolidation group not found")
    return data
  }

  private async loadStatementRuns(runId: string) {
    const { data } = await this.adminSupabase.from("consolidated_statement_runs").select("*").eq("consolidation_run_id", runId).order("generated_at", { ascending: false })
    return data || []
  }

  private async updateRun(runId: string, patch: Record<string, unknown>) {
    const { data, error } = await this.adminSupabase.from("consolidation_runs").update({ ...patch, updated_at: nowIso() }).eq("id", runId).select("*").single()
    if (error || !data) throw new Error(`Failed to update consolidation run: ${error?.message || "unknown_error"}`)
    return data
  }

  private async getManagedCompanyIds(actorUserId: string) {
    const [{ data, error }, { data: ownedCompanies, error: ownedError }] = await Promise.all([
      this.adminSupabase.from("company_members").select("company_id, role").eq("user_id", actorUserId),
      this.adminSupabase.from("companies").select("id").eq("user_id", actorUserId),
    ])
    if (error) throw new Error(`Failed to load company memberships: ${error.message}`)
    if (ownedError) throw new Error(`Failed to load owned companies: ${ownedError.message}`)

    const companyIds = new Set<string>(
      (data || [])
        .filter((row: any) => MANAGEMENT_ROLES.has(String(row.role || "").toLowerCase()))
        .map((row: any) => row.company_id)
    )

    for (const row of ownedCompanies || []) {
      companyIds.add(row.id)
    }

    return Array.from(companyIds)
  }

  private async assertManagementAccess(companyId: string, actorUserId: string) {
    const [membership, ownership] = await Promise.all([
      this.adminSupabase.from("company_members").select("role").eq("company_id", companyId).eq("user_id", actorUserId).maybeSingle(),
      this.adminSupabase.from("companies").select("id").eq("id", companyId).eq("user_id", actorUserId).maybeSingle(),
    ])
    if (membership.error) throw new Error(`Failed to validate company membership: ${membership.error.message}`)
    if (ownership.error) throw new Error(`Failed to validate company ownership: ${ownership.error.message}`)

    const hasManagementRole = !!membership.data && MANAGEMENT_ROLES.has(String(membership.data.role || "").toLowerCase())
    const isOwner = !!ownership.data
    if (!hasManagementRole && !isOwner) throw new Error("Actor does not have management access to this company")
  }

  private async assertDryRunBaseline(run: any) {
    const { data } = await this.adminSupabase.from("consolidation_runs").select("id").eq("run_family_key", run.run_family_key).eq("execution_mode", "dry_run").eq("status", "completed").neq("id", run.id).limit(1)
    if (!data || data.length === 0) throw new Error("Dry-run baseline must complete before commit_run")
  }

  private async trace(companyId: string, sourceId: string, eventType: string, actorUserId: string, idempotencyKey?: string | null, requestHash?: string | null, metadata?: Record<string, unknown>) {
    const { data, error } = await this.adminSupabase.from("financial_operation_traces").insert({ company_id: companyId, source_entity: "consolidation_run", source_id: sourceId, event_type: eventType, actor_id: actorUserId, idempotency_key: idempotencyKey || null, request_hash: requestHash || null, metadata: metadata || {}, created_at: nowIso() }).select("transaction_id").single()
    if (error || !data?.transaction_id) throw new Error(`Failed to create financial trace: ${error?.message || "unknown_error"}`)
    return data.transaction_id as string
  }

  private async stepTrace(companyId: string, runId: string, step: ConsolidationStepName, actorUserId: string, metadata?: Record<string, unknown>) {
    const traceId = await this.trace(companyId, runId, "consolidation_step_completed", actorUserId, null, null, {
      step,
      ...(metadata || {}),
    })
    await this.linkTrace(traceId, "consolidation_run", runId, `step:${step}`, "consolidation_step")
    return traceId
  }

  private async linkTrace(traceId: string, entityType: string, entityId: string, linkRole?: string, referenceType?: string) {
    await this.adminSupabase.from("financial_operation_trace_links").upsert({ transaction_id: traceId, entity_type: entityType, entity_id: entityId, link_role: linkRole || null, reference_type: referenceType || null }, { onConflict: "transaction_id,entity_type,entity_id" })
  }

  private async emit(eventName: "consolidation.run_created" | "consolidation.executed" | "consolidation.completed", companyId: string, entityId: string, actorUserId: string, idempotencyKey?: string, payload?: Record<string, unknown>) {
    if (!enterpriseFinanceFlags.consolidationEvents) return
    await emitEvent(this.eventSupabase as any, { companyId, eventName, entityType: "consolidation_run", entityId, actorId: actorUserId, idempotencyKey, payload: payload || {} })
  }

  private assertEngine() { if (!enterpriseFinanceFlags.consolidationEngineEnabled) throw new Error("Consolidation engine disabled") }
  private assertPosting() { if (!enterpriseFinanceFlags.consolidationPostingEnabled) throw new Error("Consolidation posting disabled") }
  private assertStatements() { this.assertEngine(); if (!enterpriseFinanceFlags.groupStatementsEnabled) throw new Error("Group statements disabled") }
}
