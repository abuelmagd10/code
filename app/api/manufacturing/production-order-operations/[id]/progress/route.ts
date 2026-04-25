import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadProductionOrderOperationSnapshot,
  parseJsonBody,
  updateProductionOrderOperationProgressSchema,
} from "@/lib/manufacturing/production-order-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const payload = await parseJsonBody(request, updateProductionOrderOperationProgressSchema)
    const existing = await loadProductionOrderOperationSnapshot(supabase, companyId, id)

    const finalNotes = "notes" in payload ? payload.notes ?? null : existing.operation.notes

    const { data, error } = await admin.rpc("update_manufacturing_production_order_operation_progress_atomic", {
      p_company_id: companyId,
      p_production_order_operation_id: id,
      p_updated_by: user.id,
      p_status: payload.status ?? null,
      p_completed_quantity: payload.completed_quantity ?? null,
      p_actual_start_at: payload.actual_start_at ?? null,
      p_actual_end_at: payload.actual_end_at ?? null,
      p_notes: finalNotes ?? null,
    })

    if (error) throw error

    const snapshot = await loadProductionOrderOperationSnapshot(supabase, companyId, id)

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "manufacturing_production_order_operations",
      recordId: id,
      recordIdentifier: `${existing.order.order_no}-${existing.operation.operation_code}`,
      oldData: {
        status: existing.operation.status,
        completed_quantity: existing.operation.completed_quantity,
        actual_start_at: existing.operation.actual_start_at,
        actual_end_at: existing.operation.actual_end_at,
        notes: existing.operation.notes,
      },
      newData: {
        status: snapshot.operation.status,
        completed_quantity: snapshot.operation.completed_quantity,
        actual_start_at: snapshot.operation.actual_start_at,
        actual_end_at: snapshot.operation.actual_end_at,
        notes: snapshot.operation.notes,
        auto_started_order: data?.auto_started_order || false,
      },
      reason: "Updated manufacturing production order operation progress via atomic RPC",
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
