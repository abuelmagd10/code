const {
  chunk,
  createServiceClient,
  endOfMonth,
  enumerateMonths,
  exitWithReport,
  hasLiveEnv,
  printSection,
  resolveCompanyContext,
  startOfMonth,
  toIsoDate,
  toUtcDate,
} = require("./_shared")

const APPLY = process.argv.includes("--apply") || process.env.PHASE1C_APPLY === "1"
const FORCE = process.argv.includes("--force") || process.env.PHASE1C_FORCE === "1"
const REMEDIATION_NOTE = `Phase 1C remediation bootstrap created on ${new Date().toISOString().slice(0, 10)}`

const SOURCES = [
  {
    id: "invoices",
    table: "invoices",
    dateColumn: "invoice_date",
    referenceColumn: "invoice_number",
    build: (query, companyId) => query.eq("company_id", companyId).is("deleted_at", null),
  },
  {
    id: "payments",
    table: "payments",
    dateColumn: "payment_date",
    referenceColumn: "reference_number",
    build: (query, companyId) => query.eq("company_id", companyId).or("is_deleted.is.null,is_deleted.eq.false"),
  },
  {
    id: "journal_entries",
    table: "journal_entries",
    dateColumn: "entry_date",
    referenceColumn: "reference_type",
    build: (query, companyId) => query.eq("company_id", companyId).or("is_deleted.is.null,is_deleted.eq.false").is("deleted_at", null),
  },
  {
    id: "bills",
    table: "bills",
    dateColumn: "bill_date",
    referenceColumn: "bill_number",
    build: (query, companyId) => query.eq("company_id", companyId),
  },
  {
    id: "sales_returns",
    table: "sales_returns",
    dateColumn: "return_date",
    referenceColumn: "return_number",
    build: (query, companyId) => query.eq("company_id", companyId),
  },
  {
    id: "purchase_returns",
    table: "purchase_returns",
    dateColumn: "created_at",
    referenceColumn: "return_number",
    build: (query, companyId) => query.eq("company_id", companyId),
  },
]

function isCovered(date, periods) {
  return periods.some((period) => date >= period.period_start && date <= period.period_end)
}

function monthCoverage(month, periods) {
  const fullCover = periods.some((period) =>
    period.period_start <= month.periodStart && period.period_end >= month.periodEnd
  )
  const overlap = periods.some((period) =>
    !(period.period_end < month.periodStart || period.period_start > month.periodEnd)
  )

  if (fullCover) return "covered"
  if (overlap) return "conflict"
  return "missing"
}

async function fetchSourceRows(supabase, source, companyId) {
  const selectClause = `id, ${source.dateColumn}, ${source.referenceColumn}`
  const baseQuery = supabase.from(source.table).select(selectClause)

  try {
    const { data, error } = await source.build(baseQuery, companyId)
    if (error) throw error
    return data || []
  } catch (_error) {
    const fallbackQuery = supabase.from(source.table).select(selectClause).eq("company_id", companyId)
    const { data, error } = await fallbackQuery
    if (error) throw error
    return data || []
  }
}

function analyzeCoverage(rows, source, periods) {
  const normalized = (rows || [])
    .map((row) => ({
      id: row.id,
      date: toIsoDate(row[source.dateColumn]),
      reference: row[source.referenceColumn] || row.id,
    }))
    .filter((row) => !!row.date)

  const uncovered = normalized
    .filter((row) => !isCovered(row.date, periods))
    .slice(0, 25)

  const dates = normalized.map((row) => row.date).sort()
  return {
    source: source.id,
    totalRows: normalized.length,
    uncoveredCount: normalized.filter((row) => !isCovered(row.date, periods)).length,
    uncoveredSample: uncovered,
    minDate: dates[0] || null,
    maxDate: dates[dates.length - 1] || null,
  }
}

async function loadCoverageState(supabase, companyId) {
  const { data: periods, error: periodError } = await supabase
    .from("accounting_periods")
    .select("id, period_name, period_start, period_end, status, is_locked, notes")
    .eq("company_id", companyId)
    .order("period_start", { ascending: true })

  if (periodError) throw periodError

  const periodRows = periods || []
  const sourceRows = {}
  const coverage = []
  let minDate = null
  let maxDate = toIsoDate(new Date())

  for (const source of SOURCES) {
    const rows = await fetchSourceRows(supabase, source, companyId)
    sourceRows[source.id] = rows
    const summary = analyzeCoverage(rows, source, periodRows)
    coverage.push(summary)

    if (summary.minDate && (!minDate || summary.minDate < minDate)) minDate = summary.minDate
    if (summary.maxDate && summary.maxDate > maxDate) maxDate = summary.maxDate
  }

  return {
    periods: periodRows,
    coverage,
    minDate: minDate || maxDate,
    maxDate,
  }
}

async function run() {
  const report = {
    phase: "phase1c-period-remediation",
    executedAt: new Date().toISOString(),
    mode: hasLiveEnv() ? "live" : "static",
    applyRequested: APPLY,
    ok: true,
  }

  if (!hasLiveEnv()) {
    report.ok = false
    report.error = "Supabase live env is missing. Cannot remediate accounting periods."
    return exitWithReport("phase1c-period-remediation", report)
  }

  const supabase = createServiceClient()
  const companyContext = await resolveCompanyContext(supabase)
  const companyId = companyContext.companyId
  report.company = {
    id: companyId,
    name: companyContext.company?.name || null,
    resolution: companyContext.resolution,
  }

  printSection("Coverage Analysis Before Remediation")
  const before = await loadCoverageState(supabase, companyId)
  report.before = before

  const monthlyPlan = enumerateMonths(startOfMonth(before.minDate), endOfMonth(before.maxDate))
  const coveredMonths = []
  const missingMonths = []
  const conflictingMonths = []

  for (const month of monthlyPlan) {
    const state = monthCoverage(month, before.periods)
    if (state === "covered") coveredMonths.push(month)
    else if (state === "conflict") conflictingMonths.push(month)
    else missingMonths.push(month)
  }

  report.plan = {
    totalTargetMonths: monthlyPlan.length,
    existingPeriods: before.periods.length,
    coveredMonths: coveredMonths.length,
    missingMonths: missingMonths.length,
    conflictingMonths: conflictingMonths.length,
    missingMonthSample: missingMonths.slice(0, 24),
    conflictingMonthSample: conflictingMonths.slice(0, 24),
  }

  if (APPLY) {
    printSection("Applying Period Remediation")
    if (conflictingMonths.length > 0 && !FORCE) {
      report.ok = false
      report.error = "Refused to auto-apply because partially overlapping periods already exist. Re-run with PHASE1C_FORCE=1 only after manual review."
      return exitWithReport("phase1c-period-remediation", report)
    }

    if (before.periods.length > 0 && !FORCE) {
      report.ok = false
      report.error = "Refused to auto-apply because accounting_periods already contains rows. Re-run with PHASE1C_FORCE=1 after reviewing overlap safety."
      return exitWithReport("phase1c-period-remediation", report)
    }

    const payload = missingMonths.map((month) => ({
      company_id: companyId,
      period_name: month.periodName,
      period_start: month.periodStart,
      period_end: month.periodEnd,
      status: "open",
      is_locked: false,
      notes: REMEDIATION_NOTE,
    }))

    const inserted = []
    for (const group of chunk(payload, 25)) {
      const { data, error } = await supabase
        .from("accounting_periods")
        .insert(group)
        .select("id, period_name, period_start, period_end, status, is_locked")

      if (error) throw error
      inserted.push(...(data || []))
    }

    report.applied = {
      insertedCount: inserted.length,
      insertedSample: inserted.slice(0, 24),
    }
  }

  printSection("Coverage Analysis After Remediation")
  const after = await loadCoverageState(supabase, companyId)
  report.after = after
  report.ok = after.coverage.every((item) => item.uncoveredCount === 0)

  exitWithReport("phase1c-period-remediation", report)
}

run().catch((error) => {
  exitWithReport("phase1c-period-remediation", {
    phase: "phase1c-period-remediation",
    executedAt: new Date().toISOString(),
    applyRequested: APPLY,
    ok: false,
    error: error.message,
  })
})
