import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertRoutingAccessible,
  assertRoutingDeleteAllowed,
  getManufacturingApiContext,
  handleManufacturingApiError,
  parseJsonBody,
  updateRoutingSchema,
} from "@/lib/manufacturing/routing-api"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, companyId } = await getManufacturingApiContext(request, "read")
    const routing = await assertRoutingAccessible(supabase, companyId, id)

    const [{ data: versions, error: versionsError }, { data: product, error: productError }] = await Promise.all([
      supabase
        .from("manufacturing_routing_versions")
        .select("id, routing_id, version_no, status, effective_from, effective_to, change_summary, notes, updated_at")
        .eq("routing_id", id)
        .eq("company_id", companyId)
        .order("version_no", { ascending: false }),
      supabase
        .from("products")
        .select("*")
        .eq("id", routing.product_id)
        .maybeSingle(),
    ])

    if (versionsError) throw versionsError
    if (productError) throw productError

    return NextResponse.json({
      success: true,
      data: {
        ...routing,
        product: product || null,
        versions: versions || [],
      },
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, companyId, user } = await getManufacturingApiContext(request, "update")
    const payload = await parseJsonBody(request, updateRoutingSchema)
    const existing = await assertRoutingAccessible(supabase, companyId, id)

    const { data, error } = await supabase
      .from("manufacturing_routings")
      .update({
        ...payload,
        updated_by: user.id,
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single()

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "manufacturing_routings",
      recordId: data.id,
      recordIdentifier: data.routing_code,
      oldData: {
        routing_code: existing.routing_code,
        routing_name: existing.routing_name,
        description: existing.description,
        is_active: existing.is_active,
      },
      newData: payload,
      reason: "Updated manufacturing routing header",
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, companyId, user } = await getManufacturingApiContext(request, "delete")
    const existing = await assertRoutingAccessible(supabase, companyId, id)

    await assertRoutingDeleteAllowed(supabase, companyId, id)

    const { data, error } = await supabase
      .from("manufacturing_routings")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single()

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "DELETE",
      table: "manufacturing_routings",
      recordId: existing.id,
      recordIdentifier: existing.routing_code,
      oldData: existing,
      reason: "Deleted manufacturing routing header",
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
