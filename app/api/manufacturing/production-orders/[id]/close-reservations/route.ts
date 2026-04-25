import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertProductionOrderAccessible,
  assertProductionOrderReservationCloseAllowed,
  closeProductionOrderReservationsSchema,
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadProductionOrderInventoryExecutionSnapshot,
  parseOptionalJsonBody,
} from "@/lib/manufacturing/inventory-execution-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const payload = await parseOptionalJsonBody(request, closeProductionOrderReservationsSchema)
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)

    assertProductionOrderReservationCloseAllowed(existing)

    const { data, error } = await admin.rpc("close_manufacturing_production_order_reservations_atomic", {
      p_company_id: companyId,
      p_production_order_id: id,
      p_updated_by: user.id,
      p_mode: payload.mode,
    })

    if (error) throw error

    const snapshot = await loadProductionOrderInventoryExecutionSnapshot(supabase, companyId, id)

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "inventory_reservations",
      recordId: data?.reservation_id || id,
      recordIdentifier: existing.order_no,
      oldData: {
        order_status: existing.status,
      },
      newData: {
        mode: payload.mode,
        reservation_status: data?.reservation_status ?? null,
        close_reason: data?.close_reason ?? null,
        released_allocation_count: data?.released_allocation_count ?? 0,
      },
      reason: "Closed production order reservations via atomic RPC",
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
