const {
  createServiceClient,
  hasLiveEnv,
  printSection,
  resolveCompanyContext,
  exitWithReport,
} = require("./_shared")

async function run() {
  const report = {
    phase: "phase1b-prechecks",
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
      message: "Supabase live env is missing. Set PHASE1B_COMPANY_ID, SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY.",
    })
    return exitWithReport("phase1b-prechecks", report)
  }

  const supabase = createServiceClient()
  const companyContext = await resolveCompanyContext(supabase)
  const companyId = companyContext.companyId
  report.company = {
    id: companyId,
    name: companyContext.company?.name || null,
    resolution: companyContext.resolution,
  }

  printSection("Active Financial Period Coverage")
  const today = new Date().toISOString().slice(0, 10)
  const { data: activePeriod, error: activePeriodError } = await supabase
    .from("accounting_periods")
    .select("id, period_name, period_start, period_end, status, is_locked")
    .eq("company_id", companyId)
    .lte("period_start", today)
    .gte("period_end", today)
    .limit(1)
    .maybeSingle()

  if (activePeriodError) throw activePeriodError

  report.checks.push({
    id: "active_period_today",
    passed: !!activePeriod && !activePeriod.is_locked && !["closed", "locked", "audit_lock"].includes(activePeriod.status),
    severity: "critical",
    message: activePeriod
      ? `Current date ${today} is covered by open period ${activePeriod.period_name || activePeriod.id}.`
      : `No active accounting period covers ${today}.`,
    data: activePeriod || null,
  })

  printSection("Financial Date Coverage")
  const uncovered = []

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, status, customer_id, sales_order_id")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", ["draft", "sent", "paid", "partially_paid", "partially_returned", "fully_returned"])

  const { data: periods } = await supabase
    .from("accounting_periods")
    .select("id, period_name, period_start, period_end, status, is_locked")
    .eq("company_id", companyId)

  const periodRows = periods || []
  for (const invoice of invoices || []) {
    const covered = periodRows.some((period) =>
      invoice.invoice_date >= period.period_start &&
      invoice.invoice_date <= period.period_end
    )
    if (!covered) {
      uncovered.push({
        entity: "invoice",
        id: invoice.id,
        reference: invoice.invoice_number,
        date: invoice.invoice_date,
      })
    }
  }

  report.checks.push({
    id: "financial_dates_covered",
    passed: uncovered.length === 0,
    severity: "critical",
    message: uncovered.length === 0
      ? `All ${invoices?.length || 0} invoice dates are covered by accounting periods.`
      : `${uncovered.length} invoice date(s) are not covered by accounting periods.`,
    data: { uncovered: uncovered.slice(0, 20), count: uncovered.length },
  })

  printSection("Orphan Invoice References")
  const [{ data: customers }, { data: salesOrders }] = await Promise.all([
    supabase.from("customers").select("id").eq("company_id", companyId),
    supabase.from("sales_orders").select("id").eq("company_id", companyId),
  ])

  const customerIds = new Set((customers || []).map((item) => item.id))
  const salesOrderIds = new Set((salesOrders || []).map((item) => item.id))

  const orphanInvoices = (invoices || []).filter((invoice) => {
    if (invoice.customer_id && !customerIds.has(invoice.customer_id)) return true
    if (invoice.sales_order_id && !salesOrderIds.has(invoice.sales_order_id)) return true
    return false
  }).map((invoice) => ({
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    customer_id: invoice.customer_id,
    sales_order_id: invoice.sales_order_id,
  }))

  report.checks.push({
    id: "orphan_invoices",
    passed: orphanInvoices.length === 0,
    severity: "critical",
    message: orphanInvoices.length === 0
      ? "No orphan invoice references detected."
      : `${orphanInvoices.length} orphan invoice reference(s) detected.`,
    data: { sample: orphanInvoices.slice(0, 20), count: orphanInvoices.length },
  })

  printSection("Inventory Consistency")
  const { data: inventoryAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("company_id", companyId)
    .in("sub_type", ["inventory", "stock"])
    .eq("is_active", true)

  const inventoryAccountIds = (inventoryAccounts || []).map((a) => a.id)
  let glInventoryValue = 0

  if (inventoryAccountIds.length > 0) {
    const { data: postedInventoryEntries } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .or("is_deleted.is.null,is_deleted.eq.false")
      .is("deleted_at", null)

    const postedIds = (postedInventoryEntries || []).map((row) => row.id)
    if (postedIds.length > 0) {
      const { data: inventoryLines } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount")
        .in("journal_entry_id", postedIds)
        .in("account_id", inventoryAccountIds)

      for (const line of inventoryLines || []) {
        glInventoryValue += Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
      }
    }
  }

  const { data: fifoLots } = await supabase
    .from("fifo_cost_lots")
    .select("remaining_quantity, unit_cost, product_id")
    .eq("company_id", companyId)
    .gt("remaining_quantity", 0)

  let fifoInventoryValue = 0
  for (const lot of fifoLots || []) {
    fifoInventoryValue += Number(lot.remaining_quantity || 0) * Number(lot.unit_cost || 0)
  }

  const diff = Math.abs(glInventoryValue - fifoInventoryValue)
  const tolerance = Math.max(fifoInventoryValue * 0.005, 1)
  report.checks.push({
    id: "inventory_gl_vs_fifo",
    passed: diff <= tolerance,
    severity: "critical",
    message: diff <= tolerance
      ? `Inventory GL matches FIFO within tolerance.`
      : `Inventory mismatch detected between GL and FIFO.`,
    data: { glInventoryValue, fifoInventoryValue, difference: diff, tolerance },
  })

  report.ok = report.checks.every((check) => check.passed || check.severity !== "critical")
  exitWithReport("phase1b-prechecks", report)
}

run().catch((error) => {
  exitWithReport("phase1b-prechecks", {
    phase: "phase1b-prechecks",
    executedAt: new Date().toISOString(),
    ok: false,
    error: error.message,
  })
})
