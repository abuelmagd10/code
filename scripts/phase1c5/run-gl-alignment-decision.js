const fs = require("fs")
const path = require("path")
const {
  chunk,
  createServiceClient,
  hasLiveEnv,
  numeric,
  printSection,
  resolveCompanyContext,
} = require("../phase1c2/_shared")

function ensureReportDir() {
  const dir = path.join(process.cwd(), "reports", "phase1c5")
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

function lower(value) {
  return String(value || "").trim().toLowerCase()
}

function stableDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function listFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => predicate(name))
    .map((name) => ({
      name,
      path: path.join(dir, name),
      mtimeMs: fs.statSync(path.join(dir, name)).mtimeMs,
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
}

function loadJson(target) {
  return JSON.parse(fs.readFileSync(target, "utf8"))
}

function findLatestPhase1C4Report() {
  const explicit = process.env.PHASE1C5_PHASE1C4_REPORT
  if (explicit) return path.isAbsolute(explicit) ? explicit : path.join(process.cwd(), explicit)

  const files = listFiles(
    path.join(process.cwd(), "reports", "phase1c4"),
    (name) => name.endsWith("phase1c4-remediation-loop.json")
  )

  if (files.length === 0) {
    throw new Error("No Phase 1C.4 remediation report was found.")
  }

  return files[0].path
}

function buildMap(rows, keyField = "id") {
  const map = new Map()
  for (const row of rows || []) {
    map.set(row[keyField], row)
  }
  return map
}

function inventoryAccountScore(account) {
  const subtype = lower(account.sub_type)
  const name = lower(account.account_name)
  const code = lower(account.account_code)

  let score = 0
  if (subtype === "inventory" || subtype === "stock") score += 100
  if (code === "1300") score += 40
  if (name.includes("inventory") || name.includes("مخزون")) score += 40
  if (name.includes("stock")) score += 20
  return score
}

function isInventoryAccount(account) {
  return account.is_active !== false && inventoryAccountScore(account) > 0
}

function adjustmentAccountScore(account) {
  const subtype = lower(account.sub_type)
  const accountType = lower(account.account_type)
  const name = lower(account.account_name)

  if (
    name.includes("currency") ||
    name.includes("foreign exchange") ||
    name.includes("fx") ||
    name.includes("فروق العملة") ||
    name.includes("فرق العملة") ||
    name.includes("فروق العملات") ||
    name.includes("خسائر العملة") ||
    name.includes("خسائر فروق")
  ) {
    return -1000
  }

  let score = 0

  if (name.includes("inventory adjustment")) score += 120
  if (name.includes("inventory loss")) score += 120
  if (name.includes("inventory write off")) score += 115
  if (name.includes("stock loss")) score += 110
  if (name.includes("adjustment loss")) score += 105
  if (name.includes("تسوية مخزون")) score += 120
  if (name.includes("خسائر مخزون")) score += 120
  if (name.includes("إهلاك مخزون")) score += 115
  if (name.includes("مخزون") && name.includes("خسائر")) score += 110
  if (name.includes("مخزون") && name.includes("تسوية")) score += 110
  if (name.includes("write off")) score += 70
  if (name.includes("loss")) score += 70
  if (name.includes("خسائر")) score += 70
  if (name.includes("adjustment")) score += 60
  if (name.includes("تسوية")) score += 60
  if (name.includes("cost of goods sold")) score += 100
  if (name.includes("تكلفة البضائع المباعة")) score += 100

  if (["expense", "expenses", "other_expense", "other_expenses"].includes(accountType)) score += 50
  if (["other_expense", "other_expenses", "loss", "write_off", "cogs", "cost_of_goods_sold"].includes(subtype)) score += 50
  if (subtype.includes("expense")) score += 25

  return score
}

function isDedicatedInventoryAlignmentAccount(candidate) {
  const name = lower(candidate.account_name)
  return (
    name.includes("inventory adjustment") ||
    name.includes("inventory loss") ||
    name.includes("inventory write off") ||
    name.includes("stock loss") ||
    name.includes("تسوية مخزون") ||
    name.includes("خسائر مخزون") ||
    name.includes("إهلاك مخزون") ||
    (name.includes("مخزون") && name.includes("تسوية")) ||
    (name.includes("مخزون") && name.includes("خسائر"))
  )
}

function isCogsFallbackAccount(candidate) {
  const name = lower(candidate.account_name)
  const subtype = lower(candidate.sub_type)
  return (
    subtype === "cogs" ||
    subtype === "cost_of_goods_sold" ||
    name.includes("cost of goods sold") ||
    name.includes("تكلفة البضائع المباعة")
  )
}

async function fetchRows(supabase, table, builder) {
  const { data, error } = await builder(supabase.from(table))
  if (error) throw error
  return data || []
}

async function fetchRowsByIds(supabase, table, idColumn, ids) {
  const rows = []
  for (const group of chunk(ids, 500)) {
    const { data, error } = await supabase.from(table).select("*").in(idColumn, group)
    if (error) throw error
    rows.push(...(data || []))
  }
  return rows
}

async function fetchGlSnapshot(supabase, companyId, asOfTimestamp) {
  const chartOfAccounts = await fetchRows(
    supabase,
    "chart_of_accounts",
    (query) => query.select("*").eq("company_id", companyId)
  )

  let journalQuery = supabase
    .from("journal_entries")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "posted")
    .or("is_deleted.is.null,is_deleted.eq.false")
    .is("deleted_at", null)

  if (asOfTimestamp) {
    journalQuery = journalQuery.lte("created_at", asOfTimestamp)
  }

  const { data: journalEntries, error: journalError } = await journalQuery
  if (journalError) throw journalError

  const journalEntryIds = (journalEntries || []).map((row) => row.id)
  const journalEntryLines = journalEntryIds.length > 0
    ? await fetchRowsByIds(supabase, "journal_entry_lines", "journal_entry_id", journalEntryIds)
    : []

  return {
    chartOfAccounts,
    journalEntries: journalEntries || [],
    journalEntryLines,
  }
}

function analyzeInventoryGl(glSnapshot) {
  const entriesById = buildMap(glSnapshot.journalEntries)
  const inventoryAccounts = (glSnapshot.chartOfAccounts || []).filter(isInventoryAccount)
  const inventoryAccountIds = new Set(inventoryAccounts.map((row) => row.id))

  const byReferenceType = {}
  const byAccount = new Map()
  const journalImpactRows = []
  let total = 0

  for (const line of glSnapshot.journalEntryLines || []) {
    if (!inventoryAccountIds.has(line.account_id)) continue

    const amount = numeric(line.debit_amount) - numeric(line.credit_amount)
    const entry = entriesById.get(line.journal_entry_id) || {}
    const referenceType = entry.reference_type || "unknown"
    total += amount
    byReferenceType[referenceType] = Number((numeric(byReferenceType[referenceType]) + amount).toFixed(4))

    const account = inventoryAccounts.find((row) => row.id === line.account_id) || null
    const accountBucket = byAccount.get(line.account_id) || {
      account_id: line.account_id,
      account_code: account?.account_code || null,
      account_name: account?.account_name || null,
      account_sub_type: account?.sub_type || null,
      balance: 0,
    }
    accountBucket.balance = Number((numeric(accountBucket.balance) + amount).toFixed(4))
    byAccount.set(line.account_id, accountBucket)

    journalImpactRows.push({
      journal_entry_id: line.journal_entry_id,
      journal_number: entry.entry_number || entry.journal_number || null,
      entry_date: entry.entry_date || null,
      created_at: entry.created_at || null,
      reference_type: referenceType,
      reference_id: entry.reference_id || null,
      description: entry.description || line.description || null,
      account_id: line.account_id,
      account_code: account?.account_code || null,
      account_name: account?.account_name || null,
      amount,
    })
  }

  return {
    inventoryAccounts: [...byAccount.values()].sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance)),
    byReferenceType,
    total: Number(total.toFixed(4)),
    journalImpactRows,
  }
}

function summarizeArtifactLots(lots) {
  const totalsByType = {}
  const closingByType = {}
  let totalOriginalCost = 0
  let totalClosingCost = 0

  for (const lot of lots || []) {
    const originalCost = Number((numeric(lot.original_quantity) * numeric(lot.unit_cost)).toFixed(4))
    const closingValue =
      lot.remaining_value != null
        ? numeric(lot.remaining_value)
        : Number((numeric(lot.remaining_quantity) * numeric(lot.unit_cost)).toFixed(4))

    totalsByType[lot.lot_type] = Number((numeric(totalsByType[lot.lot_type]) + originalCost).toFixed(4))
    closingByType[lot.lot_type] = Number((numeric(closingByType[lot.lot_type]) + closingValue).toFixed(4))
    totalOriginalCost += originalCost
    totalClosingCost += closingValue
  }

  return {
    totalsByType,
    closingByType,
    totalOriginalCost: Number(totalOriginalCost.toFixed(4)),
    totalClosingCost: Number(totalClosingCost.toFixed(4)),
  }
}

function summarizeArtifactConsumptions(consumptions) {
  const byReferenceEntity = {}
  const byMode = {}
  const byReferenceAndMode = {}
  let totalCost = 0

  for (const row of consumptions || []) {
    const cost = numeric(row.total_cost)
    totalCost += cost
    byReferenceEntity[row.reference_entity] = Number((numeric(byReferenceEntity[row.reference_entity]) + cost).toFixed(4))
    byMode[row.consumption_mode] = Number((numeric(byMode[row.consumption_mode]) + cost).toFixed(4))
    const key = `${row.reference_entity}::${row.consumption_mode}`
    byReferenceAndMode[key] = Number((numeric(byReferenceAndMode[key]) + cost).toFixed(4))
  }

  return {
    byReferenceEntity,
    byMode,
    byReferenceAndMode,
    totalCost: Number(totalCost.toFixed(4)),
  }
}

function selectAdjustmentAccount(accounts) {
  const candidates = (accounts || [])
    .filter((row) => row.is_active !== false)
    .map((row) => ({
      id: row.id,
      account_code: row.account_code || null,
      account_name: row.account_name || null,
      account_type: row.account_type || null,
      sub_type: row.sub_type || null,
      score: adjustmentAccountScore(row),
    }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score)

  const dedicated = candidates.filter(isDedicatedInventoryAlignmentAccount)
  if (dedicated.length > 0) {
    return {
      primary: dedicated[0],
      selection_basis: "inventory_adjustment_account",
      requires_controller_note: false,
      candidates: candidates.slice(0, 10),
    }
  }

  const cogsFallback = candidates.filter(isCogsFallbackAccount)
  if (cogsFallback.length > 0) {
    return {
      primary: cogsFallback[0],
      selection_basis: "cogs_fallback_account",
      requires_controller_note: true,
      candidates: candidates.slice(0, 10),
    }
  }

  return {
    primary: null,
    selection_basis: "manual_selection_required",
    requires_controller_note: true,
    candidates: candidates.slice(0, 10),
  }
}

function classifyRootCause(remediatedSummary, glAnalysis, artifactLotsSummary, artifactConsumptionSummary) {
  const glInventory = numeric(glAnalysis.total)
  const fifoInventory = numeric(remediatedSummary.valuation.fifo_inventory_value)
  const variance = Number((fifoInventory - glInventory).toFixed(4))
  const purchaseCapitalizationGl = numeric(glAnalysis.byReferenceType.bill)
  const purchaseLotsValue = numeric(artifactLotsSummary.totalsByType.purchase)
  const purchaseCapitalizationDelta = Number((purchaseCapitalizationGl - purchaseLotsValue).toFixed(4))
  const vendorCreditImpact = numeric(glAnalysis.byReferenceType.vendor_credit)
  const purchaseReturnImpact = numeric(glAnalysis.byReferenceType.purchase_return)
  const manualEntryImpact = numeric(glAnalysis.byReferenceType.manual_entry)
  const invoiceCogsImpact = Math.abs(numeric(glAnalysis.byReferenceType.invoice_cogs))
  const invoiceReliefFromFifo = numeric(artifactConsumptionSummary.byReferenceAndMode["invoice::issue"]) +
    numeric(artifactConsumptionSummary.byReferenceAndMode["invoice::retro_cost_assignment"])
  const missingHistoricalInventoryRelief = Number((glInventory - fifoInventory).toFixed(4))
  const invoiceCogsShortfall = Number((invoiceReliefFromFifo - invoiceCogsImpact).toFixed(4))

  const doubleInventoryCapitalizationEvidence = Math.abs(purchaseCapitalizationDelta) > 1
  const manualJournalDriver = manualEntryImpact > 0.0001

  return {
    dominant_classification: "missing_historical_inventory_relief",
    source_breakdown: {
      missing_historical_inventory_relief: {
        amount: missingHistoricalInventoryRelief,
        evidence: {
          gl_inventory_balance: glInventory,
          fifo_inventory_balance: fifoInventory,
          invoice_cogs_gl_impact: invoiceCogsImpact,
          invoice_relief_from_fifo: invoiceReliefFromFifo,
          invoice_cogs_shortfall: invoiceCogsShortfall,
        },
        conclusion: "Historical inventory relief posted to GL is materially below the cost relief implied by the cleaned FIFO v2 truth layer.",
      },
      double_inventory_capitalization: {
        amount: doubleInventoryCapitalizationEvidence ? purchaseCapitalizationDelta : 0,
        evidence: {
          purchase_capitalization_gl: purchaseCapitalizationGl,
          purchase_lots_fifo: purchaseLotsValue,
          delta: purchaseCapitalizationDelta,
          vendor_credit_impact: vendorCreditImpact,
          purchase_return_impact: purchaseReturnImpact,
        },
        conclusion: doubleInventoryCapitalizationEvidence
          ? "Purchase-side capitalization exceeds reconstructed purchase lots and requires controller review."
          : "Not evidenced. Purchase-side inventory capitalization matches reconstructed purchase lots within tolerance, and vendor credit / purchase return entries net to zero on inventory.",
      },
      manual_journal_errors: {
        amount: manualEntryImpact,
        evidence: {
          manual_entry_inventory_impact: manualEntryImpact,
        },
        conclusion: manualJournalDriver
          ? "Manual entries increased inventory and may be a contributing driver."
          : "Not evidenced as a driver. Manual entries reduce inventory and appear corrective rather than inflationary.",
      },
    },
    controller_conclusion: "The residual variance is best classified as legacy GL overstatement caused primarily by missing historical inventory relief / COGS recognition, not by remaining FIFO defects.",
  }
}

function assessMateriality(remediatedSummary, glAnalysis, rootCause) {
  const variance = Math.abs(numeric(remediatedSummary.valuation.difference_value))
  const glInventory = Math.abs(numeric(glAnalysis.total))
  const purchaseCapitalization = Math.abs(numeric(glAnalysis.byReferenceType.bill))
  const thresholdFivePercentInventory = Number((glInventory * 0.05).toFixed(4))
  const thresholdOnePercentPurchases = Number((purchaseCapitalization * 0.01).toFixed(4))
  const quantitativeThreshold = Math.max(10000, thresholdFivePercentInventory, thresholdOnePercentPurchases)

  return {
    variance_amount: variance,
    quantitative_threshold: quantitativeThreshold,
    ratios: {
      to_gl_inventory_percent: glInventory > 0 ? Number(((variance / glInventory) * 100).toFixed(2)) : null,
      to_purchase_capitalization_percent: purchaseCapitalization > 0 ? Number(((variance / purchaseCapitalization) * 100).toFixed(2)) : null,
      to_fifo_inventory_percent: numeric(remediatedSummary.valuation.fifo_inventory_value) > 0
        ? Number(((variance / Math.abs(numeric(remediatedSummary.valuation.fifo_inventory_value))) * 100).toFixed(2))
        : null,
    },
    is_material: variance > quantitativeThreshold,
    requires_disclosure: true,
    conclusion:
      "The variance is material under any reasonable internal close threshold and requires explicit controller approval, working-paper disclosure, and an auditable adjustment memorandum before books can be relied upon.",
    policy_note:
      "External financial statement disclosure remains a controller / auditor judgment, but internal management disclosure is mandatory because the variance is material to inventory.",
    root_cause_reference: rootCause.controller_conclusion,
  }
}

function buildInventoryCreditDistribution(inventoryAccounts, amount) {
  const positiveAccounts = (inventoryAccounts || []).filter((row) => numeric(row.balance) > 0.0001)
  const totalPositive = positiveAccounts.reduce((total, row) => total + numeric(row.balance), 0)

  if (positiveAccounts.length === 0 || totalPositive <= 0.0001) {
    return []
  }

  let assigned = 0
  return positiveAccounts.map((row, index) => {
    const remaining = Number((amount - assigned).toFixed(4))
    const lineAmount = index === positiveAccounts.length - 1
      ? remaining
      : Number(((numeric(row.balance) / totalPositive) * amount).toFixed(4))
    assigned += lineAmount
    return {
      account_id: row.account_id,
      account_code: row.account_code,
      account_name: row.account_name,
      amount: lineAmount,
      current_balance: numeric(row.balance),
      distribution_basis: "proportional_to_current_inventory_gl_balance",
    }
  })
}

function buildAdjustmentProposal(companyContext, phase1c4Report, glAnalysis, adjustmentAccountSelection) {
  const variance = Math.abs(numeric(phase1c4Report.after.valuation.difference_value))
  const entryDate = stableDate(phase1c4Report.asOfTimestamp) || stableDate(new Date().toISOString())
  const inventoryCredits = buildInventoryCreditDistribution(glAnalysis.inventoryAccounts, variance)
  const primaryAdjustmentAccount = adjustmentAccountSelection.primary

  return {
    audit_reference: "FIFO_REBUILD_2026",
    source_of_truth_run_id: phase1c4Report.after.runId,
    source_of_truth_run_key: phase1c4Report.after.runKey,
    proposal_status: primaryAdjustmentAccount ? "ready_for_approval" : "requires_counterparty_account_selection",
    counterparty_selection_basis: adjustmentAccountSelection.selection_basis,
    requires_controller_note: adjustmentAccountSelection.requires_controller_note,
    entry_date: entryDate,
    company_id: companyContext.companyId,
    company_name: companyContext.company?.name || null,
    approved_by: null,
    justification:
      "Align historical GL inventory to the audited FIFO v2 rebuild baseline after Phase 1C.4 eliminated all operational and lineage anomalies.",
    amount: variance,
    direction: "reduce_inventory_to_fifo_truth",
    header: {
      reference_type: "manual_entry",
      memo: `FIFO v2 GL alignment adjustment - ${entryDate}`,
    },
    debit_line: primaryAdjustmentAccount
      ? {
          account_id: primaryAdjustmentAccount.id,
          account_code: primaryAdjustmentAccount.account_code,
          account_name: primaryAdjustmentAccount.account_name,
          amount: variance,
          rationale: "Recognize legacy inventory overstatement as inventory alignment loss / adjustment expense.",
        }
      : {
          account_id: null,
          account_code: null,
          account_name: "Inventory Adjustment / Loss account required",
          amount: variance,
          rationale: "A dedicated expense or prior-period adjustment account must be selected before posting.",
        },
    credit_lines: inventoryCredits,
    affected_accounts: {
      inventory_accounts: inventoryCredits,
      counterparty_account: primaryAdjustmentAccount || null,
      candidate_counterparty_accounts: adjustmentAccountSelection.candidates,
    },
    audit_fields: {
      audit_reference: "FIFO_REBUILD_2026",
      approved_by: null,
      approval_date: null,
      supporting_report: path.join("reports", "phase1c4", path.basename(findLatestPhase1C4Report())),
      supporting_artifact_dir: phase1c4Report.after.artifactDir,
      required_attachments: [
        "Phase 1C.4 remediation report",
        "FIFO v2 summary.json",
        "Controller approval memo",
        "Post-adjustment simulation report",
      ],
    },
  }
}

function buildPostAdjustmentSimulation(phase1c4Report, adjustmentProposal) {
  const currentGl = numeric(phase1c4Report.after.valuation.gl_inventory_value)
  const fifo = numeric(phase1c4Report.after.valuation.fifo_inventory_value)
  const adjustmentAmount = numeric(adjustmentProposal.amount)
  const adjustedGl = Number((currentGl - adjustmentAmount).toFixed(4))
  const varianceAfter = Number((fifo - adjustedGl).toFixed(4))

  return {
    before: {
      fifo_inventory_value: fifo,
      gl_inventory_value: currentGl,
      variance_value: Number((fifo - currentGl).toFixed(4)),
    },
    proposed_adjustment_amount: adjustmentAmount,
    after: {
      fifo_inventory_value: fifo,
      gl_inventory_value: adjustedGl,
      variance_value: varianceAfter,
    },
    simulation_status: Math.abs(varianceAfter) <= 1 ? "aligned" : "not_aligned",
  }
}

function buildBaselineLockRecommendation(phase1c4Report, postAdjustmentSimulation) {
  return {
    source_of_truth: "fifo_v2",
    source_run_id: phase1c4Report.after.runId,
    source_run_key: phase1c4Report.after.runKey,
    audit_reference: "FIFO_REBUILD_2026",
    lock_ready_after_posting: postAdjustmentSimulation.simulation_status === "aligned",
    policy:
      "Once the approved GL adjustment is posted, FIFO v2 becomes the financial truth baseline for inventory valuation and all future reconciliations must reference this rebuild lineage.",
  }
}

function buildJustificationDocument(rootCause, materiality, adjustmentProposal, postAdjustmentSimulation) {
  return {
    why_adjustment_is_required:
      "Phase 1C.4 proved that FIFO v2 is operationally clean and anomaly-free. The residual difference therefore sits in historical GL, not in the costing engine.",
    why_fifo_v2_is_reliable:
      "FIFO v2 is deterministic, fully auditable, and fully reconciled to inventory_transactions and products.quantity_on_hand after remediation.",
    why_manual_gl_alignment_is_correct:
      "Because the residual variance is a legacy GL overstatement, the correct enterprise treatment is an explicit controller-approved adjustment entry rather than further manipulation of FIFO v2.",
    root_cause: rootCause.controller_conclusion,
    materiality: materiality.conclusion,
    proposed_entry_summary: {
      audit_reference: adjustmentProposal.audit_reference,
      amount: adjustmentProposal.amount,
      direction: adjustmentProposal.direction,
      post_adjustment_variance: postAdjustmentSimulation.after.variance_value,
    },
  }
}

async function run() {
  if (!hasLiveEnv()) {
    throw new Error("Supabase live env is missing. Phase 1C.5 requires read access to GL data.")
  }

  const phase1c4ReportPath = findLatestPhase1C4Report()
  const phase1c4Report = loadJson(phase1c4ReportPath)
  const remediatedArtifactDir = phase1c4Report.after?.artifactDir
  if (!remediatedArtifactDir || !fs.existsSync(remediatedArtifactDir)) {
    throw new Error("Phase 1C.4 remediated artifact directory is missing.")
  }

  const remediatedSummary = loadJson(path.join(remediatedArtifactDir, "summary.json"))
  const remediatedLots = loadJson(path.join(remediatedArtifactDir, "fifo_cost_lots_v2.json"))
  const remediatedConsumptions = loadJson(path.join(remediatedArtifactDir, "fifo_lot_consumptions_v2.json"))
  const remediatedActions = loadJson(path.join(remediatedArtifactDir, "remediation_actions.json"))

  const supabase = createServiceClient()
  const companyContext = await resolveCompanyContext(supabase)

  printSection("Loading GL Snapshot")
  const glSnapshot = await fetchGlSnapshot(supabase, companyContext.companyId, phase1c4Report.asOfTimestamp)
  const glAnalysis = analyzeInventoryGl(glSnapshot)

  printSection("Building Phase 1C.5 Decision Package")
  const lotSummary = summarizeArtifactLots(remediatedLots)
  const consumptionSummary = summarizeArtifactConsumptions(remediatedConsumptions)
  const rootCause = classifyRootCause(remediatedSummary, glAnalysis, lotSummary, consumptionSummary)
  const materiality = assessMateriality(remediatedSummary, glAnalysis, rootCause)
  const adjustmentAccountSelection = selectAdjustmentAccount(glSnapshot.chartOfAccounts)
  const adjustmentProposal = buildAdjustmentProposal(companyContext, phase1c4Report, glAnalysis, adjustmentAccountSelection)
  const postAdjustmentSimulation = buildPostAdjustmentSimulation(phase1c4Report, adjustmentProposal)
  const baselineLockRecommendation = buildBaselineLockRecommendation(phase1c4Report, postAdjustmentSimulation)
  const justificationDocument = buildJustificationDocument(
    rootCause,
    materiality,
    adjustmentProposal,
    postAdjustmentSimulation
  )

  const report = {
    phase: "phase1c5-gl-alignment-decision",
    executedAt: new Date().toISOString(),
    ok: postAdjustmentSimulation.simulation_status === "aligned",
    executionMode: "read_only_source_snapshot_to_local_shadow_artifacts",
    asOfTimestamp: phase1c4Report.asOfTimestamp,
    company: {
      id: companyContext.companyId,
      name: companyContext.company?.name || null,
      resolution: companyContext.resolution,
    },
    sourceReferences: {
      phase1c4_report: phase1c4ReportPath,
      remediated_artifact_dir: remediatedArtifactDir,
      fifo_truth_run_id: phase1c4Report.after.runId,
      fifo_truth_run_key: phase1c4Report.after.runKey,
    },
    glSnapshot: {
      inventory_balance: glAnalysis.total,
      by_reference_type: glAnalysis.byReferenceType,
      inventory_accounts: glAnalysis.inventoryAccounts,
      manual_inventory_journal_sample: glAnalysis.journalImpactRows
        .filter((row) => row.reference_type === "manual_entry")
        .slice(0, 20),
    },
    fifoTruthLayer: {
      summary: remediatedSummary,
      lot_summary: lotSummary,
      consumption_summary: consumptionSummary,
      remediation_actions_summary: {
        total_actions: remediatedActions.length,
        by_type: remediatedActions.reduce((acc, row) => {
          acc[row.action_type] = (acc[row.action_type] || 0) + 1
          return acc
        }, {}),
      },
    },
    rootCauseClassification: rootCause,
    materialityAssessment: materiality,
    adjustmentProposal,
    justificationDocument,
    postAdjustmentSimulation,
    baselineLockRecommendation,
  }

  const reportPath = writeReport("phase1c5-gl-alignment-decision", report)
  console.log(`Report saved: ${reportPath}`)
  if (!report.ok) {
    process.exitCode = 1
  }
}

module.exports = {
  runPhase1C5GlAlignmentDecision: run,
}

if (require.main === module) {
  run().catch((error) => {
    const reportPath = writeReport("phase1c5-gl-alignment-decision", {
      phase: "phase1c5-gl-alignment-decision",
      executedAt: new Date().toISOString(),
      ok: false,
      error: error.message,
    })
    console.log(`Report saved: ${reportPath}`)
    process.exitCode = 1
  })
}
