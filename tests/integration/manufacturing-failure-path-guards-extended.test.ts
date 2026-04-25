import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import {
  cleanupTestData,
  createTestClient,
  createTestCompany,
  hasTestSupabaseCredentials,
  type TestSupabaseClient,
} from "../helpers/test-setup"

const shouldRunManufacturingFailurePathGuardsExtended =
  hasTestSupabaseCredentials() &&
  String(process.env.RUN_API_INTEGRATION_TESTS || "").trim() === "1"

const { mockGetManufacturingApiContext } = vi.hoisted(() => ({
  mockGetManufacturingApiContext: vi.fn(),
}))

vi.mock("@/lib/core", () => ({
  asyncAuditLog: vi.fn(),
}))

vi.mock("@/lib/manufacturing/production-order-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/manufacturing/production-order-api")>(
    "@/lib/manufacturing/production-order-api"
  )
  return {
    ...actual,
    getManufacturingApiContext: mockGetManufacturingApiContext,
  }
})

vi.mock("@/lib/manufacturing/inventory-execution-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/manufacturing/inventory-execution-api")>(
    "@/lib/manufacturing/inventory-execution-api"
  )
  return {
    ...actual,
    getManufacturingApiContext: mockGetManufacturingApiContext,
  }
})

import { POST as createProductionOrderRoute } from "../../app/api/manufacturing/production-orders/route"
import { POST as releaseProductionOrderRoute } from "../../app/api/manufacturing/production-orders/[id]/release/route"
import { POST as syncMaterialsRoute } from "../../app/api/manufacturing/production-orders/[id]/sync-materials/route"
import { POST as issueMaterialsRoute } from "../../app/api/manufacturing/production-orders/[id]/issue/route"
import { POST as receiptOutputRoute } from "../../app/api/manufacturing/production-orders/[id]/receipt/route"
import { POST as closeReservationsRoute } from "../../app/api/manufacturing/production-orders/[id]/close-reservations/route"

const describeFailurePathGuardsExtended = shouldRunManufacturingFailurePathGuardsExtended ? describe : describe.skip

type JsonObject = Record<string, any>

type ScenarioContext = {
  supabase: TestSupabaseClient
  companyId: string
  userId: string
  email: string
}

type DraftOrderScenario = ScenarioContext & {
  branchId: string
  costCenterId: string
  warehouseId: string
  fgId: string
  rmId: string
  productionOrderId: string
}

type ReleasedAndSyncedScenario = DraftOrderScenario & {
  materialRequirementId: string
  reservationId: string
}

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
    message.includes("structure is not editable in current status")
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

async function cleanupManufacturingScenario(supabase: TestSupabaseClient, companyId: string) {
  const tables = [
    "inventory_reservation_consumptions",
    "inventory_reservation_allocations",
    "inventory_reservation_lines",
    "inventory_reservations",
    "production_order_issue_lines",
    "production_order_issue_events",
    "production_order_receipt_lines",
    "production_order_receipt_events",
    "production_order_material_requirements",
    "manufacturing_production_order_operations",
    "manufacturing_production_orders",
    "manufacturing_routing_operations",
    "manufacturing_routing_versions",
    "manufacturing_routings",
    "manufacturing_bom_line_substitutes",
    "manufacturing_bom_lines",
    "manufacturing_bom_versions",
    "manufacturing_boms",
    "manufacturing_work_centers",
    "fifo_lot_consumptions",
    "fifo_cost_lots",
    "inventory_transactions",
    "products",
    "warehouses",
    "cost_centers",
    "branches",
  ]

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
        notes: "Failure-path extended integration warehouse",
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
  productType: "manufactured" | "raw_material"
  quantityOnHand?: number
  costPrice?: number
}) {
  const { data, error } = await params.supabase
    .from("products")
    .insert({
      company_id: params.companyId,
      branch_id: params.branchId,
      warehouse_id: params.warehouseId,
      cost_center_id: params.costCenterId,
      sku: `${params.tag}-${params.suffix}`,
      name: params.name,
      item_type: "product",
      product_type: params.productType,
      quantity_on_hand: params.quantityOnHand ?? 0,
      cost_price: params.costPrice ?? 0,
      unit_price: 0,
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

async function setupDraftOrder(
  tag: string,
  options: {
    includeWarehouses: boolean
  }
): Promise<DraftOrderScenario> {
  const context = await createScenarioContext()
  const { supabase, companyId, userId } = context
  const { branchId, costCenterId, warehouseId } = await ensureBranchDefaults(supabase, companyId, userId, tag)

  const fg = await createProduct({
    supabase,
    companyId,
    branchId,
    warehouseId,
    costCenterId,
    tag,
    suffix: "FG",
    name: `${tag} Finished Good`,
    productType: "manufactured",
  })

  const rm = await createProduct({
    supabase,
    companyId,
    branchId,
    warehouseId,
    costCenterId,
    tag,
    suffix: "RM",
    name: `${tag} Raw Material`,
    productType: "raw_material",
    quantityOnHand: 10,
    costPrice: 5,
  })

  const { data: workCenter, error: workCenterError } = await supabase
    .from("manufacturing_work_centers")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      cost_center_id: costCenterId,
      code: `${tag}-WC1`,
      name: `${tag} Work Center`,
      work_center_type: "machine",
      status: "active",
      parallel_capacity: 1,
      efficiency_percent: 100,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single()

  if (workCenterError || !workCenter?.id) {
    throw new Error(`Failed to create work center: ${workCenterError?.message}`)
  }

  const { data: bom, error: bomError } = await supabase
    .from("manufacturing_boms")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      product_id: fg.id,
      bom_code: `${tag}-BOM`,
      bom_name: `${tag} BOM`,
      bom_usage: "production",
      is_active: true,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single()

  if (bomError || !bom?.id) {
    throw new Error(`Failed to create BOM: ${bomError?.message}`)
  }

  const { data: bomVersion, error: bomVersionError } = await supabase
    .from("manufacturing_bom_versions")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      bom_id: bom.id,
      version_no: 1,
      status: "draft",
      is_default: false,
      base_output_qty: 1,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single()

  if (bomVersionError || !bomVersion?.id) {
    throw new Error(`Failed to create BOM version: ${bomVersionError?.message}`)
  }

  const { error: bomLineError } = await supabase
    .from("manufacturing_bom_lines")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      bom_version_id: bomVersion.id,
      line_no: 10,
      component_product_id: rm.id,
      line_type: "component",
      quantity_per: 2,
      scrap_percent: 0,
      issue_uom: "piece",
      is_optional: false,
      created_by: userId,
      updated_by: userId,
    })

  if (bomLineError) {
    throw new Error(`Failed to create BOM line: ${bomLineError.message}`)
  }

  const { data: routing, error: routingError } = await supabase
    .from("manufacturing_routings")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      product_id: fg.id,
      routing_code: `${tag}-ROUT`,
      routing_name: `${tag} Routing`,
      routing_usage: "production",
      is_active: true,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single()

  if (routingError || !routing?.id) {
    throw new Error(`Failed to create routing: ${routingError?.message}`)
  }

  const { data: routingVersion, error: routingVersionError } = await supabase
    .from("manufacturing_routing_versions")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      routing_id: routing.id,
      version_no: 1,
      status: "draft",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single()

  if (routingVersionError || !routingVersion?.id) {
    throw new Error(`Failed to create routing version: ${routingVersionError?.message}`)
  }

  const { error: routingOpError } = await supabase
    .from("manufacturing_routing_operations")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      routing_version_id: routingVersion.id,
      operation_no: 10,
      operation_code: `${tag}-OP10`,
      operation_name: `${tag} Mix`,
      work_center_id: workCenter.id,
      setup_time_minutes: 0,
      run_time_minutes_per_unit: 1,
      queue_time_minutes: 0,
      move_time_minutes: 0,
      labor_time_minutes: 0,
      machine_time_minutes: 1,
      quality_checkpoint_required: false,
      created_by: userId,
      updated_by: userId,
    })

  if (routingOpError) {
    throw new Error(`Failed to create routing operation: ${routingOpError.message}`)
  }

  const { data: activateRoutingResult, error: activateRoutingError } = await supabase.rpc(
    "activate_manufacturing_routing_version_atomic",
    {
      p_company_id: companyId,
      p_routing_version_id: routingVersion.id,
      p_updated_by: userId,
    }
  )

  if (activateRoutingError) {
    throw new Error(`Failed to activate routing version: ${activateRoutingError.message}`)
  }

  if (!activateRoutingResult?.success) {
    throw new Error("Failed to activate routing version: RPC returned unsuccessful result")
  }

  const seedReferenceId = randomUUID()
  const { error: seedInventoryError } = await supabase.from("inventory_transactions").insert({
    company_id: companyId,
    branch_id: branchId,
    warehouse_id: warehouseId,
    cost_center_id: costCenterId,
    product_id: rm.id,
    transaction_type: "adjustment",
    quantity_change: 10,
    unit_cost: 5,
    total_cost: 50,
    reference_id: seedReferenceId,
    reference_type: "failure_path_extended_seed",
    notes: `${tag} RM stock seed`,
  })

  if (seedInventoryError) {
    throw new Error(`Failed to create inventory seed transaction: ${seedInventoryError.message}`)
  }

  const { error: seedLotError } = await supabase.from("fifo_cost_lots").insert({
    company_id: companyId,
    product_id: rm.id,
    lot_date: new Date().toISOString().slice(0, 10),
    lot_type: "opening_stock",
    reference_type: "opening_stock",
    reference_id: null,
    original_quantity: 10,
    remaining_quantity: 10,
    unit_cost: 5,
    notes: `${tag} RM fifo seed`,
    branch_id: branchId,
    warehouse_id: warehouseId,
  })

  if (seedLotError) {
    throw new Error(`Failed to create fifo lot seed: ${seedLotError.message}`)
  }

  const createOrderPayload: JsonObject = {
    branch_id: branchId,
    product_id: fg.id,
    bom_id: bom.id,
    bom_version_id: bomVersion.id,
    routing_id: routing.id,
    routing_version_id: routingVersion.id,
    planned_quantity: 10,
    notes: `${tag} production order`,
  }

  if (options.includeWarehouses) {
    createOrderPayload.issue_warehouse_id = warehouseId
    createOrderPayload.receipt_warehouse_id = warehouseId
  }

  const createOrderResponse = await createProductionOrderRoute(
    makeJsonRequest("http://localhost/api/manufacturing/production-orders", "POST", createOrderPayload)
  )
  const createOrderJson = await parseJsonResponse(createOrderResponse)

  if (createOrderResponse.status !== 201 || !createOrderJson.success) {
    throw new Error(`Failed to create production order in setup: ${JSON.stringify(createOrderJson)}`)
  }

  return {
    ...context,
    branchId,
    costCenterId,
    warehouseId,
    fgId: fg.id,
    rmId: rm.id,
    productionOrderId: String(createOrderJson.data.order.id),
  }
}

async function setupReleasedAndSyncedOrder(tag: string): Promise<ReleasedAndSyncedScenario> {
  const draftScenario = await setupDraftOrder(tag, { includeWarehouses: true })

  const releaseResponse = await releaseProductionOrderRoute(
    makeJsonRequest(
      `http://localhost/api/manufacturing/production-orders/${draftScenario.productionOrderId}/release`,
      "POST",
      {}
    ),
    { params: Promise.resolve({ id: draftScenario.productionOrderId }) }
  )
  const releaseJson = await parseJsonResponse(releaseResponse)

  if (releaseResponse.status !== 200 || !releaseJson.success) {
    throw new Error(`Failed to release production order in setup: ${JSON.stringify(releaseJson)}`)
  }

  const syncResponse = await syncMaterialsRoute(
    makeJsonRequest(
      `http://localhost/api/manufacturing/production-orders/${draftScenario.productionOrderId}/sync-materials`,
      "POST",
      {}
    ),
    { params: Promise.resolve({ id: draftScenario.productionOrderId }) }
  )
  const syncJson = await parseJsonResponse(syncResponse)

  if (syncResponse.status !== 200 || !syncJson.success) {
    throw new Error(`Failed to sync materials in setup: ${JSON.stringify(syncJson)}`)
  }

  return {
    ...draftScenario,
    materialRequirementId: String(syncJson.data.material_requirements[0].id),
    reservationId: String(syncJson.data.reservations[0].id),
  }
}

async function setupInProgressOrderWithPartialReceipt(tag: string): Promise<ReleasedAndSyncedScenario> {
  const scenario = await setupReleasedAndSyncedOrder(tag)
  currentApiContext = scenario

  const issueResponse = await issueMaterialsRoute(
    makeJsonRequest(
      `http://localhost/api/manufacturing/production-orders/${scenario.productionOrderId}/issue`,
      "POST",
      {
        command_key: `${tag}-ISSUE-SETUP`,
        notes: `${tag} setup issue`,
        lines: [
          {
            material_requirement_id: scenario.materialRequirementId,
            issued_qty: 8,
          },
        ],
      }
    ),
    { params: Promise.resolve({ id: scenario.productionOrderId }) }
  )
  const issueJson = await parseJsonResponse(issueResponse)

  if (issueResponse.status !== 200 || !issueJson.success) {
    throw new Error(`Failed to issue materials in setup: ${JSON.stringify(issueJson)}`)
  }

  const receiptResponse = await receiptOutputRoute(
    makeJsonRequest(
      `http://localhost/api/manufacturing/production-orders/${scenario.productionOrderId}/receipt`,
      "POST",
      {
        command_key: `${tag}-RECEIPT-SETUP-1`,
        notes: `${tag} setup receipt`,
        received_qty: 4,
      }
    ),
    { params: Promise.resolve({ id: scenario.productionOrderId }) }
  )
  const receiptJson = await parseJsonResponse(receiptResponse)

  if (receiptResponse.status !== 200 || !receiptJson.success) {
    throw new Error(`Failed to receipt output in setup: ${JSON.stringify(receiptJson)}`)
  }

  return scenario
}

describeFailurePathGuardsExtended("Manufacturing failure-path guards extended integration", () => {
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
          branchId: null,
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
        await cleanupManufacturingScenario(context.supabase, context.companyId)
      } catch (error) {
        if (!isExpectedProtectedCleanupError(error)) throw error
        console.warn("Skipping protected manufacturing cleanup during test teardown:", error)
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
    "rejects over-receipt above remaining receivable without partial persistence",
    async () => {
      const tag = `FP-OVER-RECEIPT-${Date.now()}`
      const scenario = await setupInProgressOrderWithPartialReceipt(tag)
      currentApiContext = scenario

      const [
        { data: orderBefore, error: orderBeforeError },
        { count: receiptEventCountBefore, error: receiptEventCountBeforeError },
        { count: receiptLineCountBefore, error: receiptLineCountBeforeError },
        { count: receiptTxnCountBefore, error: receiptTxnCountBeforeError },
        { count: fgLotCountBefore, error: fgLotCountBeforeError },
        { data: fgSnapshotBefore, error: fgSnapshotBeforeError },
        { data: reservationBefore, error: reservationBeforeError },
      ] = await Promise.all([
        scenario.supabase
          .from("manufacturing_production_orders")
          .select("status, started_at, completed_at")
          .eq("id", scenario.productionOrderId)
          .single(),
        scenario.supabase
          .from("production_order_receipt_events")
          .select("*", { count: "exact", head: true })
          .eq("production_order_id", scenario.productionOrderId),
        scenario.supabase
          .from("production_order_receipt_lines")
          .select("*", { count: "exact", head: true })
          .eq("production_order_id", scenario.productionOrderId),
        scenario.supabase
          .from("inventory_transactions")
          .select("*", { count: "exact", head: true })
          .eq("company_id", scenario.companyId)
          .eq("reference_type", "production_receipt_line"),
        scenario.supabase
          .from("fifo_cost_lots")
          .select("*", { count: "exact", head: true })
          .eq("company_id", scenario.companyId)
          .eq("product_id", scenario.fgId)
          .eq("lot_type", "production"),
        scenario.supabase
          .from("v_inventory_reservation_balances")
          .select("on_hand_quantity, reserved_quantity, free_quantity")
          .eq("company_id", scenario.companyId)
          .eq("branch_id", scenario.branchId)
          .eq("warehouse_id", scenario.warehouseId)
          .eq("product_id", scenario.fgId)
          .maybeSingle(),
        scenario.supabase
          .from("inventory_reservations")
          .select("status, requested_qty, reserved_qty, consumed_qty, released_qty")
          .eq("id", scenario.reservationId)
          .single(),
      ])

      if (orderBeforeError) throw new Error(orderBeforeError.message)
      if (receiptEventCountBeforeError) throw new Error(receiptEventCountBeforeError.message)
      if (receiptLineCountBeforeError) throw new Error(receiptLineCountBeforeError.message)
      if (receiptTxnCountBeforeError) throw new Error(receiptTxnCountBeforeError.message)
      if (fgLotCountBeforeError) throw new Error(fgLotCountBeforeError.message)
      if (fgSnapshotBeforeError) throw new Error(fgSnapshotBeforeError.message)
      if (reservationBeforeError) throw new Error(reservationBeforeError.message)

      expect(orderBefore.status).toBe("in_progress")
      expect(orderBefore.started_at).not.toBeNull()
      expect(orderBefore.completed_at).toBeNull()
      expect(Number(receiptEventCountBefore || 0)).toBe(1)
      expect(Number(receiptLineCountBefore || 0)).toBe(1)
      expect(Number(receiptTxnCountBefore || 0)).toBe(1)
      expect(Number(fgLotCountBefore || 0)).toBe(1)
      expect(Number(fgSnapshotBefore?.on_hand_quantity || 0)).toBe(4)
      expect(Number(fgSnapshotBefore?.reserved_quantity || 0)).toBe(0)
      expect(Number(fgSnapshotBefore?.free_quantity || 0)).toBe(4)
      expect(reservationBefore.status).toBe("partially_consumed")
      expect(Number(reservationBefore.requested_qty || 0)).toBe(20)
      expect(Number(reservationBefore.reserved_qty || 0)).toBe(2)
      expect(Number(reservationBefore.consumed_qty || 0)).toBe(8)
      expect(Number(reservationBefore.released_qty || 0)).toBe(0)

      const receiptResponse = await receiptOutputRoute(
        makeJsonRequest(
          `http://localhost/api/manufacturing/production-orders/${scenario.productionOrderId}/receipt`,
          "POST",
          {
            command_key: `${tag}-RECEIPT-OVER`,
            notes: `${tag} attempt to over receipt`,
            received_qty: 7,
          }
        ),
        { params: Promise.resolve({ id: scenario.productionOrderId }) }
      )
      const receiptJson = await parseJsonResponse(receiptResponse)

      expect(receiptResponse.status).toBe(409)
      expect(receiptJson.success).toBe(false)
      expect(String(receiptJson.error || "")).toContain("remaining receivable")

      const [
        { data: orderAfter, error: orderAfterError },
        { count: receiptEventCountAfter, error: receiptEventCountAfterError },
        { count: receiptLineCountAfter, error: receiptLineCountAfterError },
        { count: receiptTxnCountAfter, error: receiptTxnCountAfterError },
        { count: fgLotCountAfter, error: fgLotCountAfterError },
        { data: fgSnapshotAfter, error: fgSnapshotAfterError },
        { data: reservationAfter, error: reservationAfterError },
      ] = await Promise.all([
        scenario.supabase
          .from("manufacturing_production_orders")
          .select("status, started_at, completed_at")
          .eq("id", scenario.productionOrderId)
          .single(),
        scenario.supabase
          .from("production_order_receipt_events")
          .select("*", { count: "exact", head: true })
          .eq("production_order_id", scenario.productionOrderId),
        scenario.supabase
          .from("production_order_receipt_lines")
          .select("*", { count: "exact", head: true })
          .eq("production_order_id", scenario.productionOrderId),
        scenario.supabase
          .from("inventory_transactions")
          .select("*", { count: "exact", head: true })
          .eq("company_id", scenario.companyId)
          .eq("reference_type", "production_receipt_line"),
        scenario.supabase
          .from("fifo_cost_lots")
          .select("*", { count: "exact", head: true })
          .eq("company_id", scenario.companyId)
          .eq("product_id", scenario.fgId)
          .eq("lot_type", "production"),
        scenario.supabase
          .from("v_inventory_reservation_balances")
          .select("on_hand_quantity, reserved_quantity, free_quantity")
          .eq("company_id", scenario.companyId)
          .eq("branch_id", scenario.branchId)
          .eq("warehouse_id", scenario.warehouseId)
          .eq("product_id", scenario.fgId)
          .maybeSingle(),
        scenario.supabase
          .from("inventory_reservations")
          .select("status, requested_qty, reserved_qty, consumed_qty, released_qty")
          .eq("id", scenario.reservationId)
          .single(),
      ])

      if (orderAfterError) throw new Error(orderAfterError.message)
      if (receiptEventCountAfterError) throw new Error(receiptEventCountAfterError.message)
      if (receiptLineCountAfterError) throw new Error(receiptLineCountAfterError.message)
      if (receiptTxnCountAfterError) throw new Error(receiptTxnCountAfterError.message)
      if (fgLotCountAfterError) throw new Error(fgLotCountAfterError.message)
      if (fgSnapshotAfterError) throw new Error(fgSnapshotAfterError.message)
      if (reservationAfterError) throw new Error(reservationAfterError.message)

      expect(orderAfter.status).toBe("in_progress")
      expect(orderAfter.started_at).not.toBeNull()
      expect(orderAfter.completed_at).toBeNull()
      expect(Number(receiptEventCountAfter || 0)).toBe(1)
      expect(Number(receiptLineCountAfter || 0)).toBe(1)
      expect(Number(receiptTxnCountAfter || 0)).toBe(1)
      expect(Number(fgLotCountAfter || 0)).toBe(1)
      expect(Number(fgSnapshotAfter?.on_hand_quantity || 0)).toBe(4)
      expect(Number(fgSnapshotAfter?.reserved_quantity || 0)).toBe(0)
      expect(Number(fgSnapshotAfter?.free_quantity || 0)).toBe(4)
      expect(reservationAfter).toEqual(reservationBefore)
    },
    120000
  )

  it(
    "rejects close-reservations before terminal order status without releasing allocations",
    async () => {
      const tag = `FP-CLOSE-TIMING-${Date.now()}`
      const scenario = await setupReleasedAndSyncedOrder(tag)
      currentApiContext = scenario

      const [
        { data: orderBefore, error: orderBeforeError },
        { data: reservationBefore, error: reservationBeforeError },
        { data: allocationBefore, error: allocationBeforeError },
        { data: rmSnapshotBefore, error: rmSnapshotBeforeError },
      ] = await Promise.all([
        scenario.supabase
          .from("manufacturing_production_orders")
          .select("status, completed_at, cancelled_at")
          .eq("id", scenario.productionOrderId)
          .single(),
        scenario.supabase
          .from("inventory_reservations")
          .select("status, requested_qty, reserved_qty, consumed_qty, released_qty, close_reason")
          .eq("id", scenario.reservationId)
          .single(),
        scenario.supabase
          .from("inventory_reservation_allocations")
          .select("allocated_qty, consumed_qty, released_qty")
          .eq("reservation_id", scenario.reservationId)
          .maybeSingle(),
        scenario.supabase
          .from("v_inventory_reservation_balances")
          .select("on_hand_quantity, reserved_quantity, free_quantity")
          .eq("company_id", scenario.companyId)
          .eq("branch_id", scenario.branchId)
          .eq("warehouse_id", scenario.warehouseId)
          .eq("product_id", scenario.rmId)
          .maybeSingle(),
      ])

      if (orderBeforeError) throw new Error(orderBeforeError.message)
      if (reservationBeforeError) throw new Error(reservationBeforeError.message)
      if (allocationBeforeError) throw new Error(allocationBeforeError.message)
      if (rmSnapshotBeforeError) throw new Error(rmSnapshotBeforeError.message)

      expect(orderBefore.status).toBe("released")
      expect(orderBefore.completed_at).toBeNull()
      expect(orderBefore.cancelled_at).toBeNull()
      expect(reservationBefore.status).toBe("partially_reserved")
      expect(Number(reservationBefore.requested_qty || 0)).toBe(20)
      expect(Number(reservationBefore.reserved_qty || 0)).toBe(10)
      expect(Number(reservationBefore.consumed_qty || 0)).toBe(0)
      expect(Number(reservationBefore.released_qty || 0)).toBe(0)
      expect(reservationBefore.close_reason).toBeNull()
      expect(Number(allocationBefore?.allocated_qty || 0)).toBe(10)
      expect(Number(allocationBefore?.consumed_qty || 0)).toBe(0)
      expect(Number(allocationBefore?.released_qty || 0)).toBe(0)
      expect(Number(rmSnapshotBefore?.on_hand_quantity || 0)).toBe(10)
      expect(Number(rmSnapshotBefore?.reserved_quantity || 0)).toBe(10)
      expect(Number(rmSnapshotBefore?.free_quantity || 0)).toBe(0)

      const closeResponse = await closeReservationsRoute(
        makeJsonRequest(
          `http://localhost/api/manufacturing/production-orders/${scenario.productionOrderId}/close-reservations`,
          "POST",
          {
            mode: "complete",
          }
        ),
        { params: Promise.resolve({ id: scenario.productionOrderId }) }
      )
      const closeJson = await parseJsonResponse(closeResponse)

      expect(closeResponse.status).toBe(409)
      expect(closeJson.success).toBe(false)
      expect(String(closeJson.error || "")).toContain("completed or cancelled")

      const [
        { data: orderAfter, error: orderAfterError },
        { data: reservationAfter, error: reservationAfterError },
        { data: allocationAfter, error: allocationAfterError },
        { data: rmSnapshotAfter, error: rmSnapshotAfterError },
      ] = await Promise.all([
        scenario.supabase
          .from("manufacturing_production_orders")
          .select("status, completed_at, cancelled_at")
          .eq("id", scenario.productionOrderId)
          .single(),
        scenario.supabase
          .from("inventory_reservations")
          .select("status, requested_qty, reserved_qty, consumed_qty, released_qty, close_reason")
          .eq("id", scenario.reservationId)
          .single(),
        scenario.supabase
          .from("inventory_reservation_allocations")
          .select("allocated_qty, consumed_qty, released_qty")
          .eq("reservation_id", scenario.reservationId)
          .maybeSingle(),
        scenario.supabase
          .from("v_inventory_reservation_balances")
          .select("on_hand_quantity, reserved_quantity, free_quantity")
          .eq("company_id", scenario.companyId)
          .eq("branch_id", scenario.branchId)
          .eq("warehouse_id", scenario.warehouseId)
          .eq("product_id", scenario.rmId)
          .maybeSingle(),
      ])

      if (orderAfterError) throw new Error(orderAfterError.message)
      if (reservationAfterError) throw new Error(reservationAfterError.message)
      if (allocationAfterError) throw new Error(allocationAfterError.message)
      if (rmSnapshotAfterError) throw new Error(rmSnapshotAfterError.message)

      expect(orderAfter).toEqual(orderBefore)
      expect(reservationAfter).toEqual(reservationBefore)
      expect(allocationAfter).toEqual(allocationBefore)
      expect(rmSnapshotAfter).toEqual(rmSnapshotBefore)
    },
    120000
  )

  it(
    "rejects release without readiness when draft order is missing issue and receipt warehouses",
    async () => {
      const tag = `FP-RELEASE-READINESS-${Date.now()}`
      const scenario = await setupDraftOrder(tag, { includeWarehouses: false })
      currentApiContext = scenario

      const [{ data: orderBefore, error: orderBeforeError }] = await Promise.all([
        scenario.supabase
          .from("manufacturing_production_orders")
          .select("status, issue_warehouse_id, receipt_warehouse_id, released_at")
          .eq("id", scenario.productionOrderId)
          .single(),
      ])

      if (orderBeforeError) throw new Error(orderBeforeError.message)

      expect(orderBefore.status).toBe("draft")
      expect(orderBefore.issue_warehouse_id).toBeNull()
      expect(orderBefore.receipt_warehouse_id).toBeNull()
      expect(orderBefore.released_at).toBeNull()

      const releaseResponse = await releaseProductionOrderRoute(
        makeJsonRequest(
          `http://localhost/api/manufacturing/production-orders/${scenario.productionOrderId}/release`,
          "POST",
          {}
        ),
        { params: Promise.resolve({ id: scenario.productionOrderId }) }
      )
      const releaseJson = await parseJsonResponse(releaseResponse)

      expect(releaseResponse.status).toBe(409)
      expect(releaseJson.success).toBe(false)
      expect(String(releaseJson.error || "")).toContain("issue and receipt warehouses")

      const [
        { data: orderAfter, error: orderAfterError },
        { count: materialRequirementCount, error: materialRequirementCountError },
        { count: reservationCount, error: reservationCountError },
      ] = await Promise.all([
        scenario.supabase
          .from("manufacturing_production_orders")
          .select("status, issue_warehouse_id, receipt_warehouse_id, released_at")
          .eq("id", scenario.productionOrderId)
          .single(),
        scenario.supabase
          .from("production_order_material_requirements")
          .select("*", { count: "exact", head: true })
          .eq("company_id", scenario.companyId)
          .eq("production_order_id", scenario.productionOrderId),
        scenario.supabase
          .from("inventory_reservations")
          .select("*", { count: "exact", head: true })
          .eq("company_id", scenario.companyId)
          .eq("source_type", "production_order")
          .eq("source_id", scenario.productionOrderId),
      ])

      if (orderAfterError) throw new Error(orderAfterError.message)
      if (materialRequirementCountError) throw new Error(materialRequirementCountError.message)
      if (reservationCountError) throw new Error(reservationCountError.message)

      expect(orderAfter.status).toBe("draft")
      expect(orderAfter.issue_warehouse_id).toBeNull()
      expect(orderAfter.receipt_warehouse_id).toBeNull()
      expect(orderAfter.released_at).toBeNull()
      expect(Number(materialRequirementCount || 0)).toBe(0)
      expect(Number(reservationCount || 0)).toBe(0)
    },
    120000
  )
})
