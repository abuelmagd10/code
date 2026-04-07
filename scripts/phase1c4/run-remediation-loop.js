const fs = require("fs")
const path = require("path")
const { runPhase1C2DryRun } = require("../phase1c2/engine")
const { numeric } = require("../phase1c2/_shared")

function ensureReportDir() {
  const dir = path.join(process.cwd(), "reports", "phase1c4")
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

function memorySnapshot() {
  const usage = process.memoryUsage()
  return {
    rssMb: Number((usage.rss / 1024 / 1024).toFixed(2)),
    heapUsedMb: Number((usage.heapUsed / 1024 / 1024).toFixed(2)),
    heapTotalMb: Number((usage.heapTotal / 1024 / 1024).toFixed(2)),
  }
}

function summarizePerformance(label, beforeMemory, afterMemory, startedAt) {
  return {
    label,
    durationMs: Date.now() - startedAt,
    beforeMemory,
    afterMemory,
    deltaHeapUsedMb: Number((afterMemory.heapUsedMb - beforeMemory.heapUsedMb).toFixed(2)),
    deltaRssMb: Number((afterMemory.rssMb - beforeMemory.rssMb).toFixed(2)),
  }
}

function validationMap(result) {
  return new Map((result.validations || []).map((row) => [row.validation_key, row]))
}

function classifyAnomalies(anomalies) {
  const classByType = {
    NEGATIVE_STOCK_SUSPENSE: "timing_issues",
    PURCHASE_RETURN_LOT_AFFINITY_BROKEN: "timing_issues",
    MISSING_SOURCE_COST: "missing_cost",
    UNLINKED_SALES_RETURN_COST: "broken_references",
    DUPLICATE_CONSUMPTION: "duplicate_consumption",
  }

  const countsByClass = {}
  const countsByType = {}
  const sampleByClass = {}

  for (const row of anomalies || []) {
    const anomalyType = row.anomaly_type || "UNKNOWN"
    const anomalyClass = classByType[anomalyType] || "other"
    countsByClass[anomalyClass] = (countsByClass[anomalyClass] || 0) + 1
    countsByType[anomalyType] = (countsByType[anomalyType] || 0) + 1
    const bucket = sampleByClass[anomalyClass] || []
    if (bucket.length < 20) {
      bucket.push(row)
    }
    sampleByClass[anomalyClass] = bucket
  }

  return {
    countsByClass,
    countsByType,
    sampleByClass,
  }
}

function summarizeRemediationActions(actions) {
  const countsByType = {}
  let totalResolvedQuantity = 0
  let totalResolvedAmount = 0

  for (const row of actions || []) {
    const actionType = row.action_type || "UNKNOWN"
    countsByType[actionType] = (countsByType[actionType] || 0) + 1
    totalResolvedQuantity += numeric(row.quantity)
    totalResolvedAmount += numeric(row.amount)
  }

  return {
    totalActions: (actions || []).length,
    countsByType,
    totalResolvedQuantity: Number(totalResolvedQuantity.toFixed(4)),
    totalResolvedAmount: Number(totalResolvedAmount.toFixed(4)),
    sample: (actions || []).slice(0, 20),
  }
}

function summarizeResult(result) {
  const validations = validationMap(result)
  return {
    runId: result.runContext.runId,
    runKey: result.runContext.runKey,
    executionProfile: result.runContext.executionProfile,
    artifactDir: path.join(process.cwd(), "artifacts", "phase1c2", result.runContext.runKey),
    valuation: result.summary.valuation,
    counts: result.summary.counts,
    validationStatuses: Object.fromEntries(
      [...validations.entries()].map(([key, value]) => [key, value.status])
    ),
    blockedReasons: result.summary.status.reasons,
  }
}

function remediationPlan(classification) {
  const plan = []
  const counts = classification.countsByClass || {}

  if ((counts.timing_issues || 0) > 0) {
    plan.push({
      anomaly_class: "timing_issues",
      count: counts.timing_issues,
      root_cause: "historical outbound movements were posted before cost-bearing inbound layers became available",
      remediation: "forward-fill the oldest unresolved suspense from the nearest deterministic inbound purchase/opening/adjustment layer",
    })
  }

  if ((counts.missing_cost || 0) > 0) {
    plan.push({
      anomaly_class: "missing_cost",
      count: counts.missing_cost,
      root_cause: "source documents do not expose a usable cost amount for the event",
      remediation: "recover cost from invoice allocations first, then invoice-level weighted recovery, then period-weighted fallback only with audit flags",
    })
  }

  if ((counts.broken_references || 0) > 0) {
    plan.push({
      anomaly_class: "broken_references",
      count: counts.broken_references,
      root_cause: "sales return documents lost original sale or original lot lineage",
      remediation: "reconstruct return lineage from original invoice allocations; if impossible, use period-weighted fallback with mandatory audit flag",
    })
  }

  if ((counts.duplicate_consumption || 0) > 0) {
    plan.push({
      anomaly_class: "duplicate_consumption",
      count: counts.duplicate_consumption,
      root_cause: "same outbound quantity was assigned cost more than once",
      remediation: "block activation and deduplicate lineage assignment before any cutover decision",
    })
  }

  return plan
}

function assessGlAlignment(beforeResult, afterResult) {
  const beforeDifference = numeric(beforeResult.summary.valuation.difference_value)
  const afterDifference = numeric(afterResult.summary.valuation.difference_value)
  const beforeBlocked = numeric(beforeResult.summary.counts.blocked_anomalies)
  const afterBlocked = numeric(afterResult.summary.counts.blocked_anomalies)

  let classification = "unresolved_source_data_integrity_gap"
  let recommendedStrategy = "continue_fifo_logic_remediation"

  if (Math.abs(afterDifference) <= 1 && afterBlocked === 0) {
    classification = "matched"
    recommendedStrategy = "no_adjustment_required"
  } else if (afterBlocked === 0) {
    classification = "legacy_gl_mismatch_requiring_manual_adjustment"
    recommendedStrategy = "manual_adjustment_journal_after_validation"
  } else if (Math.abs(afterDifference) < Math.abs(beforeDifference) || afterBlocked < beforeBlocked) {
    classification = "partially_improved_but_blocked_by_remaining_data_lineage"
    recommendedStrategy = "complete_remaining_fifo_lineage_remediation_before_any_gl_adjustment"
  }

  return {
    beforeDifference,
    afterDifference,
    improvementValue: Number((beforeDifference - afterDifference).toFixed(4)),
    beforeBlocked,
    afterBlocked,
    classification,
    recommendedStrategy,
  }
}

async function execute(label, options) {
  const beforeMemory = memorySnapshot()
  const startedAt = Date.now()
  const result = await runPhase1C2DryRun(options)
  const afterMemory = memorySnapshot()
  return {
    result,
    performance: summarizePerformance(label, beforeMemory, afterMemory, startedAt),
  }
}

async function run() {
  const asOfTimestamp = process.env.PHASE1C4_AS_OF || process.env.PHASE1C3_AS_OF || new Date().toISOString()

  const baseline = await execute("baseline", {
    asOfTimestamp,
    persistArtifacts: true,
    executionProfile: "phase1c4-baseline",
    enableForwardFillResolution: false,
    enableReturnWeightedRecovery: false,
    enablePeriodWeightedFallback: false,
    allowCostFallback: false,
  })

  const remediated = await execute("remediated", {
    asOfTimestamp,
    persistArtifacts: true,
    executionProfile: "phase1c4-remediated",
    enableForwardFillResolution: true,
    enableReturnWeightedRecovery: true,
    enablePeriodWeightedFallback: true,
    allowCostFallback: false,
  })

  const beforeClassification = classifyAnomalies(baseline.result.anomalies)
  const afterClassification = classifyAnomalies(remediated.result.anomalies)
  const glAlignment = assessGlAlignment(baseline.result, remediated.result)
  const beforeSummary = summarizeResult(baseline.result)
  const afterSummary = summarizeResult(remediated.result)

  const report = {
    phase: "phase1c4-remediation-loop",
    executedAt: new Date().toISOString(),
    ok:
      Math.abs(numeric(remediated.result.summary.valuation.difference_value)) <= 1 &&
      numeric(remediated.result.summary.counts.blocked_anomalies) === 0,
    executionMode: "read_only_source_snapshot_to_local_shadow_artifacts",
    asOfTimestamp,
    company: {
      id: remediated.result.companyContext.companyId,
      name: remediated.result.companyContext.company?.name || null,
      resolution: remediated.result.companyContext.resolution,
    },
    before: beforeSummary,
    after: afterSummary,
    delta: {
      fifoInventoryValueChange: Number((
        numeric(remediated.result.summary.valuation.fifo_inventory_value) -
        numeric(baseline.result.summary.valuation.fifo_inventory_value)
      ).toFixed(4)),
      glDifferenceChange: Number((
        numeric(remediated.result.summary.valuation.difference_value) -
        numeric(baseline.result.summary.valuation.difference_value)
      ).toFixed(4)),
      blockedAnomaliesChange:
        numeric(remediated.result.summary.counts.blocked_anomalies) -
        numeric(baseline.result.summary.counts.blocked_anomalies),
      totalAnomaliesChange:
        numeric(remediated.result.summary.counts.anomalies) -
        numeric(baseline.result.summary.counts.anomalies),
    },
    anomalyClassificationBefore: beforeClassification,
    anomalyClassificationAfter: afterClassification,
    remediationPlan: remediationPlan(beforeClassification),
    remediationActions: summarizeRemediationActions(remediated.result.remediationActions),
    glAlignmentAssessment: glAlignment,
    performanceBaseline: [baseline.performance, remediated.performance],
    warnings: [...new Set([...(baseline.result.warnings || []), ...(remediated.result.warnings || [])])],
  }

  const reportPath = writeReport("phase1c4-remediation-loop", report)
  console.log(`Report saved: ${reportPath}`)
  if (!report.ok) {
    process.exitCode = 1
  }
}

module.exports = {
  runPhase1C4RemediationLoop: run,
}

if (require.main === module) {
  run().catch((error) => {
    const reportPath = writeReport("phase1c4-remediation-loop", {
      phase: "phase1c4-remediation-loop",
      executedAt: new Date().toISOString(),
      ok: false,
      error: error.message,
    })
    console.log(`Report saved: ${reportPath}`)
    process.exitCode = 1
  })
}
