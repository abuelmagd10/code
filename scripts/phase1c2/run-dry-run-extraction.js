const { exitWithPhase1C2Report } = require("./_shared")
const { runPhase1C2DryRun } = require("./engine")

async function run() {
  const result = await runPhase1C2DryRun({
    allowCostFallback: process.env.PHASE1C2_ALLOW_COST_FALLBACK === "1",
    cutoffTimestamp: process.env.PHASE1C2_CUTOFF || null,
    persistArtifacts: true,
  })

  const report = {
    phase: "phase1c2-dry-run-extraction",
    executedAt: new Date().toISOString(),
    ok: result.summary.status.ok,
    company: {
      id: result.companyContext.companyId,
      name: result.companyContext.company?.name || null,
      resolution: result.companyContext.resolution,
    },
    run: result.summary.run,
    counts: result.summary.counts,
    valuation: result.summary.valuation,
    warnings: result.warnings,
    eventCompleteness: result.eventCompleteness,
    suspenseResolutionBacklogSample: result.suspenseResolutionBacklog.slice(0, 20),
    validationSample: result.validations.slice(0, 20),
    anomalySample: result.anomalies.slice(0, 20),
    topProducts: result.productValuationRows.slice(0, 20),
    topWarehouses: result.warehouseValuationRows.slice(0, 20),
    cutoverBlocked: true,
  }

  exitWithPhase1C2Report("phase1c2-dry-run-extraction", report)
}

run().catch((error) => {
  exitWithPhase1C2Report("phase1c2-dry-run-extraction", {
    phase: "phase1c2-dry-run-extraction",
    executedAt: new Date().toISOString(),
    ok: false,
    error: error.message,
  })
})
