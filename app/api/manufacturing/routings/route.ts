import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertManufacturableProduct,
  createRoutingSchema,
  getManufacturingApiContext,
  handleManufacturingApiError,
  jsonError,
  parseJsonBody,
  resolveScopedBranchId,
} from "@/lib/manufacturing/routing-api"

export async function GET(request: NextRequest) {
  try {
    const { supabase, companyId, member } = await getManufacturingApiContext(request, "read")
    const { searchParams } = new URL(request.url)

    const requestedBranchId = searchParams.get("branch_id")
    if (member.isNormalRole && requestedBranchId && requestedBranchId !== member.branchId) {
      return jsonError(403, "You cannot query another branch")
    }

    let query = supabase
      .from("manufacturing_routings")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })

    if (requestedBranchId) query = query.eq("branch_id", requestedBranchId)
    if (searchParams.get("product_id")) query = query.eq("product_id", searchParams.get("product_id"))
    if (searchParams.get("routing_usage")) query = query.eq("routing_usage", searchParams.get("routing_usage"))
    if (searchParams.get("is_active") === "true") query = query.eq("is_active", true)
    if (searchParams.get("is_active") === "false") query = query.eq("is_active", false)

    const q = searchParams.get("q")?.trim()
    if (q) {
      query = query.or(`routing_code.ilike.%${q}%,routing_name.ilike.%${q}%`)
    }

    const { data: routings, error } = await query
    if (error) throw error

    const routingIds = (routings || []).map((routing) => routing.id)
    const productIds = Array.from(new Set((routings || []).map((routing) => routing.product_id)))

    const [{ data: versions, error: versionsError }, { data: products, error: productsError }] = await Promise.all([
      routingIds.length > 0
        ? supabase
            .from("manufacturing_routing_versions")
            .select("id, routing_id, version_no, status, effective_from, effective_to, updated_at")
            .in("routing_id", routingIds)
            .order("version_no", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      productIds.length > 0
        ? supabase
            .from("products")
            .select("*")
            .in("id", productIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (versionsError) throw versionsError
    if (productsError) throw productsError

    const versionsByRoutingId = (versions || []).reduce<Record<string, any[]>>((acc, version) => {
      acc[version.routing_id] ||= []
      acc[version.routing_id].push(version)
      return acc
    }, {})

    const productsById = Object.fromEntries((products || []).map((product) => [product.id, product]))

    return NextResponse.json({
      success: true,
      data: (routings || []).map((routing) => ({
        ...routing,
        product: productsById[routing.product_id] || null,
        versions: versionsByRoutingId[routing.id] || [],
      })),
      meta: {
        total: (routings || []).length,
      },
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, companyId, member } = await getManufacturingApiContext(request, "write")
    const payload = await parseJsonBody(request, createRoutingSchema)
    const finalBranchId = resolveScopedBranchId(member, payload.branch_id || null)

    await assertManufacturableProduct(supabase, {
      companyId,
      branchId: finalBranchId,
      productId: payload.product_id,
    })

    const { data, error } = await supabase
      .from("manufacturing_routings")
      .insert({
        company_id: companyId,
        branch_id: finalBranchId,
        product_id: payload.product_id,
        routing_code: payload.routing_code,
        routing_name: payload.routing_name,
        routing_usage: payload.routing_usage,
        description: payload.description ?? null,
        is_active: payload.is_active,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("*")
      .single()

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "CREATE",
      table: "manufacturing_routings",
      recordId: data.id,
      recordIdentifier: data.routing_code,
      newData: {
        product_id: data.product_id,
        branch_id: data.branch_id,
        routing_usage: data.routing_usage,
      },
      reason: "Created manufacturing routing header",
    })

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
