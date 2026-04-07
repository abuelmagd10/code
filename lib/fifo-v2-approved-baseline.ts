import fs from "fs"
import path from "path"

export interface ApprovedFifoV2Baseline {
  source: "phase1_final_approval_gate"
  reportPath: string
  companyId: string | null
  companyName: string | null
  auditReference: string | null
  fifoTruthValue: number
  runId: string | null
  runKey: string | null
  journalEntryId: string | null
  journalReferenceId: string | null
  locked: boolean
  effectiveAt: string | null
}

function listReportFiles(dir: string, suffix: string) {
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

export function loadApprovedFifoV2Baseline(
  companyId: string | null
): ApprovedFifoV2Baseline | null {
  const dir = path.join(process.cwd(), "reports", "phase1final")
  const files = listReportFiles(dir, "phase1-final-approval-gate.json")

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file.path, "utf8"))
    if (!data?.ok) continue
    if (!data?.baselineLock?.locked) continue
    if (companyId && data?.company?.id !== companyId) continue

    return {
      source: "phase1_final_approval_gate",
      reportPath: file.path,
      companyId: data?.company?.id || null,
      companyName: data?.company?.name || null,
      auditReference: data?.auditReference || null,
      fifoTruthValue: Number(data?.baselineLock?.fifoTruthValue || 0),
      runId: data?.baselineLock?.runId || null,
      runKey: data?.baselineLock?.runKey || null,
      journalEntryId: data?.journalEntry?.id || null,
      journalReferenceId: data?.journalEntry?.referenceId || null,
      locked: data?.baselineLock?.locked === true,
      effectiveAt: data?.executedAt || null,
    }
  }

  return null
}
