import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertManufacturableProduct,
  createProductionOrderSchema,
  getManufacturingApiContext,
  handleManufacturingApiError,
  jsonError,
  loadProductionOrderSnapshot,
  parseJsonBody,
  resolveScopedBranchId,
} from "@/lib/manufacturing/production-order-api"

export async function GET(request: NextRequest) {
  try {
    const { supabase, companyId, member } = await getManufacturingApiContext(request, "read")
    const { searchParams } = new URL(request.url)

    const requestedBranchId = searchParams.get("branch_id")
    if (member.isNormalRole && requestedBranchId && requestedBranchId !== member.branchId) {
      return jsonError(403, "You cannot query another branch")
    }

    let query = supabase
      .from("manufacturing_production_orders")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })

    if (requestedBranchId) query = query.eq("branch_id", requestedBranchId)
    if (searchParams.get("product_id")) query = query.eq("product_id", searchParams.get("product_id"))
    if (searchParams.get("status")) query = query.eq("status", searchParams.get("status"))

    const q = searchParams.get("q")?.trim()
    if (q) {
      query = query.ilike("order_no", `%${q}%`)
    }

    const { data: orders, error } = await query
    if (error) throw error

    const productIds = Array.from(new Set((orders || []).map((order) => order.product_id).filter(Boolean)))
    const bomIds = Array.from(new Set((orders || []).map((order) => order.bom_id).filter(Boolean)))
    const bomVersionIds = Array.from(new Set((orders || []).map((order) => order.bom_version_id).filter(Boolean)))
    const routingIds = Array.from(new Set((orders || []).map((order) => order.routing_id).filter(Boolean)))
    const routingVersionIds = Array.from(new Set((orders || []).map((order) => order.routing_version_id).filter(Boolean)))

    const [
      { data: products, error: productsError },
      { data: boms, error: bomsError },
      { data: bomVersions, error: bomVersionsError },
      { data: routings, error: routingsError },
      { data: routingVersions, error: routingVersionsError },
    ] = await Promise.all([
      productIds.length > 0
        ? supabase.from("products").select("*").in("id", productIds)
        : Promise.resolve({ data: [], error: null }),
      bomIds.length > 0
        ? supabase.from("manufacturing_boms").select("*").in("id", bomIds)
        : Promise.resolve({ data: [], error: null }),
      bomVersionIds.length > 0
        ? supabase.from("manufacturing_bom_versions").select("*").in("id", bomVersionIds)
        : Promise.resolve({ data: [], error: null }),
      routingIds.length > 0
        ? supabase.from("manufacturing_routings").select("*").in("id", routingIds)
        : Promise.resolve({ data: [], error: null }),
      routingVersionIds.length > 0
        ? supabase.from("manufacturing_routing_versions").select("*").in("id", routingVersionIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (productsError) throw productsError
    if (bomsError) throw bomsError
    if (bomVersionsError) throw bomVersionsError
    if (routingsError) throw routingsError
    if (routingVersionsError) throw routingVersionsError

    const productsById = Object.fromEntries((products || []).map((product) => [product.id, product]))
    const bomsById = Object.fromEntries((boms || []).map((bom) => [bom.id, bom]))
    const bomVersionsById = Object.fromEntries((bomVersions || []).map((version) => [version.id, version]))
    const routingsById = Object.fromEntries((routings || []).map((routing) => [routing.id, routing]))
    const routingVersionsById = Object.fromEntries((routingVersions || []).map((version) => [version.id, version]))

    return NextResponse.json({
      success: true,
      data: (orders || []).map((order) => ({
        ...order,
        product: productsById[order.product_id] || null,
        bom: bomsById[order.bom_id] || null,
        bom_version: bomVersionsById[order.bom_version_id] || null,
        routing: routingsById[order.routing_id] || null,
        routing_version: routingVersionsById[order.routing_version_id] || null,
      })),
      meta: {
        total: (orders || []).length,
      },
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, admin, user, companyId, member } = await getManufacturingApiContext(request, "write")
    const payload = await parseJsonBody(request, createProductionOrderSchema)
    const finalBranchId = resolveScopedBranchId(member, payload.branch_id || null)

    await assertManufacturableProduct(supabase, {
      companyId,
      branchId: finalBranchId,
      productId: payload.product_id,
    })

    const { data, error } = await admin.rpc("create_manufacturing_production_order_atomic", {
      p_company_id: companyId,
      p_branch_id: finalBranchId,
      p_created_by: user.id,
      p_product_id: payload.product_id,
      p_bom_id: payload.bom_id,
      p_bom_version_id: payload.bom_version_id,
      p_routing_id: payload.routing_id,
      p_routing_version_id: payload.routing_version_id,
      p_issue_warehouse_id: payload.issue_warehouse_id ?? null,
      p_receipt_warehouse_id: payload.receipt_warehouse_id ?? null,
      p_planned_quantity: payload.planned_quantity,
      p_order_uom: payload.order_uom ?? null,
      p_planned_start_at: payload.planned_start_at ?? null,
      p_planned_end_at: payload.planned_end_at ?? null,
      p_notes: payload.notes ?? null,
    })

    if (error) throw error

    const productionOrderId = data?.production_order_id
    if (!productionOrderId) {
      throw new Error("Production order RPC did not return production_order_id")
    }

    const snapshot = await loadProductionOrderSnapshot(supabase, companyId, productionOrderId)

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "CREATE",
      table: "manufacturing_production_orders",
      recordId: productionOrderId,
      recordIdentifier: data?.order_no || snapshot.order.order_no,
      newData: {
        product_id: payload.product_id,
        bom_id: payload.bom_id,
        bom_version_id: payload.bom_version_id,
        routing_id: payload.routing_id,
        routing_version_id: payload.routing_version_id,
        planned_quantity: payload.planned_quantity,
        operation_count: data?.operation_count ?? snapshot.operations.length,
      },
      reason: "Created manufacturing production order via atomic RPC",
    })

    return NextResponse.json(
      {
        success: true,
        data: snapshot,
        meta: {
          command_result: data,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
