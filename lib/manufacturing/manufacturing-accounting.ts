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

  // WIP
  const wipAccountId =
    (company?.wip_account_id as string | null) ||
    bySubType("work_in_process") ||
    byCode("1140") ||
    byName(/الإنتاج تحت التشغيل|work[ _-]?in[ _-]?process/i)

  // Raw Materials Inventory (asset, sub_type='inventory' or 'raw_materials')
  const rawMaterialsAccountId =
    bySubType("raw_materials") ||
    bySubType("inventory") ||
    byCode("1110") ||
    byCode("1130") ||
    byName(/المخزون|inventory|raw materials/i)

  // Finished Goods (often same as general inventory in small ERPs)
  const finishedGoodsAccountId =
    bySubType("finished_goods") ||
    bySubType("inventory") ||
    rawMaterialsAccountId ||
    byName(/finished goods|منتج تام/i)

  const wagesPayableAccountId =
    (company?.wages_payable_account_id as string | null) ||
    bySubType("wages_payable") ||
    byCode("2210") ||
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
      .select("id, unit_cost, quantity, total_cost")
      .in("id", txnIds)
    const txnMap = new Map<string, any>()
    for (const t of (txns || [])) txnMap.set(String(t.id), t)

    let totalCost = 0
    for (const line of lines) {
      const txn = line.inventory_transaction_id ? txnMap.get(String(line.inventory_transaction_id)) : null
      // Prefer total_cost stored on the txn; otherwise compute unit_cost × qty
      const cost = txn
        ? Number(txn.total_cost ?? (Number(txn.unit_cost ?? 0) * Math.abs(Number(txn.quantity ?? line.issued_qty))))
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
      // Best effort: try to remove the orphan header
      await supabase.from("journal_entries").delete().eq("id", header.id)
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
// Product Receipt: Dr Finished Goods / Cr WIP
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductReceiptJournalResult {
  success: boolean
  journalEntryId?: string
  entryNumber?: string
  totalCost?: number
  lineCount?: number
  error?: string
}

/**
 * Post the accounting journal for a finished-product receipt event.
 * Called AFTER `receive_manufacturing_production_order_finished_product_atomic` succeeds.
 *
 * Posts:
 *   Dr Finished Goods         <total>
 *      Cr WIP                       <total>
 *
 * Note: in this MVP we move the SAME material cost out of WIP to Finished Goods.
 * Labor/Overhead conversion costs will be added in Phase B-2 using the
 * work_center cost rates introduced in v3.7.0.
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

    const txnIds = lines.map((l: any) => l.inventory_transaction_id).filter(Boolean)
    if (txnIds.length === 0) {
      return { success: true, lineCount: lines.length, totalCost: 0 }
    }

    const { data: txns } = await supabase
      .from("inventory_transactions")
      .select("id, unit_cost, quantity, total_cost")
      .in("id", txnIds)
    const txnMap = new Map<string, any>()
    for (const t of (txns || [])) txnMap.set(String(t.id), t)

    let totalCost = 0
    for (const line of lines) {
      const txn = line.inventory_transaction_id ? txnMap.get(String(line.inventory_transaction_id)) : null
      const cost = txn
        ? Number(txn.total_cost ?? (Number(txn.unit_cost ?? 0) * Math.abs(Number(txn.quantity ?? line.received_qty))))
        : 0
      totalCost += Math.abs(cost)
    }
    totalCost = Math.round(totalCost * 100) / 100
    if (totalCost <= 0.01) {
      return { success: true, lineCount: lines.length, totalCost: 0 }
    }

    const accounts = await resolveManufacturingAccounts(supabase, params.companyId)
    const entryDate = String(event.posted_at || new Date().toISOString()).slice(0, 10)
    const header = await createEntryHeader({
      supabase,
      companyId: params.companyId,
      branchId: event.branch_id,
      entryDate,
      description: `استلام منتج تام من الإنتاج - ${event.event_number || params.receiptEventId}`,
      referenceType: "manufacturing_product_receipt",
      entryNumberPrefix: "MFG-RECV",
      costCenterId: event.cost_center_id,
      warehouseId: event.warehouse_id,
      userId: params.userId,
    })
    if (!header) {
      return { success: false, error: "Failed to create journal entry header" }
    }

    const { error: linesPostErr } = await supabase
      .from("journal_entry_lines")
      .insert([
        {
          journal_entry_id: header.id,
          account_id: accounts.finishedGoodsAccountId,
          debit_amount: totalCost,
          credit_amount: 0,
          description: "إدخال منتج تام إلى مخزون البضاعة الجاهزة",
        },
        {
          journal_entry_id: header.id,
          account_id: accounts.wipAccountId,
          debit_amount: 0,
          credit_amount: totalCost,
          description: "تخريج تكلفة من الإنتاج تحت التشغيل",
        },
      ])
    if (linesPostErr) {
      await supabase.from("journal_entries").delete().eq("id", header.id)
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
