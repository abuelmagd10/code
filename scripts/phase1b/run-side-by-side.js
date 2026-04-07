const {
  businessFunctionalShape,
  compareFunctionalSnapshots,
  createServiceClient,
  exitWithReport,
  hasLiveEnv,
  loadJsonFile,
  parseJsonEnv,
  printSection,
  resolveCompanyContext,
  snapshotInvoiceLifecycle,
} = require("./_shared")

const REQUIRED_SCENARIO_TYPES = [
  "invoice_payment",
  "invoice_warehouse_payment",
  "partial_payment",
  "sales_return_full",
  "sales_return_partial",
]

const ALLOWED_INTERNAL_DIFFERENCE_KEYS = [
  "cogsTransactionsCount",
  "inventoryTransactionCount",
  "journalTypes",
  "traceCount",
  "traceLinkCount",
]

function loadScenarios() {
  const inline = parseJsonEnv("PHASE1B_SCENARIOS_JSON")
  if (inline) {
    return Array.isArray(inline) ? inline : inline.scenarios || []
  }

  const filePath = process.env.PHASE1B_SCENARIOS_FILE
  if (!filePath) {
    throw new Error("Provide PHASE1B_SCENARIOS_FILE or PHASE1B_SCENARIOS_JSON for side-by-side verification.")
  }

  const fileData = loadJsonFile(filePath)
  return Array.isArray(fileData) ? fileData : fileData.scenarios || []
}

async function run() {
  const report = {
    phase: "phase1b-side-by-side",
    executedAt: new Date().toISOString(),
    mode: hasLiveEnv() ? "live" : "static",
    ok: true,
    checks: [],
    scenarios: [],
  }

  if (!hasLiveEnv()) {
    report.ok = false
    report.checks.push({
      id: "env",
      passed: false,
      severity: "critical",
      message: "Supabase live env is missing. Cannot execute side-by-side verification.",
    })
    return exitWithReport("phase1b-side-by-side", report)
  }

  const scenarios = loadScenarios()
  if (scenarios.length === 0) {
    report.ok = false
    report.checks.push({
      id: "scenario_input",
      passed: false,
      severity: "critical",
      message: "No scenarios were provided for side-by-side verification.",
    })
    return exitWithReport("phase1b-side-by-side", report)
  }

  const supabase = createServiceClient()
  const companyContext = await resolveCompanyContext(supabase)
  report.company = {
    id: companyContext.companyId,
    name: companyContext.company?.name || null,
    resolution: companyContext.resolution,
  }

  const presentTypes = new Set()
  for (const scenario of scenarios) {
    if (scenario.type) {
      presentTypes.add(scenario.type)
    }
  }

  const missingScenarioTypes = REQUIRED_SCENARIO_TYPES.filter((type) => !presentTypes.has(type))
  report.checks.push({
    id: "required_scenarios_present",
    passed: missingScenarioTypes.length === 0,
    severity: "critical",
    message: missingScenarioTypes.length === 0
      ? "All required side-by-side scenario types are present."
      : "One or more required side-by-side scenario types are missing.",
    data: { required: REQUIRED_SCENARIO_TYPES, missing: missingScenarioTypes },
  })

  const businessKeys = Object.keys(businessFunctionalShape({
    invoice: {},
    payments: [],
    journals: [],
    cogs: [],
    inventoryTransactions: [],
    thirdPartyInventory: [],
    salesReturns: [],
    traces: [],
    traceLinks: [],
  }))

  for (const scenario of scenarios) {
    printSection(`Scenario: ${scenario.name || scenario.type || scenario.left?.invoiceId || "unnamed"}`)

    const leftInvoiceId = scenario.left?.invoiceId || scenario.v1InvoiceId
    const rightInvoiceId = scenario.right?.invoiceId || scenario.v2InvoiceId
    if (!leftInvoiceId || !rightInvoiceId) {
      report.scenarios.push({
        name: scenario.name || null,
        type: scenario.type || null,
        ok: false,
        error: "Each scenario must provide left/right invoice IDs (or v1InvoiceId/v2InvoiceId).",
      })
      continue
    }

    const leftCompanyId = scenario.left?.companyId || scenario.v1CompanyId || companyContext.companyId
    const rightCompanyId = scenario.right?.companyId || scenario.v2CompanyId || companyContext.companyId

    const leftSnapshot = await snapshotInvoiceLifecycle(supabase, leftCompanyId, leftInvoiceId)
    const rightSnapshot = await snapshotInvoiceLifecycle(supabase, rightCompanyId, rightInvoiceId)

    const businessCompare = compareFunctionalSnapshots(leftSnapshot, rightSnapshot, { mode: "business" })
    const fullCompare = compareFunctionalSnapshots(leftSnapshot, rightSnapshot, { mode: "full" })
    const unexpectedInternalDiffs = fullCompare.diffs.filter((diff) => {
      if (businessKeys.includes(diff.key)) return false
      return !ALLOWED_INTERNAL_DIFFERENCE_KEYS.includes(diff.key)
    })

    const scenarioOk = businessCompare.ok && unexpectedInternalDiffs.length === 0

    report.scenarios.push({
      name: scenario.name || null,
      type: scenario.type || null,
      ok: scenarioOk,
      left: {
        companyId: leftCompanyId,
        invoiceId: leftInvoiceId,
        shape: businessCompare.left,
      },
      right: {
        companyId: rightCompanyId,
        invoiceId: rightInvoiceId,
        shape: businessCompare.right,
      },
      businessCompare,
      allowedInternalDifferenceKeys: ALLOWED_INTERNAL_DIFFERENCE_KEYS,
      unexpectedInternalDiffs,
      accountingDiffs: fullCompare.diffs,
      notes: scenario.notes || null,
    })
  }

  report.ok = report.checks.every((check) => check.passed || check.severity !== "critical")
    && report.scenarios.every((scenario) => scenario.ok)

  exitWithReport("phase1b-side-by-side", report)
}

run().catch((error) => {
  exitWithReport("phase1b-side-by-side", {
    phase: "phase1b-side-by-side",
    executedAt: new Date().toISOString(),
    ok: false,
    error: error.message,
  })
})
