const fs = require("fs")
const path = require("path")
const phase1b = require("../phase1b/_shared")

function ensurePhase1CReportDir() {
  const dir = path.join(process.cwd(), "reports", "phase1c")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

function writeReport(name, data) {
  const dir = ensurePhase1CReportDir()
  const target = path.join(dir, `${timestamp()}-${name}.json`)
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

function toIsoDate(value) {
  if (!value) return null
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const date = value instanceof Date
    ? new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
    : new Date(value)

  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function toUtcDate(value) {
  const iso = toIsoDate(value)
  if (!iso) return null
  return new Date(`${iso}T00:00:00.000Z`)
}

function startOfMonth(value) {
  const date = toUtcDate(value)
  if (!date) return null
  date.setUTCDate(1)
  return toIsoDate(date)
}

function endOfMonth(value) {
  const date = toUtcDate(value)
  if (!date) return null
  return toIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)))
}

function enumerateMonths(startDate, endDate) {
  const start = toUtcDate(startDate)
  const end = toUtcDate(endDate)
  if (!start || !end) return []

  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const endCursor = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
  const rows = []

  while (cursor <= endCursor) {
    const periodStart = toIsoDate(cursor)
    const periodEnd = endOfMonth(cursor)
    rows.push({
      periodKey: periodStart.slice(0, 7),
      periodName: periodStart.slice(0, 7),
      periodStart,
      periodEnd,
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return rows
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0)
}

function chunk(array, size) {
  const rows = []
  for (let index = 0; index < array.length; index += size) {
    rows.push(array.slice(index, index + size))
  }
  return rows
}

module.exports = {
  ...phase1b,
  ensurePhase1CReportDir,
  writeReport,
  exitWithReport,
  toIsoDate,
  toUtcDate,
  startOfMonth,
  endOfMonth,
  enumerateMonths,
  sum,
  chunk,
}
