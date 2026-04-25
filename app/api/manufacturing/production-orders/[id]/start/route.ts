import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertProductionOrderAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadProductionOrderSnapshot,
  parseOptionalJsonBody,
  startProductionOrderSchema,
} from "@/lib/manufacturing/production-order-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const payload = await parseOptionalJsonBody(request, startProductionOrderSchema)
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)

    const { data, error } = await admin.rpc("start_manufacturing_production_order_atomic", {
      p_company_id: companyId,
      p_production_order_id: id,
      p_started_by: user.id,
      p_started_at: payload.started_at ?? null,
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
      oldData: { status: existing.status, started_at: existing.started_at },
      newData: {
        status: snapshot.order.status,
        started_at: snapshot.order.started_at,
        primed_operation_id: data?.primed_operation_id || null,
      },
      reason: "Started manufacturing production order",
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
