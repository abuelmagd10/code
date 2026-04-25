import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  getManufacturingApiContext,
  handleManufacturingApiError,
  jsonError,
  parseJsonBody,
  resolveScopedBranchId,
  createMrpRunSchema,
} from "@/lib/manufacturing/mrp-run-api"
import { buildMrpRun } from "@/lib/manufacturing/mrp-run-builder"

// ---------------------------------------------------------------------------
// GET /api/manufacturing/mrp/runs — list runs
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const { supabase, companyId, member } = await getManufacturingApiContext(request, "read")
    const { searchParams } = new URL(request.url)

    const requestedBranchId = searchParams.get("branch_id")
    if (member.isNormalRole && requestedBranchId && requestedBranchId !== member.branchId) {
      return jsonError(403, "You cannot query another branch")
    }

    const page = Math.max(1, Number(searchParams.get("page") || "1"))
    const perPage = Math.min(100, Math.max(1, Number(searchParams.get("per_page") || "20")))
    const offset = (page - 1) * perPage

    let query = supabase
      .from("mrp_runs")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .order("started_at", { ascending: false })
      .range(offset, offset + perPage - 1)

    if (requestedBranchId) query = query.eq("branch_id", requestedBranchId)
    else if (member.isNormalRole && member.branchId) query = query.eq("branch_id", member.branchId)

    if (searchParams.get("status")) query = query.eq("status", searchParams.get("status"))
    if (searchParams.get("run_scope")) query = query.eq("run_scope", searchParams.get("run_scope"))

    const { data: runs, error, count } = await query
    if (error) throw error

    return NextResponse.json({
      success: true,
      data: runs || [],
      meta: { total: count ?? 0, page, per_page: perPage },
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}

// ---------------------------------------------------------------------------
// POST /api/manufacturing/mrp/runs — build a new run atomically
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const { admin, user, companyId, member } = await getManufacturingApiContext(request, "write")
    const payload = await parseJsonBody(request, createMrpRunSchema)
    const finalBranchId = resolveScopedBranchId(member, payload.branch_id ?? null)

    // If warehouse_filtered: verify warehouse belongs to this company + branch
    if (payload.run_scope === "warehouse_filtered" && payload.warehouse_id) {
      const { data: wh, error: whErr } = await admin
        .from("warehouses")
        .select("id, company_id, branch_id")
        .eq("id", payload.warehouse_id)
        .maybeSingle()

      if (whErr) throw whErr
      if (!wh) return jsonError(404, "Warehouse not found")
      if (wh.company_id !== companyId) return jsonError(400, "Warehouse does not belong to your company")
      if (wh.branch_id !== finalBranchId) return jsonError(400, "Warehouse does not belong to the specified branch")
    }

    const asOfAt = payload.as_of_at ?? new Date().toISOString()

    const result = await buildMrpRun(admin, {
      companyId,
      branchId: finalBranchId,
      warehouseId: payload.warehouse_id ?? null,
      runScope: payload.run_scope,
      asOfAt,
      notes: payload.notes ?? null,
      createdBy: user.id,
    })

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "CREATE",
      table: "mrp_runs",
      recordId: result.runId,
      recordIdentifier: result.runId,
      newData: {
        run_scope: payload.run_scope,
        warehouse_id: payload.warehouse_id ?? null,
        demand_row_count: result.demandRowCount,
        supply_row_count: result.supplyRowCount,
        net_row_count: result.netRowCount,
        suggestion_count: result.suggestionCount,
      },
      reason: "Created MRP run via B8 atomic builder",
    })

    // Fetch the completed run header to return
    const { data: run, error: fetchError } = await admin
      .from("mrp_runs")
      .select("*")
      .eq("id", result.runId)
      .single()

    if (fetchError) throw fetchError

    return NextResponse.json(
      {
        success: true,
        data: run,
        meta: {
          demand_row_count: result.demandRowCount,
          supply_row_count: result.supplyRowCount,
          net_row_count: result.netRowCount,
          suggestion_count: result.suggestionCount,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
