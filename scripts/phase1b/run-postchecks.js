const {
  createServiceClient,
  hasLiveEnv,
  printSection,
  readLocalFile,
  exitWithReport,
  getEnv,
  randomUuid,
  resolveCompanyContext,
} = require("./_shared")

const requiredFunctions = [
  "require_open_financial_period_db",
  "assert_journal_entries_balanced_v2",
  "post_accounting_event_v2",
  "post_invoice_atomic_v2",
  "approve_sales_delivery_v2",
  "process_sales_return_atomic_v2",
  "process_invoice_payment_atomic_v2",
]

const requiredTables = [
  "financial_operation_traces",
  "financial_operation_trace_links",
]

async function run() {
  const report = {
    phase: "phase1b-postchecks",
    executedAt: new Date().toISOString(),
    mode: hasLiveEnv() ? "live" : "static",
    ok: true,
    checks: [],
  }

  printSection("Local Feature Flag Safety")
  const flagsFile = readLocalFile("lib/enterprise-finance-flags.ts")
  const safeDefaults = [
    'ERP_PHASE1_V2_INVOICE_POST", false',
    'ERP_PHASE1_V2_WAREHOUSE_APPROVAL", false',
    'ERP_PHASE1_V2_PAYMENT", false',
    'ERP_PHASE1_V2_RETURNS", false',
    'ERP_PHASE1_FINANCIAL_EVENTS", false',
  ]

  const missingDefaults = safeDefaults.filter((needle) => !flagsFile.includes(needle))
  report.checks.push({
    id: "flags_off_by_default",
    passed: missingDefaults.length === 0,
    severity: "critical",
    message: missingDefaults.length === 0
      ? "Phase 1 feature flags are OFF by default in code."
      : "One or more Phase 1 feature flags are not OFF by default.",
    data: { missingDefaults },
  })

  const envFlags = {
    ERP_PHASE1_V2_INVOICE_POST: getEnv("ERP_PHASE1_V2_INVOICE_POST", "unset"),
    ERP_PHASE1_V2_WAREHOUSE_APPROVAL: getEnv("ERP_PHASE1_V2_WAREHOUSE_APPROVAL", "unset"),
    ERP_PHASE1_V2_PAYMENT: getEnv("ERP_PHASE1_V2_PAYMENT", "unset"),
    ERP_PHASE1_V2_RETURNS: getEnv("ERP_PHASE1_V2_RETURNS", "unset"),
  }

  const envEnabled = Object.entries(envFlags).filter(([, value]) => value === "true")
  report.checks.push({
    id: "runtime_flags_expected_off",
    passed: envEnabled.length === 0,
    severity: "critical",
    message: envEnabled.length === 0
      ? "No Phase 1 runtime flag is enabled in the current environment."
      : "One or more Phase 1 runtime flags are enabled. Keep them OFF until each gate passes.",
    data: envFlags,
  })

  if (!hasLiveEnv()) {
    report.ok = report.checks.every((check) => check.passed || check.severity !== "critical")
    return exitWithReport("phase1b-postchecks", report)
  }

  const supabase = createServiceClient()
  const companyContext = await resolveCompanyContext(supabase)
  const companyId = companyContext.companyId
  report.company = {
    id: companyId,
    name: companyContext.company?.name || null,
    resolution: companyContext.resolution,
  }

  printSection("Migration Contract Presence")
  const migrationSource = readLocalFile("supabase/migrations/20260406_002_enterprise_financial_phase1_v2.sql")
  const missingFunctions = requiredFunctions.filter((name) => !migrationSource.includes(`FUNCTION public.${name}`))

  report.checks.push({
    id: "required_v2_functions",
    passed: missingFunctions.length === 0,
    severity: "critical",
    message: missingFunctions.length === 0
      ? "All required Phase 1B functions exist in the migration contract."
      : "One or more required Phase 1B functions are missing in the migration contract.",
    data: { requiredFunctions, missingFunctions, source: "supabase/migrations/20260406_002_enterprise_financial_phase1_v2.sql" },
  })

  printSection("DB Trace Tables")
  const tableChecks = []
  for (const tableName of requiredTables) {
    const { error } = await supabase
      .from(tableName)
      .select("created_at", { count: "exact", head: true })
      .limit(1)

    tableChecks.push({
      tableName,
      ok: !error,
      error: error?.message || null,
    })
  }
  const missingTables = tableChecks.filter((item) => !item.ok).map((item) => item.tableName)
  report.checks.push({
    id: "trace_tables_exist",
    passed: missingTables.length === 0,
    severity: "critical",
    message: missingTables.length === 0
      ? "Financial trace tables are present."
      : "One or more financial trace tables are missing.",
    data: { requiredTables, missingTables, tableChecks },
  })

  printSection("Safe RPC Smoke Checks")
  const { data: openPeriods, error: periodsError } = await supabase
    .from("accounting_periods")
    .select("period_start, period_end")
    .eq("company_id", companyId)
    .or("is_locked.is.null,is_locked.eq.false")
    .not("status", "in", "(closed,locked,audit_lock)")
    .order("period_start", { ascending: false })
    .limit(1)

  if (periodsError) throw periodsError

  const effectiveDate = openPeriods?.[0]?.period_start || new Date().toISOString().slice(0, 10)

  const { error: guardError } = await supabase.rpc("require_open_financial_period_db", {
    p_company_id: companyId,
    p_effective_date: effectiveDate,
  })

  const { error: balanceError } = await supabase.rpc("assert_journal_entries_balanced_v2", {
    p_journal_entries: [
      {
        reference_type: "phase1b_smoke",
        reference_id: randomUuid(),
        entry_date: effectiveDate,
        lines: [
          { debit_amount: 10, credit_amount: 0 },
          { debit_amount: 0, credit_amount: 10 },
        ],
      },
    ],
  })

  const mutationSmokeChecks = []
  const smokeInvoiceId = randomUuid()
  const smokeCustomerId = randomUuid()
  const smokeUserId = randomUuid()
  const smokeCallInputs = [
    {
      fn: "process_invoice_payment_atomic_v2",
      args: {
        p_invoice_id: smokeInvoiceId,
        p_company_id: companyId,
        p_customer_id: smokeCustomerId,
        p_amount: 1,
        p_payment_date: effectiveDate,
        p_payment_method: "phase1b_smoke",
        p_user_id: smokeUserId,
        p_idempotency_key: `phase1b-smoke:${randomUuid()}`,
        p_request_hash: randomUuid(),
      },
      expectedErrorIncludes: "Invoice not found",
    },
  ]

  for (const item of smokeCallInputs) {
    const { error } = await supabase.rpc(item.fn, item.args)
    mutationSmokeChecks.push({
      functionName: item.fn,
      passed: !!error && error.message.includes(item.expectedErrorIncludes),
      error: error?.message || null,
      expectedErrorIncludes: item.expectedErrorIncludes,
    })
  }

  report.checks.push({
    id: "company_exists",
    passed: !!companyContext.company,
    severity: "critical",
    message: companyContext.company
      ? `Company ${companyContext.company.name || companyId} is reachable for post-migration validation.`
      : `Company ${companyId} is not reachable.`,
    data: companyContext.company || null,
  })

  report.checks.push({
    id: "safe_smoke_guard_rpc",
    passed: !guardError,
    severity: "critical",
    message: !guardError
      ? "require_open_financial_period_db executed successfully."
      : "require_open_financial_period_db did not execute successfully.",
    data: { effectiveDate, error: guardError?.message || null },
  })

  report.checks.push({
    id: "safe_smoke_balance_rpc",
    passed: !balanceError,
    severity: "critical",
    message: !balanceError
      ? "assert_journal_entries_balanced_v2 accepted a balanced payload."
      : "assert_journal_entries_balanced_v2 did not accept a balanced payload.",
    data: { effectiveDate, error: balanceError?.message || null },
  })

  report.checks.push({
    id: "mutation_wrapper_smoke",
    passed: mutationSmokeChecks.every((item) => item.passed),
    severity: "critical",
    message: mutationSmokeChecks.every((item) => item.passed)
      ? "Mutating Phase 1B wrappers responded with expected business-level validation errors."
      : "One or more mutating Phase 1B wrappers did not respond with the expected validation error.",
    data: mutationSmokeChecks,
  })

  report.ok = report.checks.every((check) => check.passed || check.severity !== "critical")
  exitWithReport("phase1b-postchecks", report)
}

run().catch((error) => {
  exitWithReport("phase1b-postchecks", {
    phase: "phase1b-postchecks",
    executedAt: new Date().toISOString(),
    ok: false,
    error: error.message,
  })
})
