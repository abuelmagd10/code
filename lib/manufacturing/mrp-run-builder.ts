// =============================================================================
// MRP Run Builder — B8
// Scope: atomic run orchestration (demand → supply → net → suggestions)
// Advisory-only: no PO, no MO, no inventory movement.
// Failure semantics: full rollback — no partial state persisted.
// =============================================================================

import { createServiceClient } from "@/lib/supabase/server"
import { ManufacturingApiError, MRP_ELIGIBLE_PRODUCT_TYPES, MRP_REORDER_ELIGIBLE_PRODUCT_TYPES } from "./mrp-run-api"

type AdminClient = ReturnType<typeof createServiceClient>

export interface MrpRunBuildParams {
  companyId: string
  branchId: string
  warehouseId: string | null
  runScope: "branch" | "warehouse_filtered"
  asOfAt: string        // ISO timestamp
  notes: string | null
  createdBy: string
}

export interface MrpRunBuildResult {
  runId: string
  demandRowCount: number
  supplyRowCount: number
  netRowCount: number
  suggestionCount: number
}

// ---------------------------------------------------------------------------
// Main entry point — one atomic sequence, full rollback on any error
// ---------------------------------------------------------------------------

export async function buildMrpRun(
  admin: AdminClient,
  params: MrpRunBuildParams
): Promise<MrpRunBuildResult> {
  // STEP 1: Create run header in 'running' status
  const runId = await insertRunHeader(admin, params)

  try {
    // STEP 2: Collect & insert demand rows
    const demandRows = await collectDemandRows(admin, params, runId)
    if (demandRows.length > 0) {
      const { error } = await admin.from("mrp_demand_rows").insert(demandRows)
      if (error) throw error
    }

    // STEP 3: Collect & insert supply rows
    const supplyRows = await collectSupplyRows(admin, params, runId)
    if (supplyRows.length > 0) {
      const { error } = await admin.from("mrp_supply_rows").insert(supplyRows)
      if (error) throw error
    }

    // STEP 4: Aggregate & insert net rows (one per product/warehouse grain)
    const netRows = buildNetRows(runId, params, demandRows, supplyRows)
    if (netRows.length > 0) {
      const { error } = await admin.from("mrp_net_rows").insert(netRows)
      if (error) throw error
    }

    // STEP 5: Build suggestions (only where net_required_qty > 0)
    // We need the inserted net_row IDs — fetch them back
    let suggestionCount = 0
    if (netRows.length > 0) {
      const { data: insertedNetRows, error: netFetchError } = await admin
        .from("mrp_net_rows")
        .select(
          "id, product_id, warehouse_id, product_type, net_required_qty, sales_demand_qty, production_demand_qty, reorder_demand_qty"
        )
        .eq("run_id", runId)
        .eq("company_id", params.companyId)
        .eq("branch_id", params.branchId)
        .gt("net_required_qty", 0)

      if (netFetchError) throw netFetchError

      const suggestions = buildSuggestions(runId, params, insertedNetRows || [])
      if (suggestions.length > 0) {
        // fetch net_row_id per product/warehouse to attach correctly
        const netRowIdMap = new Map(
          (insertedNetRows || []).map((r: any) => [`${r.product_id}:${r.warehouse_id}`, r.id])
        )
        const suggestionsWithNetRowId = suggestions.map((s) => ({
          ...s,
          net_row_id: netRowIdMap.get(`${s.product_id}:${s.warehouse_id}`) ?? null,
        })).filter((s) => s.net_row_id !== null)

        if (suggestionsWithNetRowId.length > 0) {
          const { error } = await admin.from("mrp_suggestions").insert(suggestionsWithNetRowId)
          if (error) throw error
          suggestionCount = suggestionsWithNetRowId.length
        }
      }
    }

    // STEP 6: Mark run as completed + update counts
    const { error: completeError } = await admin
      .from("mrp_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        demand_row_count: demandRows.length,
        supply_row_count: supplyRows.length,
        net_row_count: netRows.length,
        suggestion_count: suggestionCount,
      })
      .eq("id", runId)

    if (completeError) throw completeError

    return {
      runId,
      demandRowCount: demandRows.length,
      supplyRowCount: supplyRows.length,
      netRowCount: netRows.length,
      suggestionCount,
    }
  } catch (err: any) {
    // Failure semantics v1: delete the run entirely → no partial state
    await admin.from("mrp_runs").delete().eq("id", runId)
    throw err
  }
}

// ---------------------------------------------------------------------------
// STEP 1: Insert run header
// ---------------------------------------------------------------------------

async function insertRunHeader(admin: AdminClient, params: MrpRunBuildParams): Promise<string> {
  const { data, error } = await admin
    .from("mrp_runs")
    .insert({
      company_id: params.companyId,
      branch_id: params.branchId,
      run_scope: params.runScope,
      warehouse_id: params.warehouseId,
      run_mode: "current_state_single_level",
      status: "running",
      as_of_at: params.asOfAt,
      started_at: new Date().toISOString(),
      notes: params.notes,
      created_by: params.createdBy,
    })
    .select("id")
    .single()

  if (error) throw error
  if (!data?.id) throw new ManufacturingApiError(500, "mrp_runs insert did not return id")

  return data.id
}

// ---------------------------------------------------------------------------
// STEP 2: Collect demand rows
// ---------------------------------------------------------------------------

async function collectDemandRows(
  admin: AdminClient,
  params: MrpRunBuildParams,
  runId: string
): Promise<any[]> {
  const rows: any[] = []
  const { companyId, branchId, warehouseId, runScope } = params

  // ── 2a. Sales demand (confirmed sales orders, not shipped/cancelled)
  const soQuery = admin
    .from("sales_orders")
    .select(`
      id, so_number, due_date, branch_id,
      sales_order_items!inner(id, product_id, quantity)
    `)
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .in("status", ["confirmed", "approved"])

  const { data: salesOrders, error: soError } = await soQuery
  if (soError) throw soError

  for (const so of salesOrders || []) {
    for (const item of (so as any).sales_order_items || []) {
      // Canonical eligibility: resolved from products.product_type
      // service / null / unsupported types return null → skipped automatically
      const productType = await resolveProductType(admin, companyId, item.product_id)
      if (!productType || !MRP_ELIGIBLE_PRODUCT_TYPES.has(productType)) continue

      const resolvedWarehouse = warehouseId ?? await resolveBranchDefaultWarehouse(admin, companyId, branchId)
      if (!resolvedWarehouse) continue
      if (runScope === "warehouse_filtered" && resolvedWarehouse !== warehouseId) continue

      const qty = Number(item.quantity) || 0
      if (qty <= 0) continue

      rows.push({
        run_id: runId,
        company_id: companyId,
        branch_id: branchId,
        warehouse_id: resolvedWarehouse,
        product_id: item.product_id,
        product_type: productType,
        demand_type: "sales",
        source_type: "sales_order",
        source_id: so.id,
        source_line_id: item.id,
        document_no: so.so_number,
        due_at: so.due_date ? new Date(so.due_date).toISOString() : null,
        original_qty: qty,
        covered_qty: 0,
        uncovered_qty: qty,
        uom: null,
        explanation: `Sales order ${so.so_number}`,
      })
    }
  }

  // ── 2b. Production component demand (open production orders)
  const poQuery = admin
    .from("manufacturing_production_orders")
    .select("id, order_no, planned_end_at, issue_warehouse_id, status")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .in("status", ["released", "in_progress"])

  const { data: productionOrders, error: poError } = await poQuery
  if (poError) throw poError

  for (const po of productionOrders || []) {
    const { data: requirements, error: reqError } = await admin
      .from("production_order_material_requirements")
      .select("id, product_id, gross_required_qty, warehouse_id")
      .eq("production_order_id", po.id)
      .eq("company_id", companyId)
      .eq("branch_id", branchId)

    if (reqError) throw reqError
    if (!requirements || requirements.length === 0) continue

    const requirementIds = requirements.map((req) => req.id).filter(Boolean)

    const [{ data: issueLines, error: issueError }, { data: reservations, error: reservationError }] = await Promise.all([
      requirementIds.length > 0
        ? admin
            .from("production_order_issue_lines")
            .select("material_requirement_id, issued_qty")
            .eq("production_order_id", po.id)
            .in("material_requirement_id", requirementIds)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("inventory_reservations")
        .select("id, status")
        .eq("company_id", companyId)
        .eq("source_type", "production_order")
        .eq("source_id", po.id)
        .order("created_at", { ascending: false }),
    ])

    if (issueError) throw issueError
    if (reservationError) throw reservationError

    const issuedByRequirement = new Map<string, number>()
    for (const issueLine of issueLines || []) {
      const requirementId = String(issueLine.material_requirement_id || "")
      if (!requirementId) continue
      issuedByRequirement.set(
        requirementId,
        (issuedByRequirement.get(requirementId) || 0) + (Number(issueLine.issued_qty) || 0)
      )
    }

    const activeReservation = (reservations || []).find(
      (reservation) => !["consumed", "released", "cancelled", "expired", "closed"].includes(String(reservation.status || ""))
    )

    let reservationLines: Array<{ id: string; source_line_id: string | null }> = []
    let allocations: Array<{
      reservation_line_id: string
      allocated_qty: number | string | null
      consumed_qty: number | string | null
      released_qty: number | string | null
    }> = []

    if (activeReservation?.id && requirementIds.length > 0) {
      const { data: reservationLineRows, error: reservationLineError } = await admin
        .from("inventory_reservation_lines")
        .select("id, source_line_id")
        .eq("reservation_id", activeReservation.id)
        .in("source_line_id", requirementIds)

      if (reservationLineError) throw reservationLineError
      reservationLines = reservationLineRows || []

      const reservationLineIds = reservationLines.map((line) => line.id).filter(Boolean)
      if (reservationLineIds.length > 0) {
        const { data: allocationRows, error: allocationError } = await admin
          .from("inventory_reservation_allocations")
          .select("reservation_line_id, allocated_qty, consumed_qty, released_qty")
          .in("reservation_line_id", reservationLineIds)

        if (allocationError) throw allocationError
        allocations = allocationRows || []
      }
    }

    const reservationLineByRequirement = new Map<string, string>()
    for (const reservationLine of reservationLines) {
      const requirementId = String(reservationLine.source_line_id || "")
      if (!requirementId) continue
      reservationLineByRequirement.set(requirementId, reservationLine.id)
    }

    const openReservedByRequirement = new Map<string, number>()
    for (const allocation of allocations) {
      const reservationLineId = String(allocation.reservation_line_id || "")
      if (!reservationLineId) continue

      const openQty = Math.max(
        0,
        (Number(allocation.allocated_qty) || 0)
          - (Number(allocation.consumed_qty) || 0)
          - (Number(allocation.released_qty) || 0)
      )

      if (openQty <= 0) continue

      const requirementId = [...reservationLineByRequirement.entries()]
        .find(([, lineId]) => lineId === reservationLineId)?.[0]

      if (!requirementId) continue

      openReservedByRequirement.set(
        requirementId,
        (openReservedByRequirement.get(requirementId) || 0) + openQty
      )
    }

    for (const req of requirements) {
      if (!req.product_id || req.gross_required_qty == null) continue

      const productType = await resolveProductType(admin, companyId, req.product_id)
      if (!productType || !MRP_ELIGIBLE_PRODUCT_TYPES.has(productType)) continue

      const resolvedWarehouse = req.warehouse_id || po.issue_warehouse_id ||
        await resolveBranchDefaultWarehouse(admin, companyId, branchId)
      if (!resolvedWarehouse) continue
      if (runScope === "warehouse_filtered" && resolvedWarehouse !== warehouseId) continue

      // MRP v1 must follow the executable material snapshot used by reservations/issues,
      // so remaining demand is based on gross_required_qty minus already issued quantity.
      const remainingQty = Math.max(
        0,
        (Number(req.gross_required_qty) || 0) - (issuedByRequirement.get(req.id) || 0)
      )
      if (remainingQty <= 0) continue

      const coveredQty = Math.min(
        remainingQty,
        Math.max(0, openReservedByRequirement.get(req.id) || 0)
      )
      const uncoveredQty = Math.max(0, remainingQty - coveredQty)

      rows.push({
        run_id: runId,
        company_id: companyId,
        branch_id: branchId,
        warehouse_id: resolvedWarehouse,
        product_id: req.product_id,
        product_type: productType,
        demand_type: "production_component",
        source_type: "production_order",
        source_id: po.id,
        source_line_id: req.id,
        document_no: po.order_no,
        due_at: po.planned_end_at,
        original_qty: remainingQty,
        covered_qty: coveredQty,
        uncovered_qty: uncoveredQty,
        uom: null,
        explanation: `Component for production order ${po.order_no}`,
      })
    }
  }

  // ── 2c. Reorder demand (products below reorder_level, raw/purchased only)
  const { data: reorderProducts, error: reorderError } = await admin
    .from("products")
    .select("id, product_type, reorder_level, unit, warehouse_id")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .in("product_type", ["raw_material", "purchased"])
    .gt("reorder_level", 0)

  if (reorderError) throw reorderError

  for (const product of reorderProducts || []) {
    if (!MRP_REORDER_ELIGIBLE_PRODUCT_TYPES.has(product.product_type)) continue

    const resolvedWarehouse = product.warehouse_id ||
      await resolveBranchDefaultWarehouse(admin, companyId, branchId)
    if (!resolvedWarehouse) continue
    if (runScope === "warehouse_filtered" && resolvedWarehouse !== warehouseId) continue

    const freeStock = await resolveFreeStock(admin, companyId, branchId, resolvedWarehouse, product.id)
    const reorderQty = Math.max(0, (product.reorder_level || 0) - freeStock)
    if (reorderQty <= 0) continue

    rows.push({
      run_id: runId,
      company_id: companyId,
      branch_id: branchId,
      warehouse_id: resolvedWarehouse,
      product_id: product.id,
      product_type: product.product_type,
      demand_type: "reorder",
      source_type: "reorder_policy",
      source_id: product.id,
      source_line_id: null,
      document_no: null,
      due_at: null,
      original_qty: reorderQty,
      covered_qty: 0,
      uncovered_qty: reorderQty,
      uom: product.unit,
      explanation: `Reorder level breach for product ${product.id}`,
    })
  }

  return rows
}

// ---------------------------------------------------------------------------
// STEP 3: Collect supply rows
// ---------------------------------------------------------------------------

async function collectSupplyRows(
  admin: AdminClient,
  params: MrpRunBuildParams,
  runId: string
): Promise<any[]> {
  const rows: any[] = []
  const { companyId, branchId, warehouseId, runScope } = params

  // ── 3a. Free stock (reservation-aware free_quantity)
  let freeStockQuery = admin
    .from("v_inventory_reservation_balances")
    .select("product_id, warehouse_id, free_quantity")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .gt("free_quantity", 0)

  if (runScope === "warehouse_filtered" && warehouseId) {
    freeStockQuery = freeStockQuery.eq("warehouse_id", warehouseId)
  }

  const { data: freeStockRows, error: fsError } = await freeStockQuery
  if (fsError) throw fsError

  for (const fs of freeStockRows || []) {
    const productType = await resolveProductType(admin, companyId, fs.product_id)
    if (!productType || !MRP_ELIGIBLE_PRODUCT_TYPES.has(productType)) continue

    const qty = Number(fs.free_quantity) || 0

    rows.push({
      run_id: runId,
      company_id: companyId,
      branch_id: branchId,
      warehouse_id: fs.warehouse_id,
      product_id: fs.product_id,
      product_type: productType,
      supply_type: "free_stock",
      source_type: "inventory_free_stock",
      source_id: fs.product_id,
      source_line_id: null,
      document_no: null,
      expected_at: null,
      original_qty: qty,
      available_qty: qty,
      uom: null,
      explanation: "Free stock on hand",
    })
  }

  // ── 3b. Incoming purchase (approved POs, not fully received)
  const { data: purchaseOrders, error: purchaseError } = await admin
    .from("purchase_orders")
    .select(`id, po_number, due_date, purchase_order_items(id, product_id, quantity, received_quantity)`)
    .eq("company_id", companyId)
    .in("status", ["approved", "partially_received"])

  if (purchaseError) throw purchaseError

  for (const po of purchaseOrders || []) {
    for (const item of (po as any).purchase_order_items || []) {
      // Canonical eligibility: resolved from products.product_type
      // service / null / unsupported types return null → skipped automatically
      const productType = await resolveProductType(admin, companyId, item.product_id)
      if (!productType || !MRP_ELIGIBLE_PRODUCT_TYPES.has(productType)) continue

      const remaining = Math.max(0, (Number(item.quantity) || 0) - (Number(item.received_quantity) || 0))
      if (remaining <= 0) continue

      const resolvedWarehouse = warehouseId ?? await resolveBranchDefaultWarehouse(admin, companyId, branchId)
      if (!resolvedWarehouse) continue

      rows.push({
        run_id: runId,
        company_id: companyId,
        branch_id: branchId,
        warehouse_id: resolvedWarehouse,
        product_id: item.product_id,
        product_type: productType,
        supply_type: "purchase_incoming",
        source_type: "purchase_order",
        source_id: po.id,
        source_line_id: item.id,
        document_no: po.po_number,
        expected_at: po.due_date ? new Date(po.due_date).toISOString() : null,
        original_qty: Number(item.quantity) || 0,
        available_qty: remaining,
        uom: null,
        explanation: `Incoming from PO ${po.po_number}`,
      })
    }
  }

  // ── 3c. Incoming production (in_progress production orders)
  const { data: inProgressPOs, error: ipError } = await admin
    .from("manufacturing_production_orders")
    .select("id, order_no, planned_end_at, receipt_warehouse_id, product_id, planned_quantity, status")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .in("status", ["released", "in_progress"])

  if (ipError) throw ipError

  const inProgressPoIds = (inProgressPOs || []).map((mo) => mo.id).filter(Boolean)
  const { data: receiptLines, error: receiptError } = inProgressPoIds.length > 0
    ? await admin
        .from("production_order_receipt_lines")
        .select("production_order_id, received_qty")
        .in("production_order_id", inProgressPoIds)
    : { data: [], error: null }

  if (receiptError) throw receiptError

  const receivedByProductionOrder = new Map<string, number>()
  for (const receiptLine of receiptLines || []) {
    const productionOrderId = String(receiptLine.production_order_id || "")
    if (!productionOrderId) continue
    receivedByProductionOrder.set(
      productionOrderId,
      (receivedByProductionOrder.get(productionOrderId) || 0) + (Number(receiptLine.received_qty) || 0)
    )
  }

  for (const mo of inProgressPOs || []) {
    if (!mo.product_id) continue
    const productType = await resolveProductType(admin, companyId, mo.product_id)
    if (productType !== "manufactured") continue

    const resolvedWarehouse = mo.receipt_warehouse_id ||
      (runScope === "warehouse_filtered" ? warehouseId : null) ||
      await resolveBranchDefaultWarehouse(admin, companyId, branchId)
    if (!resolvedWarehouse) continue
    if (runScope === "warehouse_filtered" && resolvedWarehouse !== warehouseId) continue

    const plannedQty = Number(mo.planned_quantity) || 0
    const remainingQty = Math.max(0, plannedQty - (receivedByProductionOrder.get(mo.id) || 0))
    if (remainingQty <= 0) continue

    rows.push({
      run_id: runId,
      company_id: companyId,
      branch_id: branchId,
      warehouse_id: resolvedWarehouse,
      product_id: mo.product_id,
      product_type: "manufactured",
      supply_type: "production_incoming",
      source_type: "production_order",
      source_id: mo.id,
      source_line_id: null,
      document_no: mo.order_no,
      expected_at: mo.planned_end_at,
      original_qty: plannedQty,
      available_qty: remainingQty,
      uom: null,
      explanation: `Incoming from MO ${mo.order_no}`,
    })
  }

  return rows
}

// ---------------------------------------------------------------------------
// STEP 4: Build net rows (aggregate demand & supply per product/warehouse)
// ---------------------------------------------------------------------------

function buildNetRows(
  runId: string,
  params: MrpRunBuildParams,
  demandRows: any[],
  supplyRows: any[]
): any[] {
  const { companyId, branchId } = params

  // grain key: product_id:warehouse_id
  type Grain = {
    productId: string
    warehouseId: string
    productType: string
    salesDemand: number
    productionDemand: number
    reorderDemand: number
    freeStock: number
    incomingPurchase: number
    incomingProduction: number
    reorderLevel: number
  }

  const grainMap = new Map<string, Grain>()

  const getOrCreate = (productId: string, warehouseId: string, productType: string): Grain => {
    const key = `${productId}:${warehouseId}`
    if (!grainMap.has(key)) {
      grainMap.set(key, {
        productId, warehouseId, productType,
        salesDemand: 0, productionDemand: 0, reorderDemand: 0,
        freeStock: 0, incomingPurchase: 0, incomingProduction: 0,
        reorderLevel: 0,
      })
    }
    return grainMap.get(key)!
  }

  for (const d of demandRows) {
    const g = getOrCreate(d.product_id, d.warehouse_id, d.product_type)
    const nettableDemandQty = Number(d.uncovered_qty) || 0
    if (d.demand_type === "sales") g.salesDemand += nettableDemandQty
    else if (d.demand_type === "production_component") g.productionDemand += nettableDemandQty
    else if (d.demand_type === "reorder") g.reorderDemand += nettableDemandQty
  }

  for (const s of supplyRows) {
    const g = getOrCreate(s.product_id, s.warehouse_id, s.product_type)
    if (s.supply_type === "free_stock") g.freeStock += Number(s.available_qty) || 0
    else if (s.supply_type === "purchase_incoming") g.incomingPurchase += Number(s.available_qty) || 0
    else if (s.supply_type === "production_incoming") g.incomingProduction += Number(s.available_qty) || 0
  }

  const netRows: any[] = []

  for (const g of grainMap.values()) {
    const totalDemand = g.salesDemand + g.productionDemand + g.reorderDemand
    const totalSupply = g.freeStock + g.incomingPurchase + g.incomingProduction
    const projectedAfterCommitted = g.freeStock - totalDemand + g.incomingPurchase + g.incomingProduction
    const netRequired = Math.max(0, totalDemand - totalSupply)

    const suggestedAction =
      netRequired === 0 ? "none"
      : g.productType === "manufactured" ? "production"
      : "purchase"

    netRows.push({
      run_id: runId,
      company_id: companyId,
      branch_id: branchId,
      warehouse_id: g.warehouseId,
      product_id: g.productId,
      product_type: g.productType,
      uom: null,
      total_demand_qty: totalDemand,
      sales_demand_qty: g.salesDemand,
      production_demand_qty: g.productionDemand,
      reorder_demand_qty: g.reorderDemand,
      free_stock_qty: g.freeStock,
      incoming_purchase_qty: g.incomingPurchase,
      incoming_production_qty: g.incomingProduction,
      total_supply_qty: totalSupply,
      reorder_level_qty: g.reorderLevel,
      projected_after_committed_qty: projectedAfterCommitted,
      net_required_qty: netRequired,
      suggested_action: suggestedAction,
    })
  }

  return netRows
}

// ---------------------------------------------------------------------------
// STEP 5: Build suggestions
// ---------------------------------------------------------------------------

function buildSuggestions(
  runId: string,
  params: MrpRunBuildParams,
  netRowsWithShortage: any[]
): any[] {
  const { companyId, branchId } = params
  const suggestions: any[] = []

  for (const nr of netRowsWithShortage) {
    const netRequired = Number(nr.net_required_qty) || 0
    if (netRequired <= 0) continue

    const suggestionType = nr.product_type === "manufactured" ? "production" : "purchase"
    if (!MRP_ELIGIBLE_PRODUCT_TYPES.has(nr.product_type)) continue

    // Filter: reorder-only products must map to 'purchase'
    if (nr.product_type === "manufactured" && suggestionType !== "production") continue
    if (["raw_material", "purchased"].includes(nr.product_type) && suggestionType !== "purchase") continue

    const reasonParts: string[] = []
    if (nr.sales_demand_qty > 0) reasonParts.push("sales_shortage")
    if (nr.production_demand_qty > 0) reasonParts.push("production_shortage")
    if (nr.reorder_demand_qty > 0) reasonParts.push("reorder_shortage")
    const reasonCode = reasonParts.length > 1 ? "mixed" : reasonParts[0] ?? "sales_shortage"

    suggestions.push({
      run_id: runId,
      net_row_id: nr.id,   // will be set by caller after DB fetch
      company_id: companyId,
      branch_id: branchId,
      warehouse_id: nr.warehouse_id,
      product_id: nr.product_id,
      product_type: nr.product_type,
      suggestion_type: suggestionType,
      suggested_qty: netRequired,
      uom: null,
      reason_code: reasonCode,
      explanation: `Net shortage of ${netRequired} — suggest ${suggestionType}`,
    })
  }

  return suggestions
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const productTypeCache = new Map<string, string>()

async function resolveProductType(
  admin: AdminClient,
  companyId: string,
  productId: string
): Promise<string | null> {
  const cacheKey = `${companyId}:${productId}`
  if (productTypeCache.has(cacheKey)) return productTypeCache.get(cacheKey)!

  const { data, error } = await admin
    .from("products")
    .select("product_type")
    .eq("id", productId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (error || !data) return null
  const pt = String(data.product_type || "").trim() || null
  if (pt) productTypeCache.set(cacheKey, pt)
  return pt
}

const warehouseCache = new Map<string, string | null>()

async function resolveBranchDefaultWarehouse(
  admin: AdminClient,
  companyId: string,
  branchId: string
): Promise<string | null> {
  const cacheKey = `${companyId}:${branchId}`
  if (warehouseCache.has(cacheKey)) return warehouseCache.get(cacheKey)!

  const { data, error } = await admin
    .from("warehouses")
    .select("id")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  const result = (!error && data?.id) ? data.id : null
  warehouseCache.set(cacheKey, result)
  return result
}

async function resolveFreeStock(
  admin: AdminClient,
  companyId: string,
  branchId: string,
  warehouseId: string,
  productId: string
): Promise<number> {
  const { data, error } = await admin
    .from("v_inventory_reservation_balances")
    .select("free_quantity")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .eq("warehouse_id", warehouseId)
    .eq("product_id", productId)
    .maybeSingle()

  if (error || !data) return 0
  return Number(data.free_quantity) || 0
}
