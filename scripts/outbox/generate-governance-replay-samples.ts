import { config as loadDotenv } from "dotenv"
import { randomUUID } from "crypto"
import { createClient } from "@supabase/supabase-js"

import { getAccrualAccountMapping } from "../../lib/accrual-accounting-engine"
import {
  buildFinancialRequestHash,
  resolveFinancialIdempotencyKey,
} from "../../lib/financial-operation-utils"
import { createCompleteJournalEntry } from "../../lib/journal-entry-governance"
import { BillReceiptNotificationService } from "../../lib/services/bill-receipt-notification.service"
import {
  BillReceiptWorkflowService,
} from "../../lib/services/bill-receipt-workflow.service"
import { FinancialReplayRecoveryService } from "../../lib/services/financial-replay-recovery.service"
import { GovernanceNotificationService } from "../../lib/services/governance-notification.service"
import { prepareBillPosting } from "../../lib/purchase-posting"
import type {
  BillReceiptReplayAccountSnapshot,
  BillReceiptReplayPayload,
} from "../../lib/purchase-posting"

loadDotenv({ path: ".env.local" })

type SupabaseLike = any

type SeedArgs = {
  companyId: string
  traceSampleCount: number
  governanceCycleCount: number
}

type ActorContext = {
  actorId: string
  actorRole: string
}

type SeedContext = {
  companyId: string
  actor: ActorContext
  branchId: string
  warehouseId: string
  costCenterId: string
  supplierId: string
  productId: string
}

type BillRecord = {
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

const DEFAULT_TEST_COMPANY_ID = "8ef6338c-1713-4202-98ac-863633b76526"
const DEFAULT_TRACE_SAMPLE_COUNT = 3
const DEFAULT_GOVERNANCE_CYCLE_COUNT = 5
const BILL_RECEIPT_EVENT = "bill_receipt_posting"
const BILL_RECEIPT_REPLAY_PAYLOAD_VERSION = "bill_receipt_v1"

function getArg(flag: string) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  return String(process.argv[index + 1] || "").trim() || null
}

function parseArgs(): SeedArgs {
  const traceSampleCount = Number(getArg("--trace-sample-count") || DEFAULT_TRACE_SAMPLE_COUNT)
  const governanceCycleCount = Number(getArg("--governance-cycle-count") || DEFAULT_GOVERNANCE_CYCLE_COUNT)

  return {
    companyId: getArg("--company-id") || DEFAULT_TEST_COMPANY_ID,
    traceSampleCount: Number.isFinite(traceSampleCount)
      ? Math.max(1, Math.min(traceSampleCount, 10))
      : DEFAULT_TRACE_SAMPLE_COUNT,
    governanceCycleCount: Number.isFinite(governanceCycleCount)
      ? Math.max(0, Math.min(governanceCycleCount, 20))
      : DEFAULT_GOVERNANCE_CYCLE_COUNT,
  }
}

function requireEnv(name: string) {
  const value = String(process.env[name] || "").trim()
  if (!value) throw new Error(`MISSING_ENV: ${name}`)
  return value
}

function createServiceSupabase() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  })
}

function toMoney(value: unknown, precision = 4) {
  const numericValue = Number(value || 0)
  if (!Number.isFinite(numericValue)) return 0
  return Number(numericValue.toFixed(precision))
}

function addDays(date: Date, offset: number) {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + offset)
  return next
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function dateTimeForSample(date: Date, sampleIndex: number) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  const hour = String(10 + sampleIndex).padStart(2, "0")
  return `${year}-${month}-${day}T${hour}:15:00.000Z`
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

async function resolveActor(supabase: SupabaseLike, companyId: string): Promise<ActorContext> {
  const { data, error } = await supabase
    .from("company_members")
    .select("user_id, role")
    .eq("company_id", companyId)
    .in("role", ["owner", "admin", "general_manager"])

  if (error) throw new Error(error.message || "Failed to resolve sample actor")

  const rolePriority: Record<string, number> = {
    owner: 1,
    admin: 2,
    general_manager: 3,
  }
  const members = Array.isArray(data) ? data : []
  members.sort(
    (left, right) =>
      (rolePriority[String(left.role || "")] || 99) -
      (rolePriority[String(right.role || "")] || 99)
  )

  const actorId = String(members[0]?.user_id || "").trim()
  const actorRole = String(members[0]?.role || "").trim()

  if (!actorId || !actorRole) {
    throw new Error("SAMPLE_ACTOR_NOT_FOUND: no owner/admin/general_manager membership found")
  }

  return { actorId, actorRole }
}

async function resolveSeedContext(supabase: SupabaseLike, companyId: string): Promise<SeedContext> {
  const actor = await resolveActor(supabase, companyId)
  const { data: branches, error: branchError } = await supabase
    .from("branches")
    .select("id, default_warehouse_id, default_cost_center_id")
    .eq("company_id", companyId)
    .eq("branch_code", "BR01")
    .limit(1)
    .maybeSingle()

  if (branchError || !branches?.id) {
    throw new Error(branchError?.message || "Failed to resolve branch BR01 for sample generation")
  }

  const { data: supplier, error: supplierError } = await supabase
    .from("suppliers")
    .select("id")
    .eq("company_id", companyId)
    .eq("branch_id", branches.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (supplierError || !supplier?.id) {
    throw new Error(supplierError?.message || "Failed to resolve an active supplier for sample generation")
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id")
    .eq("company_id", companyId)
    .eq("branch_id", branches.id)
    .eq("warehouse_id", branches.default_warehouse_id)
    .eq("cost_center_id", branches.default_cost_center_id)
    .eq("item_type", "product")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (productError || !product?.id) {
    throw new Error(productError?.message || "Failed to resolve an active stock product for sample generation")
  }

  return {
    companyId,
    actor,
    branchId: String(branches.id),
    warehouseId: String(branches.default_warehouse_id || ""),
    costCenterId: String(branches.default_cost_center_id || ""),
    supplierId: String(supplier.id),
    productId: String(product.id),
  }
}

async function insertSeedBill(
  supabase: SupabaseLike,
  ctx: SeedContext,
  sampleIndex: number,
  targetDate: string
) {
  const quantity = 5 + sampleIndex
  const unitPrice = 1
  const subtotal = quantity * unitPrice
  const billNumber = `BILL-CANARY-${targetDate.replace(/-/g, "")}-${String(sampleIndex + 1).padStart(2, "0")}-${randomUUID().slice(0, 8)}`
  const dueDate = isoDate(addDays(new Date(`${targetDate}T00:00:00.000Z`), 30))

  const { data: bill, error: billError } = await supabase
    .from("bills")
    .insert({
      company_id: ctx.companyId,
      supplier_id: ctx.supplierId,
      bill_number: billNumber,
      bill_date: targetDate,
      due_date: dueDate,
      subtotal,
      tax_amount: 0,
      total_amount: subtotal,
      discount_type: "amount",
      discount_value: 0,
      discount_position: "before_tax",
      tax_inclusive: false,
      shipping: 0,
      shipping_tax_rate: 0,
      adjustment: 0,
      paid_amount: 0,
      status: "draft",
      currency_code: "EGP",
      exchange_rate: 1,
      original_currency: "EGP",
      original_subtotal: subtotal,
      original_tax_amount: 0,
      original_total: subtotal,
      display_currency: "EGP",
      display_subtotal: subtotal,
      display_total: subtotal,
      exchange_rate_used: 1,
      branch_id: ctx.branchId,
      cost_center_id: ctx.costCenterId,
      warehouse_id: ctx.warehouseId,
      created_by_user_id: ctx.actor.actorId,
      approval_status: null,
      created_by: ctx.actor.actorId,
    })
    .select("id, bill_number")
    .single()

  if (billError || !bill?.id) {
    throw new Error(billError?.message || "Failed to insert seed bill")
  }

  const { error: itemError } = await supabase
    .from("bill_items")
    .insert({
      bill_id: bill.id,
      product_id: ctx.productId,
      description: "Governance replay canary seed item",
      quantity,
      unit_price: unitPrice,
      tax_rate: 0,
      discount_percent: 0,
      line_total: subtotal,
      returned_quantity: 0,
      item_type: "product",
    })

  if (itemError) {
    throw new Error(itemError.message || "Failed to insert seed bill item")
  }

  return {
    billId: String(bill.id),
    billNumber: String(bill.bill_number),
    quantity,
    unitPrice,
    subtotal,
  }
}

async function fetchBillForReceipt(supabase: SupabaseLike, billId: string, companyId: string) {
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

async function fetchReceiptArtifacts(
  supabase: SupabaseLike,
  companyId: string,
  billId: string
): Promise<ReceiptArtifacts> {
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
  supabase: SupabaseLike,
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

async function findLatestReceiptTraceForBill(
  supabase: SupabaseLike,
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
  supabase: SupabaseLike,
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

function buildBillReceiptReplayPayload(params: {
  bill: BillRecord
  companyId: string
  actorId: string
  receivedAtIso: string
  effectiveReceiptDate: string
  accountMapping: Awaited<ReturnType<typeof getAccrualAccountMapping>>
  accountMappingSnapshot: BillReceiptReplayPayload["account_mapping_snapshot"]
  artifactsAfter: ReceiptArtifacts
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
      stockable_item_count: params.artifactsAfter.stockableItemCount,
      line_item_count: params.artifactsAfter.lineItems.length,
      expects_inventory: params.artifactsAfter.stockableItemCount > 0,
    },
    line_items: params.artifactsAfter.lineItems.map((item) => ({
      ...item,
      stockable: Boolean(item.product_id && item.item_type !== "service"),
    })),
  }
}

async function createReceiptTrace(
  supabase: SupabaseLike,
  params: {
    companyId: string
    bill: BillRecord
    actorId: string
    idempotencyKey: string
    requestHash: string
    uiSurface: string
    replayPayload: BillReceiptReplayPayload
  },
  artifactsAfter: ReceiptArtifacts,
  traceCreatedAtIso: string
) {
  const existing = await findLatestReceiptTraceForBill(supabase, params.companyId, params.bill.id)
  if (existing?.transaction_id) {
    return existing.transaction_id
  }

  const metadata = {
    purchase_order_id: params.bill.purchase_order_id,
    supplier_id: params.bill.supplier_id,
    branch_id: params.bill.branch_id,
    warehouse_id: params.bill.warehouse_id,
    cost_center_id: params.bill.cost_center_id,
    ui_surface: params.uiSurface,
    legacy_bootstrap_applied: false,
    adopted_existing_posting: false,
    stockable_item_count: artifactsAfter.stockableItemCount,
    replay_payload_policy: "forward_only",
    replay_eligibility: "FORWARD_ONLY_V1",
    replay_payload_version: params.replayPayload.payload_version,
    replay_payload_complete: true,
    normalized_replay_payload_hash: buildFinancialRequestHash(params.replayPayload),
    normalized_replay_payload: params.replayPayload,
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
    throw new Error(error.message || "Failed to create bill receipt trace")
  }

  const traceId = String(data)
  await linkTraceArtifacts(supabase, traceId, params.bill.id, artifactsAfter)

  const { error: traceTimeError } = await supabase
    .from("financial_operation_traces")
    .update({ created_at: traceCreatedAtIso })
    .eq("company_id", params.companyId)
    .eq("transaction_id", traceId)

  if (traceTimeError) {
    throw new Error(traceTimeError.message || "Failed to backdate bill receipt trace window")
  }

  return traceId
}

async function confirmBillReceiptForSample(
  supabase: SupabaseLike,
  ctx: SeedContext,
  billId: string,
  sampleDate: Date,
  sampleIndex: number
) {
  const { data: billData, error: billError } = await fetchBillForReceipt(supabase, billId, ctx.companyId)
  if (billError || !billData) {
    throw new Error(billError?.message || "Seed bill not found before receipt confirmation")
  }

  const bill = billData as BillRecord
  const receivedAtIso = dateTimeForSample(sampleDate, sampleIndex)
  const effectiveReceiptDate = isoDate(sampleDate)

  const accountMapping = await getAccrualAccountMapping(supabase, ctx.companyId)
  const accountMappingSnapshot = await fetchAccountMappingSnapshot(supabase, ctx.companyId, accountMapping)
  const preparation = await prepareBillPosting(
    supabase,
    {
      billId: bill.id,
      billNumber: bill.bill_number,
      billDate: effectiveReceiptDate,
      companyId: ctx.companyId,
      branchId: bill.branch_id,
      warehouseId: bill.warehouse_id,
      costCenterId: bill.cost_center_id,
      subtotal: Number(bill.subtotal || 0),
      taxAmount: Number(bill.tax_amount || 0),
      totalAmount: Number(bill.total_amount || 0),
      status: "received",
      receiptStatus: "received",
      receivedBy: ctx.actor.actorId,
      receivedAt: receivedAtIso,
    },
    {
      companyId: ctx.companyId,
      ap: accountMapping.accounts_payable,
      inventory: accountMapping.inventory,
      vatInput: accountMapping.vat_input || undefined,
    }
  )

  if (!preparation.success || !preparation.payload) {
    throw new Error(preparation.error || "Failed to prepare seed bill receipt posting")
  }
  let journalEntryId: string | null = null
  const journal = preparation.payload.journal
  if (journal) {
    const journalResult = await createCompleteJournalEntry(
      supabase,
      {
        company_id: journal.company_id,
        reference_type: journal.reference_type,
        reference_id: journal.reference_id,
        entry_date: journal.entry_date,
        description: journal.description,
        branch_id: journal.branch_id,
        cost_center_id: journal.cost_center_id,
        warehouse_id: bill.warehouse_id,
      },
      journal.lines.map((line) => ({
        account_id: line.account_id,
        debit_amount: line.debit_amount,
        credit_amount: line.credit_amount,
        description: line.description,
        branch_id: line.branch_id,
        cost_center_id: line.cost_center_id,
      }))
    )

    if (!journalResult.success || !journalResult.entryId) {
      throw new Error(journalResult.error || "Failed to create seed journal entry")
    }

    journalEntryId = journalResult.entryId
    const { error: jeCurrencyError } = await supabase
      .from("journal_entries")
      .update({
        status: journal.status,
        currency_code: bill.currency_code || "EGP",
        exchange_rate: Number(bill.exchange_rate || 1),
        original_currency: bill.original_currency || bill.currency_code || "EGP",
      })
      .eq("id", journalEntryId)

    if (jeCurrencyError) {
      throw new Error(jeCurrencyError.message || "Failed to enrich seed journal currency fields")
    }
  }

  const inventoryTransactions = preparation.payload.inventoryTransactions || []
  if (inventoryTransactions.length > 0) {
    const { error: inventoryError } = await supabase
      .from("inventory_transactions")
      .insert(
        inventoryTransactions.map((tx) => ({
          company_id: tx.company_id,
          branch_id: tx.branch_id,
          warehouse_id: tx.warehouse_id,
          cost_center_id: tx.cost_center_id,
          product_id: tx.product_id,
          transaction_type: tx.transaction_type,
          quantity_change: tx.quantity_change,
          reference_id: tx.reference_id,
          reference_type: tx.reference_type,
          notes: tx.notes,
          created_at: receivedAtIso,
          journal_entry_id: journalEntryId,
        }))
      )

    if (inventoryError) {
      throw new Error(inventoryError.message || "Failed to insert seed inventory transactions")
    }
  }

  const artifactsAfter = await fetchReceiptArtifacts(supabase, ctx.companyId, bill.id)
  const replayPayload = buildBillReceiptReplayPayload({
    bill,
    companyId: ctx.companyId,
    actorId: ctx.actor.actorId,
    receivedAtIso,
    effectiveReceiptDate,
    accountMapping,
    accountMappingSnapshot,
    artifactsAfter,
  })

  const idempotencyKey = resolveFinancialIdempotencyKey(null, [
    "bill-confirm-receipt-seed",
    ctx.companyId,
    bill.id,
    effectiveReceiptDate,
  ])
  const requestHash = buildFinancialRequestHash({
    operation: "confirm_bill_receipt_seed",
    companyId: ctx.companyId,
    actorId: ctx.actor.actorId,
    billId: bill.id,
    effectiveReceiptDate,
  })

  const traceId = await createReceiptTrace(
    supabase,
    {
      companyId: ctx.companyId,
      bill,
      actorId: ctx.actor.actorId,
      idempotencyKey,
      requestHash,
      uiSurface: "outbox_governance_seed_script",
      replayPayload,
    },
    artifactsAfter,
    receivedAtIso
  )

  const { error: billUpdateError } = await supabase
    .from("bills")
    .update({
      status: "received",
      receipt_status: "received",
      received_by: ctx.actor.actorId,
      received_at: receivedAtIso,
      receipt_rejection_reason: null,
    })
    .eq("company_id", ctx.companyId)
    .eq("id", bill.id)

  if (billUpdateError) {
    throw new Error(billUpdateError.message || "Failed to finalize bill receipt status")
  }

  try {
    await new BillReceiptNotificationService(supabase).notifyReceiptConfirmed(
      { companyId: ctx.companyId, actorId: ctx.actor.actorId },
      {
        id: bill.id,
        bill_number: bill.bill_number,
        branch_id: bill.branch_id,
        warehouse_id: bill.warehouse_id,
        cost_center_id: bill.cost_center_id,
        purchase_order_id: bill.purchase_order_id,
        created_by: ctx.actor.actorId,
      },
      traceId
    )
  } catch (notificationError: any) {
    console.warn("[SEED_BILL_RECEIPT_NOTIFICATION]", notificationError?.message || notificationError)
  }

  return {
    billId: bill.id,
    billNumber: bill.bill_number,
    traceId,
    requestHash,
    previewDate: effectiveReceiptDate,
  }
}

async function seedReceiptTraceSamples(
  supabase: SupabaseLike,
  ctx: SeedContext,
  traceSampleCount: number
) {
  const workflow = new BillReceiptWorkflowService(supabase)
  const samples = []

  for (let index = 0; index < traceSampleCount; index += 1) {
    const sampleDate = addDays(new Date(), -(traceSampleCount - index - 1))
    const targetDate = isoDate(sampleDate)
    const seedBill = await insertSeedBill(supabase, ctx, index, targetDate)

    await workflow.approveBill(
      {
        companyId: ctx.companyId,
        actorId: ctx.actor.actorId,
        actorRole: ctx.actor.actorRole,
      },
      seedBill.billId,
      {
        idempotencyKey: resolveFinancialIdempotencyKey(null, [
          "seed-bill-approve",
          ctx.companyId,
          seedBill.billId,
          targetDate,
        ]),
        requestHash: buildFinancialRequestHash({
          operation: "seed_bill_approve",
          companyId: ctx.companyId,
          billId: seedBill.billId,
          targetDate,
        }),
        uiSurface: "outbox_governance_seed_script",
        appLang: "ar",
      }
    )

    await workflow.submitForReceipt(
      {
        companyId: ctx.companyId,
        actorId: ctx.actor.actorId,
        actorRole: ctx.actor.actorRole,
      },
      seedBill.billId,
      {
        idempotencyKey: resolveFinancialIdempotencyKey(null, [
          "seed-bill-submit",
          ctx.companyId,
          seedBill.billId,
          targetDate,
        ]),
        requestHash: buildFinancialRequestHash({
          operation: "seed_bill_submit_for_receipt",
          companyId: ctx.companyId,
          billId: seedBill.billId,
          targetDate,
        }),
        uiSurface: "outbox_governance_seed_script",
      }
    )

    const confirmed = await confirmBillReceiptForSample(supabase, ctx, seedBill.billId, sampleDate, index)
    samples.push({
      date: targetDate,
      ...seedBill,
      ...confirmed,
    })
  }

  return samples
}

async function issueGovernanceReplayCycles(
  supabase: SupabaseLike,
  ctx: SeedContext,
  seededTraceSamples: Array<{
    billId: string
    billNumber: string
    traceId: string
    requestHash: string
  }>,
  governanceCycleCount: number
) {
  process.env.FINANCIAL_REPLAY_EXECUTION_ENABLED = "true"
  process.env.FINANCIAL_REPLAY_EXECUTION_TENANT_ALLOWLIST = ctx.companyId

  const replayService = new FinancialReplayRecoveryService(supabase)
  const governanceNotifications = new GovernanceNotificationService(supabase)
  const cycles = []

  for (let index = 0; index < governanceCycleCount; index += 1) {
    const sample = seededTraceSamples[index % seededTraceSamples.length]
    const shadowPlan = await replayService.shadowReplayExecution({
      companyId: ctx.companyId,
      actorId: ctx.actor.actorId,
      traceId: sample.traceId,
      requestHash: sample.requestHash,
      dryRun: true,
      uiSurface: "outbox_governance_seed_script",
    })

    const previewResultHash = String(
      shadowPlan.execution.execution_envelope.preview_result_hash || ""
    ).trim()
    if (!previewResultHash) {
      throw new Error(`Missing preview_result_hash for trace ${sample.traceId}`)
    }

    const commitIntent = await replayService.issueReplayCommitIntent({
      companyId: ctx.companyId,
      actorId: ctx.actor.actorId,
      traceId: sample.traceId,
      requestHash: sample.requestHash,
      previewResultHash,
      manualApproval: true,
      ttlMinutes: 15,
      uiSurface: "outbox_governance_seed_script",
    })

    await governanceNotifications.notifyReplayCommitIntentIssued({
      companyId: ctx.companyId,
      createdBy: ctx.actor.actorId,
      intentId: commitIntent.intent.id,
      sourceTraceId: commitIntent.intent.source_trace_id,
      eventType: commitIntent.intent.event_type,
      payloadVersion: commitIntent.intent.payload_version,
      expiresAt: commitIntent.intent.expires_at,
    })

    const activation = await replayService.activateReplayExecution({
      companyId: ctx.companyId,
      actorId: ctx.actor.actorId,
      intentId: commitIntent.intent.id,
      token: commitIntent.intent.token,
      previewResultHash: commitIntent.intent.preview_result_hash,
      uiSurface: "outbox_governance_seed_script",
    })

    await governanceNotifications.notifyReplayExecutionActivated({
      companyId: ctx.companyId,
      createdBy: ctx.actor.actorId,
      executionId: activation.execution.id,
      commitIntentId: activation.execution.commit_intent_id,
      sourceTraceId: activation.execution.source_trace_id,
      eventType: activation.execution.event_type,
      payloadVersion: activation.execution.payload_version,
      financialWritesPerformed: activation.execution.financial_writes_performed,
      executedAt: activation.execution.executed_at,
    })

    cycles.push({
      sampleTraceId: sample.traceId,
      commitIntentId: commitIntent.intent.id,
      executionId: activation.execution.id,
      previewResultHash: commitIntent.intent.preview_result_hash,
    })
  }

  return cycles
}

async function main() {
  const args = parseArgs()
  const supabase = createServiceSupabase()
  const ctx = await resolveSeedContext(supabase, args.companyId)

  const seededTraceSamples = await seedReceiptTraceSamples(
    supabase,
    ctx,
    args.traceSampleCount
  )

  const governanceCycles = await issueGovernanceReplayCycles(
    supabase,
    ctx,
    seededTraceSamples,
    args.governanceCycleCount
  )

  console.log(
    JSON.stringify(
      {
        success: true,
        companyId: args.companyId,
        actor: ctx.actor,
        seededTraceSamples,
        governanceCycles,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        error: String(error instanceof Error ? error.message : error),
      },
      null,
      2
    )
  )
  process.exit(1)
})
