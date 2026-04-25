import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertManufacturableProduct,
  createBomSchema,
  getManufacturingApiContext,
  handleManufacturingApiError,
  jsonError,
  parseJsonBody,
  resolveScopedBranchId,
} from "@/lib/manufacturing/bom-api"

export async function GET(request: NextRequest) {
  try {
    const { supabase, companyId, member } = await getManufacturingApiContext(request, "read")
    const { searchParams } = new URL(request.url)

    const requestedBranchId = searchParams.get("branch_id")
    if (member.isNormalRole && requestedBranchId && requestedBranchId !== member.branchId) {
      return jsonError(403, "You cannot query another branch")
    }

    let query = supabase
      .from("manufacturing_boms")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })

    if (requestedBranchId) query = query.eq("branch_id", requestedBranchId)
    if (searchParams.get("product_id")) query = query.eq("product_id", searchParams.get("product_id"))
    if (searchParams.get("bom_usage")) query = query.eq("bom_usage", searchParams.get("bom_usage"))
    if (searchParams.get("is_active") === "true") query = query.eq("is_active", true)
    if (searchParams.get("is_active") === "false") query = query.eq("is_active", false)

    const q = searchParams.get("q")?.trim()
    if (q) {
      query = query.or(`bom_code.ilike.%${q}%,bom_name.ilike.%${q}%`)
    }

    const { data: boms, error } = await query
    if (error) throw error

    const bomIds = (boms || []).map((bom) => bom.id)
    const productIds = Array.from(new Set((boms || []).map((bom) => bom.product_id)))

    const [{ data: versions, error: versionsError }, { data: products, error: productsError }] = await Promise.all([
      bomIds.length > 0
        ? supabase
            .from("manufacturing_bom_versions")
            .select("id, bom_id, version_no, status, is_default, effective_from, effective_to, updated_at")
            .in("bom_id", bomIds)
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

    const versionsByBomId = (versions || []).reduce<Record<string, any[]>>((acc, version) => {
      acc[version.bom_id] ||= []
      acc[version.bom_id].push(version)
      return acc
    }, {})

    const productsById = Object.fromEntries((products || []).map((product) => [product.id, product]))

    return NextResponse.json({
      success: true,
      data: (boms || []).map((bom) => ({
        ...bom,
        product: productsById[bom.product_id] || null,
        versions: versionsByBomId[bom.id] || [],
      })),
      meta: {
        total: (boms || []).length,
      },
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, companyId, member } = await getManufacturingApiContext(request, "write")
    const payload = await parseJsonBody(request, createBomSchema)
    const finalBranchId = resolveScopedBranchId(member, payload.branch_id || null)

    await assertManufacturableProduct(supabase, {
      companyId,
      branchId: finalBranchId,
      productId: payload.product_id,
    })

    const { data, error } = await supabase
      .from("manufacturing_boms")
      .insert({
        company_id: companyId,
        branch_id: finalBranchId,
        product_id: payload.product_id,
        bom_code: payload.bom_code,
        bom_name: payload.bom_name,
        bom_usage: payload.bom_usage,
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
      table: "manufacturing_boms",
      recordId: data.id,
      recordIdentifier: data.bom_code,
      newData: {
        product_id: data.product_id,
        branch_id: data.branch_id,
        bom_usage: data.bom_usage,
      },
      reason: "Created manufacturing BOM header",
    })

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
