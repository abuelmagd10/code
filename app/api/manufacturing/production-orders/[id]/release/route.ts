import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertProductionOrderAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadProductionOrderSnapshot,
  parseOptionalJsonBody,
  releaseProductionOrderSchema,
} from "@/lib/manufacturing/production-order-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const payload = await parseOptionalJsonBody(request, releaseProductionOrderSchema)
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)

    const { data, error } = await admin.rpc("release_manufacturing_production_order_atomic", {
      p_company_id: companyId,
      p_production_order_id: id,
      p_updated_by: user.id,
      p_released_at: payload.released_at ?? null,
    })

    if (error) throw error

    const snapshot = await loadProductionOrderSnapshot(supabase, companyId, id)

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "manufacturing_production_orders",
      recordId: id,
      recordIdentifier: existing.order_no,
      oldData: { status: existing.status },
      newData: { status: "released" },
      reason: "Released manufacturing production order",
    })

    return NextResponse.json({
      success: true,
      data: snapshot,
      meta: {
        command_result: data,
      },
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
