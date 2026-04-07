const {
  stableHash,
  numeric,
  createServiceClient,
  hasLiveEnv,
  resolveCompanyContext,
  resolveConsolidationGroup,
  resolveGroupEntities,
  inferStatementCategory,
  createTrace,
  linkTrace,
  exitWithReport,
  parseJsonEnv,
  firstDayOfCurrentMonth,
  lastDayOfCurrentMonth,
} = require("./_shared")

const MAX_ENTITIES = Math.max(1, Number(process.env.ERP_PHASE2B_DRY_RUN_MAX_ENTITIES || 25))
const MAX_LINES = Math.max(10, Number(process.env.ERP_PHASE2B_DRY_RUN_MAX_LINES || 5000))

function nowIso() {
  return new Date().toISOString()
}

function buildNumber(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function memorySnapshot() {
  const usage = process.memoryUsage()
  return {
    rssMb: Number((usage.rss / 1024 / 1024).toFixed(2)),
    heapUsedMb: Number((usage.heapUsed / 1024 / 1024).toFixed(2)),
    heapTotalMb: Number((usage.heapTotal / 1024 / 1024).toFixed(2)),
  }
}

function chunk(items, size) {
  const rows = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

function isDebitNatureAccountType(accountType) {
  return ["asset", "assets", "expense", "expenses", "cost"].includes(String(accountType || "").trim().toLowerCase())
}

function naturalBalanceFromMovements(accountType, openingBalance, debitAmount, creditAmount) {
  const movement = isDebitNatureAccountType(accountType)
    ? numeric(debitAmount) - numeric(creditAmount)
    : numeric(creditAmount) - numeric(debitAmount)
  return Number((numeric(openingBalance) + movement).toFixed(4))
}

function signedBalanceFromNatural(accountType, naturalBalance) {
  const signed = isDebitNatureAccountType(accountType) ? numeric(naturalBalance) : -numeric(naturalBalance)
  return Number(signed.toFixed(4))
}

function naturalStatementAmount(line) {
  const category = String(line?.statement_category || "").trim().toLowerCase()
  const signed = numeric(line?.balance_translated)
  if (["liability", "equity", "revenue", "income"].includes(category)) {
    return Number((-signed).toFixed(4))
  }
  return Number(signed.toFixed(4))
}

function translationLineKey(parts) {
  return [
    String(parts.legal_entity_id || ""),
    String(parts.company_id || ""),
    String(parts.account_code || ""),
  ].join("::")
}

function buildEliminationAdjustmentLine(baseLine, signedAmount, metadata) {
  return {
    consolidation_run_id: baseLine.consolidation_run_id,
    run_version: baseLine.run_version,
    legal_entity_id: baseLine.legal_entity_id,
    company_id: baseLine.company_id,
    account_id: baseLine.account_id,
    account_code: baseLine.account_code,
    account_name: baseLine.account_name,
    account_type: baseLine.account_type,
    statement_category: baseLine.statement_category,
    translation_method: baseLine.translation_method,
    source_currency: baseLine.source_currency,
    presentation_currency: baseLine.presentation_currency,
    exchange_rate: baseLine.exchange_rate,
    rate_source: baseLine.rate_source,
    rate_timestamp: baseLine.rate_timestamp,
    rate_set_code: baseLine.rate_set_code,
    rate_snapshot_hash: baseLine.rate_snapshot_hash,
    balance_source: baseLine.source_currency === baseLine.presentation_currency ? Number(signedAmount.toFixed(4)) : 0,
    balance_translated: Number(signedAmount.toFixed(4)),
    translation_difference: 0,
    batch_key: `${baseLine.batch_key || "TR"}-ELIM`,
    elimination_metadata: metadata,
  }
}

function buildSyntheticTranslationAdjustmentLine({
  runId,
  runVersion,
  legalEntityId = null,
  companyId = null,
  accountCode,
  accountName,
  accountType,
  statementCategory,
  presentationCurrency,
  rateTimestamp,
  rateSetCode,
  rateSnapshotHash,
  signedAmount,
  metadata,
  batchKey = "TR-GROUP-ELIM",
}) {
  return {
    consolidation_run_id: runId,
    run_version: runVersion,
    legal_entity_id: legalEntityId,
    company_id: companyId,
    account_id: null,
    account_code: accountCode,
    account_name: accountName,
    account_type: accountType,
    statement_category: statementCategory,
    translation_method: inferTranslationMethod(statementCategory),
    source_currency: presentationCurrency,
    presentation_currency: presentationCurrency,
    exchange_rate: 1,
    rate_source: "synthetic_consolidation_adjustment",
    rate_timestamp: rateTimestamp,
    rate_set_code: rateSetCode,
    rate_snapshot_hash: rateSnapshotHash,
    balance_source: Number(signedAmount.toFixed(4)),
    balance_translated: Number(signedAmount.toFixed(4)),
    translation_difference: 0,
    batch_key: batchKey,
    elimination_metadata: metadata,
  }
}

function applyTranslationAdjustments(translationLines, eliminationAdjustments) {
  const buckets = new Map(
    translationLines.map((line) => [
      translationLineKey(line),
      {
        ...line,
        balance_source: numeric(line.balance_source),
        balance_translated: numeric(line.balance_translated),
        translation_difference: numeric(line.translation_difference),
      },
    ])
  )

  for (const adjustment of eliminationAdjustments) {
    const key = translationLineKey(adjustment)
    const existing = buckets.get(key)
    if (!existing) {
      buckets.set(key, {
        ...adjustment,
        balance_source: numeric(adjustment.balance_source),
        balance_translated: numeric(adjustment.balance_translated),
        translation_difference: numeric(adjustment.translation_difference),
        elimination_metadata: adjustment.elimination_metadata ? [adjustment.elimination_metadata] : [],
      })
      continue
    }
    existing.balance_source = Number((numeric(existing.balance_source) + numeric(adjustment.balance_source)).toFixed(4))
    existing.balance_translated = Number((numeric(existing.balance_translated) + numeric(adjustment.balance_translated)).toFixed(4))
    existing.translation_difference = Number((existing.balance_translated - existing.balance_source).toFixed(4))
    existing.elimination_metadata = existing.elimination_metadata || []
    existing.elimination_metadata.push(adjustment.elimination_metadata)
    buckets.set(key, existing)
  }

  return [...buckets.values()].filter((line) => Math.abs(numeric(line.balance_translated)) > 0.0001)
}

function firstDefinedNumeric(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue
    return numeric(value)
  }
  return 0
}

async function tableAccessible(supabase, table, selectColumns = "id") {
  const { error } = await supabase.from(table).select(selectColumns).limit(1)
  return { table, passed: !error, error: error ? error.message : null }
}

async function verifySchema(supabase) {
  const checks = await Promise.all([
    tableAccessible(supabase, "consolidation_runs", "id, run_version, input_hash"),
    tableAccessible(supabase, "consolidation_run_snapshots"),
    tableAccessible(supabase, "consolidation_run_checks"),
    tableAccessible(supabase, "consolidation_trial_balance_lines"),
    tableAccessible(supabase, "consolidation_translation_lines"),
    tableAccessible(supabase, "consolidation_elimination_candidates"),
    tableAccessible(supabase, "consolidated_statement_runs"),
    tableAccessible(supabase, "consolidated_statement_lines"),
  ])
  return { ok: checks.every((check) => check.passed), checks }
}

async function resolveActorUserId(supabase, companyId) {
  const { data, error } = await supabase
    .from("companies")
    .select("id, user_id")
    .eq("id", companyId)
    .maybeSingle()
  if (error) throw error
  if (!data?.user_id) throw new Error(`No owner user_id found for company ${companyId}`)
  return data.user_id
}

async function resolveHostCompanyForRun(supabase, groupId) {
  const explicitCompanyId = process.env.PHASE2B3_HOST_COMPANY_ID || process.env.PHASE1B_COMPANY_ID
  if (explicitCompanyId) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name")
      .eq("id", explicitCompanyId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error(`Configured host company was not found: ${explicitCompanyId}`)
    return {
      companyId: data.id,
      company: data,
      resolution: "env",
    }
  }

  const { data: members, error: membersError } = await supabase
    .from("consolidation_group_members")
    .select("legal_entity_id")
    .eq("consolidation_group_id", groupId)
  if (membersError) throw membersError

  const legalEntityIds = [...new Set((members || []).map((row) => row.legal_entity_id).filter(Boolean))]
  if (legalEntityIds.length === 0) {
    throw new Error("No legal entities are linked to the selected consolidation group")
  }

  const { data: companyMaps, error: companyMapError } = await supabase
    .from("company_legal_entity_map")
    .select("company_id, legal_entity_id, status")
    .in("legal_entity_id", legalEntityIds)
    .eq("status", "active")
  if (companyMapError) throw companyMapError

  const companyIds = [...new Set((companyMaps || []).map((row) => row.company_id).filter(Boolean))]
  if (companyIds.length !== 1) {
    throw new Error(`PHASE2B3_HOST_COMPANY_ID is required because the selected group maps to ${companyIds.length} companies.`)
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", companyIds[0])
    .maybeSingle()
  if (companyError) throw companyError
  if (!company) throw new Error(`Resolved host company was not found: ${companyIds[0]}`)

  return {
    companyId: company.id,
    company,
    resolution: "group-single-company",
  }
}

async function getOrCreateDryRun(supabase, input, actorUserId) {
  const scopeHash = stableHash(input.scopeDefinition)
  const inputHash = stableHash(input)
  const runFamilyKey = stableHash({
    groupId: input.groupId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    scopeHash,
    statementMappingVersion: input.statementMappingVersion,
    eliminationRuleSetCode: input.eliminationRuleSetCode,
  })
  const idempotencyKey = stableHash({
    mode: "phase2b3",
    hostCompanyId: input.hostCompanyId,
    groupId: input.groupId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    asOfTimestamp: input.asOfTimestamp,
    scopeHash,
    fx: input.rateSetLock,
  })

  const { data: existing, error: existingError } = await supabase
    .from("consolidation_runs")
    .select("*")
    .eq("consolidation_group_id", input.groupId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return { run: existing, alreadyExists: true, idempotencyKey, inputHash }

  const { data: latestFamilyRun, error: latestFamilyRunError } = await supabase
    .from("consolidation_runs")
    .select("id, run_version")
    .eq("run_family_key", runFamilyKey)
    .order("run_version", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestFamilyRunError) throw latestFamilyRunError

  const nextRunVersion = Number(latestFamilyRun?.run_version || 0) + 1
  const payload = {
    run_number: buildNumber("CRUN"),
    host_company_id: input.hostCompanyId,
    consolidation_group_id: input.groupId,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    run_type: "dry_run",
    as_of_timestamp: input.asOfTimestamp,
    translation_policy_snapshot: {
      presentation_currency: input.presentationCurrency,
      rate_set_code: input.rateSetLock.rateSetCode,
      rate_source: input.rateSetLock.rateSource,
    },
    ownership_policy_snapshot: {},
    scope_snapshot: input.scopeDefinition,
    status: "draft",
    created_by: actorUserId,
    run_version: nextRunVersion,
    run_family_key: runFamilyKey,
    execution_mode: "dry_run",
    scope_mode: input.scopeDefinition.scopeMode,
    scope_definition: input.scopeDefinition,
    scope_hash: scopeHash,
    fx_snapshot_hash: stableHash(input.rateSetLock),
    input_hash: inputHash,
    statement_mapping_version: input.statementMappingVersion,
    elimination_rule_set_code: input.eliminationRuleSetCode,
    idempotency_key: idempotencyKey,
    request_hash: inputHash,
  }

  const { data: run, error } = await supabase
    .from("consolidation_runs")
    .insert(payload)
    .select("*")
    .single()
  if (error) throw error

  const snapshots = [
    { snapshot_type: "entity_scope", snapshot_key: "scope", snapshot_payload: input.scopeDefinition },
    { snapshot_type: "translation_rates", snapshot_key: "rate_set_lock", snapshot_payload: input.rateSetLock },
    { snapshot_type: "statement_mapping", snapshot_key: "statement_mapping_version", snapshot_payload: { version: input.statementMappingVersion } },
    { snapshot_type: "elimination_seed", snapshot_key: "rule_set_code", snapshot_payload: { code: input.eliminationRuleSetCode } },
  ].map((row) => ({
    consolidation_run_id: run.id,
    snapshot_type: row.snapshot_type,
    snapshot_key: row.snapshot_key,
    snapshot_hash: stableHash(row.snapshot_payload),
    snapshot_payload: row.snapshot_payload,
    created_by: actorUserId,
  }))

  const { error: snapshotError } = await supabase
    .from("consolidation_run_snapshots")
    .upsert(snapshots, { onConflict: "consolidation_run_id,snapshot_type,snapshot_key" })
  if (snapshotError) throw snapshotError

  return { run, alreadyExists: false, idempotencyKey, inputHash }
}

async function insertRunEntities(supabase, runId, entities) {
  if (!entities.length) return
  const rows = entities.map((entity) => ({
    consolidation_run_id: runId,
    legal_entity_id: entity.legal_entity_id,
    consolidation_method: entity.consolidation_method || "full",
    ownership_percentage: numeric(entity.ownership_percentage || 1),
    nci_percentage: numeric(entity.nci_percentage || 0),
    scope_status: entity.scope_status || "included",
    functional_currency: entity.functional_currency || "EGP",
    included: true,
  }))
  const { error } = await supabase
    .from("consolidation_run_entities")
    .upsert(rows, { onConflict: "consolidation_run_id,legal_entity_id" })
  if (error) throw error
}

async function fetchTrialBalanceForEntity(supabase, entity, periodStart, periodEnd) {
  const { data: accounts, error: accountsError } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type, sub_type, opening_balance")
    .eq("company_id", entity.company_id)
    .eq("is_active", true)
  if (accountsError) throw accountsError
  const accountMap = new Map((accounts || []).map((row) => [row.id, row]))

  const { data: entries, error: entriesError } = await supabase
    .from("journal_entries")
    .select("id, entry_date")
    .eq("company_id", entity.company_id)
    .eq("status", "posted")
    .or("is_deleted.is.null,is_deleted.eq.false")
    .is("deleted_at", null)
    .lte("entry_date", periodEnd)
  if (entriesError) throw entriesError

  const entryIds = (entries || []).map((row) => row.id)
  const totals = new Map()
  for (const part of chunk(entryIds, 200)) {
    const { data: lines, error: linesError } = await supabase
      .from("journal_entry_lines")
      .select("journal_entry_id, account_id, debit_amount, credit_amount")
      .in("journal_entry_id", part)
    if (linesError) throw linesError

    for (const line of lines || []) {
      const account = accountMap.get(line.account_id)
      if (!account) continue
      const key = String(account.id)
      const bucket = totals.get(key) || {
        account_id: account.id,
        account_code: account.account_code,
        account_name: account.account_name,
        account_type: account.account_type || "unknown",
        statement_category: inferStatementCategory(account),
        opening_balance: numeric(account.opening_balance),
        total_debit: 0,
        total_credit: 0,
        source_reference_count: 0,
      }
      bucket.total_debit = Number((bucket.total_debit + numeric(line.debit_amount)).toFixed(4))
      bucket.total_credit = Number((bucket.total_credit + numeric(line.credit_amount)).toFixed(4))
      bucket.source_reference_count += 1
      totals.set(key, bucket)
    }
  }

  return {
    entryCount: entryIds.length,
    lines: (accounts || [])
      .map((account) => {
        const bucket = totals.get(String(account.id)) || {
          account_id: account.id,
          account_code: account.account_code,
          account_name: account.account_name,
          account_type: account.account_type || "unknown",
          statement_category: inferStatementCategory(account),
          opening_balance: numeric(account.opening_balance),
          total_debit: 0,
          total_credit: 0,
          source_reference_count: 0,
        }
        const naturalBalance = naturalBalanceFromMovements(
          account.account_type,
          bucket.opening_balance,
          bucket.total_debit,
          bucket.total_credit
        )
        const signedBalance = signedBalanceFromNatural(account.account_type, naturalBalance)
        return {
          account_id: bucket.account_id,
          account_code: bucket.account_code,
          account_name: bucket.account_name,
          account_type: bucket.account_type,
          statement_category: bucket.statement_category,
          source_reference_count: bucket.source_reference_count,
          opening_balance: bucket.opening_balance,
          total_debit: bucket.total_debit,
          total_credit: bucket.total_credit,
          natural_balance: naturalBalance,
          signed_balance: signedBalance,
        }
      })
      .filter((row) => Math.abs(numeric(row.signed_balance)) > 0.0001)
      .map((row) => ({
        consolidation_run_id: null,
        run_version: null,
        legal_entity_id: entity.legal_entity_id,
        company_id: entity.company_id,
        account_id: row.account_id,
        account_code: row.account_code,
        account_name: row.account_name,
        account_type: row.account_type,
        statement_category: row.statement_category,
        functional_currency: entity.functional_currency || "EGP",
        balance_functional: row.signed_balance,
        source_reference_count: row.source_reference_count,
        source_lineage: {
          source: "journal_entry_lines",
          company_id: entity.company_id,
          extraction_mode: "ending_balance_as_of",
          reporting_period_start: periodStart,
          as_of_date: periodEnd,
          opening_balance: row.opening_balance,
          total_debit: row.total_debit,
          total_credit: row.total_credit,
          natural_balance: row.natural_balance,
        },
        extract_hash: stableHash({ entity: entity.legal_entity_id, account: row.account_code, asOfDate: periodEnd }),
        batch_key: `TB-${entity.legal_entity_id}`,
      })),
  }
}

function resolveRateForCurrency(rateOverrides, sourceCurrency, presentationCurrency) {
  if (sourceCurrency === presentationCurrency) return { rate: 1, source: "identity" }
  const pairKey = `${sourceCurrency}->${presentationCurrency}`
  if (rateOverrides && Number(rateOverrides[pairKey] || 0) > 0) {
    return { rate: Number(rateOverrides[pairKey]), source: pairKey }
  }
  if (rateOverrides && Number(rateOverrides[sourceCurrency] || 0) > 0) {
    return { rate: Number(rateOverrides[sourceCurrency]), source: sourceCurrency }
  }
  return null
}

function inferTranslationMethod(statementCategory) {
  const value = String(statementCategory || "").trim().toLowerCase()
  if (["revenue", "expense", "income", "pnl"].includes(value)) return "average_rate"
  if (value === "equity") return "historical_rate"
  return "closing_rate"
}

async function ensureRuleSet(supabase, ruleSetCode) {
  let { data: ruleSet, error } = await supabase
    .from("elimination_rule_sets")
    .select("*")
    .eq("rule_set_code", ruleSetCode)
    .maybeSingle()
  if (error) throw error
  if (!ruleSet) {
    const inserted = await supabase
      .from("elimination_rule_sets")
      .insert({
        rule_set_code: ruleSetCode,
        rule_set_name: "Default Elimination Rule Set",
        reporting_standard: "IFRS",
        status: "active",
      })
      .select("*")
      .single()
    if (inserted.error) throw inserted.error
    ruleSet = inserted.data
  }

  let { data: rule, error: ruleError } = await supabase
    .from("elimination_rules")
    .select("*")
    .eq("rule_set_id", ruleSet.id)
    .eq("rule_code", "DEFAULT_AR_AP")
    .maybeSingle()
  if (ruleError) throw ruleError
  if (!rule) {
    const insertedRule = await supabase
      .from("elimination_rules")
      .insert({
        rule_set_id: ruleSet.id,
        rule_code: "DEFAULT_AR_AP",
        rule_type: "ar_ap",
        match_strategy: "matched_reconciliation_only",
        rule_config: { skeleton_mode: false, phase: "2B.3" },
        status: "active",
      })
      .select("*")
      .single()
    if (insertedRule.error) throw insertedRule.error
    rule = insertedRule.data
  }
  return rule
}

async function ensureTemplate(supabase, statementType) {
  const templateCode = `GROUP_${String(statementType).toUpperCase()}_V1`
  let { data: template, error } = await supabase
    .from("consolidation_statement_templates")
    .select("*")
    .eq("template_code", templateCode)
    .maybeSingle()
  if (error) throw error
  if (!template) {
    const inserted = await supabase
      .from("consolidation_statement_templates")
      .insert({
        template_code: templateCode,
        statement_type: statementType,
        reporting_standard: "IFRS",
        version_no: 1,
        status: "active",
        template_payload: { phase: "2B.3" },
      })
      .select("*")
      .single()
    if (inserted.error) throw inserted.error
    template = inserted.data
  }
  return template
}

function buildStatementLines(statementType, translationLines, presentationCurrency) {
  if (statementType === "trial_balance") {
    return translationLines.map((line, index) => ({
      section_code: "trial_balance",
      line_code: line.account_code,
      line_label: line.account_name || line.account_code,
      legal_entity_id: line.legal_entity_id,
      account_code: line.account_code,
      amount: numeric(line.balance_translated),
      presentation_currency: presentationCurrency,
      display_order: index + 1,
      line_metadata: { statement_category: line.statement_category },
    }))
  }

  const groups = new Map()
  for (const line of translationLines) {
    const amount = naturalStatementAmount(line)
    const key = statementType === "income_statement"
      ? (["revenue", "expense"].includes(String(line.statement_category || "").toLowerCase()) ? String(line.statement_category).toLowerCase() : "other")
      : (["asset", "liability", "equity"].includes(String(line.statement_category || "").toLowerCase()) ? String(line.statement_category).toLowerCase() : "other")
    const bucket = groups.get(key) || { section_code: statementType, line_code: key, line_label: key, amount: 0, display_order: groups.size + 1 }
    bucket.amount = Number((bucket.amount + amount).toFixed(4))
    groups.set(key, bucket)
  }

  return [...groups.values()].map((row) => ({
    ...row,
    legal_entity_id: null,
    account_code: null,
    presentation_currency: presentationCurrency,
    line_metadata: { grouped: true },
  }))
}

async function run() {
  const report = {
    phase: "phase2b3-dry-run-validation",
    executedAt: nowIso(),
    mode: hasLiveEnv() ? "live" : "static",
    ok: true,
    checks: [],
  }

  if (!hasLiveEnv()) {
    report.ok = false
    report.checks.push({
      id: "env",
      passed: false,
      severity: "critical",
      message: "Supabase live env is missing. Cannot execute consolidation dry-run validation.",
    })
    return exitWithReport("phase2b3-dry-run-validation", report)
  }

  const performance = { startedAt: Date.now(), memoryBefore: memorySnapshot() }
  const supabase = createServiceClient()
  const schema = await verifySchema(supabase)
  report.schema = schema
  if (!schema.ok) {
    report.ok = false
    report.checks.push({
      id: "schema",
      passed: false,
      severity: "critical",
      message: "Phase 2B.2 migration is not fully applied on the target database.",
      data: schema.checks,
    })
    return exitWithReport("phase2b3-dry-run-validation", report)
  }

  const groupContext = await resolveConsolidationGroup(supabase)
  const companyContext = await resolveHostCompanyForRun(supabase, groupContext.group.id)
  const hostCompanyId = String(companyContext.companyId)
  const actorUserId = await resolveActorUserId(supabase, hostCompanyId)
  const entities = await resolveGroupEntities(supabase, groupContext.group.id)
  const periodStart = String(process.env.PHASE2B3_PERIOD_START || firstDayOfCurrentMonth())
  const periodEnd = String(process.env.PHASE2B3_PERIOD_END || lastDayOfCurrentMonth())
  const asOfTimestamp = String(process.env.PHASE2B3_AS_OF || nowIso())
  const rateOverrides = parseJsonEnv("PHASE2B3_RATE_OVERRIDES_JSON", {})

  report.company = {
    id: hostCompanyId,
    name: companyContext.company?.name || null,
    resolution: companyContext.resolution,
  }
  report.group = {
    id: groupContext.group.id,
    name: groupContext.group.group_name || null,
    resolution: groupContext.resolution,
    presentationCurrency: groupContext.group.presentation_currency,
  }
  report.scope = {
    entityCount: entities.length,
    entityIds: entities.map((row) => row.legal_entity_id),
    partialSelection: !!process.env.PHASE2B3_ENTITY_IDS,
    periodStart,
    periodEnd,
    asOfTimestamp,
  }

  if (entities.length === 0) {
    report.ok = false
    report.checks.push({
      id: "scope",
      passed: false,
      severity: "critical",
      message: "No consolidation entities resolved for the selected group scope.",
    })
    return exitWithReport("phase2b3-dry-run-validation", report)
  }

  if (entities.length > MAX_ENTITIES) {
    report.ok = false
    report.checks.push({
      id: "data_volume_guard",
      passed: false,
      severity: "critical",
      message: `Entity scope exceeds dry-run limit (${entities.length}/${MAX_ENTITIES}).`,
    })
    return exitWithReport("phase2b3-dry-run-validation", report)
  }

  const scopeDefinition = {
    scopeMode: process.env.PHASE2B3_ENTITY_IDS ? "entity_subset" : "full_group",
    legalEntityIds: entities.map((row) => row.legal_entity_id).sort(),
    excludeLegalEntityIds: [],
    includeEquityMethodEntities: process.env.PHASE2B3_INCLUDE_EQUITY === "1",
  }
  const rateSetLock = {
    rateSetCode: String(process.env.PHASE2B3_RATE_SET_CODE || "GROUP_DEFAULT_RATESET"),
    rateSource: String(process.env.PHASE2B3_RATE_SOURCE || "manual_lock"),
    asOfTimestamp,
    closingRateDate: periodEnd,
    averageRateWindowStart: periodStart,
    averageRateWindowEnd: periodEnd,
  }

  const runContext = await getOrCreateDryRun(supabase, {
    hostCompanyId,
    groupId: groupContext.group.id,
    periodStart,
    periodEnd,
    asOfTimestamp,
    presentationCurrency: groupContext.group.presentation_currency || "EGP",
    scopeDefinition,
    rateSetLock,
    statementMappingVersion: "GROUP_DEFAULT_V1",
    eliminationRuleSetCode: "DEFAULT_ELIM_RULES",
  }, actorUserId)

  const run = runContext.run
  const runTraceId = await createTrace(supabase, {
    company_id: hostCompanyId,
    source_entity: "consolidation_run",
    source_id: run.id,
    event_type: "consolidation_run_dry_run_started",
    actor_id: actorUserId,
    idempotency_key: runContext.idempotencyKey,
    request_hash: runContext.inputHash,
    metadata: { period_start: periodStart, period_end: periodEnd, entity_count: entities.length },
    created_at: nowIso(),
  })
  await linkTrace(supabase, runTraceId, "consolidation_run", run.id, "source", "consolidation_run")

  if (!runContext.alreadyExists) {
    await insertRunEntities(supabase, run.id, entities)
  }

  await supabase.from("consolidation_runs").update({ status: "extracting" }).eq("id", run.id)
  const trialBalanceLines = []
  const companyTotals = []
  for (const entity of entities) {
    const result = await fetchTrialBalanceForEntity(supabase, entity, periodStart, periodEnd)
    companyTotals.push({
      company_id: entity.company_id,
      legal_entity_id: entity.legal_entity_id,
      line_count: result.lines.length,
      entry_count: result.entryCount,
      balance_total: Number(result.lines.reduce((sum, row) => sum + numeric(row.balance_functional), 0).toFixed(4)),
    })
    for (const line of result.lines) {
      line.consolidation_run_id = run.id
      line.run_version = run.run_version
      trialBalanceLines.push(line)
    }
  }

  if (trialBalanceLines.length > MAX_LINES) {
    report.ok = false
    report.checks.push({
      id: "data_volume_guard_lines",
      passed: false,
      severity: "critical",
      message: `Trial balance line count exceeds dry-run limit (${trialBalanceLines.length}/${MAX_LINES}).`,
    })
    return exitWithReport("phase2b3-dry-run-validation", report)
  }

  if (trialBalanceLines.length > 0 && !runContext.alreadyExists) {
    const { error: tbError } = await supabase
      .from("consolidation_trial_balance_lines")
      .upsert(trialBalanceLines, { onConflict: "consolidation_run_id,legal_entity_id,company_id,account_code" })
    if (tbError) throw tbError
  }

  await createTrace(supabase, {
    company_id: hostCompanyId,
    source_entity: "consolidation_run",
    source_id: run.id,
    event_type: "consolidation_extract_completed",
    actor_id: actorUserId,
    metadata: { line_count: trialBalanceLines.length },
    created_at: nowIso(),
  })

  const fxMissing = []
  const translationLines = trialBalanceLines.map((line) => {
    const resolvedRate = resolveRateForCurrency(rateOverrides, line.functional_currency, groupContext.group.presentation_currency || "EGP")
    if (!resolvedRate) {
      fxMissing.push({
        legal_entity_id: line.legal_entity_id,
        company_id: line.company_id,
        account_code: line.account_code,
        source_currency: line.functional_currency,
        presentation_currency: groupContext.group.presentation_currency || "EGP",
      })
      return null
    }
    const translated = Number((numeric(line.balance_functional) * numeric(resolvedRate.rate)).toFixed(4))
    return {
      consolidation_run_id: run.id,
      run_version: run.run_version,
      legal_entity_id: line.legal_entity_id,
      company_id: line.company_id,
      account_id: line.account_id,
      account_code: line.account_code,
      account_name: line.account_name,
      account_type: line.account_type,
      statement_category: line.statement_category,
      translation_method: inferTranslationMethod(line.statement_category),
      source_currency: line.functional_currency,
      presentation_currency: groupContext.group.presentation_currency || "EGP",
      exchange_rate: numeric(resolvedRate.rate),
      rate_source: resolvedRate.source === "identity" ? rateSetLock.rateSource : resolvedRate.source,
      rate_timestamp: asOfTimestamp,
      rate_set_code: rateSetLock.rateSetCode,
      rate_snapshot_hash: stableHash(rateSetLock),
      balance_source: numeric(line.balance_functional),
      balance_translated: translated,
      translation_difference: Number((translated - numeric(line.balance_functional)).toFixed(4)),
      batch_key: `TR-${line.legal_entity_id}`,
    }
  }).filter(Boolean)

  if (fxMissing.length > 0) {
    report.ok = false
    report.checks.push({
      id: "fx_rate_validation",
      passed: false,
      severity: "critical",
      message: `${fxMissing.length} translation line(s) are missing locked FX rates.`,
      data: fxMissing.slice(0, 25),
    })
    return exitWithReport("phase2b3-dry-run-validation", report)
  }

  if (translationLines.length > 0 && !runContext.alreadyExists) {
    const persistedTranslationLines = translationLines.map((line) => ({
      consolidation_run_id: line.consolidation_run_id,
      run_version: line.run_version,
      legal_entity_id: line.legal_entity_id,
      company_id: line.company_id,
      account_id: line.account_id,
      account_code: line.account_code,
      statement_category: line.statement_category,
      translation_method: line.translation_method,
      source_currency: line.source_currency,
      presentation_currency: line.presentation_currency,
      exchange_rate: line.exchange_rate,
      rate_source: line.rate_source,
      rate_timestamp: line.rate_timestamp,
      rate_set_code: line.rate_set_code,
      rate_snapshot_hash: line.rate_snapshot_hash,
      balance_source: line.balance_source,
      balance_translated: line.balance_translated,
      translation_difference: line.translation_difference,
      batch_key: line.batch_key,
    }))
    const { error: translationError } = await supabase
      .from("consolidation_translation_lines")
      .upsert(persistedTranslationLines, { onConflict: "consolidation_run_id,legal_entity_id,company_id,account_code" })
    if (translationError) throw translationError
  }

  await supabase.from("consolidation_runs").update({ status: "translating", last_completed_step: "translate" }).eq("id", run.id)
  await createTrace(supabase, {
    company_id: hostCompanyId,
    source_entity: "consolidation_run",
    source_id: run.id,
    event_type: "consolidation_translation_completed",
    actor_id: actorUserId,
    metadata: { line_count: translationLines.length, rate_set_code: rateSetLock.rateSetCode },
    created_at: nowIso(),
  })

  const rule = await ensureRuleSet(supabase, "DEFAULT_ELIM_RULES")
  const scopeEntityIds = new Set(entities.map((row) => row.legal_entity_id))
  const translationIndex = new Map(translationLines.map((line) => [translationLineKey(line), line]))
  const { data: reconciliations, error: reconciliationError } = await supabase
    .from("intercompany_reconciliation_results")
    .select(`
      id,
      created_at,
      reconciliation_scope,
      result_status,
      seller_open_amount,
      buyer_open_amount,
      intercompany_transactions!inner(
        id,
        seller_company_id,
        buyer_company_id,
        seller_legal_entity_id,
        buyer_legal_entity_id,
        transaction_amount,
        transaction_currency,
        transaction_date,
        seller_exchange_rate,
        seller_rate_timestamp,
        buyer_exchange_rate,
        buyer_rate_timestamp,
        source_flow_type,
        operational_context
      )
    `)
    .order("created_at", { ascending: false })
  if (reconciliationError) throw reconciliationError

  const matched = []
  const mismatched = []
  const latestTransactionIds = new Set()
  for (const row of reconciliations || []) {
    const transaction = row.intercompany_transactions
    if (!transaction) continue
    if (!scopeEntityIds.has(transaction.seller_legal_entity_id) || !scopeEntityIds.has(transaction.buyer_legal_entity_id)) continue
    const txDate = String(transaction.transaction_date || "").slice(0, 10)
    if (txDate < periodStart || txDate > periodEnd) continue
    if (latestTransactionIds.has(transaction.id)) continue
    latestTransactionIds.add(transaction.id)
    if (["matched", "matched_within_tolerance"].includes(String(row.result_status || ""))) matched.push(row)
    else mismatched.push(row)
  }

  const matchedWithExposure = matched.filter((row) => Math.abs(firstDefinedNumeric(
    row.seller_open_amount,
    row.buyer_open_amount,
    row.intercompany_transactions?.transaction_amount
  )) > 0.0001)
  const settledMatched = matched.filter((row) => !matchedWithExposure.includes(row))

  const eliminationCandidates = matchedWithExposure.map((row) => ({
    consolidation_run_id: run.id,
    rule_id: rule.id,
    reference_type: "intercompany_transaction",
    reference_id: row.intercompany_transactions.id,
    source_intercompany_transaction_id: row.intercompany_transactions.id,
    source_reconciliation_result_id: row.id,
    seller_legal_entity_id: row.intercompany_transactions.seller_legal_entity_id,
    buyer_legal_entity_id: row.intercompany_transactions.buyer_legal_entity_id,
    candidate_currency: groupContext.group.presentation_currency || "EGP",
    candidate_amount: firstDefinedNumeric(
      row.seller_open_amount,
      row.buyer_open_amount,
      row.intercompany_transactions.transaction_amount
    ),
    candidate_payload: {
      result_status: row.result_status,
      reconciliation_scope: row.reconciliation_scope,
      phase: "2B.3",
    },
    status: "draft",
    candidate_hash: stableHash({ runId: run.id, reconciliationId: row.id, transactionId: row.intercompany_transactions.id }),
  }))

  const eliminationIssues = []
  const eliminationSummary = []
  const eliminationAdjustments = []
  for (const row of matchedWithExposure) {
    const transaction = row.intercompany_transactions
    const operationalContext = transaction?.operational_context || {}
    const candidateAmount = firstDefinedNumeric(
      row.seller_open_amount,
      row.buyer_open_amount,
      transaction.transaction_amount
    )
    const localAmounts = operationalContext.elimination_local_amounts || {}
    const sellerLocalAmount = firstDefinedNumeric(
      localAmounts.seller_amount,
      localAmounts.seller_local_amount,
      localAmounts.seller_functional_amount,
      transaction.transaction_amount != null && transaction.seller_exchange_rate != null
        ? numeric(transaction.transaction_amount) * numeric(transaction.seller_exchange_rate)
        : null,
      candidateAmount
    )
    const buyerLocalAmount = firstDefinedNumeric(
      localAmounts.buyer_amount,
      localAmounts.buyer_local_amount,
      localAmounts.buyer_functional_amount,
      transaction.transaction_amount != null && transaction.buyer_exchange_rate != null
        ? numeric(transaction.transaction_amount) * numeric(transaction.buyer_exchange_rate)
        : null,
      candidateAmount
    )
    const targets = operationalContext.elimination_targets || {}
    const fxHandling = operationalContext.fx_difference_handling || null
    const specs = [
      {
        role: "seller_ar",
        legalEntityId: transaction.seller_legal_entity_id,
        companyId: transaction.seller_company_id,
        accountCode: targets.seller_ar_account_code,
        signedAmount: -sellerLocalAmount,
      },
      {
        role: "seller_revenue",
        legalEntityId: transaction.seller_legal_entity_id,
        companyId: transaction.seller_company_id,
        accountCode: targets.seller_revenue_account_code,
        signedAmount: sellerLocalAmount,
      },
      {
        role: "buyer_ap",
        legalEntityId: transaction.buyer_legal_entity_id,
        companyId: transaction.buyer_company_id,
        accountCode: targets.buyer_ap_account_code,
        signedAmount: buyerLocalAmount,
      },
      {
        role: "buyer_expense",
        legalEntityId: transaction.buyer_legal_entity_id,
        companyId: transaction.buyer_company_id,
        accountCode: targets.buyer_expense_account_code,
        signedAmount: -buyerLocalAmount,
      },
    ]

    const pendingAdjustments = []
    const summary = {
      reconciliationId: row.id,
      transactionId: transaction.id,
      transactionCurrency: transaction.transaction_currency || groupContext.group.presentation_currency || "EGP",
      candidateAmount,
      sellerLocalAmount,
      buyerLocalAmount,
      status: "applied",
      applied: [],
      missing: [],
    }

    for (const spec of specs) {
      if (!spec.accountCode) {
        const issue = {
          reconciliationId: row.id,
          transactionId: transaction.id,
          role: spec.role,
          reason: "missing_target_account_code",
        }
        summary.missing.push(issue)
        eliminationIssues.push(issue)
        continue
      }

      const baseLine = translationIndex.get(
        translationLineKey({
          legal_entity_id: spec.legalEntityId,
          company_id: spec.companyId,
          account_code: spec.accountCode,
        })
      )
      if (!baseLine) {
        const issue = {
          reconciliationId: row.id,
          transactionId: transaction.id,
          role: spec.role,
          companyId: spec.companyId,
          legalEntityId: spec.legalEntityId,
          accountCode: spec.accountCode,
          reason: "translation_line_not_found",
        }
        summary.missing.push(issue)
        eliminationIssues.push(issue)
        continue
      }

      pendingAdjustments.push(
        buildEliminationAdjustmentLine(baseLine, spec.signedAmount, {
          reconciliation_id: row.id,
          transaction_id: transaction.id,
          role: spec.role,
          reconciliation_scope: row.reconciliation_scope || null,
          source_flow_type: transaction.source_flow_type || null,
          controlled_scenario: !!transaction?.operational_context?.controlled_scenario,
        })
      )
      summary.applied.push({
        role: spec.role,
        companyId: spec.companyId,
        legalEntityId: spec.legalEntityId,
        accountCode: spec.accountCode,
        signedAmount: Number(spec.signedAmount.toFixed(4)),
      })
    }

    if (summary.missing.length === 0) {
      const fxDifference = Number((buyerLocalAmount - sellerLocalAmount).toFixed(4))
      if (fxHandling && Math.abs(fxDifference) > 0.0001) {
        const isLoss = fxDifference > 0
        const fxAmount = Math.abs(fxDifference)
        pendingAdjustments.push(
          buildSyntheticTranslationAdjustmentLine({
            runId: run.id,
            runVersion: run.run_version,
            companyId: hostCompanyId,
            accountCode: isLoss
              ? String(fxHandling.loss_account_code || "5310")
              : String(fxHandling.gain_account_code || "4400"),
            accountName: isLoss
              ? String(fxHandling.loss_account_name || "FX Losses")
              : String(fxHandling.gain_account_name || "FX Gains"),
            accountType: isLoss ? "expense" : "revenue",
            statementCategory: isLoss ? "expense" : "revenue",
            presentationCurrency: groupContext.group.presentation_currency || "EGP",
            rateTimestamp: asOfTimestamp,
            rateSetCode: rateSetLock.rateSetCode,
            rateSnapshotHash: stableHash(rateSetLock),
            signedAmount: isLoss ? fxAmount : -fxAmount,
            metadata: {
              reconciliation_id: row.id,
              transaction_id: transaction.id,
              kind: "fx_difference",
              direction: isLoss ? "loss" : "gain",
              seller_rate: numeric(transaction.seller_exchange_rate),
              buyer_rate: numeric(transaction.buyer_exchange_rate),
              seller_rate_timestamp: transaction.seller_rate_timestamp || null,
              buyer_rate_timestamp: transaction.buyer_rate_timestamp || null,
            },
            batchKey: "TR-GROUP-FX",
          }),
          buildSyntheticTranslationAdjustmentLine({
            runId: run.id,
            runVersion: run.run_version,
            companyId: hostCompanyId,
            accountCode: String(fxHandling.reserve_account_code || "3998"),
            accountName: String(fxHandling.reserve_account_name || "FX Timing Reserve"),
            accountType: "equity",
            statementCategory: "equity",
            presentationCurrency: groupContext.group.presentation_currency || "EGP",
            rateTimestamp: asOfTimestamp,
            rateSetCode: rateSetLock.rateSetCode,
            rateSnapshotHash: stableHash(rateSetLock),
            signedAmount: isLoss ? -fxAmount : fxAmount,
            metadata: {
              reconciliation_id: row.id,
              transaction_id: transaction.id,
              kind: "fx_difference_reserve",
              direction: isLoss ? "loss" : "gain",
            },
            batchKey: "TR-GROUP-FX",
          })
        )
        summary.fxDifference = {
          amount: fxAmount,
          direction: isLoss ? "loss" : "gain",
          lossAccountCode: String(fxHandling.loss_account_code || "5310"),
          gainAccountCode: String(fxHandling.gain_account_code || "4400"),
          reserveAccountCode: String(fxHandling.reserve_account_code || "3998"),
          sellerRate: numeric(transaction.seller_exchange_rate),
          buyerRate: numeric(transaction.buyer_exchange_rate),
          sellerRateTimestamp: transaction.seller_rate_timestamp || null,
          buyerRateTimestamp: transaction.buyer_rate_timestamp || null,
        }
      }
      eliminationAdjustments.push(...pendingAdjustments)
    }
    else summary.status = "blocked"
    eliminationSummary.push(summary)
  }

  for (const row of settledMatched) {
    const transaction = row.intercompany_transactions
    const operationalContext = transaction?.operational_context || {}
    const fxSettlement = operationalContext.fx_settlement_realization || null
    if (fxSettlement?.requires_pnl_cleanup) {
      const localAmounts = operationalContext.elimination_local_amounts || {}
      const fxHandling = operationalContext.fx_difference_handling || null
      const sellerLocalAmount = firstDefinedNumeric(
        localAmounts.seller_amount,
        localAmounts.seller_local_amount,
        localAmounts.seller_functional_amount,
        transaction.transaction_amount != null && transaction.seller_exchange_rate != null
          ? numeric(transaction.transaction_amount) * numeric(transaction.seller_exchange_rate)
          : null,
        transaction.transaction_amount
      )
      const buyerLocalAmount = firstDefinedNumeric(
        localAmounts.buyer_amount,
        localAmounts.buyer_local_amount,
        localAmounts.buyer_functional_amount,
        transaction.transaction_amount != null && transaction.buyer_exchange_rate != null
          ? numeric(transaction.transaction_amount) * numeric(transaction.buyer_exchange_rate)
          : null,
        transaction.transaction_amount
      )
      const targets = operationalContext.elimination_targets || {}
      const specs = [
        {
          role: "seller_revenue",
          legalEntityId: transaction.seller_legal_entity_id,
          companyId: transaction.seller_company_id,
          accountCode: targets.seller_revenue_account_code,
          signedAmount: sellerLocalAmount,
        },
        {
          role: "buyer_expense",
          legalEntityId: transaction.buyer_legal_entity_id,
          companyId: transaction.buyer_company_id,
          accountCode: targets.buyer_expense_account_code,
          signedAmount: -buyerLocalAmount,
        },
      ]

      const pendingAdjustments = []
      const summary = {
        reconciliationId: row.id,
        transactionId: transaction.id,
        transactionCurrency: transaction.transaction_currency || groupContext.group.presentation_currency || "EGP",
        candidateAmount: 0,
        sellerLocalAmount,
        buyerLocalAmount,
        status: "settled_realized_fx_applied",
        reconciliationScope: row.reconciliation_scope || null,
        applied: [],
        missing: [],
        realizedFx: {
          settlementRate: firstDefinedNumeric(
            fxSettlement.settlement_rate,
            fxSettlement.rate,
            fxSettlement.exchange_rate
          ),
          settlementRateTimestamp: fxSettlement.settlement_rate_timestamp || fxSettlement.rate_timestamp || null,
          sellerAmount: firstDefinedNumeric(
            fxSettlement.seller_realized_fx_amount,
            fxSettlement.seller_realized_amount
          ),
          sellerDirection: fxSettlement.seller_realized_fx_direction || fxSettlement.seller_direction || null,
          buyerAmount: firstDefinedNumeric(
            fxSettlement.buyer_realized_fx_amount,
            fxSettlement.buyer_realized_amount
          ),
          buyerDirection: fxSettlement.buyer_realized_fx_direction || fxSettlement.buyer_direction || null,
          reserveReleaseAmount: firstDefinedNumeric(
            fxSettlement.reserve_release_amount,
            Math.abs(buyerLocalAmount - sellerLocalAmount)
          ),
          reserveAccountCode: fxSettlement.reserve_account_code || null,
        },
      }

      for (const spec of specs) {
        if (!spec.accountCode) {
          const issue = {
            reconciliationId: row.id,
            transactionId: transaction.id,
            role: spec.role,
            reason: "missing_target_account_code",
          }
          summary.missing.push(issue)
          eliminationIssues.push(issue)
          continue
        }

        const baseLine = translationIndex.get(
          translationLineKey({
            legal_entity_id: spec.legalEntityId,
            company_id: spec.companyId,
            account_code: spec.accountCode,
          })
        )
        if (!baseLine) {
          const issue = {
            reconciliationId: row.id,
            transactionId: transaction.id,
            role: spec.role,
            companyId: spec.companyId,
            legalEntityId: spec.legalEntityId,
            accountCode: spec.accountCode,
            reason: "translation_line_not_found",
          }
          summary.missing.push(issue)
          eliminationIssues.push(issue)
          continue
        }

        pendingAdjustments.push(
          buildEliminationAdjustmentLine(baseLine, spec.signedAmount, {
            reconciliation_id: row.id,
            transaction_id: transaction.id,
            role: spec.role,
            reconciliation_scope: row.reconciliation_scope || null,
            source_flow_type: transaction.source_flow_type || null,
            controlled_scenario: !!transaction?.operational_context?.controlled_scenario,
            settled_fx_realization: true,
          })
        )
        summary.applied.push({
          role: spec.role,
          companyId: spec.companyId,
          legalEntityId: spec.legalEntityId,
          accountCode: spec.accountCode,
          signedAmount: Number(spec.signedAmount.toFixed(4)),
        })
      }

      if (summary.missing.length === 0) {
        const fxDifference = Number((buyerLocalAmount - sellerLocalAmount).toFixed(4))
        if (Math.abs(fxDifference) > 0.0001) {
          const isLoss = fxDifference > 0
          const fxAmount = Math.abs(fxDifference)
          pendingAdjustments.push(
            buildSyntheticTranslationAdjustmentLine({
              runId: run.id,
              runVersion: run.run_version,
              companyId: hostCompanyId,
              accountCode: isLoss
                ? String(fxHandling?.loss_account_code || "5310")
                : String(fxHandling?.gain_account_code || "4400"),
              accountName: isLoss
                ? String(fxHandling?.loss_account_name || "FX Losses")
                : String(fxHandling?.gain_account_name || "FX Gains"),
              accountType: isLoss ? "expense" : "revenue",
              statementCategory: isLoss ? "expense" : "revenue",
              presentationCurrency: groupContext.group.presentation_currency || "EGP",
              rateTimestamp: asOfTimestamp,
              rateSetCode: rateSetLock.rateSetCode,
              rateSnapshotHash: stableHash(rateSetLock),
              signedAmount: isLoss ? fxAmount : -fxAmount,
              metadata: {
                reconciliation_id: row.id,
                transaction_id: transaction.id,
                kind: "fx_realized_cleanup",
                direction: isLoss ? "loss" : "gain",
                reserve_released: true,
              },
              batchKey: "TR-GROUP-FX-REALIZED",
            })
          )
          summary.realizedFx.normalizationAmount = fxAmount
          summary.realizedFx.normalizationDirection = isLoss ? "loss" : "gain"
          summary.realizedFx.normalizationAccountCode = isLoss
            ? String(fxHandling?.loss_account_code || "5310")
            : String(fxHandling?.gain_account_code || "4400")
        }

        eliminationAdjustments.push(...pendingAdjustments)
      }
      else summary.status = "blocked"

      eliminationSummary.push(summary)
      continue
    }

    eliminationSummary.push({
      reconciliationId: row.id,
      transactionId: transaction.id,
      transactionCurrency: transaction.transaction_currency || groupContext.group.presentation_currency || "EGP",
      candidateAmount: 0,
      status: "settled_no_elimination_required",
      reconciliationScope: row.reconciliation_scope || null,
      applied: [],
      missing: [],
    })
  }

  const adjustedTranslationLines = applyTranslationAdjustments(translationLines, eliminationAdjustments)

  if (eliminationCandidates.length > 0 && !runContext.alreadyExists) {
    const { error: eliminationError } = await supabase
      .from("consolidation_elimination_candidates")
      .upsert(eliminationCandidates, { onConflict: "consolidation_run_id,candidate_hash" })
    if (eliminationError) throw eliminationError
  }

  await createTrace(supabase, {
    company_id: hostCompanyId,
    source_entity: "consolidation_run",
    source_id: run.id,
    event_type: "consolidation_elimination_completed",
    actor_id: actorUserId,
    metadata: {
      matched_count: matched.length,
      matched_with_exposure_count: matchedWithExposure.length,
      settled_matched_count: settledMatched.length,
      mismatch_count: mismatched.length,
      applied_adjustment_count: eliminationAdjustments.length,
      blocked_adjustment_count: eliminationIssues.length,
    },
    created_at: nowIso(),
  })

  const statementTypes = ["trial_balance", "income_statement", "balance_sheet"]
  const statementRuns = []
  for (const statementType of statementTypes) {
    const template = await ensureTemplate(supabase, statementType)
    const generationHash = stableHash({
      runId: run.id,
      statementType,
      lineCount: adjustedTranslationLines.length,
      eliminationAdjustmentCount: eliminationAdjustments.length,
    })
    let { data: statementRun, error: statementRunError } = await supabase
      .from("consolidated_statement_runs")
      .select("*")
      .eq("consolidation_run_id", run.id)
      .eq("statement_type", statementType)
      .eq("generation_hash", generationHash)
      .maybeSingle()
    if (statementRunError) throw statementRunError

    if (!statementRun) {
      const inserted = await supabase
        .from("consolidated_statement_runs")
        .insert({
          consolidation_run_id: run.id,
          run_version: run.run_version,
          statement_type: statementType,
          template_id: template.id,
          status: "generated",
          generation_hash: generationHash,
          generated_by: actorUserId,
          generated_at: nowIso(),
        })
        .select("*")
        .single()
      if (inserted.error) throw inserted.error
      statementRun = inserted.data

      const lines = buildStatementLines(statementType, adjustedTranslationLines, groupContext.group.presentation_currency || "EGP")
        .map((line) => ({ consolidated_statement_run_id: statementRun.id, ...line }))
      if (lines.length > 0) {
        const { error: lineError } = await supabase.from("consolidated_statement_lines").insert(lines)
        if (lineError) throw lineError
      }
    }

    statementRuns.push(statementRun)
  }

  const rawBalanceTotals = translationLines.reduce((acc, line) => {
    const category = String(line.statement_category || "").trim().toLowerCase()
    acc[category] = Number(((acc[category] || 0) + naturalStatementAmount(line)).toFixed(4))
    return acc
  }, {})

  const balanceTotals = adjustedTranslationLines.reduce((acc, line) => {
    const category = String(line.statement_category || "").trim().toLowerCase()
    acc[category] = Number(((acc[category] || 0) + naturalStatementAmount(line)).toFixed(4))
    return acc
  }, {})

  const rawAssets = numeric(rawBalanceTotals.asset || 0)
  const rawLiabilities = numeric(rawBalanceTotals.liability || 0)
  const rawEquity = numeric(rawBalanceTotals.equity || 0)
  const rawRevenue = numeric(rawBalanceTotals.revenue || 0)
  const rawExpenses = numeric(rawBalanceTotals.expense || 0)
  const rawPnlNet = Number((rawRevenue - rawExpenses).toFixed(4))
  const rawLiabilitiesAndEquity = Number((rawLiabilities + rawEquity + rawPnlNet).toFixed(4))
  const rawBalanceSheetDifference = Number((rawAssets - rawLiabilitiesAndEquity).toFixed(4))

  const assets = numeric(balanceTotals.asset || 0)
  const liabilities = numeric(balanceTotals.liability || 0)
  const equity = numeric(balanceTotals.equity || 0)
  const revenue = numeric(balanceTotals.revenue || 0)
  const expenses = numeric(balanceTotals.expense || 0)
  const pnlNet = Number((revenue - expenses).toFixed(4))
  const liabilitiesAndEquity = Number((liabilities + equity + pnlNet).toFixed(4))
  const balanceSheetDifference = Number((assets - liabilitiesAndEquity).toFixed(4))
  const tbBalanced = companyTotals.every((row) => Math.abs(numeric(row.balance_total)) <= 0.01)
  const blockedEliminations = eliminationSummary.filter((row) => row.status === "blocked")
  const realizedFxSettlements = eliminationSummary.filter((row) => row.status === "settled_realized_fx_applied")
  const realizedFxReserveAccountCodes = [...new Set(
    realizedFxSettlements
      .map((row) => row.realizedFx?.reserveAccountCode)
      .filter(Boolean)
      .map((value) => String(value))
  )]
  const fxTimingReserveEndingBalance = Number(
    adjustedTranslationLines
      .filter((line) => realizedFxReserveAccountCodes.includes(String(line.account_code || "")))
      .reduce((sum, line) => sum + numeric(line.balance_translated), 0)
      .toFixed(4)
  )

  const checks = [
    {
      id: "trial_balance_correctness",
      passed: tbBalanced,
      severity: "critical",
      message: tbBalanced ? "Each entity trial balance is balanced." : "One or more entity trial balances are not balanced.",
      data: companyTotals,
    },
    {
      id: "fx_translation_correctness",
      passed: adjustedTranslationLines.every((line) => numeric(line.exchange_rate) > 0 && !!line.rate_source && !!line.rate_timestamp),
      severity: "critical",
      message: "All translation lines carry explicit locked FX metadata.",
      data: { lineCount: adjustedTranslationLines.length, rateSetLock },
    },
    {
      id: "elimination_correctness",
      passed: mismatched.length === 0 && blockedEliminations.length === 0,
      severity: blockedEliminations.length > 0 ? "critical" : (mismatched.length === 0 ? "info" : "warning"),
      message: blockedEliminations.length > 0
        ? `${blockedEliminations.length} matched reconciliation(s) could not be converted into full elimination adjustments.`
        : (mismatched.length === 0
          ? (realizedFxSettlements.length > 0
            ? "Settled FX transactions were converted into deterministic P&L cleanup adjustments with no residual timing reserve."
            : (settledMatched.length > 0 && matchedWithExposure.length === 0
              ? "Matched intercompany transactions are fully settled in scope; no elimination adjustments are required."
              : "Matched intercompany transactions were converted into deterministic elimination adjustments with no mismatches in scope."))
          : `${mismatched.length} intercompany mismatch alert(s) remain outside elimination coverage.`),
      data: {
        matched: matched.length,
        matchedWithExposure: matchedWithExposure.length,
        settledMatched: settledMatched.length,
        mismatched: mismatched.length,
        eliminationAdjustmentLines: eliminationAdjustments.length,
        blockedEliminations: blockedEliminations.length,
        mismatchSample: mismatched.slice(0, 10),
        eliminationIssues: eliminationIssues.slice(0, 10),
        eliminationSummary: eliminationSummary.slice(0, 10),
      },
    },
    {
      id: "statement_consistency",
      passed: Math.abs(balanceSheetDifference) <= 0.01 && Number.isFinite(pnlNet),
      severity: "critical",
      message: Math.abs(balanceSheetDifference) <= 0.01
        ? "Balance sheet and income statement sanity checks passed."
        : "Balance sheet is not balanced after translation and current-period result roll-forward.",
      data: { assets, liabilities, equity, liabilitiesAndEquity, balanceSheetDifference, revenue, expenses, pnlNet },
    },
    {
      id: "fx_realization_consistency",
      passed: realizedFxSettlements.length === 0 || Math.abs(fxTimingReserveEndingBalance) <= 0.01,
      severity: "critical",
      message: realizedFxSettlements.length === 0
        ? "No realized FX settlement scenarios required reserve-release validation."
        : (Math.abs(fxTimingReserveEndingBalance) <= 0.01
          ? "Realized FX settlements released the timing reserve with no residual balance."
          : "FX timing reserve still carries a residual balance after realized settlement."),
      data: {
        realizedFxSettlementCount: realizedFxSettlements.length,
        reserveAccountCodes: realizedFxReserveAccountCodes,
        fxTimingReserveEndingBalance,
        sample: realizedFxSettlements.slice(0, 10),
      },
    },
  ]

  for (const check of checks) {
    await supabase.from("consolidation_run_checks").insert({
      consolidation_run_id: run.id,
      check_name: check.id,
      check_scope: "run",
      status: check.passed ? "passed" : (check.severity === "warning" ? "warning" : "failed"),
      details: check.data,
    })
  }

  await supabase
    .from("consolidation_runs")
    .update({ status: "completed", last_completed_step: "finalize" })
    .eq("id", run.id)

  const completionTraceId = await createTrace(supabase, {
    company_id: hostCompanyId,
    source_entity: "consolidation_run",
    source_id: run.id,
    event_type: "consolidation_run_dry_run_completed",
    actor_id: actorUserId,
    metadata: {
      statement_run_count: statementRuns.length,
      elimination_candidate_count: eliminationCandidates.length,
      elimination_adjustment_count: eliminationAdjustments.length,
      check_count: checks.length,
    },
    created_at: nowIso(),
  })
  await linkTrace(supabase, completionTraceId, "consolidation_run", run.id, "completion", "consolidation_run")

  performance.finishedAt = Date.now()
  performance.durationMs = performance.finishedAt - performance.startedAt
  performance.memoryAfter = memorySnapshot()

  report.run = {
    id: run.id,
    number: run.run_number,
    alreadyExists: runContext.alreadyExists,
    idempotencyKey: runContext.idempotencyKey,
  }
  report.counts = {
    trialBalanceLines: trialBalanceLines.length,
    translationLines: translationLines.length,
    adjustedTranslationLines: adjustedTranslationLines.length,
    eliminationCandidates: eliminationCandidates.length,
    eliminationAdjustmentLines: eliminationAdjustments.length,
    statementRuns: statementRuns.length,
  }
  report.checks.push(...checks)
  report.edgeScenarios = {
    missingFxRates: fxMissing.length,
    intercompanyMismatchAlerts: mismatched.length,
    blockedEliminationMappings: eliminationIssues.length,
    settledMatchedTransactions: settledMatched.length,
    realizedFxSettlements: realizedFxSettlements.length,
    partialEntitySelection: !!process.env.PHASE2B3_ENTITY_IDS,
  }
  report.performance = {
    durationMs: performance.durationMs,
    memoryBefore: performance.memoryBefore,
    memoryAfter: performance.memoryAfter,
    deltaHeapUsedMb: Number((performance.memoryAfter.heapUsedMb - performance.memoryBefore.heapUsedMb).toFixed(2)),
  }
  report.auditTrace = {
    startTraceId: runTraceId,
    completionTraceId,
    sourceEntity: "consolidation_run",
    sourceId: run.id,
  }
  report.statementSummary = {
    assets,
    liabilities,
    equity,
    liabilitiesAndEquity,
    balanceSheetDifference,
    revenue,
    expenses,
    pnlNet,
    preElimination: {
      assets: rawAssets,
      liabilities: rawLiabilities,
      equity: rawEquity,
      liabilitiesAndEquity: rawLiabilitiesAndEquity,
      balanceSheetDifference: rawBalanceSheetDifference,
      revenue: rawRevenue,
      expenses: rawExpenses,
      pnlNet: rawPnlNet,
    },
  }
  report.elimination = {
    matchedTransactions: matched.length,
    matchedWithExposure: matchedWithExposure.length,
    settledMatchedTransactions: settledMatched.length,
    realizedFxSettlements: realizedFxSettlements.length,
    mismatchedTransactions: mismatched.length,
    blockedTransactions: blockedEliminations.length,
    adjustmentLines: eliminationAdjustments.length,
    summary: eliminationSummary,
  }
  report.fxLifecycle = {
    realizedSettlementCount: realizedFxSettlements.length,
    reserveAccountCodes: realizedFxReserveAccountCodes,
    fxTimingReserveEndingBalance,
    summary: realizedFxSettlements,
  }
  report.ok = report.checks.every((check) => check.passed || check.severity !== "critical")
  exitWithReport("phase2b3-dry-run-validation", report)
}

run().catch((error) => {
  exitWithReport("phase2b3-dry-run-validation", {
    phase: "phase2b3-dry-run-validation",
    executedAt: nowIso(),
    ok: false,
    error: error.message,
  })
})
