const fs = require("fs")
const path = require("path")
const {
  createServiceClient,
  exitWithReport,
  getEnv,
  hasLiveEnv,
  printSection,
  resolveCompanyContext,
} = require("./_shared")

const ZERO_UUID = "00000000-0000-0000-0000-000000000000"

function isMissingFunctionError(message) {
  return /Could not find the function|schema cache/i.test(message || "")
}

function isExistingBusinessGuard(message) {
  return /NO_ACTIVE_FINANCIAL_PERIOD|FINANCIAL_PERIOD_LOCKED|INVOICE_NOT_FOUND|DUPLICATE_PAYMENT|NO_BRANCH/i.test(message || "")
}

async function probeRpc(supabase, rpcName, args, options = {}) {
  const { data, error } = await supabase.rpc(rpcName, args)

  if (!error) {
    return {
      rpcName,
      reachable: true,
      passed: true,
      message: options.successMessage || `${rpcName} is reachable from the API layer.`,
      data: data ?? null,
    }
  }

  const message = error.message || String(error)
  if (isMissingFunctionError(message)) {
    return {
      rpcName,
      reachable: false,
      passed: false,
      severity: "critical",
      message,
      classification: "schema_cache_or_migration_missing",
    }
  }

  if (isExistingBusinessGuard(message)) {
    return {
      rpcName,
      reachable: true,
      passed: true,
      severity: "info",
      message,
      classification: "reachable_blocked_by_business_guard",
    }
  }

  return {
    rpcName,
    reachable: true,
    passed: false,
    severity: "critical",
    message,
    classification: "reachable_unexpected_error",
  }
}

async function run() {
  const report = {
    phase: "phase1c-deployment-integrity",
    executedAt: new Date().toISOString(),
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
      message: "Supabase live env is missing. Cannot validate deployment integrity.",
    })
    return exitWithReport("phase1c-deployment-integrity", report)
  }

  const supabase = createServiceClient()
  const companyContext = await resolveCompanyContext(supabase)
  const companyId = companyContext.companyId
  const today = new Date().toISOString().slice(0, 10)

  report.company = {
    id: companyId,
    name: companyContext.company?.name || null,
    resolution: companyContext.resolution,
  }

  printSection("Required V2 RPC Reachability")
  const guardProbe = await probeRpc(supabase, "require_open_financial_period_db", {
    p_company_id: companyId,
    p_effective_date: today,
  })
  const balanceProbe = await probeRpc(supabase, "assert_journal_entries_balanced_v2", {
    p_journal_entries: [
      {
        reference_type: "phase1c_probe",
        reference_id: ZERO_UUID,
        entry_date: today,
        lines: [
          { debit_amount: 10, credit_amount: 0 },
          { debit_amount: 0, credit_amount: 10 },
        ],
      },
    ],
  })
  const paymentProbe = await probeRpc(supabase, "process_invoice_payment_atomic_v2", {
    p_invoice_id: ZERO_UUID,
    p_company_id: companyId,
    p_customer_id: ZERO_UUID,
    p_amount: 1,
    p_payment_date: today,
    p_payment_method: "cash",
    p_reference_number: "phase1c-probe",
    p_notes: "Phase 1C deployment integrity probe",
    p_account_id: null,
    p_branch_id: null,
    p_cost_center_id: null,
    p_warehouse_id: null,
    p_user_id: ZERO_UUID,
    p_idempotency_key: null,
    p_request_hash: null,
  })

  report.checks.push(
    {
      id: "require_open_financial_period_db",
      passed: guardProbe.passed,
      severity: guardProbe.severity || "critical",
      message: guardProbe.message,
      data: guardProbe,
    },
    {
      id: "assert_journal_entries_balanced_v2",
      passed: balanceProbe.passed,
      severity: balanceProbe.severity || "critical",
      message: balanceProbe.message,
      data: balanceProbe,
    },
    {
      id: "process_invoice_payment_atomic_v2",
      passed: paymentProbe.passed,
      severity: paymentProbe.severity || "critical",
      message: paymentProbe.message,
      data: paymentProbe,
    }
  )

  printSection("Workspace Apply Capability")
  const hasSupabaseConfig = fs.existsSync(path.join(process.cwd(), "supabase", "config.toml"))
  const hasDirectDbUrl = !!(getEnv("SUPABASE_DB_URL") || getEnv("DATABASE_URL") || getEnv("PGHOST"))
  const { error: execSqlError } = await supabase.rpc("exec_sql", { sql_query: "SELECT 1;" })
  const execSqlReachable = !execSqlError

  report.checks.push({
    id: "workspace_sql_apply_path",
    passed: execSqlReachable || hasDirectDbUrl,
    severity: "critical",
    message: execSqlReachable || hasDirectDbUrl
      ? "A workspace-driven SQL apply path exists."
      : "No workspace-driven SQL apply path was found. Use Supabase SQL Editor or direct Postgres access, then reload PostgREST schema cache.",
    data: {
      execSqlReachable,
      execSqlError: execSqlError?.message || null,
      hasSupabaseConfig,
      hasDirectDbUrl,
      requiredManualSteps: [
        "Apply supabase/migrations/20260406_002_enterprise_financial_phase1_v2.sql",
        "Execute: NOTIFY pgrst, 'reload schema';",
        "Re-run npm run phase1c:deployment",
      ],
    },
  })

  report.ok = report.checks.every((check) => check.passed || check.severity !== "critical")
  exitWithReport("phase1c-deployment-integrity", report)
}

run().catch((error) => {
  exitWithReport("phase1c-deployment-integrity", {
    phase: "phase1c-deployment-integrity",
    executedAt: new Date().toISOString(),
    ok: false,
    error: error.message,
  })
})
