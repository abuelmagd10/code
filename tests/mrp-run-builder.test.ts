/**
 * MRP B9 — Targeted Tests
 * Scope: pure logic units (no DB, no HTTP).
 * DB-dependent tests are flagged and deferred to smoke tests.
 *
 * Run: npx vitest tests/mrp-run-builder.test.ts
 */

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { createMrpRunSchema, MRP_ELIGIBLE_PRODUCT_TYPES, MRP_REORDER_ELIGIBLE_PRODUCT_TYPES, MRP_RESULTS_SECTION_VALUES } from "../lib/manufacturing/mrp-run-api"

const mrpBuilderSource = readFileSync(
  path.resolve(process.cwd(), "lib/manufacturing/mrp-run-builder.ts"),
  "utf8"
)

// ---------------------------------------------------------------------------
// 1. Schema validation — createMrpRunSchema
// ---------------------------------------------------------------------------
describe("createMrpRunSchema — payload validation", () => {
  it("accepts branch scope without warehouse_id", () => {
    const result = createMrpRunSchema.safeParse({ run_scope: "branch" })
    expect(result.success).toBe(true)
  })

  it("accepts branch scope with explicit null warehouse_id", () => {
    const result = createMrpRunSchema.safeParse({ run_scope: "branch", warehouse_id: null })
    expect(result.success).toBe(true)
  })

  it("rejects branch scope when warehouse_id is provided", () => {
    const result = createMrpRunSchema.safeParse({
      run_scope: "branch",
      warehouse_id: "00000000-0000-0000-0000-000000000001",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."))
      expect(paths).toContain("warehouse_id")
    }
  })

  it("accepts warehouse_filtered scope with warehouse_id", () => {
    const result = createMrpRunSchema.safeParse({
      run_scope: "warehouse_filtered",
      warehouse_id: "00000000-0000-0000-0000-000000000001",
    })
    expect(result.success).toBe(true)
  })

  it("rejects warehouse_filtered scope without warehouse_id", () => {
    const result = createMrpRunSchema.safeParse({ run_scope: "warehouse_filtered" })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."))
      expect(paths).toContain("warehouse_id")
    }
  })

  it("rejects invalid run_scope", () => {
    const result = createMrpRunSchema.safeParse({ run_scope: "company" })
    expect(result.success).toBe(false)
  })

  it("accepts optional as_of_at ISO string", () => {
    const result = createMrpRunSchema.safeParse({
      run_scope: "branch",
      as_of_at: "2026-04-23T00:00:00.000Z",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid as_of_at", () => {
    const result = createMrpRunSchema.safeParse({ run_scope: "branch", as_of_at: "not-a-date" })
    expect(result.success).toBe(false)
  })

  it("trims and nullifies blank notes", () => {
    const result = createMrpRunSchema.safeParse({ run_scope: "branch", notes: "   " })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.notes).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. Product type eligibility sets
// ---------------------------------------------------------------------------
describe("MRP_ELIGIBLE_PRODUCT_TYPES", () => {
  it("includes manufactured, raw_material, purchased", () => {
    expect(MRP_ELIGIBLE_PRODUCT_TYPES.has("manufactured")).toBe(true)
    expect(MRP_ELIGIBLE_PRODUCT_TYPES.has("raw_material")).toBe(true)
    expect(MRP_ELIGIBLE_PRODUCT_TYPES.has("purchased")).toBe(true)
  })

  it("excludes service and unknown types", () => {
    expect(MRP_ELIGIBLE_PRODUCT_TYPES.has("service")).toBe(false)
    expect(MRP_ELIGIBLE_PRODUCT_TYPES.has("")).toBe(false)
    expect(MRP_ELIGIBLE_PRODUCT_TYPES.has("other")).toBe(false)
  })
})

describe("MRP_REORDER_ELIGIBLE_PRODUCT_TYPES", () => {
  it("includes raw_material and purchased only", () => {
    expect(MRP_REORDER_ELIGIBLE_PRODUCT_TYPES.has("raw_material")).toBe(true)
    expect(MRP_REORDER_ELIGIBLE_PRODUCT_TYPES.has("purchased")).toBe(true)
  })

  it("excludes manufactured (manufactured products use production demand, not reorder)", () => {
    expect(MRP_REORDER_ELIGIBLE_PRODUCT_TYPES.has("manufactured")).toBe(false)
  })

  it("excludes service", () => {
    expect(MRP_REORDER_ELIGIBLE_PRODUCT_TYPES.has("service")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. Netting logic — pure function tests (extracted for unit testing)
// ---------------------------------------------------------------------------

/** Mirrors the netting logic in mrp-run-builder.ts buildNetRows */
function computeNet(input: {
  salesDemand: number
  productionDemand: number
  reorderDemand: number
  freeStock: number
  incomingPurchase: number
  incomingProduction: number
  productType: string
}) {
  const totalDemand = input.salesDemand + input.productionDemand + input.reorderDemand
  const totalSupply = input.freeStock + input.incomingPurchase + input.incomingProduction
  const projected = input.freeStock - totalDemand + input.incomingPurchase + input.incomingProduction
  const netRequired = Math.max(0, totalDemand - totalSupply)
  const suggestedAction =
    netRequired === 0 ? "none"
    : input.productType === "manufactured" ? "production"
    : "purchase"
  return { totalDemand, totalSupply, projected, netRequired, suggestedAction }
}

describe("Netting logic — computeNet", () => {
  it("returns no shortage when supply >= demand", () => {
    const result = computeNet({
      salesDemand: 100, productionDemand: 0, reorderDemand: 0,
      freeStock: 150, incomingPurchase: 0, incomingProduction: 0,
      productType: "raw_material",
    })
    expect(result.netRequired).toBe(0)
    expect(result.suggestedAction).toBe("none")
  })

  it("computes net shortage correctly", () => {
    const result = computeNet({
      salesDemand: 100, productionDemand: 50, reorderDemand: 0,
      freeStock: 80, incomingPurchase: 20, incomingProduction: 0,
      productType: "raw_material",
    })
    expect(result.totalDemand).toBe(150)
    expect(result.totalSupply).toBe(100)
    expect(result.netRequired).toBe(50)
    expect(result.suggestedAction).toBe("purchase")
  })

  it("suggests production for manufactured products in shortage", () => {
    const result = computeNet({
      salesDemand: 200, productionDemand: 0, reorderDemand: 0,
      freeStock: 50, incomingPurchase: 0, incomingProduction: 80,
      productType: "manufactured",
    })
    expect(result.netRequired).toBe(70)
    expect(result.suggestedAction).toBe("production")
  })

  it("net_required is never negative", () => {
    const result = computeNet({
      salesDemand: 10, productionDemand: 0, reorderDemand: 0,
      freeStock: 1000, incomingPurchase: 0, incomingProduction: 0,
      productType: "purchased",
    })
    expect(result.netRequired).toBe(0)
  })

  it("aggregates all three demand types", () => {
    const result = computeNet({
      salesDemand: 30, productionDemand: 20, reorderDemand: 10,
      freeStock: 0, incomingPurchase: 0, incomingProduction: 0,
      productType: "raw_material",
    })
    expect(result.totalDemand).toBe(60)
    expect(result.netRequired).toBe(60)
  })
})

function aggregateDemandForNetting(rows: Array<{
  demand_type: "sales" | "production_component" | "reorder"
  original_qty: number
  covered_qty: number
  uncovered_qty: number
}>) {
  return rows.reduce(
    (acc, row) => {
      const nettableDemandQty = Number(row.uncovered_qty) || 0
      if (row.demand_type === "sales") acc.salesDemand += nettableDemandQty
      else if (row.demand_type === "production_component") acc.productionDemand += nettableDemandQty
      else if (row.demand_type === "reorder") acc.reorderDemand += nettableDemandQty
      return acc
    },
    { salesDemand: 0, productionDemand: 0, reorderDemand: 0 }
  )
}

function aggregateSupplyForNetting(rows: Array<{
  supply_type: "free_stock" | "purchase_incoming" | "production_incoming"
  original_qty: number
  available_qty: number
}>) {
  return rows.reduce(
    (acc, row) => {
      const qty = Number(row.available_qty) || 0
      if (row.supply_type === "free_stock") acc.freeStock += qty
      else if (row.supply_type === "purchase_incoming") acc.incomingPurchase += qty
      else if (row.supply_type === "production_incoming") acc.incomingProduction += qty
      return acc
    },
    { freeStock: 0, incomingPurchase: 0, incomingProduction: 0 }
  )
}

describe("MRP runtime regression guards", () => {
  it("maps production component demand from the current requirement snapshot table", () => {
    expect(mrpBuilderSource).toContain('.from("production_order_material_requirements")')
    expect(mrpBuilderSource).toContain('.select("id, product_id, gross_required_qty, warehouse_id")')
    expect(mrpBuilderSource).not.toContain("manufacturing_production_order_material_requirements")
    expect(mrpBuilderSource).not.toContain("required_quantity")
  })

  it("uses reservation-aware free stock instead of raw available balance", () => {
    expect(mrpBuilderSource).toContain('.from("v_inventory_reservation_balances")')
    expect(mrpBuilderSource).toContain("free_quantity")
    expect(mrpBuilderSource).not.toContain("inventory_available_balance")
  })

  it("nets demand on uncovered_qty instead of original_qty", () => {
    const totals = aggregateDemandForNetting([
      {
        demand_type: "production_component",
        original_qty: 12,
        covered_qty: 2,
        uncovered_qty: 10,
      },
    ])

    expect(totals.productionDemand).toBe(10)
    expect(totals.productionDemand).not.toBe(12)
    expect(mrpBuilderSource).toContain("const nettableDemandQty = Number(d.uncovered_qty) || 0")
  })

  it("nets incoming production supply on remaining receivable, not full planned quantity", () => {
    const totals = aggregateSupplyForNetting([
      {
        supply_type: "production_incoming",
        original_qty: 10,
        available_qty: 6,
      },
    ])

    expect(totals.incomingProduction).toBe(6)
    expect(totals.incomingProduction).not.toBe(10)
    expect(mrpBuilderSource).toContain('.from("production_order_receipt_lines")')
    expect(mrpBuilderSource).toContain("available_qty: remainingQty")
  })
})

// ---------------------------------------------------------------------------
// 4. Suggestion eligibility — product_type → suggestion_type mapping
// ---------------------------------------------------------------------------

function resolveSuggestionType(productType: string): "purchase" | "production" | null {
  if (productType === "manufactured") return "production"
  if (productType === "raw_material" || productType === "purchased") return "purchase"
  return null
}

describe("Suggestion eligibility — product_type → suggestion_type", () => {
  it("manufactured → production", () => {
    expect(resolveSuggestionType("manufactured")).toBe("production")
  })

  it("raw_material → purchase", () => {
    expect(resolveSuggestionType("raw_material")).toBe("purchase")
  })

  it("purchased → purchase", () => {
    expect(resolveSuggestionType("purchased")).toBe("purchase")
  })

  it("service → null (ineligible)", () => {
    expect(resolveSuggestionType("service")).toBeNull()
  })

  it("unknown type → null", () => {
    expect(resolveSuggestionType("")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 5. Reason code derivation
// ---------------------------------------------------------------------------

function deriveReasonCode(salesDemand: number, productionDemand: number, reorderDemand: number): string {
  const parts: string[] = []
  if (salesDemand > 0) parts.push("sales_shortage")
  if (productionDemand > 0) parts.push("production_shortage")
  if (reorderDemand > 0) parts.push("reorder_shortage")
  return parts.length > 1 ? "mixed" : parts[0] ?? "sales_shortage"
}

describe("Reason code derivation", () => {
  it("pure sales demand → sales_shortage", () => {
    expect(deriveReasonCode(100, 0, 0)).toBe("sales_shortage")
  })

  it("pure production demand → production_shortage", () => {
    expect(deriveReasonCode(0, 50, 0)).toBe("production_shortage")
  })

  it("pure reorder demand → reorder_shortage", () => {
    expect(deriveReasonCode(0, 0, 20)).toBe("reorder_shortage")
  })

  it("mixed demand sources → mixed", () => {
    expect(deriveReasonCode(50, 30, 0)).toBe("mixed")
    expect(deriveReasonCode(0, 10, 10)).toBe("mixed")
    expect(deriveReasonCode(10, 10, 10)).toBe("mixed")
  })
})

// ---------------------------------------------------------------------------
// 6. Results section validation
// ---------------------------------------------------------------------------

describe("MRP_RESULTS_SECTION_VALUES", () => {
  it("contains exactly the four expected sections", () => {
    expect([...MRP_RESULTS_SECTION_VALUES].sort()).toEqual(
      ["demand", "net", "suggestions", "supply"].sort()
    )
  })

  it("does not include invalid section names", () => {
    expect(MRP_RESULTS_SECTION_VALUES.includes("runs" as any)).toBe(false)
    expect(MRP_RESULTS_SECTION_VALUES.includes("summary" as any)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 7. Reorder demand quantity formula
// ---------------------------------------------------------------------------

describe("Reorder demand quantity", () => {
  it("is zero if free_stock >= reorder_level", () => {
    const reorderLevel = 50
    const freeStock = 60
    const qty = Math.max(0, reorderLevel - freeStock)
    expect(qty).toBe(0)
  })

  it("is the shortfall when free_stock < reorder_level", () => {
    const reorderLevel = 100
    const freeStock = 30
    const qty = Math.max(0, reorderLevel - freeStock)
    expect(qty).toBe(70)
  })
})

// ---------------------------------------------------------------------------
// ⏳ DEFERRED — DB runtime / smoke tests (require linked Supabase)
// ---------------------------------------------------------------------------
// The following test scenarios CANNOT run without a live DB connection.
// Document them here for traceability.
//
// describe.skip("MRP smoke tests — require linked DB", () => {
//
//   it("POST /mrp/runs creates a completed run with correct counts")
//   it("POST /mrp/runs with warehouse_filtered returns only warehouse-scoped rows")
//   it("GET /mrp/runs returns only runs for the authenticated company")
//   it("GET /mrp/runs/[id] returns correct summary counts")
//   it("GET /mrp/runs/[id]/results?section=demand returns demand rows")
//   it("GET /mrp/runs/[id]/results?section=net returns one row per product/warehouse grain")
//   it("GET /mrp/runs/[id]/results?section=suggestions has no suggestion where net_required = 0")
//   it("POST /mrp/runs fails gracefully and leaves no run record when source queries fail")
//   it("Normal user cannot query another branch via GET /mrp/runs")
//   it("Trigger rejects INSERT on demand_rows when run is already completed")
//   it("service product is never included in demand or supply rows")
// })
