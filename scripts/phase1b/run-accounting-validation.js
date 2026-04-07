const {
  createServiceClient,
  hasLiveEnv,
  printSection,
  resolveCompanyContext,
  exitWithReport,
} = require("./_shared")
const { loadApprovedFifoV2Baseline } = require("../phase1final/_shared")

async function run() {
  const report = {
    phase: "phase1b-accounting-validation",
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
      message: "Supabase live env is missing. Cannot execute accounting validation.",
    })
    return exitWithReport("phase1b-accounting-validation", report)
  }

  const supabase = createServiceClient()
  const companyContext = await resolveCompanyContext(supabase)
  const companyId = companyContext.companyId
  report.company = {
    id: companyId,
    name: companyContext.company?.name || null,
    resolution: companyContext.resolution,
  }

  printSection("Missing COGS")
  const { data: activeInvoices } = await supabase
    .from("invoices")
    .select("id")
    .eq("company_id", companyId)
    .in("status", ["sent", "paid", "partially_paid"])
    .is("deleted_at", null)

  const activeIds = (activeInvoices || []).map((item) => item.id)
  let invoicesWithoutCOGS = 0
  if (activeIds.length > 0) {
    const chunkSize = 100
    for (let i = 0; i < activeIds.length; i += chunkSize) {
      const chunk = activeIds.slice(i, i + chunkSize)
      const { data: cogsJournals } = await supabase
        .from("journal_entries")
        .select("reference_id")
        .eq("company_id", companyId)
        .eq("reference_type", "invoice_cogs")
        .in("reference_id", chunk)
        .eq("status", "posted")
      const cogsSet = new Set((cogsJournals || []).map((j) => j.reference_id))
      invoicesWithoutCOGS += chunk.filter((id) => !cogsSet.has(id)).length
    }
  }

  report.checks.push({
    id: "missing_cogs",
    passed: invoicesWithoutCOGS === 0,
    severity: "critical",
    message: invoicesWithoutCOGS === 0
      ? `All ${activeIds.length} active invoices have posted COGS entries.`
      : `${invoicesWithoutCOGS} active invoice(s) are missing COGS entries.`,
    data: { activeInvoices: activeIds.length, invoicesWithoutCOGS },
  })

  printSection("Unbalanced Entries")
  const { data: unbalancedRpc, error: unbalancedRpcError } = await supabase.rpc(
    "find_unbalanced_journal_entries",
    { p_company_id: companyId }
  )

  let unbalancedCount = 0
  let unbalancedSample = []
  if (!unbalancedRpcError && unbalancedRpc != null) {
    unbalancedCount = unbalancedRpc.length
    unbalancedSample = unbalancedRpc.slice(0, 10)
  } else {
    const { data: jeIds } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .or("is_deleted.is.null,is_deleted.eq.false")
      .is("deleted_at", null)

    const allIds = (jeIds || []).map((row) => row.id)
    const chunkSize = 200
    for (let i = 0; i < allIds.length; i += chunkSize) {
      const chunk = allIds.slice(i, i + chunkSize)
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select("journal_entry_id, debit_amount, credit_amount")
        .in("journal_entry_id", chunk)

      const totals = {}
      for (const line of lines || []) {
        const id = line.journal_entry_id
        if (!totals[id]) totals[id] = { debit: 0, credit: 0 }
        totals[id].debit += Number(line.debit_amount || 0)
        totals[id].credit += Number(line.credit_amount || 0)
      }

      for (const [id, total] of Object.entries(totals)) {
        const difference = Math.abs(total.debit - total.credit)
        if (difference > 0.01) {
          unbalancedCount += 1
          if (unbalancedSample.length < 10) {
            unbalancedSample.push({
              journal_entry_id: id,
              total_debit: total.debit,
              total_credit: total.credit,
              difference,
            })
          }
        }
      }
    }
  }

  report.checks.push({
    id: "unbalanced_entries",
    passed: unbalancedCount === 0,
    severity: "critical",
    message: unbalancedCount === 0
      ? "All posted journal entries are balanced."
      : `${unbalancedCount} posted journal entry(ies) are unbalanced.`,
    data: { unbalancedCount, sample: unbalancedSample },
  })

  printSection("Duplicate Journals")
  const { data: journals } = await supabase
    .from("journal_entries")
    .select("reference_type, reference_id")
    .eq("company_id", companyId)
    .or("is_deleted.is.null,is_deleted.eq.false")
    .is("deleted_at", null)
    .not("reference_type", "is", null)
    .not("reference_id", "is", null)

  const counts = {}
  for (const journal of journals || []) {
    const key = `${journal.reference_type}::${journal.reference_id}`
    counts[key] = (counts[key] || 0) + 1
  }
  const duplicateKeys = Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }))

  report.checks.push({
    id: "duplicate_journals",
    passed: duplicateKeys.length === 0,
    severity: "critical",
    message: duplicateKeys.length === 0
      ? "No duplicate journal references were found."
      : `${duplicateKeys.length} duplicated journal reference(s) were found.`,
    data: { duplicateCount: duplicateKeys.length, sample: duplicateKeys.slice(0, 10) },
  })

  printSection("Inventory Mismatch")
  const approvedBaseline = loadApprovedFifoV2Baseline(companyId)
  const { data: inventoryAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id, sub_type, account_name, account_code, is_active")
    .eq("company_id", companyId)

  const inventoryAccountIds = (inventoryAccounts || [])
    .filter((account) => {
      const subType = String(account.sub_type || "").trim().toLowerCase()
      const accountName = String(account.account_name || "").trim().toLowerCase()
      return (
        account.is_active !== false &&
        (
          subType === "inventory" ||
          subType === "stock" ||
          accountName.includes("inventory") ||
          accountName.includes("مخزون") ||
          accountName.includes("stock")
        )
      )
    })
    .map((a) => a.id)
  let glInventoryValue = 0

  if (inventoryAccountIds.length > 0) {
    const { data: postedEntries } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .or("is_deleted.is.null,is_deleted.eq.false")
      .is("deleted_at", null)

    const postedIds = (postedEntries || []).map((entry) => entry.id)
    if (postedIds.length > 0) {
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount")
        .in("journal_entry_id", postedIds)
        .in("account_id", inventoryAccountIds)

      for (const line of lines || []) {
        glInventoryValue += Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
      }
    }
  }

  const { data: fifoLots } = await supabase
    .from("fifo_cost_lots")
    .select("remaining_quantity, unit_cost, product_id")
    .eq("company_id", companyId)
    .gt("remaining_quantity", 0)

  let legacyFifoInventoryValue = 0
  for (const lot of fifoLots || []) {
    legacyFifoInventoryValue += Number(lot.remaining_quantity || 0) * Number(lot.unit_cost || 0)
  }

  const fifoInventoryValue = approvedBaseline
    ? Number(approvedBaseline.fifoTruthValue || 0)
    : legacyFifoInventoryValue

  const inventoryDiff = Math.abs(glInventoryValue - fifoInventoryValue)
  const tolerance = Math.max(fifoInventoryValue * 0.005, 1)
  report.checks.push({
    id: "inventory_mismatch",
    passed: inventoryDiff <= tolerance,
    severity: "critical",
    message: inventoryDiff <= tolerance
      ? "Inventory GL matches FIFO valuation within tolerance."
      : "Inventory GL does not match FIFO valuation.",
    data: {
      glInventoryValue,
      fifoInventoryValue,
      difference: inventoryDiff,
      tolerance,
      truthSource: approvedBaseline ? approvedBaseline.source : "legacy_fifo_cost_lots",
      truthReportPath: approvedBaseline ? approvedBaseline.reportPath : null,
      legacyFifoInventoryValue,
      legacyFifoLotsCount: (fifoLots || []).length,
    },
  })

  report.ok = report.checks.every((check) => check.passed || check.severity !== "critical")
  exitWithReport("phase1b-accounting-validation", report)
}

run().catch((error) => {
  exitWithReport("phase1b-accounting-validation", {
    phase: "phase1b-accounting-validation",
    executedAt: new Date().toISOString(),
    ok: false,
    error: error.message,
  })
})
