const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const dotenv = require("dotenv")
const { createClient } = require("@supabase/supabase-js")

dotenv.config({ path: ".env.local" })
dotenv.config()

function getEnv(name, fallback = null) {
  const value = process.env[name]
  if (value == null || value === "") return fallback
  return value
}

function hasLiveEnv() {
  return !!(
    getEnv("SUPABASE_URL") ||
    getEnv("NEXT_PUBLIC_SUPABASE_URL")
  ) && !!getEnv("SUPABASE_SERVICE_ROLE_KEY")
}

function createServiceClient(options = {}) {
  const url = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env vars: SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
  }

  const clientOptions = {
    auth: { autoRefreshToken: false, persistSession: false },
  }

  if (options.accessToken) {
    clientOptions.global = {
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
      },
    }
  }

  return createClient(url, serviceKey, clientOptions)
}

function createUserContextClient() {
  const accessToken = getEnv("PHASE1B_USER_ACCESS_TOKEN")
  if (!accessToken) {
    throw new Error("PHASE1B_USER_ACCESS_TOKEN is required for auth-bound RPC validation")
  }

  return createServiceClient({ accessToken })
}

function getCompanyId(required = true) {
  const companyId = getEnv("PHASE1B_COMPANY_ID")
  if (!companyId && required) {
    throw new Error("PHASE1B_COMPANY_ID is required")
  }
  return companyId
}

async function resolveCompanyContext(supabase, options = {}) {
  const required = options.required !== false
  const explicitCompanyId = getEnv("PHASE1B_COMPANY_ID")

  if (explicitCompanyId) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name")
      .eq("id", explicitCompanyId)
      .maybeSingle()

    if (error) throw error
    if (!data && required) {
      throw new Error(`PHASE1B_COMPANY_ID does not exist or is not reachable: ${explicitCompanyId}`)
    }

    return {
      companyId: explicitCompanyId,
      company: data || null,
      resolution: "env",
      candidates: data ? [data] : [],
    }
  }

  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(10)

  if (error) throw error

  const rows = companies || []
  if (rows.length === 1) {
    return {
      companyId: rows[0].id,
      company: rows[0],
      resolution: "auto-single-company",
      candidates: rows,
    }
  }

  if (!required) {
    return {
      companyId: null,
      company: null,
      resolution: "unresolved",
      candidates: rows,
    }
  }

  const hint = rows.length > 0
    ? rows.map((row) => `${row.id}:${row.name || "unnamed"}`).join(", ")
    : "no companies returned from Supabase"

  throw new Error(`PHASE1B_COMPANY_ID is required because auto-resolution is ambiguous. Candidates: ${hint}`)
}

function printSection(title) {
  console.log(`\n=== ${title} ===`)
}

function ensureReportDir() {
  const dir = path.join(process.cwd(), "reports", "phase1b")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

function writeReport(name, data) {
  const dir = ensureReportDir()
  const target = path.join(dir, `${timestamp()}-${name}.json`)
  fs.writeFileSync(target, JSON.stringify(data, null, 2), "utf8")
  return target
}

function readLocalFile(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8")
}

function exitWithReport(name, report) {
  const reportPath = writeReport(name, report)
  console.log(`Report saved: ${reportPath}`)
  if (report.ok === false) {
    process.exitCode = 1
  }
}

async function timed(label, fn) {
  const started = Date.now()
  const result = await fn()
  return {
    label,
    durationMs: Date.now() - started,
    result,
  }
}

async function fetchSingleInvoice(supabase, companyId, invoiceId) {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", invoiceId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function snapshotInvoiceLifecycle(supabase, companyId, invoiceId) {
  const invoice = await fetchSingleInvoice(supabase, companyId, invoiceId)
  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`)
  }

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("id, amount, payment_date, status, journal_entry_id")
    .eq("company_id", companyId)
    .eq("invoice_id", invoiceId)
    .or("is_deleted.is.null,is_deleted.eq.false")

  if (paymentsError) throw paymentsError

  const { data: journals, error: journalsError } = await supabase
    .from("journal_entries")
    .select("id, reference_type, reference_id, status")
    .eq("company_id", companyId)
    .or("is_deleted.is.null,is_deleted.eq.false")
    .is("deleted_at", null)
    .eq("reference_id", invoiceId)

  if (journalsError) throw journalsError

  const { data: cogs, error: cogsError } = await supabase
    .from("cogs_transactions")
    .select("id, source_type, source_id, total_cost")
    .eq("company_id", companyId)
    .eq("source_id", invoiceId)

  if (cogsError) throw cogsError

  const { data: inventoryTransactions, error: inventoryError } = await supabase
    .from("inventory_transactions")
    .select("id, transaction_type, reference_type, reference_id, quantity_change")
    .eq("company_id", companyId)
    .eq("reference_id", invoiceId)

  if (inventoryError) throw inventoryError

  const { data: thirdPartyInventory, error: tpiError } = await supabase
    .from("third_party_inventory")
    .select("id, quantity, unit_cost, total_cost, status")
    .eq("company_id", companyId)
    .eq("invoice_id", invoiceId)

  if (tpiError) throw tpiError

  const { data: salesReturns, error: returnsError } = await supabase
    .from("sales_returns")
    .select("id, status, total_amount")
    .eq("company_id", companyId)
    .eq("invoice_id", invoiceId)

  if (returnsError) throw returnsError

  const returnIds = (salesReturns || []).map((item) => item.id)

  let returnJournals = []
  let returnCogs = []
  let returnInventoryTransactions = []

  if (returnIds.length > 0) {
    const { data } = await supabase
      .from("journal_entries")
      .select("id, reference_type, reference_id, status")
      .eq("company_id", companyId)
      .in("reference_id", returnIds)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .is("deleted_at", null)
    returnJournals = data || []

    const { data: returnCogsRows } = await supabase
      .from("cogs_transactions")
      .select("id, source_type, source_id, total_cost")
      .eq("company_id", companyId)
      .eq("source_type", "return")
      .in("source_id", returnIds)
    returnCogs = returnCogsRows || []

    const { data: returnInventoryRows } = await supabase
      .from("inventory_transactions")
      .select("id, transaction_type, reference_type, reference_id, quantity_change")
      .eq("company_id", companyId)
      .eq("reference_type", "sales_return")
      .in("reference_id", returnIds)
    returnInventoryTransactions = returnInventoryRows || []
  }

  const { data: traces, error: tracesError } = await supabase
    .from("financial_operation_traces")
    .select("*")
    .eq("company_id", companyId)
    .eq("source_entity", "invoice")
    .eq("source_id", invoiceId)
    .order("created_at", { ascending: true })

  if (tracesError && tracesError.code !== "PGRST116") throw tracesError

  const traceIds = (traces || []).map((item) => item.transaction_id)
  let traceLinks = []
  if (traceIds.length > 0) {
    const { data: links } = await supabase
      .from("financial_operation_trace_links")
      .select("*")
      .in("transaction_id", traceIds)
      .order("created_at", { ascending: true })
    traceLinks = links || []
  }

  const paymentJournalIds = (payments || []).map((p) => p.journal_entry_id).filter(Boolean)

  const relevantJournals = [...(journals || []), ...returnJournals].filter((entry) => {
    if (!entry) return false
    if (paymentJournalIds.includes(entry.id)) return true
    return true
  })

  return {
    invoice,
    payments: payments || [],
    journals: relevantJournals,
    cogs: [...(cogs || []), ...returnCogs],
    inventoryTransactions: [...(inventoryTransactions || []), ...returnInventoryTransactions],
    thirdPartyInventory: thirdPartyInventory || [],
    salesReturns: salesReturns || [],
    traces: traces || [],
    traceLinks,
  }
}

function functionalShape(snapshot) {
  const invoice = snapshot.invoice
  const journalTypes = {}
  for (const entry of snapshot.journals || []) {
    const key = entry.reference_type || "unknown"
    journalTypes[key] = (journalTypes[key] || 0) + 1
  }

  return {
    invoiceStatus: invoice.status,
    warehouseStatus: invoice.warehouse_status || null,
    paidAmount: Number(invoice.paid_amount || 0),
    returnedAmount: Number(invoice.returned_amount || 0),
    returnStatus: invoice.return_status || null,
    totalAmount: Number(invoice.total_amount || 0),
    balanceDue: Math.max(
      Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0) - Number(invoice.returned_amount || 0),
      0
    ),
    paymentsCount: (snapshot.payments || []).length,
    salesReturnsCount: (snapshot.salesReturns || []).length,
    thirdPartyInventoryCount: (snapshot.thirdPartyInventory || []).length,
    cogsTransactionsCount: (snapshot.cogs || []).length,
    inventoryTransactionCount: (snapshot.inventoryTransactions || []).length,
    journalTypes,
    traceCount: (snapshot.traces || []).length,
    traceLinkCount: (snapshot.traceLinks || []).length,
  }
}

function businessFunctionalShape(snapshot) {
  const shape = functionalShape(snapshot)
  return {
    invoiceStatus: shape.invoiceStatus,
    warehouseStatus: shape.warehouseStatus,
    paidAmount: shape.paidAmount,
    returnedAmount: shape.returnedAmount,
    returnStatus: shape.returnStatus,
    totalAmount: shape.totalAmount,
    balanceDue: shape.balanceDue,
    paymentsCount: shape.paymentsCount,
    salesReturnsCount: shape.salesReturnsCount,
    thirdPartyInventoryCount: shape.thirdPartyInventoryCount,
  }
}

function compareFunctionalSnapshots(left, right, options = {}) {
  const mode = options.mode || "business"
  const ignoreKeys = new Set(options.ignoreKeys || [])
  const leftShape = mode === "full" ? functionalShape(left) : businessFunctionalShape(left)
  const rightShape = mode === "full" ? functionalShape(right) : businessFunctionalShape(right)
  const diffs = []

  const keys = new Set([...Object.keys(leftShape), ...Object.keys(rightShape)])
  for (const key of keys) {
    if (ignoreKeys.has(key)) continue
    const leftValue = JSON.stringify(leftShape[key])
    const rightValue = JSON.stringify(rightShape[key])
    if (leftValue !== rightValue) {
      diffs.push({
        key,
        left: leftShape[key],
        right: rightShape[key],
      })
    }
  }

  return {
    ok: diffs.length === 0,
    left: leftShape,
    right: rightShape,
    diffs,
  }
}

function parseJsonEnv(name, fallback = null) {
  const raw = getEnv(name)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid JSON in ${name}: ${error.message}`)
  }
}

function loadJsonFile(relativePath) {
  const target = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(process.cwd(), relativePath)
  return JSON.parse(fs.readFileSync(target, "utf8"))
}

function randomUuid() {
  return crypto.randomUUID()
}

module.exports = {
  businessFunctionalShape,
  compareFunctionalSnapshots,
  createServiceClient,
  createUserContextClient,
  functionalShape,
  getCompanyId,
  getEnv,
  hasLiveEnv,
  loadJsonFile,
  parseJsonEnv,
  printSection,
  readLocalFile,
  randomUuid,
  resolveCompanyContext,
  exitWithReport,
  timed,
  snapshotInvoiceLifecycle,
  writeReport,
}
