import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertProductionOrderAccessible,
  cancelProductionOrderSchema,
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadProductionOrderSnapshot,
  parseJsonBody,
} from "@/lib/manufacturing/production-order-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const payload = await parseJsonBody(request, cancelProductionOrderSchema)
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)

    const { data, error } = await admin.rpc("cancel_manufacturing_production_order_atomic", {
      p_company_id: companyId,
      p_production_order_id: id,
      p_cancelled_by: user.id,
      p_cancellation_reason: payload.cancellation_reason,
      p_cancelled_at: payload.cancelled_at ?? null,
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
      newData: {
        status: snapshot.order.status,
        cancellation_reason: snapshot.order.cancellation_reason,
      },
      reason: "Cancelled manufacturing production order",
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
