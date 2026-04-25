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

const shouldRunManufacturingGoldenPath =
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

vi.mock("@/lib/manufacturing/mrp-run-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/manufacturing/mrp-run-api")>(
    "@/lib/manufacturing/mrp-run-api"
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
import { POST as createMrpRunRoute } from "../../app/api/manufacturing/mrp/runs/route"
import { GET as getMrpRunRoute } from "../../app/api/manufacturing/mrp/runs/[id]/route"
import { GET as getMrpRunResultsRoute } from "../../app/api/manufacturing/mrp/runs/[id]/results/route"

const describeGoldenPath = shouldRunManufacturingGoldenPath ? describe : describe.skip

type JsonObject = Record<string, any>

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

function isExpectedProtectedCleanupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "")
  return (
    message.includes("MRP rows can only be written while the run is running") ||
    message.includes("immutable. UPDATE and DELETE are not allowed")
  )
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
        notes: "Golden-path integration warehouse",
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
  unitPrice?: number
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
      unit_price: params.unitPrice ?? 0,
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

describeGoldenPath("Manufacturing golden path integration", () => {
  let supabase: TestSupabaseClient
  let companyId: string
  let userId: string

  beforeAll(async () => {
    supabase = createTestClient()
    const setup = await createTestCompany(supabase)
    companyId = setup.companyId
    userId = setup.userId

    mockGetManufacturingApiContext.mockImplementation(async () => ({
      user: { id: userId, email: setup.email },
      companyId,
      member: {
        id: `member-${companyId}`,
        companyId,
        userId,
        role: "owner",
        branchId: null,
        costCenterId: null,
        warehouseId: null,
        email: setup.email,
        createdAt: new Date().toISOString(),
        isUpperRole: true,
        isNormalRole: false,
      },
      supabase,
      admin: supabase,
    }))
  })

  afterAll(async () => {
    if (supabase && companyId && userId) {
      try {
        await cleanupManufacturingScenario(supabase, companyId)
      } catch (error) {
        if (!isExpectedProtectedCleanupError(error)) throw error
        console.warn("Skipping protected manufacturing cleanup during test teardown:", error)
      } finally {
        try {
          await cleanupTestData(supabase, companyId, userId)
        } catch (error) {
          if (!isExpectedProtectedCleanupError(error)) throw error
          console.warn("Skipping protected company cleanup during test teardown:", error)
        }
      }
    }
  })

  it(
    "creates, releases, executes, and replans a production order end-to-end",
    async () => {
      const tag = `GP-E2E-${Date.now()}`
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

      expect(fg.item_type).toBe("product")
      expect(fg.product_type).toBe("manufactured")
      expect(rm.item_type).toBe("product")
      expect(rm.product_type).toBe("raw_material")

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
        reference_type: "golden_path_seed",
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

      const { data: initialRmSnapshot, error: initialRmSnapshotError } = await supabase
        .from("v_inventory_reservation_balances")
        .select("on_hand_quantity, reserved_quantity, free_quantity")
        .eq("company_id", companyId)
        .eq("branch_id", branchId)
        .eq("warehouse_id", warehouseId)
        .eq("product_id", rm.id)
        .maybeSingle()

      if (initialRmSnapshotError) {
        throw new Error(`Failed to load initial RM snapshot: ${initialRmSnapshotError.message}`)
      }

      expect(Number(initialRmSnapshot?.on_hand_quantity || 0)).toBe(10)
      expect(Number(initialRmSnapshot?.reserved_quantity || 0)).toBe(0)
      expect(Number(initialRmSnapshot?.free_quantity || 0)).toBe(10)

      const createOrderResponse = await createProductionOrderRoute(
        makeJsonRequest("http://localhost/api/manufacturing/production-orders", "POST", {
          branch_id: branchId,
          product_id: fg.id,
          bom_id: bom.id,
          bom_version_id: bomVersion.id,
          routing_id: routing.id,
          routing_version_id: routingVersion.id,
          issue_warehouse_id: warehouseId,
          receipt_warehouse_id: warehouseId,
          planned_quantity: 10,
          notes: `${tag} production order`,
        })
      )
      const createOrderJson = await parseJsonResponse(createOrderResponse)

      expect(createOrderResponse.status).toBe(201)
      expect(createOrderJson.success).toBe(true)
      expect(createOrderJson.data.order.status).toBe("draft")
      expect(createOrderJson.data.operations).toHaveLength(1)

      const productionOrderId = String(createOrderJson.data.order.id)

      const releaseResponse = await releaseProductionOrderRoute(
        makeJsonRequest(
          `http://localhost/api/manufacturing/production-orders/${productionOrderId}/release`,
          "POST",
          {}
        ),
        { params: Promise.resolve({ id: productionOrderId }) }
      )
      const releaseJson = await parseJsonResponse(releaseResponse)

      expect(releaseResponse.status).toBe(200)
      expect(releaseJson.success).toBe(true)
      expect(releaseJson.data.order.status).toBe("released")

      const syncResponse = await syncMaterialsRoute(
        makeJsonRequest(
          `http://localhost/api/manufacturing/production-orders/${productionOrderId}/sync-materials`,
          "POST",
          {}
        ),
        { params: Promise.resolve({ id: productionOrderId }) }
      )
      const syncJson = await parseJsonResponse(syncResponse)

      expect(syncResponse.status).toBe(200)
      expect(syncJson.success).toBe(true)
      expect(syncJson.data.material_requirements).toHaveLength(1)
      expect(syncJson.data.reservations).toHaveLength(1)

      const materialRequirementId = String(syncJson.data.material_requirements[0].id)
      expect(Number(syncJson.data.material_requirements[0].gross_required_qty)).toBe(20)
      expect(syncJson.data.reservations[0].status).toBe("partially_reserved")

      const issueResponse = await issueMaterialsRoute(
        makeJsonRequest(
          `http://localhost/api/manufacturing/production-orders/${productionOrderId}/issue`,
          "POST",
          {
            command_key: `${tag}-ISSUE`,
            notes: `${tag} partial issue`,
            lines: [
              {
                material_requirement_id: materialRequirementId,
                issued_qty: 8,
              },
            ],
          }
        ),
        { params: Promise.resolve({ id: productionOrderId }) }
      )
      const issueJson = await parseJsonResponse(issueResponse)

      expect(issueResponse.status).toBe(200)
      expect(issueJson.success).toBe(true)
      expect(issueJson.meta.command_result.total_issued_qty).toBe(8)
      expect(issueJson.meta.command_result.auto_started_order).toBe(true)
      expect(issueJson.data.order.status).toBe("in_progress")

      const [
        { data: orderAfterIssue, error: orderAfterIssueError },
        { data: issueEvents, error: issueEventsError },
        { data: issueLines, error: issueLinesError },
        { data: issueTxns, error: issueTxnsError },
        { data: fifoConsumptions, error: fifoConsumptionsError },
        { data: reservationConsumptions, error: reservationConsumptionsError },
        { data: rmAfterIssueSnapshot, error: rmAfterIssueSnapshotError },
      ] = await Promise.all([
        supabase
          .from("manufacturing_production_orders")
          .select("status, started_at")
          .eq("id", productionOrderId)
          .single(),
        supabase
          .from("production_order_issue_events")
          .select("id")
          .eq("production_order_id", productionOrderId),
        supabase
          .from("production_order_issue_lines")
          .select("id, inventory_transaction_id, issued_qty")
          .eq("production_order_id", productionOrderId),
        supabase
          .from("inventory_transactions")
          .select("id, transaction_type, quantity_change, unit_cost, total_cost")
          .eq("company_id", companyId)
          .eq("reference_type", "production_issue_line"),
        supabase
          .from("fifo_lot_consumptions")
          .select("product_id, consumption_type, quantity_consumed")
          .eq("company_id", companyId)
          .eq("reference_type", "production_issue_line"),
        supabase
          .from("inventory_reservation_consumptions")
          .select("quantity")
          .eq("company_id", companyId)
          .eq("source_event_type", "production_issue"),
        supabase
          .from("v_inventory_reservation_balances")
          .select("on_hand_quantity, reserved_quantity, free_quantity")
          .eq("company_id", companyId)
          .eq("branch_id", branchId)
          .eq("warehouse_id", warehouseId)
          .eq("product_id", rm.id)
          .maybeSingle(),
      ])

      if (orderAfterIssueError) throw new Error(orderAfterIssueError.message)
      if (issueEventsError) throw new Error(issueEventsError.message)
      if (issueLinesError) throw new Error(issueLinesError.message)
      if (issueTxnsError) throw new Error(issueTxnsError.message)
      if (fifoConsumptionsError) throw new Error(fifoConsumptionsError.message)
      if (reservationConsumptionsError) throw new Error(reservationConsumptionsError.message)
      if (rmAfterIssueSnapshotError) throw new Error(rmAfterIssueSnapshotError.message)

      expect(orderAfterIssue.status).toBe("in_progress")
      expect(orderAfterIssue.started_at).toBeTruthy()
      expect(issueEvents || []).toHaveLength(1)
      expect(issueLines || []).toHaveLength(1)
      expect(Number(issueLines?.[0]?.issued_qty || 0)).toBe(8)
      expect(issueLines?.[0]?.inventory_transaction_id).toBeTruthy()
      expect(issueTxns?.some((txn) => txn.transaction_type === "production_issue" && Number(txn.quantity_change) === -8)).toBe(
        true
      )
      expect(
        fifoConsumptions?.some(
          (row) =>
            row.product_id === rm.id &&
            row.consumption_type === "production_issue" &&
            Number(row.quantity_consumed) === 8
        )
      ).toBe(true)
      expect(Number(reservationConsumptions?.[0]?.quantity || 0)).toBe(8)
      expect(Number(rmAfterIssueSnapshot?.on_hand_quantity || 0)).toBe(2)
      expect(Number(rmAfterIssueSnapshot?.reserved_quantity || 0)).toBe(2)
      expect(Number(rmAfterIssueSnapshot?.free_quantity || 0)).toBe(0)

      const receiptResponse = await receiptOutputRoute(
        makeJsonRequest(
          `http://localhost/api/manufacturing/production-orders/${productionOrderId}/receipt`,
          "POST",
          {
            command_key: `${tag}-RECEIPT`,
            notes: `${tag} partial receipt`,
            received_qty: 4,
          }
        ),
        { params: Promise.resolve({ id: productionOrderId }) }
      )
      const receiptJson = await parseJsonResponse(receiptResponse)

      expect(receiptResponse.status).toBe(200)
      expect(receiptJson.success).toBe(true)
      expect(Number(receiptJson.meta.command_result.received_qty || 0)).toBe(4)
      expect(receiptJson.data.order.status).toBe("in_progress")

      const [
        { data: receiptEvents, error: receiptEventsError },
        { data: receiptLines, error: receiptLinesError },
        { data: receiptTxns, error: receiptTxnsError },
        { data: fgLots, error: fgLotsError },
        { data: fgSnapshot, error: fgSnapshotError },
      ] = await Promise.all([
        supabase
          .from("production_order_receipt_events")
          .select("id")
          .eq("production_order_id", productionOrderId),
        supabase
          .from("production_order_receipt_lines")
          .select("id, inventory_transaction_id, fifo_cost_lot_id, received_qty")
          .eq("production_order_id", productionOrderId),
        supabase
          .from("inventory_transactions")
          .select("transaction_type, quantity_change, total_cost")
          .eq("company_id", companyId)
          .eq("reference_type", "production_receipt_line"),
        supabase
          .from("fifo_cost_lots")
          .select("id, product_id, lot_type, original_quantity, remaining_quantity, reference_type")
          .eq("company_id", companyId)
          .eq("product_id", fg.id)
          .eq("lot_type", "production"),
        supabase
          .from("v_inventory_reservation_balances")
          .select("on_hand_quantity, reserved_quantity, free_quantity")
          .eq("company_id", companyId)
          .eq("branch_id", branchId)
          .eq("warehouse_id", warehouseId)
          .eq("product_id", fg.id)
          .maybeSingle(),
      ])

      if (receiptEventsError) throw new Error(receiptEventsError.message)
      if (receiptLinesError) throw new Error(receiptLinesError.message)
      if (receiptTxnsError) throw new Error(receiptTxnsError.message)
      if (fgLotsError) throw new Error(fgLotsError.message)
      if (fgSnapshotError) throw new Error(fgSnapshotError.message)

      expect(receiptEvents || []).toHaveLength(1)
      expect(receiptLines || []).toHaveLength(1)
      expect(Number(receiptLines?.[0]?.received_qty || 0)).toBe(4)
      expect(receiptLines?.[0]?.inventory_transaction_id).toBeTruthy()
      expect(receiptLines?.[0]?.fifo_cost_lot_id).toBeTruthy()
      expect(
        receiptTxns?.some(
          (txn) => txn.transaction_type === "production_receipt" && Number(txn.quantity_change) === 4
        )
      ).toBe(true)
      expect(
        fgLots?.some(
          (lot) =>
            lot.product_id === fg.id &&
            lot.lot_type === "production" &&
            Number(lot.original_quantity) === 4 &&
            Number(lot.remaining_quantity) === 4
        )
      ).toBe(true)
      expect(Number(fgSnapshot?.on_hand_quantity || 0)).toBe(4)
      expect(Number(fgSnapshot?.reserved_quantity || 0)).toBe(0)
      expect(Number(fgSnapshot?.free_quantity || 0)).toBe(4)

      const mrpRunResponse = await createMrpRunRoute(
        makeJsonRequest("http://localhost/api/manufacturing/mrp/runs", "POST", {
          run_scope: "warehouse_filtered",
          branch_id: branchId,
          warehouse_id: warehouseId,
          notes: `${tag} MRP run`,
        })
      )
      const mrpRunJson = await parseJsonResponse(mrpRunResponse)

      expect(mrpRunResponse.status).toBe(201)
      expect(mrpRunJson.success).toBe(true)
      expect(mrpRunJson.data.status).toBe("completed")
      expect(mrpRunJson.meta.demand_row_count).toBe(1)
      expect(mrpRunJson.meta.supply_row_count).toBe(2)
      expect(mrpRunJson.meta.net_row_count).toBe(2)
      expect(mrpRunJson.meta.suggestion_count).toBe(1)

      const runId = String(mrpRunJson.data.id)

      const mrpHeaderResponse = await getMrpRunRoute(
        new NextRequest(`http://localhost/api/manufacturing/mrp/runs/${runId}`),
        { params: { id: runId } }
      )
      const mrpHeaderJson = await parseJsonResponse(mrpHeaderResponse)

      const demandResultsResponse = await getMrpRunResultsRoute(
        new NextRequest(`http://localhost/api/manufacturing/mrp/runs/${runId}/results?section=demand`),
        { params: { id: runId } }
      )
      const demandResultsJson = await parseJsonResponse(demandResultsResponse)

      const supplyResultsResponse = await getMrpRunResultsRoute(
        new NextRequest(`http://localhost/api/manufacturing/mrp/runs/${runId}/results?section=supply`),
        { params: { id: runId } }
      )
      const supplyResultsJson = await parseJsonResponse(supplyResultsResponse)

      const netResultsResponse = await getMrpRunResultsRoute(
        new NextRequest(`http://localhost/api/manufacturing/mrp/runs/${runId}/results?section=net`),
        { params: { id: runId } }
      )
      const netResultsJson = await parseJsonResponse(netResultsResponse)

      const suggestionResultsResponse = await getMrpRunResultsRoute(
        new NextRequest(`http://localhost/api/manufacturing/mrp/runs/${runId}/results?section=suggestions`),
        { params: { id: runId } }
      )
      const suggestionResultsJson = await parseJsonResponse(suggestionResultsResponse)

      expect(mrpHeaderResponse.status).toBe(200)
      expect(mrpHeaderJson.data.summary.demand_row_count).toBe(1)
      expect(mrpHeaderJson.data.summary.supply_row_count).toBe(2)
      expect(mrpHeaderJson.data.summary.net_row_count).toBe(2)
      expect(mrpHeaderJson.data.summary.suggestion_count).toBe(1)

      expect(demandResultsJson.success).toBe(true)
      expect(demandResultsJson.data).toHaveLength(1)
      expect(demandResultsJson.data[0].demand_type).toBe("production_component")
      expect(demandResultsJson.data[0].product_id).toBe(rm.id)
      expect(Number(demandResultsJson.data[0].original_qty)).toBe(12)
      expect(Number(demandResultsJson.data[0].covered_qty)).toBe(2)
      expect(Number(demandResultsJson.data[0].uncovered_qty)).toBe(10)
      expect(demandResultsJson.data[0].source_line_id).toBe(materialRequirementId)

      expect(supplyResultsJson.success).toBe(true)
      expect(supplyResultsJson.data).toHaveLength(2)
      expect(
        supplyResultsJson.data.some(
          (row: any) =>
            row.product_id === fg.id &&
            row.supply_type === "free_stock" &&
            Number(row.available_qty) === 4
        )
      ).toBe(true)
      expect(
        supplyResultsJson.data.some(
          (row: any) =>
            row.product_id === fg.id &&
            row.supply_type === "production_incoming" &&
            Number(row.available_qty) === 6
        )
      ).toBe(true)
      expect(supplyResultsJson.data.some((row: any) => row.product_id === rm.id)).toBe(false)

      const rmNetRow = netResultsJson.data.find((row: any) => row.product_id === rm.id)
      expect(rmNetRow).toBeTruthy()
      expect(Number(rmNetRow.production_demand_qty)).toBe(10)
      expect(Number(rmNetRow.free_stock_qty)).toBe(0)
      expect(Number(rmNetRow.net_required_qty)).toBe(10)
      expect(rmNetRow.suggested_action).toBe("purchase")

      const fgNetRow = netResultsJson.data.find((row: any) => row.product_id === fg.id)
      expect(fgNetRow).toBeTruthy()
      expect(Number(fgNetRow.free_stock_qty)).toBe(4)
      expect(Number(fgNetRow.incoming_production_qty)).toBe(6)
      expect(Number(fgNetRow.net_required_qty)).toBe(0)
      expect(fgNetRow.suggested_action).toBe("none")

      expect(suggestionResultsJson.success).toBe(true)
      expect(suggestionResultsJson.data).toHaveLength(1)
      expect(suggestionResultsJson.data[0].product_id).toBe(rm.id)
      expect(suggestionResultsJson.data[0].product_type).toBe("raw_material")
      expect(suggestionResultsJson.data[0].suggestion_type).toBe("purchase")
      expect(Number(suggestionResultsJson.data[0].suggested_qty)).toBe(10)
      expect(suggestionResultsJson.data[0].reason_code).toBe("production_shortage")
    },
    120000
  )
})
