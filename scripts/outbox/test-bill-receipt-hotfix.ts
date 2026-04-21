import { config as loadDotenv } from "dotenv"
import { randomUUID } from "crypto"
import { createClient } from "@supabase/supabase-js"

import { AccountingTransactionService } from "../../lib/accounting-transaction-service"
import { getAccrualAccountMapping } from "../../lib/accrual-accounting-engine"
import { BillReceiptWorkflowService } from "../../lib/services/bill-receipt-workflow.service"

loadDotenv({ path: ".env.local" })

type SupabaseLike = any

const DEFAULT_TEST_COMPANY_ID = "8ef6338c-1713-4202-98ac-863633b76526"

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

async function resolveActor(supabase: SupabaseLike, companyId: string) {
  const { data, error } = await supabase
    .from("company_members")
    .select("user_id, role")
    .eq("company_id", companyId)
    .in("role", ["owner", "admin", "general_manager"])
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message || "Failed to resolve actor")
  const actor = Array.isArray(data) ? data[0] : null
  if (!actor?.user_id || !actor?.role) {
    throw new Error("BILL_RECEIPT_HOTFIX_ACTOR_NOT_FOUND")
  }
  return {
    actorId: String(actor.user_id),
    actorRole: String(actor.role),
  }
}

async function resolveContext(supabase: SupabaseLike, companyId: string) {
  const actor = await resolveActor(supabase, companyId)

  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id, default_warehouse_id, default_cost_center_id")
    .eq("company_id", companyId)
    .eq("branch_code", "BR01")
    .limit(1)
    .maybeSingle()

  if (branchError || !branch?.id || !branch?.default_warehouse_id || !branch?.default_cost_center_id) {
    throw new Error(branchError?.message || "Failed to resolve branch defaults")
  }

  const { data: supplier, error: supplierError } = await supabase
    .from("suppliers")
    .select("id")
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (supplierError || !supplier?.id) {
    throw new Error(supplierError?.message || "Failed to resolve supplier")
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id")
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (productError || !product?.id) {
    throw new Error(productError?.message || "Failed to resolve product")
  }

  return {
    actor,
    branchId: String(branch.id),
    warehouseId: String(branch.default_warehouse_id),
    costCenterId: String(branch.default_cost_center_id),
    supplierId: String(supplier.id),
    productId: String(product.id),
  }
}

async function deleteByIds(supabase: SupabaseLike, table: string, column: string, ids: string[]) {
  if (ids.length === 0) return 0
  const { error, count } = await supabase.from(table).delete({ count: "exact" }).in(column, ids)
  if (error) throw new Error(`${table}: ${error.message || "delete failed"}`)
  return Number(count || 0)
}

async function cleanupBillArtifacts(supabase: SupabaseLike, companyId: string, billId: string) {
  const [notificationRows, traceRows, auditRows, inventoryRows, journalRows] = await Promise.all([
    supabase.from("notifications").select("id").eq("reference_type", "bill").eq("reference_id", billId),
    supabase.from("financial_operation_traces").select("transaction_id").eq("source_entity", "bill").eq("source_id", billId),
    supabase.from("audit_logs").select("id").eq("target_table", "bills").eq("record_id", billId),
    supabase.from("inventory_transactions").select("id").eq("company_id", companyId).eq("reference_type", "bill").eq("reference_id", billId),
    supabase.from("journal_entries").select("id").eq("company_id", companyId).eq("reference_type", "bill").eq("reference_id", billId),
  ])

  const notificationIds = (notificationRows.data || []).map((row: any) => String(row.id))
  const traceIds = (traceRows.data || []).map((row: any) => String(row.transaction_id))
  const auditIds = (auditRows.data || []).map((row: any) => String(row.id))
  const inventoryIds = (inventoryRows.data || []).map((row: any) => String(row.id))
  const journalIds = (journalRows.data || []).map((row: any) => String(row.id))

  const lineRows = journalIds.length
    ? await supabase.from("journal_entry_lines").select("id").in("journal_entry_id", journalIds)
    : { data: [] as any[], error: null }
  if (lineRows.error) throw new Error(lineRows.error.message || "Failed to load journal lines")

  await deleteByIds(
    supabase,
    "notification_user_states",
    "notification_id",
    notificationIds
  )
  await deleteByIds(supabase, "notifications", "id", notificationIds)
  await deleteByIds(supabase, "notification_outbox_events", "aggregate_id", [billId])
  await deleteByIds(supabase, "financial_operation_trace_links", "transaction_id", traceIds)
  await deleteByIds(supabase, "financial_operation_traces", "transaction_id", traceIds)
  await deleteByIds(supabase, "inventory_transactions", "id", inventoryIds)
  await deleteByIds(
    supabase,
    "journal_entry_lines",
    "id",
    (lineRows.data || []).map((row: any) => String(row.id))
  )
  await deleteByIds(supabase, "journal_entries", "id", journalIds)
  await deleteByIds(supabase, "bill_items", "bill_id", [billId])
  await deleteByIds(supabase, "audit_logs", "id", auditIds)
  await deleteByIds(supabase, "bills", "id", [billId])
  await deleteByIds(supabase, "audit_logs", "record_id", [billId])
}

async function main() {
  const companyId = DEFAULT_TEST_COMPANY_ID
  const supabase = createServiceSupabase()
  const context = await resolveContext(supabase, companyId)
  const workflow = new BillReceiptWorkflowService(supabase)
  const accounting = new AccountingTransactionService(supabase)

  const billNumber = `BILL-HOTFIX-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`
  let billId: string | null = null
  let cleanupError: string | null = null

  try {
    const { data: bill, error: billError } = await supabase
      .from("bills")
      .insert({
        company_id: companyId,
        supplier_id: context.supplierId,
        branch_id: context.branchId,
        warehouse_id: context.warehouseId,
        cost_center_id: context.costCenterId,
        bill_number: billNumber,
        bill_date: new Date().toISOString().slice(0, 10),
        status: "draft",
        approval_status: "pending",
        subtotal: 5,
        tax_amount: 0,
        total_amount: 5,
        currency_code: "EGP",
        exchange_rate: 1,
        created_by_user_id: context.actor.actorId,
      })
      .select("id, bill_date")
      .single()

    if (billError || !bill?.id) {
      throw new Error(billError?.message || "Failed to create hotfix test bill")
    }

    billId = String(bill.id)

    const { error: itemError } = await supabase.from("bill_items").insert({
      bill_id: billId,
      product_id: context.productId,
      quantity: 5,
      unit_price: 1,
      tax_rate: 0,
      discount_percent: 0,
      line_total: 5,
    })

    if (itemError) {
      throw new Error(itemError.message || "Failed to create hotfix test bill item")
    }

    await workflow.approveBill(
      {
        companyId,
        actorId: context.actor.actorId,
        actorRole: context.actor.actorRole,
      },
      billId,
      {
        idempotencyKey: `bill-hotfix-approve:${billId}`,
        requestHash: `bill-hotfix-approve:${billId}`,
        uiSurface: "bill_receipt_hotfix_test",
      }
    )

    await workflow.submitForReceipt(
      {
        companyId,
        actorId: context.actor.actorId,
        actorRole: context.actor.actorRole,
        actorBranchId: context.branchId,
        actorWarehouseId: context.warehouseId,
      },
      billId,
      {
        idempotencyKey: `bill-hotfix-submit:${billId}`,
        requestHash: `bill-hotfix-submit:${billId}`,
        uiSurface: "bill_receipt_hotfix_test",
      }
    )

    const accountMapping = await getAccrualAccountMapping(supabase, companyId)
    const postResult = await accounting.postBillAtomic(
      {
        billId,
        billNumber,
        billDate: String(bill.bill_date),
        companyId,
        branchId: context.branchId,
        warehouseId: context.warehouseId,
        costCenterId: context.costCenterId,
        subtotal: 5,
        taxAmount: 0,
        totalAmount: 5,
        status: "received",
        receiptStatus: "received",
        receivedBy: context.actor.actorId,
        receivedAt: new Date().toISOString(),
      },
      {
        companyId,
        ap: accountMapping.accounts_payable,
        inventory: accountMapping.inventory,
        purchases: accountMapping.purchases,
        vatInput: accountMapping.vat_input || undefined,
      }
    )

    if (!postResult.success) {
      throw new Error(postResult.error || "Bill receipt hotfix posting failed")
    }

    const [billAfter, journalEntries, inventoryTransactions] = await Promise.all([
      supabase
        .from("bills")
        .select("id, status, receipt_status, received_by, received_at")
        .eq("id", billId)
        .eq("company_id", companyId)
        .single(),
      supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", companyId)
        .eq("reference_type", "bill")
        .eq("reference_id", billId)
        .is("deleted_at", null),
      supabase
        .from("inventory_transactions")
        .select("id, unit_cost, total_cost")
        .eq("company_id", companyId)
        .eq("reference_type", "bill")
        .eq("reference_id", billId)
        .eq("transaction_type", "purchase"),
    ])

    if (billAfter.error || !billAfter.data) {
      throw new Error(billAfter.error?.message || "Failed to verify posted bill")
    }
    if (journalEntries.error) {
      throw new Error(journalEntries.error.message || "Failed to verify journal entries")
    }
    if (inventoryTransactions.error) {
      throw new Error(inventoryTransactions.error.message || "Failed to verify inventory transactions")
    }

    console.log(
      JSON.stringify(
        {
          success: true,
          billId,
          billNumber,
          billStatus: billAfter.data.status,
          receiptStatus: billAfter.data.receipt_status,
          journalEntries: (journalEntries.data || []).length,
          inventoryTransactions: (inventoryTransactions.data || []).length,
          inventoryCosts: inventoryTransactions.data || [],
          cleanupStatus: "pending",
        },
        null,
        2
      )
    )
  } finally {
    if (billId) {
      try {
        await cleanupBillArtifacts(supabase, companyId, billId)
      } catch (error) {
        cleanupError = error instanceof Error ? error.message : String(error)
      }
    }

    if (cleanupError) {
      console.warn(
        JSON.stringify(
          {
            warning: "BILL_RECEIPT_HOTFIX_TEST_CLEANUP_FAILED",
            details: cleanupError,
            billId,
          },
          null,
          2
        )
      )
    }
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  )
  process.exit(1)
})
