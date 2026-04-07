const {
  createServiceClient,
  exitWithReport,
  hasLiveEnv,
  loadJsonFile,
  parseJsonEnv,
  printSection,
  randomUuid,
  resolveCompanyContext,
  snapshotInvoiceLifecycle,
  timed,
} = require("./_shared")

const DEFAULT_THRESHOLDS = {
  guardRpcMs: 500,
  balanceRpcMs: 500,
  fifoQueryMs: 1500,
  traceLookupMs: 500,
  lifecycleSnapshotMs: 1500,
}

function loadTargets() {
  const inline = parseJsonEnv("PHASE1B_PERF_TARGETS_JSON")
  if (inline) {
    return Array.isArray(inline) ? inline : inline.targets || []
  }

  const scenariosFile = process.env.PHASE1B_SCENARIOS_FILE
  if (!scenariosFile) return []

  const data = loadJsonFile(scenariosFile)
  const scenarios = Array.isArray(data) ? data : data.scenarios || []
  return scenarios.flatMap((scenario) => {
    const targets = []
    if (scenario.left?.invoiceId || scenario.v1InvoiceId) {
      targets.push({
        name: `${scenario.name || scenario.type || "scenario"}:left`,
        invoiceId: scenario.left?.invoiceId || scenario.v1InvoiceId,
        companyId: scenario.left?.companyId || scenario.v1CompanyId || null,
      })
    }
    if (scenario.right?.invoiceId || scenario.v2InvoiceId) {
      targets.push({
        name: `${scenario.name || scenario.type || "scenario"}:right`,
        invoiceId: scenario.right?.invoiceId || scenario.v2InvoiceId,
        companyId: scenario.right?.companyId || scenario.v2CompanyId || null,
      })
    }
    return targets
  })
}

async function run() {
  const report = {
    phase: "phase1b-performance-check",
    executedAt: new Date().toISOString(),
    mode: hasLiveEnv() ? "live" : "static",
    ok: true,
    thresholds: DEFAULT_THRESHOLDS,
    timings: [],
    warnings: [],
  }

  if (!hasLiveEnv()) {
    report.ok = false
    report.warnings.push("Supabase live env is missing. Cannot execute performance sanity check.")
    return exitWithReport("phase1b-performance-check", report)
  }

  const supabase = createServiceClient()
  const companyContext = await resolveCompanyContext(supabase)
  const companyId = companyContext.companyId
  report.company = {
    id: companyId,
    name: companyContext.company?.name || null,
    resolution: companyContext.resolution,
  }

  const { data: periods } = await supabase
    .from("accounting_periods")
    .select("period_start")
    .eq("company_id", companyId)
    .or("is_locked.is.null,is_locked.eq.false")
    .not("status", "in", "(closed,locked,audit_lock)")
    .order("period_start", { ascending: false })
    .limit(1)

  const effectiveDate = periods?.[0]?.period_start || new Date().toISOString().slice(0, 10)

  printSection("RPC Timing")
  report.timings.push(await timed("require_open_financial_period_db", async () => {
    const { error } = await supabase.rpc("require_open_financial_period_db", {
      p_company_id: companyId,
      p_effective_date: effectiveDate,
    })
    if (error) throw error
    return { effectiveDate }
  }))

  report.timings.push(await timed("assert_journal_entries_balanced_v2", async () => {
    const { error } = await supabase.rpc("assert_journal_entries_balanced_v2", {
      p_journal_entries: [
        {
          reference_type: "phase1b_perf",
          reference_id: randomUuid(),
          entry_date: effectiveDate,
          lines: [
            { debit_amount: 10, credit_amount: 0 },
            { debit_amount: 0, credit_amount: 10 },
          ],
        },
      ],
    })
    if (error) throw error
    return { effectiveDate }
  }))

  printSection("FIFO and Trace Timing")
  report.timings.push(await timed("fifo_cost_lots_summary", async () => {
    const { data, error } = await supabase
      .from("fifo_cost_lots")
      .select("remaining_quantity, unit_cost, product_id")
      .eq("company_id", companyId)
      .gt("remaining_quantity", 0)
      .limit(1000)

    if (error) throw error
    return { rows: (data || []).length }
  }))

  report.timings.push(await timed("financial_trace_lookup", async () => {
    const { count, error } = await supabase
      .from("financial_operation_traces")
      .select("transaction_id", { count: "exact", head: true })
      .eq("company_id", companyId)

    if (error) throw error
    return { count }
  }))

  const targets = loadTargets()
  for (const target of targets) {
    printSection(`Lifecycle Snapshot Timing: ${target.name || target.invoiceId}`)
    report.timings.push(await timed(`snapshot:${target.name || target.invoiceId}`, async () => {
      const snapshot = await snapshotInvoiceLifecycle(
        supabase,
        target.companyId || companyId,
        target.invoiceId
      )
      return {
        invoiceId: target.invoiceId,
        companyId: target.companyId || companyId,
        payments: (snapshot.payments || []).length,
        traces: (snapshot.traces || []).length,
      }
    }))
  }

  for (const timing of report.timings) {
    const label = timing.label
    const ms = timing.durationMs
    if (label === "require_open_financial_period_db" && ms > DEFAULT_THRESHOLDS.guardRpcMs) {
      report.warnings.push(`${label} exceeded ${DEFAULT_THRESHOLDS.guardRpcMs}ms: ${ms}ms`)
    }
    if (label === "assert_journal_entries_balanced_v2" && ms > DEFAULT_THRESHOLDS.balanceRpcMs) {
      report.warnings.push(`${label} exceeded ${DEFAULT_THRESHOLDS.balanceRpcMs}ms: ${ms}ms`)
    }
    if (label === "fifo_cost_lots_summary" && ms > DEFAULT_THRESHOLDS.fifoQueryMs) {
      report.warnings.push(`${label} exceeded ${DEFAULT_THRESHOLDS.fifoQueryMs}ms: ${ms}ms`)
    }
    if (label === "financial_trace_lookup" && ms > DEFAULT_THRESHOLDS.traceLookupMs) {
      report.warnings.push(`${label} exceeded ${DEFAULT_THRESHOLDS.traceLookupMs}ms: ${ms}ms`)
    }
    if (label.startsWith("snapshot:") && ms > DEFAULT_THRESHOLDS.lifecycleSnapshotMs) {
      report.warnings.push(`${label} exceeded ${DEFAULT_THRESHOLDS.lifecycleSnapshotMs}ms: ${ms}ms`)
    }
  }

  report.ok = report.warnings.length === 0
  exitWithReport("phase1b-performance-check", report)
}

run().catch((error) => {
  exitWithReport("phase1b-performance-check", {
    phase: "phase1b-performance-check",
    executedAt: new Date().toISOString(),
    ok: false,
    error: error.message,
  })
})
