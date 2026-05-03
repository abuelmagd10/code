import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  ManufacturingApiError,
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
    const { count: operationCount, error: operationsError } = await supabase
      .from("manufacturing_routing_operations")
      .select("id", { count: "exact", head: true })
      .eq("routing_version_id", id)
      .eq("company_id", companyId)

    if (operationsError) throw operationsError
    if ((operationCount || 0) <= 0) {
      throw new ManufacturingApiError(
        409,
        "لا يمكن تفعيل نسخة مسار التصنيع قبل إضافة عملية واحدة على الأقل وحفظها."
      )
    }

    const { data, error } = await admin.rpc("activate_manufacturing_routing_version_atomic", {
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
      newData: {
        status: "active",
        previous_active_version_id: data?.previous_active_version_id || null,
      },
      reason: "Activated manufacturing routing version",
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
