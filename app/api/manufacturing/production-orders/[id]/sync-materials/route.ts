import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertProductionOrderAccessible,
  assertProductionOrderExecutionOpen,
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadProductionOrderInventoryExecutionSnapshot,
  parseOptionalJsonBody,
  syncProductionOrderMaterialsSchema,
} from "@/lib/manufacturing/inventory-execution-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    await parseOptionalJsonBody(request, syncProductionOrderMaterialsSchema)
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)

    assertProductionOrderExecutionOpen(existing)

    const { data, error } = await admin.rpc("sync_manufacturing_production_order_materials_atomic", {
      p_company_id: companyId,
      p_production_order_id: id,
      p_user_id: user.id,
    })

    if (error) throw error

    const snapshot = await loadProductionOrderInventoryExecutionSnapshot(supabase, companyId, id)

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "manufacturing_production_orders",
      recordId: id,
      recordIdentifier: existing.order_no,
      oldData: {
        status: existing.status,
      },
      newData: {
        material_requirement_count: snapshot.material_requirements.length,
        reservation_count: snapshot.reservations.length,
        command_result: data,
      },
      reason: "Synced production order materials and reservation context",
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
