import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertRoutingVersionAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
} from "@/lib/manufacturing/routing-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const version = await assertRoutingVersionAccessible(supabase, companyId, id)

    const { data, error } = await admin.rpc("deactivate_manufacturing_routing_version_atomic", {
      p_company_id: companyId,
      p_routing_version_id: id,
      p_updated_by: user.id,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "manufacturing_routing_versions",
      recordId: id,
      recordIdentifier: `routing-version-${version.version_no}`,
      oldData: { status: version.status },
      newData: { status: "inactive" },
      reason: "Deactivated manufacturing routing version",
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
