const fs = require("fs")
const path = require("path")
const { ensurePhase1C2ArtifactRoot, exitWithPhase1C2Report } = require("./_shared")

function latestArtifactDir() {
  const root = ensurePhase1C2ArtifactRoot()
  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(root, entry.name)
      const stat = fs.statSync(fullPath)
      return {
        name: entry.name,
        fullPath,
        mtimeMs: stat.mtimeMs,
      }
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)

  return entries[0] || null
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function resolveArtifactDir() {
  const requestedRunKey = process.env.PHASE1C2_RUN_KEY
  const root = ensurePhase1C2ArtifactRoot()

  if (requestedRunKey) {
    const requested = path.join(root, requestedRunKey)
    if (!fs.existsSync(requested)) {
      throw new Error(`Artifact run key not found: ${requestedRunKey}`)
    }
    return requested
  }

  const latest = latestArtifactDir()
  if (!latest) {
    throw new Error("No Phase 1C.2 artifact directories were found.")
  }
  return latest.fullPath
}

async function run() {
  const artifactDir = resolveArtifactDir()
  const summary = loadJson(path.join(artifactDir, "summary.json"))
  const validations = loadJson(path.join(artifactDir, "fifo_rebuild_validation_results.json"))
  const anomalies = loadJson(path.join(artifactDir, "fifo_rebuild_anomalies_v2.json"))
  const reconciliation = loadJson(path.join(artifactDir, "fifo_gl_reconciliation_batches.json"))

  const blockingValidations = validations.filter((row) => ["failed", "blocked"].includes(String(row.status || "").toLowerCase()))
  const blockedAnomalies = anomalies.filter((row) => ["blocked", "error"].includes(String(row.severity || "").toLowerCase()))

  exitWithPhase1C2Report("phase1c2-validation-report", {
    phase: "phase1c2-validation-report",
    executedAt: new Date().toISOString(),
    ok: summary?.status?.ok === true,
    artifactDir,
    run: summary.run,
    valuation: summary.valuation,
    counts: summary.counts,
    blockingValidations: blockingValidations.slice(0, 50),
    blockedAnomalies: blockedAnomalies.slice(0, 50),
    reconciliation,
    cutoverGuards: {
      fifoV2Validated: blockingValidations.length === 0,
      glMatched: Math.abs(Number(summary?.valuation?.difference_value || 0)) <= 1,
      accountingValidationClean: false,
      cutoverAllowed: false,
    },
  })
}

run().catch((error) => {
  exitWithPhase1C2Report("phase1c2-validation-report", {
    phase: "phase1c2-validation-report",
    executedAt: new Date().toISOString(),
    ok: false,
    error: error.message,
  })
})
