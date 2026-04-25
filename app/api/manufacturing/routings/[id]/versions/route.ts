import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertRoutingAccessible,
  createRoutingVersionSchema,
  getManufacturingApiContext,
  handleManufacturingApiError,
  parseOptionalJsonBody,
} from "@/lib/manufacturing/routing-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "write")
    const payload = await parseOptionalJsonBody(request, createRoutingVersionSchema)
    const routing = await assertRoutingAccessible(supabase, companyId, id)

    const { data, error } = await admin.rpc("create_manufacturing_routing_version_atomic", {
      p_company_id: companyId,
      p_routing_id: id,
      p_created_by: user.id,
      p_clone_from_version_id: payload.clone_from_version_id ?? null,
      p_effective_from: payload.effective_from ?? null,
      p_effective_to: payload.effective_to ?? null,
      p_change_summary: payload.change_summary ?? null,
      p_notes: payload.notes ?? null,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "CREATE",
      table: "manufacturing_routing_versions",
      recordId: data?.routing_version_id || id,
      recordIdentifier: `${routing.routing_code}-v${data?.version_no || "?"}`,
      newData: {
        routing_id: id,
        version_no: data?.version_no,
        cloned: data?.cloned || false,
      },
      reason: "Created manufacturing routing version via atomic RPC",
    })

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
