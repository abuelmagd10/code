const {
  createServiceClient,
  exitWithReport,
  hasLiveEnv,
} = require("./_shared")

function nowIso() {
  return new Date().toISOString()
}

async function resolveCompanyByNameOrId(supabase, explicitId, fallbackName) {
  if (explicitId) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, user_id")
      .eq("id", explicitId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error(`Company was not found: ${explicitId}`)
    return { company: data, resolution: "env" }
  }

  const { data, error } = await supabase
    .from("companies")
    .select("id, name, user_id")
    .eq("name", fallbackName)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`Company "${fallbackName}" was not found`)
  return { company: data, resolution: "name" }
}

async function resolveGroupByCode(supabase, groupCode) {
  const { data, error } = await supabase
    .from("consolidation_groups")
    .select("*")
    .eq("group_code", groupCode)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function loadActiveMappings(supabase, companyId) {
  const { data, error } = await supabase
    .from("company_legal_entity_map")
    .select("id, company_id, legal_entity_id, status, effective_to")
    .eq("company_id", companyId)
    .eq("status", "active")
    .is("effective_to", null)
  if (error) throw error
  return data || []
}

async function loadAccounts(supabase, companyId) {
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type, sub_type, is_active")
    .eq("company_id", companyId)
    .eq("is_active", true)
  if (error) throw error
  return data || []
}

async function loadCurrentPeriod(supabase, companyId, effectiveDate) {
  const { data, error } = await supabase
    .from("accounting_periods")
    .select("id, period_name, period_start, period_end, status, is_locked")
    .eq("company_id", companyId)
    .lte("period_start", effectiveDate)
    .gte("period_end", effectiveDate)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

function findAccount(accounts, predicate) {
  return accounts.find(predicate) || null
}

async function buildCompanyReadiness(supabase, company, effectiveDate, role) {
  const mappings = await loadActiveMappings(supabase, company.id)
  const accounts = await loadAccounts(supabase, company.id)
  const period = await loadCurrentPeriod(supabase, company.id, effectiveDate)

  const requiredAccounts = role === "seller"
    ? {
        receivable: findAccount(accounts, (row) => row.sub_type === "accounts_receivable"),
        revenue: findAccount(accounts, (row) => row.sub_type === "sales_revenue"),
      }
    : {
        payable: findAccount(accounts, (row) => row.sub_type === "accounts_payable"),
        expense: findAccount(accounts, (row) => ["cogs", "cost_of_goods_sold"].includes(String(row.sub_type || ""))) ||
          findAccount(accounts, (row) => String(row.account_type || "").toLowerCase() === "expense"),
      }

  return {
    company: { id: company.id, name: company.name, userId: company.user_id || null },
    activeMappings: mappings,
    activeMappingCount: mappings.length,
    legalEntityId: mappings[0]?.legal_entity_id || null,
    period: period ? {
      id: period.id,
      name: period.period_name || null,
      periodStart: period.period_start,
      periodEnd: period.period_end,
      status: period.status || null,
      isLocked: !!period.is_locked,
    } : null,
    accounts: {
      required: Object.fromEntries(
        Object.entries(requiredAccounts).map(([key, value]) => [key, value ? {
          id: value.id,
          code: value.account_code,
          name: value.account_name,
          type: value.account_type,
          subType: value.sub_type || null,
        } : null])
      ),
      activeCount: accounts.length,
    },
  }
}

async function run() {
  const report = {
    phase: "phase2b3-multi-entity-readiness",
    executedAt: nowIso(),
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
      message: "Supabase live env is missing. Cannot inspect multi-entity readiness.",
    })
    return exitWithReport("phase2b3-multi-entity-readiness", report)
  }

  const supabase = createServiceClient()
  const effectiveDate = String(process.env.PHASE2B3_SCENARIO_DATE || new Date().toISOString().slice(0, 10))
  const seller = await resolveCompanyByNameOrId(
    supabase,
    process.env.PHASE2B3_HOST_COMPANY_ID || process.env.PHASE1B_COMPANY_ID,
    process.env.PHASE2B3_PRIMARY_COMPANY_NAME || "VitaSlims"
  )
  const buyer = await resolveCompanyByNameOrId(
    supabase,
    process.env.PHASE2B3_SECONDARY_COMPANY_ID,
    process.env.PHASE2B3_SECONDARY_COMPANY_NAME || "تست"
  )
  const groupCode = String(process.env.PHASE2B3_GROUP_CODE || "VITASLIMS_GROUP")
  const group = await resolveGroupByCode(supabase, groupCode)

  const sellerReadiness = await buildCompanyReadiness(supabase, seller.company, effectiveDate, "seller")
  const buyerReadiness = await buildCompanyReadiness(supabase, buyer.company, effectiveDate, "buyer")

  let groupMembers = []
  if (group) {
    const { data, error } = await supabase
      .from("consolidation_group_members")
      .select("id, legal_entity_id, scope_status, effective_to")
      .eq("consolidation_group_id", group.id)
      .is("effective_to", null)
    if (error) throw error
    groupMembers = data || []
  }

  const checks = [
    {
      id: "seller_entity_isolation",
      passed: sellerReadiness.activeMappingCount === 1,
      severity: "critical",
      message: sellerReadiness.activeMappingCount === 1
        ? "Seller company has exactly one active legal entity mapping."
        : `Seller company has ${sellerReadiness.activeMappingCount} active legal entity mappings.`,
    },
    {
      id: "buyer_entity_isolation",
      passed: buyerReadiness.activeMappingCount === 1,
      severity: "critical",
      message: buyerReadiness.activeMappingCount === 1
        ? "Buyer company has exactly one active legal entity mapping."
        : `Buyer company has ${buyerReadiness.activeMappingCount} active legal entity mappings.`,
    },
    {
      id: "seller_accounts_ready",
      passed: !!sellerReadiness.accounts.required.receivable && !!sellerReadiness.accounts.required.revenue,
      severity: "critical",
      message: "Seller company has AR and revenue accounts required for controlled intercompany scenario.",
    },
    {
      id: "buyer_accounts_ready",
      passed: !!buyerReadiness.accounts.required.payable && !!buyerReadiness.accounts.required.expense,
      severity: "critical",
      message: "Buyer company has AP and expense/COGS accounts required for controlled intercompany scenario.",
    },
    {
      id: "seller_period_open",
      passed: !!sellerReadiness.period && !sellerReadiness.period.isLocked && !["closed", "locked", "audit_lock"].includes(String(sellerReadiness.period?.status || "").toLowerCase()),
      severity: "critical",
      message: "Seller accounting period is open for the controlled scenario date.",
    },
    {
      id: "buyer_period_open",
      passed: !!buyerReadiness.period && !buyerReadiness.period.isLocked && !["closed", "locked", "audit_lock"].includes(String(buyerReadiness.period?.status || "").toLowerCase()),
      severity: "critical",
      message: "Buyer accounting period is open for the controlled scenario date.",
    },
    {
      id: "group_exists",
      passed: !!group,
      severity: "critical",
      message: group ? "Target consolidation group exists." : `Consolidation group ${groupCode} does not exist yet.`,
    },
    {
      id: "fx_baseline",
      passed: true,
      severity: "info",
      message: "Same-currency baseline remains valid; dry-run will still require explicit rate timestamps on intercompany records.",
    },
  ]

  report.checks = checks
  report.context = {
    effectiveDate,
    group: group ? {
      id: group.id,
      code: group.group_code,
      name: group.group_name,
      presentationCurrency: group.presentation_currency,
      memberCount: groupMembers.length,
    } : null,
    seller: sellerReadiness,
    buyer: buyerReadiness,
  }
  report.ok = checks.every((check) => check.passed || check.severity !== "critical")
  exitWithReport("phase2b3-multi-entity-readiness", report)
}

run().catch((error) => {
  exitWithReport("phase2b3-multi-entity-readiness", {
    phase: "phase2b3-multi-entity-readiness",
    executedAt: nowIso(),
    ok: false,
    error: error.message,
  })
})
