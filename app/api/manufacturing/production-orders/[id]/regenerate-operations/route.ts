import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertProductionOrderAccessible,
  assertProductionOrderEditable,
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadProductionOrderSnapshot,
  parseOptionalJsonBody,
  regenerateProductionOrderSchema,
} from "@/lib/manufacturing/production-order-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const payload = await parseOptionalJsonBody(request, regenerateProductionOrderSchema)
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)

    assertProductionOrderEditable(existing)

    const finalBomId = payload.bom_id ?? existing.bom_id
    const finalBomVersionId = payload.bom_version_id ?? existing.bom_version_id
    const finalRoutingId = payload.routing_id ?? existing.routing_id
    const finalRoutingVersionId = payload.routing_version_id ?? existing.routing_version_id
    const finalPlannedQuantity = payload.planned_quantity ?? existing.planned_quantity
    const finalIssueWarehouseId = "issue_warehouse_id" in payload
      ? payload.issue_warehouse_id ?? null
      : existing.issue_warehouse_id
    const finalReceiptWarehouseId = "receipt_warehouse_id" in payload
      ? payload.receipt_warehouse_id ?? null
      : existing.receipt_warehouse_id
    const finalOrderUom = "order_uom" in payload ? payload.order_uom ?? null : existing.order_uom
    const finalPlannedStartAt = "planned_start_at" in payload
      ? payload.planned_start_at ?? null
      : existing.planned_start_at
    const finalPlannedEndAt = "planned_end_at" in payload
      ? payload.planned_end_at ?? null
      : existing.planned_end_at
    const finalNotes = "notes" in payload ? payload.notes ?? null : existing.notes

    const { data, error } = await admin.rpc("regenerate_manufacturing_production_order_operations_atomic", {
      p_company_id: companyId,
      p_production_order_id: id,
      p_updated_by: user.id,
      p_product_id: existing.product_id,
      p_bom_id: finalBomId,
      p_bom_version_id: finalBomVersionId,
      p_routing_id: finalRoutingId,
      p_routing_version_id: finalRoutingVersionId,
      p_issue_warehouse_id: finalIssueWarehouseId,
      p_receipt_warehouse_id: finalReceiptWarehouseId,
      p_planned_quantity: finalPlannedQuantity,
      p_order_uom: finalOrderUom,
      p_planned_start_at: finalPlannedStartAt,
      p_planned_end_at: finalPlannedEndAt,
      p_notes: finalNotes,
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
      oldData: {
        bom_id: existing.bom_id,
        bom_version_id: existing.bom_version_id,
        routing_id: existing.routing_id,
        routing_version_id: existing.routing_version_id,
        planned_quantity: existing.planned_quantity,
      },
      newData: {
        bom_id: finalBomId,
        bom_version_id: finalBomVersionId,
        routing_id: finalRoutingId,
        routing_version_id: finalRoutingVersionId,
        planned_quantity: finalPlannedQuantity,
        operation_count: data?.operation_count ?? snapshot.operations.length,
      },
      reason: "Regenerated production order operations via atomic RPC",
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
