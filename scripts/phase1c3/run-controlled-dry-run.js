const fs = require("fs")
const path = require("path")
const { runPhase1C2DryRun } = require("../phase1c2/engine")
const { stableHash, stableStringify } = require("../phase1c2/_shared")
const { loadApprovedFifoV2Baseline } = require("../phase1final/_shared")

function ensureReportDir() {
  const dir = path.join(process.cwd(), "reports", "phase1c3")
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

function resultHashes(result) {
  return {
    sourceRows: stableHash(result.sourceRows),
    canonicalEvents: stableHash(result.canonicalEvents),
    lots: stableHash(result.lots),
    consumptions: stableHash(result.consumptions),
    anomalies: stableHash(result.anomalies),
    validations: stableHash(result.validations),
    eventCompleteness: stableHash(result.eventCompleteness),
    suspenseResolutionBacklog: stableHash(result.suspenseResolutionBacklog),
    reconciliationBatches: stableHash(result.reconciliationBatches),
    productValuationRows: stableHash(result.productValuationRows),
    warehouseValuationRows: stableHash(result.warehouseValuationRows),
    summary: stableHash(result.summary),
  }
}

function hashEqualMap(left, right) {
  const rows = {}
  for (const key of Object.keys(left)) {
    rows[key] = {
      run1: left[key],
      run2: right[key],
      equal: left[key] === right[key],
    }
  }
  return rows
}

function assessDataQuality(result) {
  const validationMap = new Map((result.validations || []).map((row) => [row.validation_key, row]))
  const blockedAnomalies = (result.anomalies || []).filter((row) => ["blocked", "error"].includes(String(row.severity || "").toLowerCase()))
  const warningAnomalies = (result.anomalies || []).filter((row) => String(row.severity || "").toLowerCase() === "warning")

  const needsCleanup =
    blockedAnomalies.length > 0 ||
    (validationMap.get("gl_inventory_variance")?.status !== "passed") ||
    (validationMap.get("event_completeness")?.status !== "passed")

  return {
    repairableWithoutSourceMutation: blockedAnomalies.length === 0,
    requiresAdditionalCleanup: needsCleanup,
    blockedAnomalies: blockedAnomalies.length,
    warningAnomalies: warningAnomalies.length,
    keyValidationStatuses: Object.fromEntries(
      [...validationMap.entries()].map(([key, value]) => [key, value.status])
    ),
  }
}

async function run() {
  const asOfTimestamp = process.env.PHASE1C3_AS_OF || new Date().toISOString()
  const approvedBaseline = loadApprovedFifoV2Baseline(process.env.PHASE1B_COMPANY_ID || null)
  const useRemediatedProfile = !!approvedBaseline
  const runOptions = {
    asOfTimestamp,
    allowCostFallback: process.env.PHASE1C2_ALLOW_COST_FALLBACK === "1",
    persistArtifacts: true,
    executionProfile: useRemediatedProfile ? "phase1c4-remediated" : "phase1c3-controlled",
    enableForwardFillResolution: useRemediatedProfile,
    enableReturnWeightedRecovery: useRemediatedProfile,
    enablePeriodWeightedFallback: useRemediatedProfile,
  }

  const performance = []

  async function execute(label) {
    const beforeMemory = memorySnapshot()
    const startedAt = Date.now()
    const result = await runPhase1C2DryRun(runOptions)
    const afterMemory = memorySnapshot()
    const durationMs = Date.now() - startedAt
    performance.push({
      label,
      durationMs,
      beforeMemory,
      afterMemory,
      deltaHeapUsedMb: Number((afterMemory.heapUsedMb - beforeMemory.heapUsedMb).toFixed(2)),
      deltaRssMb: Number((afterMemory.rssMb - beforeMemory.rssMb).toFixed(2)),
    })
    return result
  }

  const run1 = await execute("run1")
  const run2 = await execute("run2")

  const hashes1 = resultHashes(run1)
  const hashes2 = resultHashes(run2)
  const determinism = hashEqualMap(hashes1, hashes2)
  const allEqual = Object.values(determinism).every((row) => row.equal)

  const report = {
    phase: "phase1c3-controlled-dry-run",
    executedAt: new Date().toISOString(),
    ok: run1.summary.status.ok && allEqual,
    executionMode: "read_only_source_snapshot_to_local_shadow_artifacts",
    asOfTimestamp,
    company: {
      id: run1.companyContext.companyId,
      name: run1.companyContext.company?.name || null,
      resolution: run1.companyContext.resolution,
    },
    validationBaseline: approvedBaseline || null,
    valuation: run1.summary.valuation,
    counts: run1.summary.counts,
    eventCompleteness: run1.eventCompleteness,
    dataQualityAssessment: assessDataQuality(run1),
    determinismProof: {
      identical: allEqual,
      hashes: determinism,
    },
    performanceBaseline: performance,
    anomalySample: run1.anomalies.slice(0, 25),
    suspenseResolutionBacklog: run1.suspenseResolutionBacklog.slice(0, 25),
    validationSample: run1.validations.slice(0, 25),
    warnings: run1.warnings,
  }

  const reportPath = writeReport("phase1c3-controlled-dry-run", report)
  console.log(`Report saved: ${reportPath}`)
  if (!report.ok) {
    process.exitCode = 1
  }
}

run().catch((error) => {
  const reportPath = writeReport("phase1c3-controlled-dry-run", {
    phase: "phase1c3-controlled-dry-run",
    executedAt: new Date().toISOString(),
    ok: false,
    error: error.message,
  })
  console.log(`Report saved: ${reportPath}`)
  process.exitCode = 1
})
