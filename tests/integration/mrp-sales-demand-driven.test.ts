import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import {
  cleanupTestData,
  createTestClient,
  createTestCompany,
  createTestCustomer,
  hasTestSupabaseCredentials,
  type TestSupabaseClient,
} from "../helpers/test-setup"

const shouldRunMrpSalesDemandDriven =
  hasTestSupabaseCredentials() &&
  String(process.env.RUN_API_INTEGRATION_TESTS || "").trim() === "1"

const { mockGetManufacturingApiContext } = vi.hoisted(() => ({
  mockGetManufacturingApiContext: vi.fn(),
}))

vi.mock("@/lib/core", () => ({
  asyncAuditLog: vi.fn(),
}))

vi.mock("@/lib/manufacturing/mrp-run-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/manufacturing/mrp-run-api")>(
    "@/lib/manufacturing/mrp-run-api"
  )
  return {
    ...actual,
    getManufacturingApiContext: mockGetManufacturingApiContext,
  }
})

import { POST as createMrpRunRoute } from "../../app/api/manufacturing/mrp/runs/route"

const describeMrpSalesDemandDriven = shouldRunMrpSalesDemandDriven ? describe : describe.skip

type JsonObject = Record<string, any>

type ScenarioContext = {
  supabase: TestSupabaseClient
  companyId: string
  userId: string
  email: string
}

type SalesScenario = ScenarioContext & {
  branchId: string
  costCenterId: string
  warehouseId: string
  customerId: string
}

type ProductType = "manufactured" | "raw_material" | "purchased" | "service"

let currentApiContext: ScenarioContext | null = null
const cleanupContexts: ScenarioContext[] = []

async function parseJsonResponse(response: Response) {
  return response.json() as Promise<JsonObject>
}

function makeJsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function isExpectedProtectedCleanupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "")
  return (
    message.includes("MRP rows can only be written while the run is running") ||
    message.includes("immutable. UPDATE and DELETE are not allowed") ||
    message.includes("frozen release snapshot in v1. DELETE is not allowed") ||
    message.includes("structure is not editable in current status") ||
    (message.includes("update or delete on table") && message.includes("violates foreign key constraint"))
  )
}

async function deleteByCompanyId(supabase: TestSupabaseClient, table: string, companyId: string) {
  const { error } = await supabase.from(table).delete().eq("company_id", companyId)
  if (error) {
    if (isExpectedProtectedCleanupError(error)) {
      console.warn(`Skipping protected cleanup for ${table}: ${error.message}`)
      return
    }
    throw new Error(`Cleanup failed for ${table}: ${error.message}`)
  }
}

async function deleteSalesOrderItemsByCompany(supabase: TestSupabaseClient, companyId: string) {
  const { data: salesOrders, error: salesOrdersError } = await supabase
    .from("sales_orders")
    .select("id")
    .eq("company_id", companyId)

  if (salesOrdersError) {
    throw new Error(`Failed to load sales orders for cleanup: ${salesOrdersError.message}`)
  }

  const salesOrderIds = (salesOrders || []).map((row) => row.id).filter(Boolean)
  if (salesOrderIds.length === 0) return

  const { error } = await supabase.from("sales_order_items").delete().in("sales_order_id", salesOrderIds)
  if (error) {
    if (isExpectedProtectedCleanupError(error)) {
      console.warn(`Skipping protected cleanup for sales_order_items: ${error.message}`)
      return
    }
    throw new Error(`Cleanup failed for sales_order_items: ${error.message}`)
  }
}

async function cleanupMrpSalesScenario(supabase: TestSupabaseClient, companyId: string) {
  const tables = [
    "inventory_reservation_allocations",
    "inventory_reservation_lines",
    "inventory_reservations",
    "fifo_cost_lots",
    "inventory_transactions",
    "sales_orders",
    "products",
    "customers",
    "warehouses",
    "cost_centers",
    "branches",
  ]

  await deleteSalesOrderItemsByCompany(supabase, companyId)

  for (const table of tables) {
    await deleteByCompanyId(supabase, table, companyId)
  }
}

async function ensureBranchDefaults(
  supabase: TestSupabaseClient,
  companyId: string,
  userId: string,
  tag: string
) {
  const { data: branchRows, error: branchError } = await supabase
    .from("branches")
    .select("id, code, name, default_cost_center_id, default_warehouse_id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(1)

  if (branchError) throw new Error(`Failed to load default branch: ${branchError.message}`)

  let branch = branchRows?.[0]
  if (!branch) {
    const { data: insertedBranch, error } = await supabase
      .from("branches")
      .insert({
        company_id: companyId,
        name: `${tag} Branch`,
        code: `${tag}-BR`,
        is_active: true,
        is_main: true,
      })
      .select("id, code, name, default_cost_center_id, default_warehouse_id")
      .single()

    if (error || !insertedBranch) {
      throw new Error(`Failed to create branch fallback: ${error?.message}`)
    }
    branch = insertedBranch
  }

  let costCenterId = branch.default_cost_center_id as string | null
  if (!costCenterId) {
    const { data: insertedCostCenter, error } = await supabase
      .from("cost_centers")
      .insert({
        company_id: companyId,
        branch_id: branch.id,
        cost_center_name: `${tag} Cost Center`,
        cost_center_code: `${tag}-CC`,
        is_active: true,
      })
      .select("id")
      .single()

    if (error || !insertedCostCenter?.id) {
      throw new Error(`Failed to create cost center fallback: ${error?.message}`)
    }
    costCenterId = insertedCostCenter.id
  }

  let warehouseId = branch.default_warehouse_id as string | null
  if (!warehouseId) {
    const { data: insertedWarehouse, error } = await supabase
      .from("warehouses")
      .insert({
        company_id: companyId,
        branch_id: branch.id,
        cost_center_id: costCenterId,
        name: `${tag} Warehouse`,
        code: `${tag}-WH`,
        is_main: true,
        is_active: true,
        notes: "MRP sales-demand integration warehouse",
      })
      .select("id")
      .single()

    if (error || !insertedWarehouse?.id) {
      throw new Error(`Failed to create warehouse fallback: ${error?.message}`)
    }
    warehouseId = insertedWarehouse.id
  } else {
    const { error } = await supabase
      .from("warehouses")
      .update({ cost_center_id: costCenterId, branch_id: branch.id })
      .eq("id", warehouseId)

    if (error) throw new Error(`Failed to align warehouse defaults: ${error.message}`)
  }

  const { error: branchUpdateError } = await supabase
    .from("branches")
    .update({
      default_cost_center_id: costCenterId,
      default_warehouse_id: warehouseId,
    })
    .eq("id", branch.id)

  if (branchUpdateError) {
    throw new Error(`Failed to update branch defaults: ${branchUpdateError.message}`)
  }

  const { error: membershipError } = await supabase
    .from("company_members")
    .update({
      branch_id: branch.id,
      cost_center_id: costCenterId,
      warehouse_id: warehouseId,
    })
    .eq("company_id", companyId)
    .eq("user_id", userId)

  if (membershipError) {
    throw new Error(`Failed to align company member governance context: ${membershipError.message}`)
  }

  return {
    branchId: branch.id,
    costCenterId,
    warehouseId,
  }
}

async function createProduct(params: {
  supabase: TestSupabaseClient
  companyId: string
  branchId: string
  warehouseId: string
  costCenterId: string
  tag: string
  suffix: string
  name: string
  productType: ProductType
  unitPrice?: number
  costPrice?: number
}) {
  const itemType = params.productType === "service" ? "service" : "product"
  const { data, error } = await params.supabase
    .from("products")
    .insert({
      company_id: params.companyId,
      branch_id: params.branchId,
      warehouse_id: params.warehouseId,
      cost_center_id: params.costCenterId,
      sku: `${params.tag}-${params.suffix}`,
      name: params.name,
      item_type: itemType,
      product_type: params.productType,
      quantity_on_hand: 0,
      cost_price: params.costPrice ?? 0,
      unit_price: params.unitPrice ?? 100,
      reorder_level: 0,
      unit: "piece",
      is_active: true,
    })
    .select("id, sku, item_type, product_type")
    .single()

  if (error || !data) {
    throw new Error(`Failed to create product ${params.suffix}: ${error?.message}`)
  }

  return data
}

async function createScenarioContext(): Promise<ScenarioContext> {
  const supabase = createTestClient()
  const setup = await createTestCompany(supabase)
  const context: ScenarioContext = {
    supabase,
    companyId: setup.companyId,
    userId: setup.userId,
    email: setup.email,
  }

  cleanupContexts.push(context)
  currentApiContext = context
  return context
}

async function setupSalesScenario(tag: string): Promise<SalesScenario> {
  const context = await createScenarioContext()
  const { supabase, companyId, userId } = context
  const { branchId, costCenterId, warehouseId } = await ensureBranchDefaults(supabase, companyId, userId, tag)
  const customerId = await createTestCustomer(supabase, companyId)

  return {
    ...context,
    branchId,
    costCenterId,
    warehouseId,
    customerId,
  }
}

async function seedInventoryStock(params: {
  supabase: TestSupabaseClient
  companyId: string
  branchId: string
  warehouseId: string
  costCenterId: string
  productId: string
  quantity: number
  unitCost: number
  tag: string
}) {
  const seedReferenceId = randomUUID()
  const { error: seedInventoryError } = await params.supabase.from("inventory_transactions").insert({
    company_id: params.companyId,
    branch_id: params.branchId,
    warehouse_id: params.warehouseId,
    cost_center_id: params.costCenterId,
    product_id: params.productId,
    transaction_type: "adjustment",
    quantity_change: params.quantity,
    unit_cost: params.unitCost,
    total_cost: params.quantity * params.unitCost,
    reference_id: seedReferenceId,
    reference_type: "mrp_sales_seed",
    notes: `${params.tag} inventory seed`,
  })

  if (seedInventoryError) {
    throw new Error(`Failed to create inventory seed transaction: ${seedInventoryError.message}`)
  }

  const { error: seedLotError } = await params.supabase.from("fifo_cost_lots").insert({
    company_id: params.companyId,
    product_id: params.productId,
    lot_date: new Date().toISOString().slice(0, 10),
    lot_type: "opening_stock",
    reference_type: "opening_stock",
    reference_id: null,
    original_quantity: params.quantity,
    remaining_quantity: params.quantity,
    unit_cost: params.unitCost,
    notes: `${params.tag} fifo seed`,
    branch_id: params.branchId,
    warehouse_id: params.warehouseId,
  })

  if (seedLotError) {
    throw new Error(`Failed to create fifo lot seed: ${seedLotError.message}`)
  }
}

async function seedManualReservation(params: {
  supabase: TestSupabaseClient
  companyId: string
  branchId: string
  warehouseId: string
  costCenterId: string
  userId: string
  productId: string
  quantity: number
  tag: string
}) {
  const sourceId = randomUUID()
  const { data: reservation, error: reservationError } = await params.supabase
    .from("inventory_reservations")
    .insert({
      company_id: params.companyId,
      branch_id: params.branchId,
      warehouse_id: params.warehouseId,
      cost_center_id: params.costCenterId,
      source_type: "manual",
      source_id: sourceId,
      source_number: `${params.tag}-MANUAL`,
      status: "fully_reserved",
      requested_qty: params.quantity,
      reserved_qty: params.quantity,
      consumed_qty: 0,
      released_qty: 0,
      created_by: params.userId,
      updated_by: params.userId,
      last_status_changed_by: params.userId,
    })
    .select("id")
    .single()

  if (reservationError || !reservation?.id) {
    throw new Error(`Failed to create manual reservation header: ${reservationError?.message}`)
  }

  const { data: reservationLine, error: reservationLineError } = await params.supabase
    .from("inventory_reservation_lines")
    .insert({
      company_id: params.companyId,
      branch_id: params.branchId,
      warehouse_id: params.warehouseId,
      cost_center_id: params.costCenterId,
      reservation_id: reservation.id,
      source_line_id: null,
      line_no: 1,
      product_id: params.productId,
      requested_qty: params.quantity,
      reserved_qty: params.quantity,
      consumed_qty: 0,
      released_qty: 0,
      created_by: params.userId,
      updated_by: params.userId,
    })
    .select("id")
    .single()

  if (reservationLineError || !reservationLine?.id) {
    throw new Error(`Failed to create manual reservation line: ${reservationLineError?.message}`)
  }

  const { error: allocationError } = await params.supabase
    .from("inventory_reservation_allocations")
    .insert({
      company_id: params.companyId,
      branch_id: params.branchId,
      warehouse_id: params.warehouseId,
      cost_center_id: params.costCenterId,
      reservation_id: reservation.id,
      reservation_line_id: reservationLine.id,
      product_id: params.productId,
      allocated_qty: params.quantity,
      consumed_qty: 0,
      released_qty: 0,
      status: "active",
      created_by: params.userId,
      updated_by: params.userId,
    })

  if (allocationError) {
    throw new Error(`Failed to create manual reservation allocation: ${allocationError.message}`)
  }

  return {
    reservationId: reservation.id,
    reservationLineId: reservationLine.id,
  }
}

async function insertSalesOrderWithItems(params: {
  supabase: TestSupabaseClient
  companyId: string
  branchId: string
  warehouseId: string
  costCenterId: string
  customerId: string
  tag: string
  suffix: string
  status: string
  items: Array<{
    productId: string
    quantity: number
    unitPrice: number
    itemType?: "product" | "service"
  }>
}) {
  const subtotal = params.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
  const { data: salesOrder, error: salesOrderError } = await params.supabase
    .from("sales_orders")
    .insert({
      company_id: params.companyId,
      customer_id: params.customerId,
      so_number: `${params.tag}-${params.suffix}`,
      so_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      subtotal,
      tax_amount: 0,
      total: subtotal,
      total_amount: subtotal,
      status: params.status,
      notes: `${params.tag} sales order`,
      branch_id: params.branchId,
      cost_center_id: params.costCenterId,
      warehouse_id: params.warehouseId,
    })
    .select("id, so_number, status")
    .single()

  if (salesOrderError || !salesOrder?.id) {
    throw new Error(`Failed to create sales order ${params.suffix}: ${salesOrderError?.message}`)
  }

  const itemsToInsert = params.items.map((item) => ({
    sales_order_id: salesOrder.id,
    product_id: item.productId,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    tax_rate: 0,
    discount_percent: 0,
    line_total: item.quantity * item.unitPrice,
    item_type: item.itemType ?? "product",
  }))

  const { data: insertedItems, error: itemError } = await params.supabase
    .from("sales_order_items")
    .insert(itemsToInsert)
    .select("id, product_id, quantity")

  if (itemError) {
    throw new Error(`Failed to create sales order items for ${params.suffix}: ${itemError.message}`)
  }

  return {
    salesOrderId: salesOrder.id,
    salesOrderNumber: salesOrder.so_number,
    items: insertedItems || [],
  }
}

async function runMrpAndLoadPersistedRows(
  scenario: SalesScenario,
  notes: string
) {
  currentApiContext = scenario

  const runResponse = await createMrpRunRoute(
    makeJsonRequest("http://localhost/api/manufacturing/mrp/runs", "POST", {
      run_scope: "warehouse_filtered",
      branch_id: scenario.branchId,
      warehouse_id: scenario.warehouseId,
      notes,
    })
  )
  const runJson = await parseJsonResponse(runResponse)

  if (runResponse.status !== 201 || !runJson.success) {
    throw new Error(`Failed to create MRP run: ${JSON.stringify(runJson)}`)
  }

  const runId = String(runJson.data.id)
  const [
    { data: runHeader, error: runHeaderError },
    { data: demandRows, error: demandError },
    { data: supplyRows, error: supplyError },
    { data: netRows, error: netError },
    { data: suggestionRows, error: suggestionError },
  ] = await Promise.all([
    scenario.supabase.from("mrp_runs").select("*").eq("id", runId).single(),
    scenario.supabase.from("mrp_demand_rows").select("*").eq("run_id", runId).order("created_at"),
    scenario.supabase.from("mrp_supply_rows").select("*").eq("run_id", runId).order("created_at"),
    scenario.supabase.from("mrp_net_rows").select("*").eq("run_id", runId).order("created_at"),
    scenario.supabase.from("mrp_suggestions").select("*").eq("run_id", runId).order("created_at"),
  ])

  if (runHeaderError) throw new Error(runHeaderError.message)
  if (demandError) throw new Error(demandError.message)
  if (supplyError) throw new Error(supplyError.message)
  if (netError) throw new Error(netError.message)
  if (suggestionError) throw new Error(suggestionError.message)

  return {
    runResponse,
    runJson,
    runId,
    runHeader,
    demandRows: demandRows || [],
    supplyRows: supplyRows || [],
    netRows: netRows || [],
    suggestionRows: suggestionRows || [],
  }
}

describeMrpSalesDemandDriven("MRP sales-demand-driven integration", () => {
  beforeAll(() => {
    mockGetManufacturingApiContext.mockImplementation(async () => {
      if (!currentApiContext) {
        throw new Error("Scenario context was not initialized before API invocation")
      }

      return {
        user: { id: currentApiContext.userId, email: currentApiContext.email },
        companyId: currentApiContext.companyId,
        member: {
          id: `member-${currentApiContext.companyId}`,
          companyId: currentApiContext.companyId,
          userId: currentApiContext.userId,
          role: "owner",
          branchId: currentApiContext.branchId ?? null,
          costCenterId: null,
          warehouseId: null,
          email: currentApiContext.email,
          createdAt: new Date().toISOString(),
          isUpperRole: true,
          isNormalRole: false,
        },
        supabase: currentApiContext.supabase,
        admin: currentApiContext.supabase,
      }
    })
  })

  afterAll(async () => {
    for (const context of cleanupContexts.reverse()) {
      try {
        await cleanupMrpSalesScenario(context.supabase, context.companyId)
      } catch (error) {
        if (!isExpectedProtectedCleanupError(error)) throw error
        console.warn("Skipping protected MRP/sales cleanup during test teardown:", error)
      } finally {
        try {
          await cleanupTestData(context.supabase, context.companyId, context.userId)
        } catch (error) {
          if (!isExpectedProtectedCleanupError(error)) throw error
          console.warn("Skipping protected company cleanup during test teardown:", error)
        }
      }
    }
  })

  it(
    "maps manufactured sales shortage to production suggestion with sales_shortage reason",
    async () => {
      const tag = `MRP-SALES-MFG-${Date.now()}`
      const scenario = await setupSalesScenario(tag)
      currentApiContext = scenario

      const fg = await createProduct({
        supabase: scenario.supabase,
        companyId: scenario.companyId,
        branchId: scenario.branchId,
        warehouseId: scenario.warehouseId,
        costCenterId: scenario.costCenterId,
        tag,
        suffix: "FG",
        name: `${tag} Finished Good`,
        productType: "manufactured",
        unitPrice: 120,
      })

      const salesOrder = await insertSalesOrderWithItems({
        supabase: scenario.supabase,
        companyId: scenario.companyId,
        branchId: scenario.branchId,
        warehouseId: scenario.warehouseId,
        costCenterId: scenario.costCenterId,
        customerId: scenario.customerId,
        tag,
        suffix: "SO-APPROVED",
        status: "approved",
        items: [
          {
            productId: fg.id,
            quantity: 7,
            unitPrice: 120,
          },
        ],
      })

      const result = await runMrpAndLoadPersistedRows(scenario, `${tag} MRP run`)

      expect(result.runHeader.status).toBe("completed")
      expect(result.runHeader.demand_row_count).toBe(1)
      expect(result.runHeader.net_row_count).toBe(1)
      expect(result.runHeader.suggestion_count).toBe(1)
      expect(result.demandRows).toHaveLength(1)
      expect(result.supplyRows).toHaveLength(0)
      expect(result.netRows).toHaveLength(1)
      expect(result.suggestionRows).toHaveLength(1)

      expect(result.demandRows[0].demand_type).toBe("sales")
      expect(result.demandRows[0].source_type).toBe("sales_order")
      expect(result.demandRows[0].source_id).toBe(salesOrder.salesOrderId)
      expect(result.demandRows[0].source_line_id).toBe(String(salesOrder.items[0].id))
      expect(result.demandRows[0].product_id).toBe(fg.id)
      expect(result.demandRows[0].product_type).toBe("manufactured")
      expect(Number(result.demandRows[0].original_qty)).toBe(7)
      expect(Number(result.demandRows[0].covered_qty)).toBe(0)
      expect(Number(result.demandRows[0].uncovered_qty)).toBe(7)

      expect(result.netRows[0].product_id).toBe(fg.id)
      expect(Number(result.netRows[0].sales_demand_qty)).toBe(7)
      expect(Number(result.netRows[0].production_demand_qty)).toBe(0)
      expect(Number(result.netRows[0].reorder_demand_qty)).toBe(0)
      expect(Number(result.netRows[0].free_stock_qty)).toBe(0)
      expect(Number(result.netRows[0].net_required_qty)).toBe(7)
      expect(result.netRows[0].suggested_action).toBe("production")

      expect(result.suggestionRows[0].product_id).toBe(fg.id)
      expect(result.suggestionRows[0].product_type).toBe("manufactured")
      expect(result.suggestionRows[0].suggestion_type).toBe("production")
      expect(Number(result.suggestionRows[0].suggested_qty)).toBe(7)
      expect(result.suggestionRows[0].reason_code).toBe("sales_shortage")
    },
    120000
  )

  it(
    "uses reservation-aware free stock for purchased sales demand instead of raw on-hand",
    async () => {
      const tag = `MRP-SALES-PUR-${Date.now()}`
      const scenario = await setupSalesScenario(tag)
      currentApiContext = scenario

      const purchased = await createProduct({
        supabase: scenario.supabase,
        companyId: scenario.companyId,
        branchId: scenario.branchId,
        warehouseId: scenario.warehouseId,
        costCenterId: scenario.costCenterId,
        tag,
        suffix: "PUR",
        name: `${tag} Purchased Item`,
        productType: "purchased",
        unitPrice: 50,
        costPrice: 20,
      })

      await seedInventoryStock({
        supabase: scenario.supabase,
        companyId: scenario.companyId,
        branchId: scenario.branchId,
        warehouseId: scenario.warehouseId,
        costCenterId: scenario.costCenterId,
        productId: purchased.id,
        quantity: 10,
        unitCost: 20,
        tag,
      })

      await seedManualReservation({
        supabase: scenario.supabase,
        companyId: scenario.companyId,
        branchId: scenario.branchId,
        warehouseId: scenario.warehouseId,
        costCenterId: scenario.costCenterId,
        userId: scenario.userId,
        productId: purchased.id,
        quantity: 8,
        tag,
      })

      const { data: balanceBefore, error: balanceBeforeError } = await scenario.supabase
        .from("v_inventory_reservation_balances")
        .select("on_hand_quantity, reserved_quantity, free_quantity")
        .eq("company_id", scenario.companyId)
        .eq("branch_id", scenario.branchId)
        .eq("warehouse_id", scenario.warehouseId)
        .eq("product_id", purchased.id)
        .maybeSingle()

      if (balanceBeforeError) throw new Error(balanceBeforeError.message)

      expect(Number(balanceBefore?.on_hand_quantity || 0)).toBe(10)
      expect(Number(balanceBefore?.reserved_quantity || 0)).toBe(8)
      expect(Number(balanceBefore?.free_quantity || 0)).toBe(2)

      const salesOrder = await insertSalesOrderWithItems({
        supabase: scenario.supabase,
        companyId: scenario.companyId,
        branchId: scenario.branchId,
        warehouseId: scenario.warehouseId,
        costCenterId: scenario.costCenterId,
        customerId: scenario.customerId,
        tag,
        suffix: "SO-APPROVED",
        status: "approved",
        items: [
          {
            productId: purchased.id,
            quantity: 6,
            unitPrice: 50,
          },
        ],
      })

      const result = await runMrpAndLoadPersistedRows(scenario, `${tag} MRP run`)
      const supplyRow = result.supplyRows.find((row) => row.product_id === purchased.id && row.supply_type === "free_stock")
      const netRow = result.netRows.find((row) => row.product_id === purchased.id)
      const suggestionRow = result.suggestionRows.find((row) => row.product_id === purchased.id)

      expect(result.runHeader.status).toBe("completed")
      expect(result.demandRows).toHaveLength(1)
      expect(supplyRow).toBeTruthy()
      expect(netRow).toBeTruthy()
      expect(suggestionRow).toBeTruthy()

      expect(result.demandRows[0].source_id).toBe(salesOrder.salesOrderId)
      expect(Number(result.demandRows[0].uncovered_qty)).toBe(6)

      expect(Number(supplyRow?.available_qty || 0)).toBe(2)
      expect(Number(supplyRow?.original_qty || 0)).toBe(2)

      expect(Number(netRow?.sales_demand_qty || 0)).toBe(6)
      expect(Number(netRow?.free_stock_qty || 0)).toBe(2)
      expect(Number(netRow?.total_supply_qty || 0)).toBe(2)
      expect(Number(netRow?.net_required_qty || 0)).toBe(4)
      expect(netRow?.suggested_action).toBe("purchase")

      expect(suggestionRow?.product_type).toBe("purchased")
      expect(suggestionRow?.suggestion_type).toBe("purchase")
      expect(Number(suggestionRow?.suggested_qty || 0)).toBe(4)
      expect(suggestionRow?.reason_code).toBe("sales_shortage")
    },
    120000
  )

  it(
    "maps raw material sales demand to purchase suggestion",
    async () => {
      const tag = `MRP-SALES-RM-${Date.now()}`
      const scenario = await setupSalesScenario(tag)
      currentApiContext = scenario

      const rm = await createProduct({
        supabase: scenario.supabase,
        companyId: scenario.companyId,
        branchId: scenario.branchId,
        warehouseId: scenario.warehouseId,
        costCenterId: scenario.costCenterId,
        tag,
        suffix: "RM",
        name: `${tag} Raw Material`,
        productType: "raw_material",
        unitPrice: 30,
      })

      const salesOrder = await insertSalesOrderWithItems({
        supabase: scenario.supabase,
        companyId: scenario.companyId,
        branchId: scenario.branchId,
        warehouseId: scenario.warehouseId,
        costCenterId: scenario.costCenterId,
        customerId: scenario.customerId,
        tag,
        suffix: "SO-APPROVED",
        status: "approved",
        items: [
          {
            productId: rm.id,
            quantity: 5,
            unitPrice: 30,
          },
        ],
      })

      const result = await runMrpAndLoadPersistedRows(scenario, `${tag} MRP run`)

      expect(result.runHeader.status).toBe("completed")
      expect(result.demandRows).toHaveLength(1)
      expect(result.netRows).toHaveLength(1)
      expect(result.suggestionRows).toHaveLength(1)
      expect(result.demandRows[0].source_id).toBe(salesOrder.salesOrderId)
      expect(result.demandRows[0].product_type).toBe("raw_material")
      expect(Number(result.netRows[0].sales_demand_qty)).toBe(5)
      expect(Number(result.netRows[0].net_required_qty)).toBe(5)
      expect(result.netRows[0].suggested_action).toBe("purchase")
      expect(result.suggestionRows[0].suggestion_type).toBe("purchase")
      expect(result.suggestionRows[0].reason_code).toBe("sales_shortage")
      expect(Number(result.suggestionRows[0].suggested_qty)).toBe(5)
    },
    120000
  )

  it(
    "excludes service sales lines while keeping eligible sales lines in the same run",
    async () => {
      const tag = `MRP-SALES-SVC-${Date.now()}`
      const scenario = await setupSalesScenario(tag)
      currentApiContext = scenario

      const fg = await createProduct({
        supabase: scenario.supabase,
        companyId: scenario.companyId,
        branchId: scenario.branchId,
        warehouseId: scenario.warehouseId,
        costCenterId: scenario.costCenterId,
        tag,
        suffix: "FG",
        name: `${tag} Finished Good`,
        productType: "manufactured",
        unitPrice: 140,
      })

      const service = await createProduct({
        supabase: scenario.supabase,
        companyId: scenario.companyId,
        branchId: scenario.branchId,
        warehouseId: scenario.warehouseId,
        costCenterId: scenario.costCenterId,
        tag,
        suffix: "SVC",
        name: `${tag} Service`,
        productType: "service",
        unitPrice: 200,
      })

      await insertSalesOrderWithItems({
        supabase: scenario.supabase,
        companyId: scenario.companyId,
        branchId: scenario.branchId,
        warehouseId: scenario.warehouseId,
        costCenterId: scenario.costCenterId,
        customerId: scenario.customerId,
        tag,
        suffix: "SO-MIXED",
        status: "approved",
        items: [
          {
            productId: service.id,
            quantity: 5,
            unitPrice: 200,
            itemType: "service",
          },
          {
            productId: fg.id,
            quantity: 3,
            unitPrice: 140,
          },
        ],
      })

      const result = await runMrpAndLoadPersistedRows(scenario, `${tag} MRP run`)

      expect(result.runHeader.status).toBe("completed")
      expect(result.demandRows).toHaveLength(1)
      expect(result.netRows).toHaveLength(1)
      expect(result.suggestionRows).toHaveLength(1)
      expect(result.demandRows[0].product_id).toBe(fg.id)
      expect(result.demandRows[0].product_type).toBe("manufactured")
      expect(result.demandRows.some((row) => row.product_id === service.id)).toBe(false)
      expect(result.netRows.some((row) => row.product_id === service.id)).toBe(false)
      expect(result.suggestionRows.some((row) => row.product_id === service.id)).toBe(false)
      expect(result.suggestionRows[0].suggestion_type).toBe("production")
      expect(result.suggestionRows[0].reason_code).toBe("sales_shortage")
    },
    120000
  )

  it(
    "ignores sales orders outside approved or confirmed statuses",
    async () => {
      const tag = `MRP-SALES-STATUS-${Date.now()}`
      const scenario = await setupSalesScenario(tag)
      currentApiContext = scenario

      const fg = await createProduct({
        supabase: scenario.supabase,
        companyId: scenario.companyId,
        branchId: scenario.branchId,
        warehouseId: scenario.warehouseId,
        costCenterId: scenario.costCenterId,
        tag,
        suffix: "FG",
        name: `${tag} Finished Good`,
        productType: "manufactured",
        unitPrice: 110,
      })

      const approvedOrder = await insertSalesOrderWithItems({
        supabase: scenario.supabase,
        companyId: scenario.companyId,
        branchId: scenario.branchId,
        warehouseId: scenario.warehouseId,
        costCenterId: scenario.costCenterId,
        customerId: scenario.customerId,
        tag,
        suffix: "SO-APPROVED",
        status: "approved",
        items: [
          {
            productId: fg.id,
            quantity: 4,
            unitPrice: 110,
          },
        ],
      })

      const draftOrder = await insertSalesOrderWithItems({
        supabase: scenario.supabase,
        companyId: scenario.companyId,
        branchId: scenario.branchId,
        warehouseId: scenario.warehouseId,
        costCenterId: scenario.costCenterId,
        customerId: scenario.customerId,
        tag,
        suffix: "SO-DRAFT",
        status: "draft",
        items: [
          {
            productId: fg.id,
            quantity: 6,
            unitPrice: 110,
          },
        ],
      })

      const result = await runMrpAndLoadPersistedRows(scenario, `${tag} MRP run`)

      expect(result.runHeader.status).toBe("completed")
      expect(result.demandRows).toHaveLength(1)
      expect(result.demandRows[0].source_id).toBe(approvedOrder.salesOrderId)
      expect(result.demandRows.some((row) => row.source_id === draftOrder.salesOrderId)).toBe(false)
      expect(result.netRows).toHaveLength(1)
      expect(Number(result.netRows[0].sales_demand_qty)).toBe(4)
      expect(Number(result.netRows[0].net_required_qty)).toBe(4)
      expect(result.suggestionRows).toHaveLength(1)
      expect(Number(result.suggestionRows[0].suggested_qty)).toBe(4)
      expect(result.suggestionRows[0].reason_code).toBe("sales_shortage")
    },
    120000
  )
})
