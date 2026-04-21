import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { AccountingTransactionService } from "@/lib/accounting-transaction-service"
import { getAccrualAccountMapping } from "@/lib/accrual-accounting-engine"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"
import type { BillReceiptReplayAccountSnapshot, BillReceiptReplayPayload } from "@/lib/purchase-posting"
import { BillReceiptNotificationService } from "@/lib/services/bill-receipt-notification.service"

const BILL_RECEIPT_EVENT = "bill_receipt_posting"
const BILL_RECEIPT_REPLAY_PAYLOAD_VERSION = "bill_receipt_v1"
const RECEIPT_ROLES = new Set(["owner", "admin", "general_manager", "manager", "store_manager"])

type BillReceiptRecord = {
  id: string
  bill_number: string
  bill_date: string
  status: string | null
  receipt_status: string | null
  received_by: string | null
  received_at: string | null
  company_id: string
  branch_id: string | null
  warehouse_id: string | null
  cost_center_id: string | null
  supplier_id: string | null
  purchase_order_id: string | null
  subtotal: number | null
  tax_amount: number | null
  total_amount: number | null
  discount_type: string | null
  discount_value: number | null
  discount_position: string | null
  tax_inclusive: boolean | null
  shipping: number | null
  shipping_tax_rate: number | null
  shipping_provider_id: string | null
  adjustment: number | null
  currency_code: string | null
  exchange_rate: number | null
  original_currency: string | null
  original_subtotal: number | null
  original_tax_amount: number | null
  original_total: number | null
  display_currency: string | null
  display_subtotal: number | null
  display_total: number | null
}

type ReceiptArtifacts = {
  stockableItemCount: number
  lineItems: Array<{
    bill_item_id: string
    product_id: string | null
    item_type: string | null
    quantity: number
    unit_price: number
    tax_rate: number
    discount_percent: number
    line_total: number
    gross_amount: number
    discount_amount: number
    tax_amount: number
  }>
  journalEntryIds: string[]
  inventoryTransactionIds: string[]
}

type ExistingTrace = {
  transaction_id: string
  request_hash: string | null
}

function normalizeRole(role: unknown) {
  return String(role || "")
    .trim()
    .toLowerCase()
}

function toMoney(value: unknown, precision = 4) {
  const numericValue = Number(value || 0)
  if (!Number.isFinite(numericValue)) return 0
  return Number(numericValue.toFixed(precision))
}

function calculateLineSnapshot(params: {
  quantity: number
  unitPrice: number
  taxRate: number
  discountPercent: number
  storedLineTotal: number
  taxInclusive: boolean
}) {
  const grossAmount = toMoney(params.quantity * params.unitPrice)
  const discountAmount = toMoney(grossAmount * (params.discountPercent / 100))
  const discountedAmount = toMoney(grossAmount - discountAmount)
  const lineTotal = params.storedLineTotal > 0 ? toMoney(params.storedLineTotal) : discountedAmount
  const rateFactor = 1 + params.taxRate / 100
  const taxAmount = params.taxInclusive
    ? toMoney(discountedAmount - discountedAmount / rateFactor)
    : toMoney(lineTotal * (params.taxRate / 100))

  return {
    grossAmount,
    discountAmount,
    taxAmount,
    lineTotal,
  }
}

function isDuplicateTraceError(message?: string | null) {
  if (!message) return false
  return (
    message.includes("duplicate key value violates unique constraint") ||
    message.includes("idx_financial_operation_traces_idempotency")
  )
}

async function fetchBillForReceipt(supabase: any, billId: string, companyId: string) {
  return await supabase
    .from("bills")
    .select(`
      id,
      bill_number,
      bill_date,
      status,
      receipt_status,
      received_by,
      received_at,
      company_id,
      branch_id,
      warehouse_id,
      cost_center_id,
      supplier_id,
      purchase_order_id,
      subtotal,
      tax_amount,
      total_amount,
      discount_type,
      discount_value,
      discount_position,
      tax_inclusive,
      shipping,
      shipping_tax_rate,
      shipping_provider_id,
      adjustment,
      currency_code,
      exchange_rate,
      original_currency,
      original_subtotal,
      original_tax_amount,
      original_total,
      display_currency,
      display_subtotal,
      display_total
    `)
    .eq("id", billId)
    .eq("company_id", companyId)
    .maybeSingle()
}

async function fetchReceiptArtifacts(supabase: any, companyId: string, billId: string): Promise<ReceiptArtifacts> {
  const { data: billForCalculation } = await supabase
    .from("bills")
    .select("tax_inclusive")
    .eq("company_id", companyId)
    .eq("id", billId)
    .maybeSingle()

  const taxInclusive = Boolean(billForCalculation?.tax_inclusive)
  const [{ data: billItems }, { data: journalEntries }, { data: inventoryTransactions }] = await Promise.all([
    supabase
      .from("bill_items")
      .select("id, product_id, quantity, unit_price, tax_rate, discount_percent, line_total, products(item_type)")
      .eq("bill_id", billId),
    supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "bill")
      .eq("reference_id", billId)
      .is("deleted_at", null),
    supabase
      .from("inventory_transactions")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "bill")
      .eq("reference_id", billId)
      .eq("transaction_type", "purchase"),
  ])

  const lineItems: ReceiptArtifacts["lineItems"] = (billItems || []).map((item: any) => {
    const quantity = Number(item.quantity || 0)
    const unitPrice = Number(item.unit_price || 0)
    const taxRate = Number(item.tax_rate || 0)
    const discountPercent = Number(item.discount_percent || 0)
    const lineSnapshot = calculateLineSnapshot({
      quantity,
      unitPrice,
      taxRate,
      discountPercent,
      storedLineTotal: Number(item.line_total || 0),
      taxInclusive,
    })

    return {
      bill_item_id: String(item.id || ""),
      product_id: item.product_id ? String(item.product_id) : null,
      item_type: item.products?.item_type ? String(item.products.item_type) : null,
      quantity,
      unit_price: unitPrice,
      tax_rate: taxRate,
      discount_percent: discountPercent,
      line_total: lineSnapshot.lineTotal,
      gross_amount: lineSnapshot.grossAmount,
      discount_amount: lineSnapshot.discountAmount,
      tax_amount: lineSnapshot.taxAmount,
    }
  })

  const stockableItemCount = lineItems.filter((item) => item.product_id && item.item_type !== "service").length

  return {
    stockableItemCount,
    lineItems,
    journalEntryIds: (journalEntries || []).map((row: any) => String(row.id)),
    inventoryTransactionIds: (inventoryTransactions || []).map((row: any) => String(row.id)),
  }
}

async function fetchAccountMappingSnapshot(
  supabase: any,
  companyId: string,
  accountMapping: Awaited<ReturnType<typeof getAccrualAccountMapping>>
): Promise<BillReceiptReplayPayload["account_mapping_snapshot"]> {
  const accountIds = [
    accountMapping.accounts_payable,
    accountMapping.inventory,
    accountMapping.vat_input,
  ].filter(Boolean) as string[]

  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type, sub_type")
    .eq("company_id", companyId)
    .in("id", accountIds)

  if (error) {
    throw new Error(error.message || "Failed to capture account mapping snapshot")
  }

  const byId = new Map<string, BillReceiptReplayAccountSnapshot>(
    (data || []).map((account: any) => [
      String(account.id),
      {
        id: String(account.id),
        account_code: account.account_code ? String(account.account_code) : null,
        account_name: account.account_name ? String(account.account_name) : null,
        account_type: account.account_type ? String(account.account_type) : null,
        sub_type: account.sub_type ? String(account.sub_type) : null,
      },
    ])
  )

  const accountsPayable = byId.get(accountMapping.accounts_payable)
  if (!accountsPayable) {
    throw new Error("Accounts payable snapshot is required for deterministic bill receipt replay")
  }

  return {
    accounts_payable: accountsPayable,
    inventory: accountMapping.inventory ? byId.get(accountMapping.inventory) || null : null,
    purchases: null,
    vat_input: accountMapping.vat_input ? byId.get(accountMapping.vat_input) || null : null,
  }
}

async function findTraceByIdempotency(
  supabase: any,
  companyId: string,
  idempotencyKey: string
): Promise<ExistingTrace | null> {
  const { data, error } = await supabase
    .from("financial_operation_traces")
    .select("transaction_id, request_hash")
    .eq("company_id", companyId)
    .eq("event_type", BILL_RECEIPT_EVENT)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()

  if (error || !data) return null
  return {
    transaction_id: String(data.transaction_id),
    request_hash: data.request_hash ? String(data.request_hash) : null,
  }
}

async function findLatestTraceForBill(
  supabase: any,
  companyId: string,
  billId: string
): Promise<ExistingTrace | null> {
  const { data, error } = await supabase
    .from("financial_operation_traces")
    .select("transaction_id, request_hash")
    .eq("company_id", companyId)
    .eq("source_entity", "bill")
    .eq("source_id", billId)
    .eq("event_type", BILL_RECEIPT_EVENT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return {
    transaction_id: String(data.transaction_id),
    request_hash: data.request_hash ? String(data.request_hash) : null,
  }
}

async function linkTraceArtifacts(
  supabase: any,
  traceId: string,
  billId: string,
  artifacts: ReceiptArtifacts
) {
  await supabase.rpc("link_financial_operation_trace", {
    p_transaction_id: traceId,
    p_entity_type: "bill",
    p_entity_id: billId,
    p_link_role: "source",
    p_reference_type: BILL_RECEIPT_EVENT,
  })

  for (const journalEntryId of artifacts.journalEntryIds) {
    await supabase.rpc("link_financial_operation_trace", {
      p_transaction_id: traceId,
      p_entity_type: "journal_entry",
      p_entity_id: journalEntryId,
      p_link_role: "journal_entry",
      p_reference_type: BILL_RECEIPT_EVENT,
    })
  }

  for (const inventoryTransactionId of artifacts.inventoryTransactionIds) {
    await supabase.rpc("link_financial_operation_trace", {
      p_transaction_id: traceId,
      p_entity_type: "inventory_transaction",
      p_entity_id: inventoryTransactionId,
      p_link_role: "inventory",
      p_reference_type: BILL_RECEIPT_EVENT,
    })
  }
}

async function ensureTraceForReceipt(
  supabase: any,
  params: {
    companyId: string
    bill: BillReceiptRecord
    actorId: string
    idempotencyKey: string
    requestHash: string
    uiSurface: string | null
    adoptedExistingPosting: boolean
    replayPayload?: BillReceiptReplayPayload | null
  },
  artifacts: ReceiptArtifacts
) {
  const existingBySource = await findLatestTraceForBill(supabase, params.companyId, params.bill.id)
  if (existingBySource) {
    return existingBySource.transaction_id
  }

  const metadata = {
    purchase_order_id: params.bill.purchase_order_id,
    supplier_id: params.bill.supplier_id,
    branch_id: params.bill.branch_id,
    warehouse_id: params.bill.warehouse_id,
    cost_center_id: params.bill.cost_center_id,
    ui_surface: params.uiSurface,
    legacy_bootstrap_applied: false,
    adopted_existing_posting: params.adoptedExistingPosting,
    stockable_item_count: artifacts.stockableItemCount,
    replay_payload_policy: params.replayPayload ? "forward_only" : null,
    replay_eligibility: params.replayPayload ? "FORWARD_ONLY_V1" : "MISSING_REPLAY_PAYLOAD",
    replay_payload_version: params.replayPayload?.payload_version || null,
    replay_payload_complete: Boolean(params.replayPayload),
    normalized_replay_payload_hash: params.replayPayload ? buildFinancialRequestHash(params.replayPayload) : null,
    normalized_replay_payload: params.replayPayload || null,
  }

  const { data, error } = await supabase.rpc("create_financial_operation_trace", {
    p_company_id: params.companyId,
    p_source_entity: "bill",
    p_source_id: params.bill.id,
    p_event_type: BILL_RECEIPT_EVENT,
    p_actor_id: params.actorId,
    p_idempotency_key: params.idempotencyKey,
    p_request_hash: params.requestHash,
    p_metadata: metadata,
    p_audit_flags: [],
  })

  if (error) {
    if (isDuplicateTraceError(error.message)) {
      const existingByIdempotency = await findTraceByIdempotency(supabase, params.companyId, params.idempotencyKey)
      if (existingByIdempotency) {
        return existingByIdempotency.transaction_id
      }
    }
    throw new Error(error.message || "Failed to create financial trace")
  }

  const traceId = String(data)
  await linkTraceArtifacts(supabase, traceId, params.bill.id, artifacts)
  return traceId
}

function buildBillReceiptReplayPayload(params: {
  bill: BillReceiptRecord
  companyId: string
  actorId: string
  receivedAtIso: string
  effectiveReceiptDate: string
  accountMapping: Awaited<ReturnType<typeof getAccrualAccountMapping>>
  accountMappingSnapshot: BillReceiptReplayPayload["account_mapping_snapshot"]
  artifactsBefore: ReceiptArtifacts
}): BillReceiptReplayPayload {
  if (!params.bill.branch_id || !params.bill.warehouse_id || !params.bill.cost_center_id) {
    throw new Error("Bill receipt replay payload requires branch, warehouse, and cost center")
  }

  return {
    operation: BILL_RECEIPT_EVENT,
    payload_version: BILL_RECEIPT_REPLAY_PAYLOAD_VERSION,
    bill: {
      bill_id: params.bill.id,
      bill_number: params.bill.bill_number || null,
      bill_date: params.bill.bill_date,
      purchase_order_id: params.bill.purchase_order_id,
      supplier_id: params.bill.supplier_id,
      branch_id: params.bill.branch_id,
      warehouse_id: params.bill.warehouse_id,
      cost_center_id: params.bill.cost_center_id,
      subtotal: Number(params.bill.subtotal || 0),
      tax_amount: Number(params.bill.tax_amount || 0),
      total_amount: Number(params.bill.total_amount || 0),
      currency_code: params.bill.currency_code || params.bill.original_currency || "EGP",
      exchange_rate: Number(params.bill.exchange_rate || 1),
      status: "received",
      receipt_status: "received",
      received_by: params.actorId,
      received_at: params.receivedAtIso,
      effective_receipt_date: params.effectiveReceiptDate,
    },
    account_mapping: {
      company_id: params.companyId,
      accounts_payable: params.accountMapping.accounts_payable,
      inventory: params.accountMapping.inventory || null,
      purchases: null,
      vat_input: params.accountMapping.vat_input || null,
      mapping_source: "getAccrualAccountMapping",
      mapping_version: "runtime_snapshot_v1",
    },
    account_mapping_snapshot: params.accountMappingSnapshot,
    monetary_snapshot: {
      subtotal: Number(params.bill.subtotal || 0),
      tax_amount: Number(params.bill.tax_amount || 0),
      total_amount: Number(params.bill.total_amount || 0),
      shipping: Number(params.bill.shipping || 0),
      shipping_tax_rate: Number(params.bill.shipping_tax_rate || 0),
      adjustment: Number(params.bill.adjustment || 0),
      precision: 4,
    },
    currency_snapshot: {
      currency_code: params.bill.currency_code || params.bill.original_currency || "EGP",
      exchange_rate: Number(params.bill.exchange_rate || 1),
      original_currency: params.bill.original_currency || params.bill.currency_code || "EGP",
      original_subtotal: params.bill.original_subtotal == null ? null : Number(params.bill.original_subtotal || 0),
      original_tax_amount: params.bill.original_tax_amount == null ? null : Number(params.bill.original_tax_amount || 0),
      original_total: params.bill.original_total == null ? null : Number(params.bill.original_total || 0),
      display_currency: params.bill.display_currency || null,
      display_subtotal: params.bill.display_subtotal == null ? null : Number(params.bill.display_subtotal || 0),
      display_total: params.bill.display_total == null ? null : Number(params.bill.display_total || 0),
    },
    discount_snapshot: {
      discount_type: params.bill.discount_type || "amount",
      discount_value: Number(params.bill.discount_value || 0),
      discount_position: params.bill.discount_position || "before_tax",
      line_discount_source: "bill_items.discount_percent",
      header_discount_source: "bills.discount_type/value/position",
    },
    tax_snapshot: {
      tax_inclusive: Boolean(params.bill.tax_inclusive),
      tax_amount: Number(params.bill.tax_amount || 0),
      shipping_tax_rate: Number(params.bill.shipping_tax_rate || 0),
      vat_input_account_id: params.accountMapping.vat_input || null,
      breakdown: [
        {
          tax_type: "input_vat",
          amount: Number(params.bill.tax_amount || 0),
          account_id: params.accountMapping.vat_input || null,
          source: "bills.tax_amount",
        },
      ],
    },
    calculation_policy: {
      monetary_precision: 4,
      line_total_source: "bill_items.line_total",
      tax_source: "bills.tax_amount",
      discount_source: "bills.discount_* + bill_items.discount_percent",
      shipping_source: "bills.shipping",
      adjustment_source: "bills.adjustment",
      tax_inclusive: Boolean(params.bill.tax_inclusive),
    },
    inventory_policy: {
      valuation_replay_mode: "verify_only",
      valuation_method: "current_receipt_unit_cost_snapshot",
      fifo_lot_replay: "not_revalued",
      batch_lot_tracking: "not_captured_in_bill_receipt_v1",
      quantity_source: "bill_receipt_v1.line_items.quantity",
      cost_source: "bill_receipt_v1.line_items.unit_price",
      warehouse_id: params.bill.warehouse_id,
      cost_center_id: params.bill.cost_center_id,
    },
    artifact_expectations: {
      stockable_item_count: params.artifactsBefore.stockableItemCount,
      line_item_count: params.artifactsBefore.lineItems.length,
      expects_inventory: params.artifactsBefore.stockableItemCount > 0,
    },
    line_items: params.artifactsBefore.lineItems.map((item) => ({
      ...item,
      stockable: Boolean(item.product_id && item.item_type !== "service"),
    })),
  }
}

async function buildCachedResponse(
  supabase: any,
  traceId: string,
  companyId: string,
  billId: string,
  adoptedExistingPosting = false
) {
  const artifacts = await fetchReceiptArtifacts(supabase, companyId, billId)
  return {
    success: true,
    cached: true,
    adoptedExistingPosting,
    transactionId: traceId,
    eventType: BILL_RECEIPT_EVENT,
    journalEntryIds: artifacts.journalEntryIds,
    inventoryTransactionIds: artifacts.inventoryTransactionIds,
  }
}

async function clearReceiptRejectionReason(supabase: any, companyId: string, billId: string) {
  const { error } = await supabase
    .from("bills")
    .update({ receipt_rejection_reason: null })
    .eq("company_id", companyId)
    .eq("id", billId)

  if (error) {
    throw new Error(error.message || "Failed to clear receipt rejection reason")
  }
}

async function repairBillReceiptStatus(
  supabase: any,
  companyId: string,
  billId: string,
  payload: {
    status: string
    receipt_status: string
    received_by: string
    received_at: string
  }
) {
  const { error } = await supabase
    .from("bills")
    .update({
      status: payload.status,
      receipt_status: payload.receipt_status,
      received_by: payload.received_by,
      received_at: payload.received_at,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("id", billId)

  if (error) {
    throw new Error(error.message || "Failed to repair bill receipt status")
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) {
    return errorResponse
  }

  const role = normalizeRole(context.member.role)
  if (!RECEIPT_ROLES.has(role)) {
    return NextResponse.json(
      { success: false, error: "You are not allowed to confirm goods receipt for purchase bills" },
      { status: 403 }
    )
  }

  try {
    const { id: billId } = await params
    const supabase = await createClient()

    let uiSurface: string | null = null
    try {
      const body = await request.json()
      uiSurface = body?.ui_surface ? String(body.ui_surface) : null
    } catch {
      uiSurface = null
    }

    const { data: billData, error: billError } = await fetchBillForReceipt(supabase, billId, context.companyId)
    if (billError || !billData) {
      return NextResponse.json({ success: false, error: "Purchase bill not found" }, { status: 404 })
    }

    const bill = billData as BillReceiptRecord

    if (role === "manager" && context.member.branch_id && bill.branch_id !== context.member.branch_id) {
      return NextResponse.json({ success: false, error: "Bill is outside your branch scope" }, { status: 403 })
    }

    if (role === "store_manager") {
      if (context.member.branch_id && bill.branch_id !== context.member.branch_id) {
        return NextResponse.json({ success: false, error: "Bill is outside your branch scope" }, { status: 403 })
      }
      if (context.member.warehouse_id && bill.warehouse_id !== context.member.warehouse_id) {
        return NextResponse.json({ success: false, error: "Bill is outside your warehouse scope" }, { status: 403 })
      }
    }

    if (!bill.branch_id || !bill.warehouse_id || !bill.cost_center_id) {
      return NextResponse.json(
        { success: false, error: "Branch, warehouse, and cost center must be defined before confirming receipt" },
        { status: 400 }
      )
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["bill-confirm-receipt", context.companyId, bill.id]
    )

    const requestHash = buildFinancialRequestHash({
      operation: "confirm_bill_receipt",
      billId: bill.id,
      companyId: context.companyId,
      actorId: context.user.id,
      uiSurface,
    })

    const existingByIdempotency = await findTraceByIdempotency(supabase, context.companyId, idempotencyKey)
    if (existingByIdempotency) {
      if (existingByIdempotency.request_hash && existingByIdempotency.request_hash !== requestHash) {
        return NextResponse.json(
          { success: false, error: "Idempotency key already used with a different request payload" },
          { status: 409 }
        )
      }

      return NextResponse.json(
        await buildCachedResponse(supabase, existingByIdempotency.transaction_id, context.companyId, bill.id),
        { status: 200 }
      )
    }

    const artifactsBefore = await fetchReceiptArtifacts(supabase, context.companyId, bill.id)
    const hasJournal = artifactsBefore.journalEntryIds.length > 0
    const hasInventory = artifactsBefore.inventoryTransactionIds.length > 0
    const expectsInventory = artifactsBefore.stockableItemCount > 0
    const alreadyMarkedReceived = bill.receipt_status === "received" || bill.status === "received"

    if ((expectsInventory && hasJournal !== hasInventory) || (!expectsInventory && !hasJournal && hasInventory)) {
      return NextResponse.json(
        {
          success: false,
          error: "Bill is in an inconsistent receipt posting state and requires remediation before confirmation",
        },
        { status: 409 }
      )
    }

    const alreadyPosted = hasJournal && (!expectsInventory || hasInventory)
    if (alreadyMarkedReceived || alreadyPosted) {
      if (!alreadyMarkedReceived) {
        const repairPayload = {
          status: "received",
          receipt_status: "received",
          received_by: bill.received_by || context.user.id,
          received_at: bill.received_at || new Date().toISOString(),
        }
        await repairBillReceiptStatus(supabase, context.companyId, bill.id, repairPayload)
      }

      const traceId = await ensureTraceForReceipt(
        supabase,
        {
          companyId: context.companyId,
          bill,
          actorId: context.user.id,
          idempotencyKey,
          requestHash,
          uiSurface,
          adoptedExistingPosting: true,
          replayPayload: null,
        },
        await fetchReceiptArtifacts(supabase, context.companyId, bill.id)
      )

      await clearReceiptRejectionReason(supabase, context.companyId, bill.id)

      return NextResponse.json(
        await buildCachedResponse(supabase, traceId, context.companyId, bill.id, true),
        { status: 200 }
      )
    }

    const receivedAtIso = new Date().toISOString()
    const effectiveReceiptDate = receivedAtIso.slice(0, 10)
    await requireOpenFinancialPeriod(context.companyId, effectiveReceiptDate)

    const accountMapping = await getAccrualAccountMapping(supabase, context.companyId)
    const accountMappingSnapshot = await fetchAccountMappingSnapshot(supabase, context.companyId, accountMapping)
    const replayPayload = buildBillReceiptReplayPayload({
      bill,
      companyId: context.companyId,
      actorId: context.user.id,
      receivedAtIso,
      effectiveReceiptDate,
      accountMapping,
      accountMappingSnapshot,
      artifactsBefore,
    })
    const accountingService = new AccountingTransactionService(supabase as any)
    const postingResult = await accountingService.postBillAtomic(
      {
        billId: bill.id,
        billNumber: bill.bill_number,
        billDate: effectiveReceiptDate,
        companyId: context.companyId,
        branchId: bill.branch_id,
        warehouseId: bill.warehouse_id,
        costCenterId: bill.cost_center_id,
        subtotal: Number(bill.subtotal || 0),
        taxAmount: Number(bill.tax_amount || 0),
        totalAmount: Number(bill.total_amount || 0),
        status: "received",
        receiptStatus: "received",
        receivedBy: context.user.id,
        receivedAt: receivedAtIso,
      },
      {
        companyId: context.companyId,
        ap: accountMapping.accounts_payable,
        inventory: accountMapping.inventory,
        vatInput: accountMapping.vat_input || undefined,
      }
    )

    if (!postingResult.success) {
      return NextResponse.json(
        { success: false, error: postingResult.error || "Failed to confirm purchase bill receipt" },
        { status: 400 }
      )
    }

    const artifactsAfter = await fetchReceiptArtifacts(supabase, context.companyId, bill.id)
    const traceId = await ensureTraceForReceipt(
      supabase,
      {
        companyId: context.companyId,
        bill,
        actorId: context.user.id,
        idempotencyKey,
        requestHash,
        uiSurface,
        adoptedExistingPosting: false,
        replayPayload,
      },
      artifactsAfter
    )

    await clearReceiptRejectionReason(supabase, context.companyId, bill.id)

    try {
      await supabase.from("audit_logs").insert({
        company_id: context.companyId,
        user_id: context.user.id,
        action: "APPROVE",
        target_table: "bills",
        record_id: bill.id,
        record_identifier: bill.bill_number,
        new_data: {
          status: "received",
          receipt_status: "received",
          branch_id: bill.branch_id,
          warehouse_id: bill.warehouse_id,
          received_by: context.user.id,
          received_at: receivedAtIso,
          financial_trace_transaction_id: traceId,
        },
      })
    } catch (auditError: any) {
      console.warn("[BILL_CONFIRM_RECEIPT] Audit log failed:", auditError?.message || auditError)
    }

    await new BillReceiptNotificationService(supabase).notifyReceiptConfirmed(
      { companyId: context.companyId, actorId: context.user.id },
      bill,
      traceId
    )

    return NextResponse.json({
      success: true,
      cached: false,
      adoptedExistingPosting: false,
      transactionId: traceId,
      eventType: BILL_RECEIPT_EVENT,
      journalEntryIds: artifactsAfter.journalEntryIds,
      inventoryTransactionIds: artifactsAfter.inventoryTransactionIds,
    })
  } catch (error: any) {
    console.error("[BILL_CONFIRM_RECEIPT] Unexpected error:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Unexpected error while confirming receipt" },
      { status: 500 }
    )
  }
}
