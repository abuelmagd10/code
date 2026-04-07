const {
  createServiceClient,
  exitWithReport,
  hasLiveEnv,
  loadJsonFile,
  parseJsonEnv,
  printSection,
  resolveCompanyContext,
  snapshotInvoiceLifecycle,
} = require("./_shared")

function loadTargets() {
  const inline = parseJsonEnv("PHASE1B_TRACE_TARGETS_JSON")
  if (inline) {
    return Array.isArray(inline) ? inline : inline.targets || []
  }

  const scenariosFile = process.env.PHASE1B_SCENARIOS_FILE
  if (scenariosFile) {
    const data = loadJsonFile(scenariosFile)
    const scenarios = Array.isArray(data) ? data : data.scenarios || []
    return scenarios.map((scenario) => ({
      name: scenario.name || scenario.type || null,
      type: scenario.type || null,
      invoiceId: scenario.right?.invoiceId || scenario.v2InvoiceId,
      companyId: scenario.right?.companyId || scenario.v2CompanyId || null,
      expectedEvents: scenario.expectedEvents || null,
    })).filter((item) => !!item.invoiceId)
  }

  const invoiceId = process.env.PHASE1B_TRACE_INVOICE_ID
  if (!invoiceId) {
    throw new Error("Provide PHASE1B_TRACE_INVOICE_ID, PHASE1B_TRACE_TARGETS_JSON, or PHASE1B_SCENARIOS_FILE for trace audit.")
  }

  return [{
    name: "single-trace-audit",
    invoiceId,
    companyId: process.env.PHASE1B_TRACE_COMPANY_ID || null,
    expectedEvents: null,
  }]
}

function deriveExpectedEvents(snapshot) {
  const events = new Set()
  if (snapshot.invoice?.status && snapshot.invoice.status !== "draft") {
    events.add("invoice_posting")
  }
  if (
    snapshot.invoice?.warehouse_status === "approved" ||
    (snapshot.thirdPartyInventory || []).length > 0 ||
    (snapshot.cogs || []).some((item) => item.source_id === snapshot.invoice.id)
  ) {
    events.add("warehouse_approval")
  }
  if ((snapshot.payments || []).length > 0 || Number(snapshot.invoice?.paid_amount || 0) > 0) {
    events.add("invoice_payment")
  }
  if ((snapshot.salesReturns || []).length > 0 || Number(snapshot.invoice?.returned_amount || 0) > 0) {
    events.add("return")
  }
  return Array.from(events)
}

function linksByTransaction(snapshot) {
  const grouped = {}
  for (const link of snapshot.traceLinks || []) {
    if (!grouped[link.transaction_id]) grouped[link.transaction_id] = []
    grouped[link.transaction_id].push(link)
  }
  return grouped
}

async function run() {
  const report = {
    phase: "phase1b-trace-audit",
    executedAt: new Date().toISOString(),
    mode: hasLiveEnv() ? "live" : "static",
    ok: true,
    checks: [],
    targets: [],
  }

  if (!hasLiveEnv()) {
    report.ok = false
    report.checks.push({
      id: "env",
      passed: false,
      severity: "critical",
      message: "Supabase live env is missing. Cannot execute trace audit.",
    })
    return exitWithReport("phase1b-trace-audit", report)
  }

  const targets = loadTargets()
  const supabase = createServiceClient()
  const companyContext = await resolveCompanyContext(supabase)
  report.company = {
    id: companyContext.companyId,
    name: companyContext.company?.name || null,
    resolution: companyContext.resolution,
  }

  for (const target of targets) {
    const companyId = target.companyId || companyContext.companyId
    printSection(`Trace Audit: ${target.name || target.invoiceId}`)

    const snapshot = await snapshotInvoiceLifecycle(supabase, companyId, target.invoiceId)
    const expectedEvents = target.expectedEvents || deriveExpectedEvents(snapshot)
    const groupedLinks = linksByTransaction(snapshot)
    const traces = snapshot.traces || []
    const traceRowsByEvent = {}
    for (const trace of traces) {
      if (!traceRowsByEvent[trace.event_type]) traceRowsByEvent[trace.event_type] = []
      traceRowsByEvent[trace.event_type].push(trace)
    }

    const eventChecks = expectedEvents.map((eventType) => {
      const eventTraces = traceRowsByEvent[eventType] || []
      const hasTrace = eventTraces.length > 0
      let hasInvoiceSourceLink = false
      let hasEventSpecificLink = false

      for (const trace of eventTraces) {
        const links = groupedLinks[trace.transaction_id] || []
        if (links.some((link) => link.entity_type === "invoice" && link.entity_id === target.invoiceId)) {
          hasInvoiceSourceLink = true
        }

        if (eventType === "invoice_payment") {
          hasEventSpecificLink = hasEventSpecificLink || links.some((link) => link.entity_type === "payment")
        } else if (eventType === "warehouse_approval") {
          hasEventSpecificLink = hasEventSpecificLink || links.some((link) => (
            link.entity_type === "third_party_inventory" || link.entity_type === "journal_entry"
          ))
        } else if (eventType === "return") {
          hasEventSpecificLink = hasEventSpecificLink || links.some((link) => (
            link.entity_type === "sales_return" || link.entity_type === "customer_credit_ledger"
          ))
        } else {
          hasEventSpecificLink = hasEventSpecificLink || links.some((link) => link.entity_type === "journal_entry")
        }
      }

      return {
        eventType,
        passed: hasTrace && hasInvoiceSourceLink && hasEventSpecificLink,
        traceCount: eventTraces.length,
        hasTrace,
        hasInvoiceSourceLink,
        hasEventSpecificLink,
      }
    })

    const danglingTraceIds = traces
      .filter((trace) => {
        const links = groupedLinks[trace.transaction_id] || []
        return links.length === 0
      })
      .map((trace) => trace.transaction_id)

    const targetOk = eventChecks.every((item) => item.passed) && danglingTraceIds.length === 0
    report.targets.push({
      name: target.name || null,
      type: target.type || null,
      companyId,
      invoiceId: target.invoiceId,
      ok: targetOk,
      invoiceStatus: snapshot.invoice?.status || null,
      warehouseStatus: snapshot.invoice?.warehouse_status || null,
      expectedEvents,
      eventChecks,
      traceCount: traces.length,
      traceLinkCount: (snapshot.traceLinks || []).length,
      danglingTraceIds,
    })
  }

  report.ok = report.targets.every((target) => target.ok)
  exitWithReport("phase1b-trace-audit", report)
}

run().catch((error) => {
  exitWithReport("phase1b-trace-audit", {
    phase: "phase1b-trace-audit",
    executedAt: new Date().toISOString(),
    ok: false,
    error: error.message,
  })
})
