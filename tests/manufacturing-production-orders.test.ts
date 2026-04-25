import { describe, expect, it } from "vitest"
import {
  ManufacturingApiError,
  assertProductionOrderDeleteAllowed,
  assertProductionOrderEditable,
  cancelProductionOrderSchema,
  completeProductionOrderSchema,
  createProductionOrderSchema,
  regenerateProductionOrderSchema,
  updateProductionOrderOperationProgressSchema,
  updateProductionOrderSchema,
} from "../lib/manufacturing/production-order-api"
import {
  buildBomLabel,
  buildProductLabel,
  buildRoutingLabel,
  buildSourceRoutingOperationLabel,
  buildWorkCenterLabel,
  canCancelProductionOrder,
  canCompleteProductionOrder,
  canDeleteProductionOrder,
  canEditProductionOrderHeader,
  canRegenerateProductionOrder,
  canReleaseProductionOrder,
  canStartProductionOrder,
  canUpdateProductionOrderOperationProgress,
  formatQuantity,
  getProductionOrderOperationStatusLabel,
  getProductionOrderOperationStatusVariant,
  getProductionOrderStatusLabel,
  getProductionOrderStatusVariant,
} from "../lib/manufacturing/production-order-ui"
import { getResourceFromPath } from "../lib/permissions-context"

const VALID_UUIDS = {
  branch: "11111111-1111-1111-1111-111111111111",
  product: "22222222-2222-2222-2222-222222222222",
  bom: "33333333-3333-3333-3333-333333333333",
  bomVersion: "44444444-4444-4444-4444-444444444444",
  routing: "55555555-5555-5555-5555-555555555555",
  routingVersion: "66666666-6666-6666-6666-666666666666",
  warehouse: "77777777-7777-7777-7777-777777777777",
} as const

describe("manufacturing production orders helpers", () => {
  it("maps order and operation labels and badge variants consistently", () => {
    expect(getProductionOrderStatusLabel("draft")).toBe("مسودة")
    expect(getProductionOrderStatusLabel("completed", "en")).toBe("Completed")
    expect(getProductionOrderStatusVariant("released")).toBe("default")
    expect(getProductionOrderStatusVariant("cancelled")).toBe("destructive")

    expect(getProductionOrderOperationStatusLabel("ready")).toBe("جاهزة")
    expect(getProductionOrderOperationStatusLabel("in_progress", "en")).toBe("In Progress")
    expect(getProductionOrderOperationStatusVariant("pending")).toBe("outline")
    expect(getProductionOrderOperationStatusVariant("completed")).toBe("secondary")
  })

  it("enforces the order action matrix in the UI", () => {
    expect(canEditProductionOrderHeader("draft")).toBe(true)
    expect(canRegenerateProductionOrder("draft")).toBe(true)
    expect(canReleaseProductionOrder("draft")).toBe(true)
    expect(canStartProductionOrder("draft")).toBe(false)
    expect(canDeleteProductionOrder("draft")).toBe(true)

    expect(canEditProductionOrderHeader("released")).toBe(false)
    expect(canCancelProductionOrder("released")).toBe(true)
    expect(canStartProductionOrder("released")).toBe(true)
    expect(canDeleteProductionOrder("released")).toBe(false)

    expect(canCompleteProductionOrder("in_progress")).toBe(true)
    expect(canCancelProductionOrder("in_progress")).toBe(false)
    expect(canDeleteProductionOrder("completed")).toBe(false)
  })

  it("enforces operation progress write scope in the UI", () => {
    expect(canUpdateProductionOrderOperationProgress("released", "pending")).toBe(true)
    expect(canUpdateProductionOrderOperationProgress("released", "ready")).toBe(true)
    expect(canUpdateProductionOrderOperationProgress("in_progress", "in_progress")).toBe(true)
    expect(canUpdateProductionOrderOperationProgress("draft", "pending")).toBe(false)
    expect(canUpdateProductionOrderOperationProgress("completed", "in_progress")).toBe(false)
    expect(canUpdateProductionOrderOperationProgress("released", "completed")).toBe(false)
    expect(canUpdateProductionOrderOperationProgress("released", "cancelled")).toBe(false)
  })

  it("formats source labels predictably", () => {
    expect(
      buildProductLabel({ id: "p1", sku: "FG-001", name: "Finished Good" })
    ).toBe("FG-001 — Finished Good")
    expect(
      buildBomLabel({ id: "bom-1", bom_code: "BOM-001", bom_name: "Mixer" }, { id: "v1", version_no: 2 })
    ).toBe("BOM-001 — Mixer / v2")
    expect(
      buildRoutingLabel({ id: "r1", routing_code: "ROUT-001", routing_name: "Main Flow" }, { id: "rv1", version_no: 3 })
    ).toBe("ROUT-001 — Main Flow / v3")
    expect(
      buildWorkCenterLabel({ id: "wc1", code: "WC-01", name: "Mixing" })
    ).toBe("WC-01 — Mixing")
    expect(
      buildSourceRoutingOperationLabel({ id: "op1", operation_no: 20, operation_code: "OP-20", operation_name: "Blend" })
    ).toBe("#20 / OP-20 — Blend")
    expect(formatQuantity(12.34567)).toBe("١٢٫٣٤٥٧")
    expect(formatQuantity(12.34567, "en")).toBe("12.3457")
  })

  it("maps production order routes to the guarded manufacturing resource", () => {
    expect(getResourceFromPath("/manufacturing/production-orders")).toBe("manufacturing_boms")
    expect(getResourceFromPath("/manufacturing/production-orders/123?tab=operations")).toBe("manufacturing_boms")
  })
})

describe("manufacturing production orders API contracts", () => {
  it("accepts a valid create payload and normalizes nullable values", () => {
    const parsed = createProductionOrderSchema.parse({
      branch_id: VALID_UUIDS.branch,
      product_id: VALID_UUIDS.product,
      bom_id: VALID_UUIDS.bom,
      bom_version_id: VALID_UUIDS.bomVersion,
      routing_id: VALID_UUIDS.routing,
      routing_version_id: VALID_UUIDS.routingVersion,
      issue_warehouse_id: VALID_UUIDS.warehouse,
      receipt_warehouse_id: null,
      planned_quantity: "5",
      order_uom: " kg ",
      planned_start_at: "2026-04-22T10:00",
      planned_end_at: "",
      notes: "  test order  ",
    })

    expect(parsed.planned_quantity).toBe(5)
    expect(parsed.order_uom).toBe("kg")
    expect(parsed.receipt_warehouse_id).toBeNull()
    expect(parsed.notes).toBe("test order")
    expect(parsed.planned_start_at).toContain("2026-04-22")
    expect(parsed.planned_end_at).toBeNull()
  })

  it("rejects incomplete bom pair updates", () => {
    expect(() =>
      updateProductionOrderSchema.parse({
        bom_id: VALID_UUIDS.bom,
      })
    ).toThrow(/bom_id and bom_version_id must be provided together/)
  })

  it("rejects incomplete bom/routing pairs on regenerate", () => {
    expect(() =>
      regenerateProductionOrderSchema.parse({
        bom_id: VALID_UUIDS.bom,
        routing_id: VALID_UUIDS.routing,
      })
    ).toThrow(/must be provided together/)
  })

  it("rejects invalid progress payloads and empty updates", () => {
    expect(() => updateProductionOrderOperationProgressSchema.parse({})).toThrow(/At least one field must be provided/)
    expect(() =>
      updateProductionOrderOperationProgressSchema.parse({
        status: "completed",
        completed_quantity: -1,
      })
    ).toThrow()
  })

  it("requires positive completion quantity and cancellation reason", () => {
    expect(() => completeProductionOrderSchema.parse({ completed_quantity: 0 })).toThrow()
    expect(() => cancelProductionOrderSchema.parse({ cancellation_reason: "   " })).toThrow()
  })

  it("enforces draft-only editable and delete guards", () => {
    expect(() => assertProductionOrderEditable({ id: "po-1", status: "released" })).toThrow(ManufacturingApiError)
    expect(() => assertProductionOrderDeleteAllowed({ id: "po-1", order_no: "MPO-001", status: "completed" })).toThrow(
      ManufacturingApiError
    )

    expect(() => assertProductionOrderEditable({ id: "po-2", status: "draft" })).not.toThrow()
    expect(() => assertProductionOrderDeleteAllowed({ id: "po-2", order_no: "MPO-002", status: "draft" })).not.toThrow()
  })
})
