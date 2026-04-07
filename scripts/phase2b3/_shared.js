const fs = require("fs")
const path = require("path")
const { stableHash, stableUuid, numeric } = require("../phase1c2/_shared")
const {
  createServiceClient,
  hasLiveEnv,
  printSection,
  resolveCompanyContext,
} = require("../phase1b/_shared")

function ensureReportDir() {
  const dir = path.join(process.cwd(), "reports", "phase2b3")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function writeReport(name, data) {
  const target = path.join(
    ensureReportDir(),
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${name}.json`
  )
  fs.writeFileSync(target, JSON.stringify(data, null, 2), "utf8")
  return target
}

function exitWithReport(name, report) {
  const reportPath = writeReport(name, report)
  console.log(`Report saved: ${reportPath}`)
  if (report.ok === false) {
    process.exitCode = 1
  }
}

function parseJsonEnv(name, fallback = null) {
  const value = process.env[name]
  if (!value) return fallback
  return JSON.parse(value)
}

function firstDayOfCurrentMonth() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

function lastDayOfCurrentMonth() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
}

async function resolveConsolidationGroup(supabase) {
  const explicitGroupId = process.env.PHASE2B3_GROUP_ID
  if (explicitGroupId) {
    const { data, error } = await supabase
      .from("consolidation_groups")
      .select("*")
      .eq("id", explicitGroupId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error(`PHASE2B3_GROUP_ID does not exist or is not reachable: ${explicitGroupId}`)
    return { group: data, resolution: "env" }
  }

  const { data, error } = await supabase
    .from("consolidation_groups")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(10)

  if (error) throw error
  const rows = data || []
  if (rows.length === 1) {
    return { group: rows[0], resolution: "auto-single-group" }
  }

  const hint = rows.length > 0
    ? rows.map((row) => `${row.id}:${row.group_name || row.group_code || "unnamed"}`).join(", ")
    : "no consolidation groups returned from Supabase"
  throw new Error(`PHASE2B3_GROUP_ID is required because group auto-resolution is ambiguous. Candidates: ${hint}`)
}

async function resolveGroupEntities(supabase, groupId) {
  const entityFilter = String(process.env.PHASE2B3_ENTITY_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  const includeEntityIds = entityFilter.length > 0 ? new Set(entityFilter) : null
  const includeEquityMethodEntities = process.env.PHASE2B3_INCLUDE_EQUITY === "1"

  const { data: members, error: membersError } = await supabase
    .from("consolidation_group_members")
    .select("*")
    .eq("consolidation_group_id", groupId)
    .order("effective_from", { ascending: true })

  if (membersError) throw membersError

  const legalEntityIds = [...new Set((members || []).map((row) => row.legal_entity_id).filter(Boolean))]
  if (legalEntityIds.length === 0) {
    return []
  }

  const [{ data: legalEntities, error: legalEntitiesError }, { data: companyMap, error: companyMapError }] = await Promise.all([
    supabase
      .from("legal_entities")
      .select("id, entity_code, legal_name, functional_currency")
      .in("id", legalEntityIds),
    supabase
      .from("company_legal_entity_map")
      .select("company_id, legal_entity_id, status")
      .in("legal_entity_id", legalEntityIds),
  ])

  if (legalEntitiesError) throw legalEntitiesError
  if (companyMapError) throw companyMapError

  const entityMeta = new Map((legalEntities || []).map((row) => [row.id, row]))
  const companyMeta = new Map()
  for (const row of companyMap || []) {
    if (!companyMeta.has(row.legal_entity_id) && row.status !== "inactive") {
      companyMeta.set(row.legal_entity_id, row.company_id)
    }
  }

  return (members || [])
    .filter((row) => includeEquityMethodEntities ? ["included", "equity_method"].includes(String(row.scope_status || "")) : String(row.scope_status || "") === "included")
    .filter((row) => !includeEntityIds || includeEntityIds.has(row.legal_entity_id))
    .map((row) => {
      const legalEntity = entityMeta.get(row.legal_entity_id) || {}
      return {
        legal_entity_id: row.legal_entity_id,
        company_id: companyMeta.get(row.legal_entity_id) || null,
        legal_name: legalEntity.legal_name || null,
        legal_code: legalEntity.entity_code || null,
        functional_currency: legalEntity.functional_currency || "EGP",
        consolidation_method: row.consolidation_method,
        ownership_percentage: row.ownership_percentage,
        nci_percentage: row.nci_percentage,
        scope_status: row.scope_status,
      }
    })
    .filter((row) => !!row.company_id)
}

function inferStatementCategory(account) {
  const accountType = String(account?.account_type || "").trim().toLowerCase()
  const subType = String(account?.sub_type || "").trim().toLowerCase()
  const name = String(account?.account_name || "").trim().toLowerCase()
  const code = String(account?.account_code || "").trim().toLowerCase()

  if (["asset", "assets"].includes(accountType) || ["inventory", "stock", "bank", "cash", "receivable", "fixed_asset"].includes(subType) || name.includes("inventory") || code.startsWith("1")) {
    return "asset"
  }
  if (["liability", "liabilities"].includes(accountType) || ["payable", "loan", "liability"].includes(subType) || code.startsWith("2")) {
    return "liability"
  }
  if (["equity"].includes(accountType) || code.startsWith("3")) {
    return "equity"
  }
  if (["revenue", "income"].includes(accountType) || ["sales", "revenue"].includes(subType) || code.startsWith("4")) {
    return "revenue"
  }
  if (["expense", "expenses", "cost"].includes(accountType) || ["expense", "cogs", "cost"].includes(subType) || code.startsWith("5") || code.startsWith("6")) {
    return "expense"
  }
  return "equity"
}

async function createTrace(supabase, payload) {
  const { data, error } = await supabase
    .from("financial_operation_traces")
    .insert(payload)
    .select("transaction_id")
    .single()
  if (error) throw error
  return data.transaction_id
}

async function linkTrace(supabase, transactionId, entityType, entityId, linkRole, referenceType) {
  const { error } = await supabase
    .from("financial_operation_trace_links")
    .upsert({
      transaction_id: transactionId,
      entity_type: entityType,
      entity_id: entityId,
      link_role: linkRole || null,
      reference_type: referenceType || null,
    }, {
      onConflict: "transaction_id,entity_type,entity_id",
    })
  if (error) throw error
}

module.exports = {
  stableHash,
  stableUuid,
  numeric,
  createServiceClient,
  hasLiveEnv,
  printSection,
  resolveCompanyContext,
  ensureReportDir,
  writeReport,
  exitWithReport,
  parseJsonEnv,
  firstDayOfCurrentMonth,
  lastDayOfCurrentMonth,
  resolveConsolidationGroup,
  resolveGroupEntities,
  inferStatementCategory,
  createTrace,
  linkTrace,
}
