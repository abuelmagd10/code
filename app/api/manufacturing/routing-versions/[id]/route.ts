import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertRoutingVersionAccessible,
  assertRoutingVersionDeleteAllowed,
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadRoutingVersionSnapshot,
  parseJsonBody,
  updateRoutingVersionSchema,
} from "@/lib/manufacturing/routing-api"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, companyId } = await getManufacturingApiContext(request, "read")
    const snapshot = await loadRoutingVersionSnapshot(supabase, companyId, id)

    return NextResponse.json({
      success: true,
      data: snapshot,
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
    const payload = await parseJsonBody(request, updateRoutingVersionSchema)
    const existing = await assertRoutingVersionAccessible(supabase, companyId, id)

    const { data, error } = await supabase
      .from("manufacturing_routing_versions")
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
      table: "manufacturing_routing_versions",
      recordId: data.id,
      recordIdentifier: `routing-version-${data.version_no}`,
      oldData: {
        effective_from: existing.effective_from,
        effective_to: existing.effective_to,
        change_summary: existing.change_summary,
        notes: existing.notes,
      },
      newData: payload,
      reason: "Updated manufacturing routing version header",
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
    const existing = await assertRoutingVersionAccessible(supabase, companyId, id)

    assertRoutingVersionDeleteAllowed(existing)

    const { data, error } = await supabase
      .from("manufacturing_routing_versions")
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
      table: "manufacturing_routing_versions",
      recordId: existing.id,
      recordIdentifier: `routing-version-${existing.version_no}`,
      oldData: existing,
      reason: "Deleted manufacturing routing version",
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
