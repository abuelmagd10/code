const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const phase1c = require("../phase1c/_shared")

function ensurePhase1C2ReportDir() {
  const dir = path.join(process.cwd(), "reports", "phase1c2")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function ensurePhase1C2ArtifactRoot() {
  const dir = path.join(process.cwd(), "artifacts", "phase1c2")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function ensurePhase1C2ArtifactDir(runKey) {
  const root = ensurePhase1C2ArtifactRoot()
  const dir = path.join(root, runKey)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function stableSortObject(value) {
  if (Array.isArray(value)) {
    return value.map(stableSortObject)
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    const sorted = {}
    for (const key of Object.keys(value).sort()) {
      sorted[key] = stableSortObject(value[key])
    }
    return sorted
  }

  return value
}

function stableStringify(value) {
  return JSON.stringify(stableSortObject(value))
}

function stableHash(value) {
  const normalized = typeof value === "string" ? value : stableStringify(value)
  return crypto.createHash("sha256").update(normalized).digest("hex")
}

function stableUuid(...parts) {
  const hash = stableHash(parts.join("|")).slice(0, 32)
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-")
}

function numeric(value) {
  return Number(value || 0)
}

function writePhase1C2Report(name, data) {
  const dir = ensurePhase1C2ReportDir()
  const target = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${name}.json`)
  fs.writeFileSync(target, JSON.stringify(data, null, 2), "utf8")
  return target
}

function writeArtifactJson(runKey, fileName, data) {
  const dir = ensurePhase1C2ArtifactDir(runKey)
  const target = path.join(dir, fileName)
  fs.writeFileSync(target, JSON.stringify(data, null, 2), "utf8")
  return target
}

function exitWithPhase1C2Report(name, report) {
  const reportPath = writePhase1C2Report(name, report)
  console.log(`Report saved: ${reportPath}`)
  if (report.ok === false) {
    process.exitCode = 1
  }
}

module.exports = {
  ...phase1c,
  ensurePhase1C2ReportDir,
  ensurePhase1C2ArtifactRoot,
  ensurePhase1C2ArtifactDir,
  stableStringify,
  stableHash,
  stableUuid,
  numeric,
  writePhase1C2Report,
  writeArtifactJson,
  exitWithPhase1C2Report,
}
