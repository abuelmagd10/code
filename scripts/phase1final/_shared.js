const fs = require("fs")
const path = require("path")

function ensureReportDir() {
  const dir = path.join(process.cwd(), "reports", "phase1final")
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

function listReportFiles(dir, suffix) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .map((name) => {
      const target = path.join(dir, name)
      return {
        name,
        path: target,
        mtimeMs: fs.statSync(target).mtimeMs,
      }
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
}

function loadJson(target) {
  return JSON.parse(fs.readFileSync(target, "utf8"))
}

function findLatestFinalApprovalReport(companyId = null) {
  const files = listReportFiles(
    path.join(process.cwd(), "reports", "phase1final"),
    "phase1-final-approval-gate.json"
  )

  for (const file of files) {
    const data = loadJson(file.path)
    if (!data?.ok) continue
    if (!data?.baselineLock?.locked) continue
    if (companyId && data?.company?.id !== companyId) continue
    return {
      path: file.path,
      data,
    }
  }

  return null
}

function loadApprovedFifoV2Baseline(companyId = null) {
  const latest = findLatestFinalApprovalReport(companyId)
  if (!latest) return null

  const report = latest.data
  return {
    source: "phase1_final_approval_gate",
    reportPath: latest.path,
    companyId: report.company?.id || null,
    companyName: report.company?.name || null,
    auditReference: report.auditReference || null,
    fifoTruthValue: Number(report.baselineLock?.fifoTruthValue || 0),
    runId: report.baselineLock?.runId || null,
    runKey: report.baselineLock?.runKey || null,
    journalEntryId: report.journalEntry?.id || null,
    journalReferenceId: report.journalEntry?.referenceId || null,
    locked: report.baselineLock?.locked === true,
    effectiveAt: report.executedAt || null,
  }
}

module.exports = {
  ensureReportDir,
  writeReport,
  listReportFiles,
  loadJson,
  findLatestFinalApprovalReport,
  loadApprovedFifoV2Baseline,
}
