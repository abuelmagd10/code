const fs = require("fs")
const path = require("path")
const {
  createServiceClient,
  exitWithReport,
  hasLiveEnv,
  resolveCompanyContext,
  resolveConsolidationGroup,
} = require("./_shared")

const MIGRATION_RELATIVE_PATH = "supabase/migrations/20260407_001_phase2b2_consolidation_execution_foundation.sql"

async function checkTable(supabase, table, selectColumns = "id") {
  const { error } = await supabase
    .from(table)
    .select(selectColumns)
    .limit(1)

  return {
    table,
    passed: !error,
    error: error ? error.message : null,
  }
}

async function checkRunColumns(supabase) {
  const { error } = await supabase
    .from("consolidation_runs")
    .select("id, run_version, execution_mode, scope_hash, fx_snapshot_hash, input_hash, statement_mapping_version, elimination_rule_set_code")
    .limit(1)

  return {
    id: "consolidation_runs_columns",
    passed: !error,
    error: error ? error.message : null,
  }
}

async function attemptApplyMigration(supabase, sqlContent) {
  try {
    const { error } = await supabase.rpc("exec_sql", { sql_query: sqlContent })
    if (error) {
      return {
        attempted: true,
        applied: false,
        error: error.message,
      }
    }

    const reload = await supabase.rpc("exec_sql", { sql_query: "NOTIFY pgrst, 'reload schema';" })
    return {
      attempted: true,
      applied: true,
      schemaReloaded: !reload.error,
      reloadError: reload.error ? reload.error.message : null,
    }
  } catch (error) {
    return {
      attempted: true,
      applied: false,
      error: error.message,
    }
  }
}

async function run() {
  const report = {
    phase: "phase2b3-migration-apply-plan",
    executedAt: new Date().toISOString(),
    mode: hasLiveEnv() ? "live" : "static",
    applyRequested: process.env.PHASE2B3_APPLY === "1",
    migrationFile: MIGRATION_RELATIVE_PATH,
    ok: true,
    checks: [],
  }

  if (!hasLiveEnv()) {
    report.ok = false
    report.checks.push({
      id: "env",
      passed: false,
      severity: "critical",
      message: "Supabase live env is missing. Cannot verify or apply consolidation migration.",
    })
    return exitWithReport("phase2b3-migration-apply-plan", report)
  }

  const supabase = createServiceClient()
  const migrationPath = path.join(process.cwd(), MIGRATION_RELATIVE_PATH)
  const sqlContent = fs.readFileSync(migrationPath, "utf8")

  try {
    report.company = await resolveCompanyContext(supabase, { required: false })
  } catch (error) {
    report.company = { resolution: "unresolved", error: error.message }
  }

  try {
    report.group = await resolveConsolidationGroup(supabase)
  } catch (error) {
    report.group = { resolution: "unresolved", error: error.message }
  }

  if (report.applyRequested) {
    report.applyAttempt = await attemptApplyMigration(supabase, sqlContent)
  } else {
    report.applyAttempt = {
      attempted: false,
      applied: false,
      message: "Set PHASE2B3_APPLY=1 to attempt live migration via exec_sql.",
    }
  }

  const tableChecks = await Promise.all([
    checkTable(supabase, "consolidation_run_snapshots"),
    checkTable(supabase, "consolidation_run_checks"),
    checkTable(supabase, "consolidation_trial_balance_lines"),
    checkTable(supabase, "consolidation_translation_lines"),
    checkTable(supabase, "consolidation_elimination_candidates"),
    checkTable(supabase, "consolidation_books"),
    checkTable(supabase, "consolidation_book_entries"),
    checkTable(supabase, "consolidated_statement_runs"),
    checkTable(supabase, "consolidated_statement_lines"),
  ])

  report.checks.push({
    id: "consolidation_tables",
    passed: tableChecks.every((check) => check.passed),
    severity: "critical",
    message: tableChecks.every((check) => check.passed)
      ? "All Phase 2B.2 consolidation tables are reachable."
      : "One or more Phase 2B.2 consolidation tables are missing or unreachable.",
    data: tableChecks,
  })

  const runColumns = await checkRunColumns(supabase)
  report.checks.push({
    id: runColumns.id,
    passed: runColumns.passed,
    severity: "critical",
    message: runColumns.passed
      ? "consolidation_runs exposes the required Phase 2B.2 columns."
      : "consolidation_runs is missing one or more required Phase 2B.2 columns.",
    data: runColumns,
  })

  report.ok = report.checks.every((check) => check.passed || check.severity !== "critical")
  exitWithReport("phase2b3-migration-apply-plan", report)
}

run().catch((error) => {
  exitWithReport("phase2b3-migration-apply-plan", {
    phase: "phase2b3-migration-apply-plan",
    executedAt: new Date().toISOString(),
    ok: false,
    error: error.message,
  })
})
