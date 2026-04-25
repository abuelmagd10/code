import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertRoutingVersionAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
  parseJsonBody,
  updateRoutingOperationsSchema,
} from "@/lib/manufacturing/routing-api"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const payload = await parseJsonBody(request, updateRoutingOperationsSchema)
    const version = await assertRoutingVersionAccessible(supabase, companyId, id)

    const { data, error } = await admin.rpc("update_manufacturing_routing_operations_atomic", {
      p_company_id: companyId,
      p_routing_version_id: id,
      p_updated_by: user.id,
      p_operations: payload.operations,
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
      newData: {
        operation_count: data?.operation_count ?? payload.operations.length,
      },
      reason: "Updated manufacturing routing operations via atomic RPC",
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
