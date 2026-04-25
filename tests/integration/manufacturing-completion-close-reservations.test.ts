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

const shouldRunManufacturingCompletionScenario =
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
import { POST as completeProductionOrderRoute } from "../../app/api/manufacturing/production-orders/[id]/complete/route"
import { POST as closeReservationsRoute } from "../../app/api/manufacturing/production-orders/[id]/close-reservations/route"
import { POST as updateProductionOrderOperationProgressRoute } from "../../app/api/manufacturing/production-order-operations/[id]/progress/route"

const describeCompletionScenario = shouldRunManufacturingCompletionScenario ? describe : describe.skip

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

function isExpectedProtectedCleanupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "")
  return (
    message.includes("MRP rows can only be written while the run is running") ||
    message.includes("immutable. UPDATE and DELETE are not allowed")
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
        notes: "Completion/close integration warehouse",
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

describeCompletionScenario("Manufacturing completion + reservation close integration", () => {
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
    "completes a production order and closes remaining reservations cleanly",
    async () => {
      const tag = `GP-CLOSE-${Date.now()}`
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
        reference_type: "completion_close_seed",
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
      const productionOrderOperationId = String(createOrderJson.data.operations[0].id)

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
      const reservationId = String(syncJson.data.reservations[0].id)

      expect(Number(syncJson.data.material_requirements[0].gross_required_qty)).toBe(20)
      expect(syncJson.data.reservations[0].status).toBe("partially_reserved")

      const [
        { data: syncReservation, error: syncReservationError },
        { data: syncAllocations, error: syncAllocationsError },
      ] = await Promise.all([
        supabase
          .from("inventory_reservations")
          .select("id, status, requested_qty, reserved_qty, consumed_qty, released_qty")
          .eq("id", reservationId)
          .single(),
        supabase
          .from("inventory_reservation_allocations")
          .select("id, allocated_qty, consumed_qty, released_qty")
          .eq("reservation_id", reservationId),
      ])

      if (syncReservationError) throw new Error(syncReservationError.message)
      if (syncAllocationsError) throw new Error(syncAllocationsError.message)

      expect(syncReservation.status).toBe("partially_reserved")
      expect(Number(syncReservation.requested_qty)).toBe(20)
      expect(Number(syncReservation.reserved_qty)).toBe(10)
      expect(Number(syncReservation.consumed_qty)).toBe(0)
      expect(Number(syncReservation.released_qty)).toBe(0)
      expect(syncAllocations || []).toHaveLength(1)
      expect(Number(syncAllocations?.[0]?.allocated_qty || 0)).toBe(10)
      expect(Number(syncAllocations?.[0]?.consumed_qty || 0)).toBe(0)
      expect(Number(syncAllocations?.[0]?.released_qty || 0)).toBe(0)

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
        { data: allocationAfterIssue, error: allocationAfterIssueError },
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
          .from("inventory_reservation_allocations")
          .select("allocated_qty, consumed_qty, released_qty")
          .eq("reservation_id", reservationId)
          .maybeSingle(),
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
      if (allocationAfterIssueError) throw new Error(allocationAfterIssueError.message)
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
      expect(Number(allocationAfterIssue?.allocated_qty || 0)).toBe(10)
      expect(Number(allocationAfterIssue?.consumed_qty || 0)).toBe(8)
      expect(Number(allocationAfterIssue?.released_qty || 0)).toBe(0)
      expect(Number(rmAfterIssueSnapshot?.on_hand_quantity || 0)).toBe(2)
      expect(Number(rmAfterIssueSnapshot?.reserved_quantity || 0)).toBe(2)
      expect(Number(rmAfterIssueSnapshot?.free_quantity || 0)).toBe(0)

      const receipt1Response = await receiptOutputRoute(
        makeJsonRequest(
          `http://localhost/api/manufacturing/production-orders/${productionOrderId}/receipt`,
          "POST",
          {
            command_key: `${tag}-RECEIPT-1`,
            notes: `${tag} first partial receipt`,
            received_qty: 4,
          }
        ),
        { params: Promise.resolve({ id: productionOrderId }) }
      )
      const receipt1Json = await parseJsonResponse(receipt1Response)

      expect(receipt1Response.status).toBe(200)
      expect(receipt1Json.success).toBe(true)
      expect(Number(receipt1Json.meta.command_result.received_qty || 0)).toBe(4)
      expect(receipt1Json.data.order.status).toBe("in_progress")

      const receipt2Response = await receiptOutputRoute(
        makeJsonRequest(
          `http://localhost/api/manufacturing/production-orders/${productionOrderId}/receipt`,
          "POST",
          {
            command_key: `${tag}-RECEIPT-2`,
            notes: `${tag} second partial receipt`,
            received_qty: 6,
          }
        ),
        { params: Promise.resolve({ id: productionOrderId }) }
      )
      const receipt2Json = await parseJsonResponse(receipt2Response)

      expect(receipt2Response.status).toBe(200)
      expect(receipt2Json.success).toBe(true)
      expect(Number(receipt2Json.meta.command_result.received_qty || 0)).toBe(6)
      expect(receipt2Json.data.order.status).toBe("in_progress")

      const [
        { data: receiptEvents, error: receiptEventsError },
        { data: receiptLines, error: receiptLinesError },
        { data: receiptTxns, error: receiptTxnsError },
        { data: fgLots, error: fgLotsError },
        { data: fgSnapshotAfterReceipts, error: fgSnapshotAfterReceiptsError },
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
          .select("transaction_type, quantity_change")
          .eq("company_id", companyId)
          .eq("reference_type", "production_receipt_line"),
        supabase
          .from("fifo_cost_lots")
          .select("id, product_id, lot_type, original_quantity, remaining_quantity")
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
      if (fgSnapshotAfterReceiptsError) throw new Error(fgSnapshotAfterReceiptsError.message)

      expect(receiptEvents || []).toHaveLength(2)
      expect(receiptLines || []).toHaveLength(2)
      expect(receiptLines?.every((line) => Boolean(line.inventory_transaction_id) && Boolean(line.fifo_cost_lot_id))).toBe(true)
      expect((receiptTxns || []).filter((txn) => txn.transaction_type === "production_receipt")).toHaveLength(2)
      expect(
        (receiptLines || []).reduce((sum, line) => sum + (Number(line.received_qty) || 0), 0)
      ).toBe(10)
      expect(
        (fgLots || []).reduce((sum, lot) => sum + (Number(lot.original_quantity) || 0), 0)
      ).toBe(10)
      expect(
        (fgLots || []).reduce((sum, lot) => sum + (Number(lot.remaining_quantity) || 0), 0)
      ).toBe(10)
      expect(Number(fgSnapshotAfterReceipts?.on_hand_quantity || 0)).toBe(10)
      expect(Number(fgSnapshotAfterReceipts?.reserved_quantity || 0)).toBe(0)
      expect(Number(fgSnapshotAfterReceipts?.free_quantity || 0)).toBe(10)

      const operationReadyResponse = await updateProductionOrderOperationProgressRoute(
        makeJsonRequest(
          `http://localhost/api/manufacturing/production-order-operations/${productionOrderOperationId}/progress`,
          "POST",
          {
            status: "ready",
          }
        ),
        { params: Promise.resolve({ id: productionOrderOperationId }) }
      )
      const operationReadyJson = await parseJsonResponse(operationReadyResponse)

      expect(operationReadyResponse.status).toBe(200)
      expect(operationReadyJson.success).toBe(true)
      expect(operationReadyJson.data.operation.status).toBe("ready")

      const operationStartResponse = await updateProductionOrderOperationProgressRoute(
        makeJsonRequest(
          `http://localhost/api/manufacturing/production-order-operations/${productionOrderOperationId}/progress`,
          "POST",
          {
            status: "in_progress",
          }
        ),
        { params: Promise.resolve({ id: productionOrderOperationId }) }
      )
      const operationStartJson = await parseJsonResponse(operationStartResponse)

      expect(operationStartResponse.status).toBe(200)
      expect(operationStartJson.success).toBe(true)
      expect(operationStartJson.data.operation.status).toBe("in_progress")

      const operationCompleteResponse = await updateProductionOrderOperationProgressRoute(
        makeJsonRequest(
          `http://localhost/api/manufacturing/production-order-operations/${productionOrderOperationId}/progress`,
          "POST",
          {
            completed_quantity: 10,
            actual_end_at: new Date().toISOString(),
          }
        ),
        { params: Promise.resolve({ id: productionOrderOperationId }) }
      )
      const operationCompleteJson = await parseJsonResponse(operationCompleteResponse)

      expect(operationCompleteResponse.status).toBe(200)
      expect(operationCompleteJson.success).toBe(true)
      expect(operationCompleteJson.data.operation.status).toBe("completed")
      expect(Number(operationCompleteJson.data.operation.completed_quantity || 0)).toBe(10)

      const { data: operationAfterProgress, error: operationAfterProgressError } = await supabase
        .from("manufacturing_production_order_operations")
        .select("status, completed_quantity, actual_start_at, actual_end_at")
        .eq("id", productionOrderOperationId)
        .single()

      if (operationAfterProgressError) throw new Error(operationAfterProgressError.message)

      expect(operationAfterProgress.status).toBe("completed")
      expect(Number(operationAfterProgress.completed_quantity || 0)).toBe(10)
      expect(operationAfterProgress.actual_start_at).toBeTruthy()
      expect(operationAfterProgress.actual_end_at).toBeTruthy()

      const completeResponse = await completeProductionOrderRoute(
        makeJsonRequest(
          `http://localhost/api/manufacturing/production-orders/${productionOrderId}/complete`,
          "POST",
          {
            completed_quantity: 10,
          }
        ),
        { params: Promise.resolve({ id: productionOrderId }) }
      )
      const completeJson = await parseJsonResponse(completeResponse)

      expect(completeResponse.status).toBe(200)
      expect(completeJson.success).toBe(true)
      expect(completeJson.meta.command_result.status).toBe("completed")
      expect(Number(completeJson.meta.command_result.completed_quantity || 0)).toBe(10)
      expect(completeJson.data.order.status).toBe("completed")

      const [
        { data: orderAfterComplete, error: orderAfterCompleteError },
        { data: reservationBeforeClose, error: reservationBeforeCloseError },
        { data: allocationBeforeClose, error: allocationBeforeCloseError },
        { count: inventoryTxnCountBeforeClose, error: inventoryTxnCountBeforeCloseError },
      ] = await Promise.all([
        supabase
          .from("manufacturing_production_orders")
          .select("status, completed_quantity, completed_at")
          .eq("id", productionOrderId)
          .single(),
        supabase
          .from("inventory_reservations")
          .select("status, close_reason, requested_qty, reserved_qty, consumed_qty, released_qty")
          .eq("id", reservationId)
          .single(),
        supabase
          .from("inventory_reservation_allocations")
          .select("allocated_qty, consumed_qty, released_qty")
          .eq("reservation_id", reservationId)
          .maybeSingle(),
        supabase
          .from("inventory_transactions")
          .select("*", { count: "exact", head: true })
          .eq("company_id", companyId),
      ])

      if (orderAfterCompleteError) throw new Error(orderAfterCompleteError.message)
      if (reservationBeforeCloseError) throw new Error(reservationBeforeCloseError.message)
      if (allocationBeforeCloseError) throw new Error(allocationBeforeCloseError.message)
      if (inventoryTxnCountBeforeCloseError) throw new Error(inventoryTxnCountBeforeCloseError.message)

      expect(orderAfterComplete.status).toBe("completed")
      expect(Number(orderAfterComplete.completed_quantity || 0)).toBe(10)
      expect(orderAfterComplete.completed_at).toBeTruthy()
      expect(reservationBeforeClose.status).not.toBe("closed")
      expect(reservationBeforeClose.status).not.toBe("consumed")
      expect(Number(reservationBeforeClose.requested_qty || 0)).toBe(20)
      expect(Number(reservationBeforeClose.reserved_qty || 0)).toBe(2)
      expect(Number(reservationBeforeClose.consumed_qty || 0)).toBe(8)
      expect(Number(reservationBeforeClose.released_qty || 0)).toBe(0)
      expect(Number(allocationBeforeClose?.allocated_qty || 0)).toBe(10)
      expect(Number(allocationBeforeClose?.consumed_qty || 0)).toBe(8)
      expect(Number(allocationBeforeClose?.released_qty || 0)).toBe(0)

      const closeReservationsResponse = await closeReservationsRoute(
        makeJsonRequest(
          `http://localhost/api/manufacturing/production-orders/${productionOrderId}/close-reservations`,
          "POST",
          {
            mode: "complete",
          }
        ),
        { params: Promise.resolve({ id: productionOrderId }) }
      )
      const closeReservationsJson = await parseJsonResponse(closeReservationsResponse)

      expect(closeReservationsResponse.status).toBe(200)
      expect(closeReservationsJson.success).toBe(true)
      expect(closeReservationsJson.meta.command_result.mode).toBe("complete")
      expect(closeReservationsJson.meta.command_result.reservation_id).toBe(reservationId)
      expect(closeReservationsJson.meta.command_result.reservation_status).toBe("closed")
      expect(closeReservationsJson.meta.command_result.close_reason).toBe("mixed")
      expect(Number(closeReservationsJson.meta.command_result.released_allocation_count || 0)).toBe(1)

      const [
        { data: reservationAfterClose, error: reservationAfterCloseError },
        { data: allocationAfterClose, error: allocationAfterCloseError },
        { data: rmAfterCloseSnapshot, error: rmAfterCloseSnapshotError },
        { count: inventoryTxnCountAfterClose, error: inventoryTxnCountAfterCloseError },
      ] = await Promise.all([
        supabase
          .from("inventory_reservations")
          .select("status, close_reason, requested_qty, reserved_qty, consumed_qty, released_qty")
          .eq("id", reservationId)
          .single(),
        supabase
          .from("inventory_reservation_allocations")
          .select("allocated_qty, consumed_qty, released_qty, status")
          .eq("reservation_id", reservationId)
          .maybeSingle(),
        supabase
          .from("v_inventory_reservation_balances")
          .select("on_hand_quantity, reserved_quantity, free_quantity")
          .eq("company_id", companyId)
          .eq("branch_id", branchId)
          .eq("warehouse_id", warehouseId)
          .eq("product_id", rm.id)
          .maybeSingle(),
        supabase
          .from("inventory_transactions")
          .select("*", { count: "exact", head: true })
          .eq("company_id", companyId),
      ])

      if (reservationAfterCloseError) throw new Error(reservationAfterCloseError.message)
      if (allocationAfterCloseError) throw new Error(allocationAfterCloseError.message)
      if (rmAfterCloseSnapshotError) throw new Error(rmAfterCloseSnapshotError.message)
      if (inventoryTxnCountAfterCloseError) throw new Error(inventoryTxnCountAfterCloseError.message)

      expect(reservationAfterClose.status).toBe("closed")
      expect(reservationAfterClose.close_reason).toBe("mixed")
      expect(Number(reservationAfterClose.requested_qty || 0)).toBe(20)
      expect(Number(reservationAfterClose.reserved_qty || 0)).toBe(0)
      expect(Number(reservationAfterClose.consumed_qty || 0)).toBe(8)
      expect(Number(reservationAfterClose.released_qty || 0)).toBe(2)
      expect(Number(allocationAfterClose?.allocated_qty || 0)).toBe(10)
      expect(Number(allocationAfterClose?.consumed_qty || 0)).toBe(8)
      expect(Number(allocationAfterClose?.released_qty || 0)).toBe(2)
      expect(allocationAfterClose?.status).toBe("consumed")
      expect(Number(rmAfterCloseSnapshot?.on_hand_quantity || 0)).toBe(2)
      expect(Number(rmAfterCloseSnapshot?.reserved_quantity || 0)).toBe(0)
      expect(Number(rmAfterCloseSnapshot?.free_quantity || 0)).toBe(2)
      expect(Number(inventoryTxnCountAfterClose || 0)).toBe(Number(inventoryTxnCountBeforeClose || 0))
    },
    120000
  )
})
