/**
 * Manufacturing Accounting Service (v3.8.0 — Phase B)
 *
 * Provides post-RPC hooks that create the accounting journal entries required
 * by IAS 2 (Inventories) when:
 *   1. Raw materials are issued to production → Dr WIP / Cr Raw Materials
 *   2. Finished products are received from production → Dr Finished Goods / Cr WIP
 *
 * Design notes:
 * - All entries are created with status='draft' (require approval before
 *   they affect the trial balance).
 * - Hooks are non-fatal: if posting fails, the underlying inventory action
 *   is preserved and the failure is logged.
 * - Account lookup priority:
 *     1. companies.<account>_account_id (explicit per-company configuration)
 *     2. chart_of_accounts.sub_type match
 *     3. Account code fallback (1140 WIP, 1100 Inventory, etc.)
 * - All amounts come from inventory_transactions.unit_cost × quantity
 *   (which respects FIFO for raw materials).
 *
 * This is Phase B-1 (material cost only). Phase B-2 will add labor + overhead
 * application based on work_center cost rates (introduced in v3.7.0).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { rollbackJournalEntry } from "@/lib/services/rollback-journal-entry"

// ─────────────────────────────────────────────────────────────────────────────
// Account resolution
// ─────────────────────────────────────────────────────────────────────────────

export interface ManufacturingAccounts {
  wipAccountId: string
  rawMaterialsAccountId: string
  finishedGoodsAccountId: string
  wagesPayableAccountId?: string
  manufacturingOverheadAccountId?: string
}

/**
 * Resolve the manufacturing-related accounts for a company.
 *
 * Throws a descriptive error if a required account is missing. The caller can
 * catch and log without failing the underlying inventory action.
 */
export async function resolveManufacturingAccounts(
  supabase: SupabaseClient,
  companyId: string,
): Promise<ManufacturingAccounts> {
  // 1. Read company-level overrides
  const { data: company } = await supabase
    .from("companies")
    .select("wip_account_id, manufacturing_overhead_account_id, wages_payable_account_id")
    .eq("id", companyId)
    .maybeSingle()

  // 2. Read chart of accounts for fallback resolution
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, sub_type, account_type")
    .eq("company_id", companyId)
    .eq("is_active", true)
  const list = (accounts || []) as any[]

  const byCode = (code: string) => list.find((a) => a.account_code === code)?.id as string | undefined
  const bySubType = (sub: string) => list.find((a) => a.sub_type === sub)?.id as string | undefined
  const byName = (re: RegExp) =>
    list.find((a) => re.test(String(a.account_name || "")))?.id as string | undefined

  // WIP — STRICT: only sub_type='work_in_process' (code-based fallback removed
  // because 1140 collided with existing inventory account in production data)
  // v3.74.710 — 1145 REMOVED from this chain. It is "مواد في عهدة الفنّي",
  // the technician custody account shipped in the default chart since v3.74.685.
  // Falling back to it meant work-in-process postings landed in the custody
  // account: one account carrying two unrelated balances, neither meaningful.
  // WIP has its own code now (1146, sub_type work_in_process).
  const wipAccountId =
    (company?.wip_account_id as string | null) ||
    bySubType("work_in_process") ||
    byCode("1146") ||
    byName(/إنتاج تحت التشغيل/i)

  // Raw Materials Inventory (asset)
  const rawMaterialsAccountId =
    bySubType("raw_materials") ||
    bySubType("inventory") ||
    byCode("1140") ||  // fallback: 1140 is the conventional inventory code
    byName(/المخزون|inventory|raw materials/i)

  // Finished Goods (often same as general inventory in small ERPs)
  const finishedGoodsAccountId =
    bySubType("finished_goods") ||
    bySubType("inventory") ||
    rawMaterialsAccountId ||
    byName(/finished goods|منتج تام/i)

  // CRITICAL VALIDATION: WIP and Raw Materials MUST be different accounts
  // (otherwise we'd produce Dr X / Cr X journals — same account both sides)
  if (wipAccountId && rawMaterialsAccountId && wipAccountId === rawMaterialsAccountId) {
    throw new Error(
      "MANUFACTURING_ACCOUNTS_CONFLICT: WIP account and Raw Materials account " +
      "resolved to the SAME id. Configure them separately — WIP should have " +
      "sub_type='work_in_process' (e.g. account 1145), distinct from inventory.",
    )
  }
  if (wipAccountId && finishedGoodsAccountId && wipAccountId === finishedGoodsAccountId) {
    throw new Error(
      "MANUFACTURING_ACCOUNTS_CONFLICT: WIP account and Finished Goods account " +
      "resolved to the SAME id. Configure them separately.",
    )
  }

  // v3.74.710 — 2210 REMOVED. No account in the default chart carries sub_type
  // 'wages_payable' (accrued salaries ship as 2130 / 'accrued_salaries'), so this
  // chain always fell through to code 2210 — which in the default chart is
  // "القروض طويلة الأجل". Manufacturing wages would have been credited to the
  // long-term loans account. Match the sub_type the chart actually ships.
  const wagesPayableAccountId =
    (company?.wages_payable_account_id as string | null) ||
    bySubType("wages_payable") ||
    bySubType("accrued_salaries") ||
    byName(/الرواتب والأجور المستحقة/i) ||
    undefined

  const manufacturingOverheadAccountId =
    (company?.manufacturing_overhead_account_id as string | null) ||
    bySubType("manufacturing_overhead_applied") ||
    byCode("5410") ||
    undefined

  if (!wipAccountId) {
    throw new Error(
      "MANUFACTURING_ACCOUNTS_NOT_CONFIGURED: WIP account not found. " +
      "Either set companies.wip_account_id explicitly or ensure account_code='1140' " +
      "(sub_type='work_in_process') exists in chart_of_accounts.",
    )
  }
  if (!rawMaterialsAccountId) {
    throw new Error(
      "MANUFACTURING_ACCOUNTS_NOT_CONFIGURED: Raw materials / inventory account not found. " +
      "Ensure an account with sub_type='raw_materials' or sub_type='inventory' exists.",
    )
  }

  return {
    wipAccountId: wipAccountId as string,
    rawMaterialsAccountId: rawMaterialsAccountId as string,
    finishedGoodsAccountId: finishedGoodsAccountId as string,
    wagesPayableAccountId: wagesPayableAccountId as string | undefined,
    manufacturingOverheadAccountId: manufacturingOverheadAccountId as string | undefined,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create a journal entry header
// ─────────────────────────────────────────────────────────────────────────────

interface CreateEntryParams {
  supabase: SupabaseClient
  companyId: string
  branchId: string
  entryDate: string  // YYYY-MM-DD
  description: string
  referenceType: "manufacturing_material_issue" | "manufacturing_product_receipt" | "manufacturing_operation_cost"
  entryNumberPrefix: string
  costCenterId?: string | null
  warehouseId?: string | null
  userId: string
}

async function createEntryHeader(p: CreateEntryParams): Promise<{ id: string; entry_number: string } | null> {
  const refUuid = (typeof crypto !== "undefined" && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const entryNumber = `${p.entryNumberPrefix}-${Date.now()}`

  const { data, error } = await p.supabase
    .from("journal_entries")
    .insert({
      company_id: p.companyId,
      branch_id: p.branchId,
      cost_center_id: p.costCenterId ?? null,
      warehouse_id: p.warehouseId ?? null,
      entry_date: p.entryDate,
      entry_number: entryNumber,
      description: `${p.description} [${entryNumber}]`,
      reference_type: p.referenceType,
      reference_id: refUuid,
      status: "draft",
      posted_by: p.userId,
    })
    .select("id, entry_number")
    .single()

  if (error || !data) {
    console.error("[ManufacturingAccounting] createEntryHeader failed:", error?.message)
    return null
  }
  return data as { id: string; entry_number: string }
}

// ─────────────────────────────────────────────────────────────────────────────
// Material Issue: Dr WIP / Cr Raw Materials
// ─────────────────────────────────────────────────────────────────────────────

export interface MaterialIssueJournalResult {
  success: boolean
  journalEntryId?: string
  entryNumber?: string
  totalCost?: number
  lineCount?: number
  error?: string
}

/**
 * Post the accounting journal for a material-issue event.
 * Called AFTER `issue_manufacturing_production_order_materials_atomic` succeeds.
 *
 * Reads:
 *   - production_order_issue_events (the event header)
 *   - production_order_issue_lines (lines linking to inventory_transactions)
 *   - inventory_transactions (the actual unit_cost and total)
 *
 * Posts:
 *   Dr WIP                   <total>
 *      Cr Raw Materials              <total>
 */
export async function postMaterialIssueJournal(
  supabase: SupabaseClient,
  params: {
    companyId: string
    issueEventId: string
    userId: string
  },
): Promise<MaterialIssueJournalResult> {
  try {
    // 1. Fetch the issue event for metadata (branch, cost_center, date, etc.)
    const { data: event, error: eventErr } = await supabase
      .from("production_order_issue_events")
      .select("id, branch_id, warehouse_id, cost_center_id, posted_at, production_order_id, event_number")
      .eq("id", params.issueEventId)
      .eq("company_id", params.companyId)
      .maybeSingle()
    if (eventErr || !event) {
      return { success: false, error: `Issue event not found: ${eventErr?.message || params.issueEventId}` }
    }

    // 2. Fetch the lines + inventory transactions to compute the cost
    const { data: lines, error: linesErr } = await supabase
      .from("production_order_issue_lines")
      .select("id, issued_qty, inventory_transaction_id")
      .eq("issue_event_id", params.issueEventId)
      .eq("company_id", params.companyId)
    if (linesErr) {
      return { success: false, error: `Failed to fetch issue lines: ${linesErr.message}` }
    }
    if (!lines || lines.length === 0) {
      return { success: true, lineCount: 0, totalCost: 0 }  // nothing to post
    }

    const txnIds = lines.map((l: any) => l.inventory_transaction_id).filter(Boolean)
    if (txnIds.length === 0) {
      return { success: true, lineCount: lines.length, totalCost: 0 }
    }

    const { data: txns } = await supabase
      .from("inventory_transactions")
      .select("id, unit_cost, quantity_change, total_cost")
      .in("id", txnIds)
    const txnMap = new Map<string, any>()
    for (const t of (txns || [])) txnMap.set(String(t.id), t)

    let totalCost = 0
    for (const line of lines) {
      const txn = line.inventory_transaction_id ? txnMap.get(String(line.inventory_transaction_id)) : null
      // Prefer total_cost stored on the txn; otherwise compute unit_cost × qty
      const cost = txn
        ? Number(txn.total_cost ?? (Number(txn.unit_cost ?? 0) * Math.abs(Number(txn.quantity_change ?? line.issued_qty))))
        : 0
      totalCost += Math.abs(cost)
    }
    totalCost = Math.round(totalCost * 100) / 100
    if (totalCost <= 0.01) {
      return { success: true, lineCount: lines.length, totalCost: 0 }
    }

    // 3. Resolve accounts
    const accounts = await resolveManufacturingAccounts(supabase, params.companyId)

    // 4. Create journal entry header
    const entryDate = String(event.posted_at || new Date().toISOString()).slice(0, 10)
    const header = await createEntryHeader({
      supabase,
      companyId: params.companyId,
      branchId: event.branch_id,
      entryDate,
      description: `صرف مواد للإنتاج - ${event.event_number || params.issueEventId}`,
      referenceType: "manufacturing_material_issue",
      entryNumberPrefix: "MFG-ISSUE",
      costCenterId: event.cost_center_id,
      warehouseId: event.warehouse_id,
      userId: params.userId,
    })
    if (!header) {
      return { success: false, error: "Failed to create journal entry header" }
    }

    // 5. Insert the 2 lines (Dr WIP / Cr Raw Materials)
    const { error: linesPostErr } = await supabase
      .from("journal_entry_lines")
      .insert([
        {
          journal_entry_id: header.id,
          account_id: accounts.wipAccountId,
          debit_amount: totalCost,
          credit_amount: 0,
          description: "تكلفة المواد الخام المنصرفة إلى الإنتاج",
        },
        {
          journal_entry_id: header.id,
          account_id: accounts.rawMaterialsAccountId,
          debit_amount: 0,
          credit_amount: totalCost,
          description: "خصم مواد خام من المخزون",
        },
      ])
    if (linesPostErr) {
      // v3.74.757 — was "best effort", meaning nobody found out when the effort
      // failed. Now reported.
      await rollbackJournalEntry(supabase as any, header.id, "manufacturing material issue")
      return { success: false, error: `Failed to insert journal lines: ${linesPostErr.message}` }
    }

    return {
      success: true,
      journalEntryId: header.id,
      entryNumber: header.entry_number,
      totalCost,
      lineCount: lines.length,
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Unknown error" }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversion Cost Calculation (Labor + Manufacturing Overhead)
// ─────────────────────────────────────────────────────────────────────────────

export interface ConversionCostBreakdown {
  laborCost: number
  machineCost: number
  variableOverheadCost: number
  fixedOverheadCost: number
  totalConversionCost: number
  operationCount: number
  byOperation: Array<{
    operationCode: string
    operationName: string
    laborMinutes: number
    machineMinutes: number
    laborCost: number
    machineCost: number
    overheadCost: number
  }>
}

/**
 * Calculate the total conversion cost (Labor + Overhead) for a production order
 * by summing across all completed operations using the work_center cost rates.
 *
 * Formula per operation:
 *   labor_hours        = labor_time_minutes / 60
 *   labor_cost         = labor_hours × labor_cost_rate × (100 / efficiency_percent)
 *   machine_hours      = machine_time_minutes / 60
 *   machine_cost       = machine_hours × machine_cost_rate
 *   variable_overhead  = machine_hours × variable_overhead_rate
 *   fixed_overhead     = machine_hours × fixed_overhead_rate
 *
 * Only "completed" operations are included (status = 'completed').
 */
export async function calculateConversionCost(
  supabase: SupabaseClient,
  params: { companyId: string; productionOrderId: string },
): Promise<ConversionCostBreakdown> {
  // Fetch all completed operations with their work center rates
  const { data: ops, error: opsErr } = await supabase
    .from("manufacturing_production_order_operations")
    .select(`
      id, operation_code, operation_name, status,
      labor_time_minutes, machine_time_minutes,
      work_center_id,
      manufacturing_work_centers!inner(
        labor_cost_rate, machine_cost_rate,
        variable_overhead_rate, fixed_overhead_rate,
        cost_rate_uom, efficiency_percent
      )
    `)
    .eq("company_id", params.companyId)
    .eq("production_order_id", params.productionOrderId)
    .eq("status", "completed")

  if (opsErr) {
    console.warn("[calculateConversionCost] Failed to fetch operations:", opsErr.message)
    return { laborCost: 0, machineCost: 0, variableOverheadCost: 0, fixedOverheadCost: 0, totalConversionCost: 0, operationCount: 0, byOperation: [] }
  }

  let totalLabor = 0
  let totalMachine = 0
  let totalVarOh = 0
  let totalFixOh = 0
  const byOperation: ConversionCostBreakdown["byOperation"] = []

  for (const op of (ops || [])) {
    const wc = Array.isArray((op as any).manufacturing_work_centers)
      ? (op as any).manufacturing_work_centers[0]
      : (op as any).manufacturing_work_centers
    if (!wc) continue

    const laborRate = Number(wc.labor_cost_rate || 0)
    const machineRate = Number(wc.machine_cost_rate || 0)
    const varOhRate = Number(wc.variable_overhead_rate || 0)
    const fixOhRate = Number(wc.fixed_overhead_rate || 0)
    const efficiency = Number(wc.efficiency_percent || 100)

    // Convert minutes to hours (default UOM is per_hour). per_minute / per_unit not supported yet
    const laborMin = Number((op as any).labor_time_minutes || 0)
    const machineMin = Number((op as any).machine_time_minutes || 0)
    const laborHours = laborMin / 60
    const machineHours = machineMin / 60

    // Efficiency adjustment for labor: if efficiency=95%, actual time = planned × (100/95)
    const efficiencyMultiplier = efficiency > 0 ? 100 / efficiency : 1

    const opLabor = laborHours * laborRate * efficiencyMultiplier
    const opMachine = machineHours * machineRate
    const opVarOh = machineHours * varOhRate
    const opFixOh = machineHours * fixOhRate

    totalLabor += opLabor
    totalMachine += opMachine
    totalVarOh += opVarOh
    totalFixOh += opFixOh

    byOperation.push({
      operationCode: String((op as any).operation_code || ""),
      operationName: String((op as any).operation_name || ""),
      laborMinutes: laborMin,
      machineMinutes: machineMin,
      laborCost: Math.round(opLabor * 100) / 100,
      machineCost: Math.round(opMachine * 100) / 100,
      overheadCost: Math.round((opVarOh + opFixOh) * 100) / 100,
    })
  }

  const round = (n: number) => Math.round(n * 100) / 100
  return {
    laborCost: round(totalLabor),
    machineCost: round(totalMachine),
    variableOverheadCost: round(totalVarOh),
    fixedOverheadCost: round(totalFixOh),
    totalConversionCost: round(totalLabor + totalMachine + totalVarOh + totalFixOh),
    operationCount: (ops || []).length,
    byOperation,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Receipt: Dr Finished Goods / Cr WIP + Cr Wages Payable + Cr MOH Applied
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductReceiptJournalResult {
  success: boolean
  journalEntryId?: string
  entryNumber?: string
  totalCost?: number          // material + labor + overhead
  materialCost?: number
  conversionCost?: number     // labor + overhead
  lineCount?: number
  error?: string
}

/**
 * Post the accounting journal for a finished-product receipt event.
 * Called AFTER `receive_manufacturing_production_order_finished_product_atomic` succeeds.
 *
 * v3.9.0 (Phase B-2): Now includes Labor + Manufacturing Overhead in addition to materials.
 *
 * Full IAS 2-compliant journal:
 *   Dr Finished Goods                  [material + conversion]
 *      Cr WIP                                  [material cost - relieves WIP]
 *      Cr Wages Payable                        [labor cost - new liability]
 *      Cr MOH Applied                          [overhead cost - new credit]
 *
 * The conversion cost is calculated from completed operations × work_center rates.
 * If work centers have 0 cost rates, conversion = 0 and behavior is same as v3.8 (material only).
 */
export async function postProductReceiptJournal(
  supabase: SupabaseClient,
  params: {
    companyId: string
    receiptEventId: string
    userId: string
  },
): Promise<ProductReceiptJournalResult> {
  try {
    const { data: event, error: eventErr } = await supabase
      .from("production_order_receipt_events")
      .select("id, branch_id, warehouse_id, cost_center_id, posted_at, production_order_id, event_number")
      .eq("id", params.receiptEventId)
      .eq("company_id", params.companyId)
      .maybeSingle()
    if (eventErr || !event) {
      return { success: false, error: `Receipt event not found: ${eventErr?.message || params.receiptEventId}` }
    }

    const { data: lines, error: linesErr } = await supabase
      .from("production_order_receipt_lines")
      .select("id, received_qty, inventory_transaction_id")
      .eq("receipt_event_id", params.receiptEventId)
      .eq("company_id", params.companyId)
    if (linesErr) {
      return { success: false, error: `Failed to fetch receipt lines: ${linesErr.message}` }
    }
    if (!lines || lines.length === 0) {
      return { success: true, lineCount: 0, totalCost: 0 }
    }

    // ─── 1. Material cost from inventory transactions ───
    const txnIds = lines.map((l: any) => l.inventory_transaction_id).filter(Boolean)
    let materialCost = 0
    if (txnIds.length > 0) {
      const { data: txns } = await supabase
        .from("inventory_transactions")
        .select("id, unit_cost, quantity_change, total_cost")
        .in("id", txnIds)
      const txnMap = new Map<string, any>()
      for (const t of (txns || [])) txnMap.set(String(t.id), t)
      for (const line of lines) {
        const txn = line.inventory_transaction_id ? txnMap.get(String(line.inventory_transaction_id)) : null
        const cost = txn
          ? Number(txn.total_cost ?? (Number(txn.unit_cost ?? 0) * Math.abs(Number(txn.quantity_change ?? line.received_qty))))
          : 0
        materialCost += Math.abs(cost)
      }
    }
    materialCost = Math.round(materialCost * 100) / 100

    // ─── 2. Conversion cost from completed operations × work_center rates ───
    const conversion = await calculateConversionCost(supabase, {
      companyId: params.companyId,
      productionOrderId: String(event.production_order_id),
    })
    const laborCost = conversion.laborCost
    const overheadCost = conversion.machineCost + conversion.variableOverheadCost + conversion.fixedOverheadCost
    const conversionCost = laborCost + overheadCost
    const totalCost = Math.round((materialCost + conversionCost) * 100) / 100

    if (totalCost <= 0.01) {
      return { success: true, lineCount: lines.length, totalCost: 0, materialCost: 0, conversionCost: 0 }
    }

    // ─── 3. Resolve accounts (validates WIP, Raw Mat, FG; Wages/MOH may be undefined) ───
    const accounts = await resolveManufacturingAccounts(supabase, params.companyId)
    if (conversionCost > 0.01) {
      if (!accounts.wagesPayableAccountId) {
        return {
          success: false,
          error: "MANUFACTURING_ACCOUNTS_NOT_CONFIGURED: Wages Payable account not found. " +
            "Either configure companies.wages_payable_account_id or create account_code='2210' with sub_type='wages_payable'.",
        }
      }
      if (!accounts.manufacturingOverheadAccountId) {
        return {
          success: false,
          error: "MANUFACTURING_ACCOUNTS_NOT_CONFIGURED: Manufacturing Overhead Applied account not found. " +
            "Either configure companies.manufacturing_overhead_account_id or create account_code='5410' with sub_type='manufacturing_overhead_applied'.",
        }
      }
    }

    // ─── 4. Create journal header ───
    const entryDate = String(event.posted_at || new Date().toISOString()).slice(0, 10)
    const header = await createEntryHeader({
      supabase,
      companyId: params.companyId,
      branchId: event.branch_id,
      entryDate,
      description: conversionCost > 0
        ? `استلام منتج تام (مواد + تحويل) - ${event.event_number || params.receiptEventId}`
        : `استلام منتج تام (مواد فقط) - ${event.event_number || params.receiptEventId}`,
      referenceType: "manufacturing_product_receipt",
      entryNumberPrefix: "MFG-RECV",
      costCenterId: event.cost_center_id,
      warehouseId: event.warehouse_id,
      userId: params.userId,
    })
    if (!header) {
      return { success: false, error: "Failed to create journal entry header" }
    }

    // ─── 5. Build the lines: Dr FG / Cr WIP + Cr Wages + Cr MOH ───
    const linesToInsert: any[] = [
      {
        journal_entry_id: header.id,
        account_id: accounts.finishedGoodsAccountId,
        debit_amount: totalCost,
        credit_amount: 0,
        description: "إدخال منتج تام إلى مخزون البضاعة الجاهزة (مواد + تحويل)",
      },
    ]
    if (materialCost > 0.01) {
      linesToInsert.push({
        journal_entry_id: header.id,
        account_id: accounts.wipAccountId,
        debit_amount: 0,
        credit_amount: materialCost,
        description: "تخريج تكلفة المواد من الإنتاج تحت التشغيل",
      })
    }
    if (laborCost > 0.01 && accounts.wagesPayableAccountId) {
      linesToInsert.push({
        journal_entry_id: header.id,
        account_id: accounts.wagesPayableAccountId,
        debit_amount: 0,
        credit_amount: Math.round(laborCost * 100) / 100,
        description: "تحميل تكلفة العمالة المباشرة على الإنتاج",
      })
    }
    if (overheadCost > 0.01 && accounts.manufacturingOverheadAccountId) {
      linesToInsert.push({
        journal_entry_id: header.id,
        account_id: accounts.manufacturingOverheadAccountId,
        debit_amount: 0,
        credit_amount: Math.round(overheadCost * 100) / 100,
        description: "تحميل الأعباء الصناعية على الإنتاج (آلة + متغيرة + ثابتة)",
      })
    }

    // Sanity: debits must equal credits
    const totalDebit = linesToInsert.reduce((s, l) => s + Number(l.debit_amount || 0), 0)
    const totalCredit = linesToInsert.reduce((s, l) => s + Number(l.credit_amount || 0), 0)
    if (Math.abs(totalDebit - totalCredit) > 0.02) {
      // v3.74.757 — aborting an unbalanced entry only helps if the header
      // actually goes away.
      await rollbackJournalEntry(supabase as any, header.id, "manufacturing unbalanced abort")
      return {
        success: false,
        error: `Journal would be unbalanced: Dr=${totalDebit} vs Cr=${totalCredit}. Aborted.`,
      }
    }

    const { error: linesPostErr } = await supabase.from("journal_entry_lines").insert(linesToInsert)
    if (linesPostErr) {
      // v3.74.757 — see above.
      await rollbackJournalEntry(supabase as any, header.id, "manufacturing production posting")
      return { success: false, error: `Failed to insert journal lines: ${linesPostErr.message}` }
    }

    return {
      success: true,
      journalEntryId: header.id,
      entryNumber: header.entry_number,
      totalCost,
      materialCost,
      conversionCost: Math.round(conversionCost * 100) / 100,
      lineCount: linesToInsert.length,
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Unknown error" }
  }
}
