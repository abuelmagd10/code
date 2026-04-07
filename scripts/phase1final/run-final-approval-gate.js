const {
  createServiceClient,
  hasLiveEnv,
  numeric,
  printSection,
  resolveCompanyContext,
  stableUuid,
} = require("../phase1c2/_shared")
const { listReportFiles, loadJson, writeReport } = require("./_shared")

function lower(value) {
  return String(value || "").trim().toLowerCase()
}

function findLatestPhase1C5Report(companyId = null) {
  const files = listReportFiles(
    `${process.cwd()}\\reports\\phase1c5`,
    "phase1c5-gl-alignment-decision.json"
  )

  for (const file of files) {
    const data = loadJson(file.path)
    if (!data?.ok) continue
    if (companyId && data?.company?.id !== companyId) continue
    return {
      path: file.path,
      data,
    }
  }

  throw new Error("No approved Phase 1C.5 report was found.")
}

async function fetchOptionalBranchContext(supabase, companyId) {
  const { data, error } = await supabase
    .from("branches")
    .select("id")
    .eq("company_id", companyId)
    .limit(1)

  if (error) {
    return { branchId: null }
  }

  return {
    branchId: data?.[0]?.id || null,
  }
}

async function fetchJournalEntryByReference(supabase, companyId, referenceType, referenceId) {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("company_id", companyId)
    .eq("reference_type", referenceType)
    .eq("reference_id", referenceId)
    .or("is_deleted.is.null,is_deleted.eq.false")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function fetchJournalEntryById(supabase, journalEntryId) {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("id", journalEntryId)
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function fetchJournalLines(supabase, journalEntryId) {
  const { data, error } = await supabase
    .from("journal_entry_lines")
    .select("*")
    .eq("journal_entry_id", journalEntryId)

  if (error) throw error
  return data || []
}

async function fetchInventoryAccounts(supabase, companyId) {
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, sub_type, is_active")
    .eq("company_id", companyId)

  if (error) throw error

  return (data || []).filter((account) => {
    const subType = lower(account.sub_type)
    const name = lower(account.account_name)
    return (
      account.is_active !== false &&
      (
        subType === "inventory" ||
        subType === "stock" ||
        name.includes("inventory") ||
        name.includes("مخزون")
      )
    )
  })
}

async function computeCurrentGlInventory(supabase, companyId) {
  const inventoryAccounts = await fetchInventoryAccounts(supabase, companyId)
  const inventoryAccountIds = inventoryAccounts.map((row) => row.id)
  if (inventoryAccountIds.length === 0) {
    return {
      total: 0,
      inventoryAccounts: [],
    }
  }

  const { data: postedEntries, error: postedEntriesError } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "posted")
    .or("is_deleted.is.null,is_deleted.eq.false")
    .is("deleted_at", null)

  if (postedEntriesError) throw postedEntriesError

  const postedIds = (postedEntries || []).map((row) => row.id)
  let total = 0
  const byAccount = new Map()

  if (postedIds.length > 0) {
    const { data: lines, error: linesError } = await supabase
      .from("journal_entry_lines")
      .select("journal_entry_id, account_id, debit_amount, credit_amount")
      .in("journal_entry_id", postedIds)
      .in("account_id", inventoryAccountIds)

    if (linesError) throw linesError

    for (const line of lines || []) {
      const amount = numeric(line.debit_amount) - numeric(line.credit_amount)
      total += amount
      const account = inventoryAccounts.find((row) => row.id === line.account_id)
      const bucket = byAccount.get(line.account_id) || {
        account_id: line.account_id,
        account_code: account?.account_code || null,
        account_name: account?.account_name || null,
        balance: 0,
      }
      bucket.balance = Number((numeric(bucket.balance) + amount).toFixed(4))
      byAccount.set(line.account_id, bucket)
    }
  }

  return {
    total: Number(total.toFixed(4)),
    inventoryAccounts: [...byAccount.values()].sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance)),
  }
}

function buildLinesPayload(phase1c5Report, auditReference) {
  const proposal = phase1c5Report.adjustmentProposal
  return [
    {
      account_id: proposal.debit_line.account_id,
      debit_amount: numeric(proposal.debit_line.amount),
      credit_amount: 0,
      description: `${auditReference} | inventory alignment debit`,
    },
    ...proposal.credit_lines.map((line, index) => ({
      account_id: line.account_id,
      debit_amount: 0,
      credit_amount: numeric(line.amount),
      description: `${auditReference} | inventory alignment credit ${index + 1}`,
    })),
  ]
}

function sumLines(lines, side) {
  return Number(
    (lines || []).reduce((total, line) => total + numeric(line[side]), 0).toFixed(4)
  )
}

async function createOrReuseApprovalEntry(supabase, companyContext, phase1c5Report, approvalConfig) {
  const proposal = phase1c5Report.adjustmentProposal
  const branchContext = await fetchOptionalBranchContext(supabase, companyContext.companyId)
  const referenceId = stableUuid(
    companyContext.companyId,
    proposal.audit_reference,
    proposal.source_of_truth_run_key || proposal.source_of_truth_run_id,
    "phase1-final-approval"
  )

  const existing = await fetchJournalEntryByReference(
    supabase,
    companyContext.companyId,
    "manual_entry",
    referenceId
  )

  if (existing) {
    const lines = await fetchJournalLines(supabase, existing.id)
    return {
      created: false,
      referenceId,
      entry: existing,
      lines,
    }
  }

  const description = [
    proposal.audit_reference,
    "Final Phase 1 GL alignment",
    `approval_ref=${approvalConfig.approvalReference}`,
    `approved_by=${approvalConfig.approvedBy}`,
    `run_key=${proposal.source_of_truth_run_key}`,
  ].join(" | ")

  const linesPayload = buildLinesPayload(phase1c5Report, proposal.audit_reference)

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "create_journal_entry_atomic",
    {
      p_company_id: companyContext.companyId,
      p_reference_type: "manual_entry",
      p_reference_id: referenceId,
      p_entry_date: proposal.entry_date,
      p_description: description,
      p_branch_id: branchContext.branchId,
      p_cost_center_id: null,
      p_warehouse_id: null,
      p_lines: linesPayload,
    }
  )

  if (rpcError) throw rpcError

  if (!rpcResult?.success && !rpcResult?.entry_id && !rpcResult?.existing_id) {
    throw new Error(rpcResult?.error || "Failed to create final approval journal entry.")
  }

  const entryId = rpcResult.entry_id || rpcResult.existing_id || rpcResult.id
  if (!entryId) {
    throw new Error("Final approval journal entry RPC did not return an entry id.")
  }

  const entry = await fetchJournalEntryById(supabase, entryId)
  const lines = await fetchJournalLines(supabase, entryId)
  return {
    created: true,
    referenceId,
    entry,
    lines,
  }
}

function buildAuditTrace(phase1c5Report, journalEntry, journalLines, glAfter) {
  const proposal = phase1c5Report.adjustmentProposal
  const totalDebit = sumLines(journalLines, "debit_amount")
  const totalCredit = sumLines(journalLines, "credit_amount")
  const expectedAmount = numeric(proposal.amount)

  return {
    source_truth_run_id: proposal.source_of_truth_run_id,
    source_truth_run_key: proposal.source_of_truth_run_key,
    source_report: phase1c5Report.sourceReferences?.phase1c4_report || null,
    adjustment_decision_report: phase1c5Report.adjustmentProposal?.audit_fields?.supporting_report || null,
    journal_entry_id: journalEntry?.id || null,
    journal_entry_status: journalEntry?.status || null,
    journal_entry_number: journalEntry?.entry_number || journalEntry?.journal_number || null,
    journal_reference_type: journalEntry?.reference_type || null,
    journal_reference_id: journalEntry?.reference_id || null,
    audit_reference: proposal.audit_reference,
    line_totals: {
      totalDebit,
      totalCredit,
      expectedAmount,
      balanced: Math.abs(totalDebit - totalCredit) <= 0.01,
      matchedExpectedAmount:
        Math.abs(totalDebit - expectedAmount) <= 0.01 &&
        Math.abs(totalCredit - expectedAmount) <= 0.01,
    },
    gl_after_posting: glAfter,
  }
}

async function run() {
  if (!hasLiveEnv()) {
    throw new Error("Supabase live env is missing. Final Approval Gate requires production access.")
  }

  const supabase = createServiceClient()
  const companyContext = await resolveCompanyContext(supabase)
  const latestPhase1c5 = findLatestPhase1C5Report(companyContext.companyId)
  const phase1c5Report = latestPhase1c5.data

  const approvalConfig = {
    approvedBy: process.env.PHASE1_FINAL_APPROVED_BY || "terminal-management-approval",
    approvalReference:
      process.env.PHASE1_FINAL_APPROVAL_REFERENCE || "PHASE1_FINAL_APPROVAL_2026-04-06",
    source: process.env.PHASE1_FINAL_APPROVAL_REFERENCE ? "env" : "session-default",
  }

  printSection("Posting Final GL Alignment Entry")
  const postingResult = await createOrReuseApprovalEntry(
    supabase,
    companyContext,
    phase1c5Report,
    approvalConfig
  )

  if (!postingResult.entry) {
    throw new Error("Final approval journal entry could not be loaded after posting.")
  }

  printSection("Verifying GL Alignment")
  const glAfter = await computeCurrentGlInventory(supabase, companyContext.companyId)
  const fifoTruthValue = numeric(phase1c5Report.postAdjustmentSimulation?.after?.fifo_inventory_value)
  const varianceAfter = Number((fifoTruthValue - numeric(glAfter.total)).toFixed(4))
  const journalBalance = {
    totalDebit: sumLines(postingResult.lines, "debit_amount"),
    totalCredit: sumLines(postingResult.lines, "credit_amount"),
  }

  const auditTrace = buildAuditTrace(
    phase1c5Report,
    postingResult.entry,
    postingResult.lines,
    glAfter
  )

  const report = {
    phase: "phase1-final-approval-gate",
    executedAt: new Date().toISOString(),
    ok:
      postingResult.entry.status === "posted" &&
      Math.abs(varianceAfter) <= 1 &&
      Math.abs(journalBalance.totalDebit - journalBalance.totalCredit) <= 0.01,
    executionMode: "live_production_adjustment",
    company: {
      id: companyContext.companyId,
      name: companyContext.company?.name || null,
      resolution: companyContext.resolution,
    },
    auditReference: phase1c5Report.adjustmentProposal.audit_reference,
    approval: approvalConfig,
    sourceReferences: {
      phase1c5_report: latestPhase1c5.path,
      phase1c4_report: phase1c5Report.sourceReferences?.phase1c4_report || null,
      remediated_artifact_dir: phase1c5Report.sourceReferences?.remediated_artifact_dir || null,
    },
    proposedAdjustment: phase1c5Report.adjustmentProposal,
    journalEntry: {
      id: postingResult.entry.id,
      entryNumber: postingResult.entry.entry_number || postingResult.entry.journal_number || null,
      status: postingResult.entry.status || null,
      referenceType: postingResult.entry.reference_type || null,
      referenceId: postingResult.referenceId,
      description: postingResult.entry.description || null,
      created: postingResult.created,
      lineCount: postingResult.lines.length,
      totalDebit: journalBalance.totalDebit,
      totalCredit: journalBalance.totalCredit,
      lines: postingResult.lines.map((line) => ({
        account_id: line.account_id,
        debit_amount: numeric(line.debit_amount),
        credit_amount: numeric(line.credit_amount),
        description: line.description || null,
      })),
    },
    alignmentCheck: {
      fifoTruthValue,
      glInventoryValue: glAfter.total,
      varianceAfter,
      inventoryAccounts: glAfter.inventoryAccounts,
    },
    baselineLock: {
      locked: Math.abs(varianceAfter) <= 1,
      source: "fifo_v2",
      runId: phase1c5Report.adjustmentProposal.source_of_truth_run_id,
      runKey: phase1c5Report.adjustmentProposal.source_of_truth_run_key,
      fifoTruthValue,
      reportPath: latestPhase1c5.path,
    },
    auditTrace,
  }

  const reportPath = writeReport("phase1-final-approval-gate", report)
  console.log(`Report saved: ${reportPath}`)
  if (!report.ok) {
    process.exitCode = 1
  }
}

if (require.main === module) {
  run().catch((error) => {
    const reportPath = writeReport("phase1-final-approval-gate", {
      phase: "phase1-final-approval-gate",
      executedAt: new Date().toISOString(),
      ok: false,
      error: error.message,
    })
    console.log(`Report saved: ${reportPath}`)
    process.exitCode = 1
  })
}
