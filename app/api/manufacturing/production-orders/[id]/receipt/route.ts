import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertProductionOrderAccessible,
  assertProductionOrderReceiptAllowed,
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadProductionOrderInventoryExecutionSnapshot,
  parseJsonBody,
  receiptProductionOrderOutputSchema,
} from "@/lib/manufacturing/inventory-execution-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const payload = await parseJsonBody(request, receiptProductionOrderOutputSchema)
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)

    assertProductionOrderReceiptAllowed(existing)

    const { data, error } = await admin.rpc("receipt_manufacturing_production_order_output_atomic", {
      p_company_id: companyId,
      p_production_order_id: id,
      p_posted_by: user.id,
      p_received_qty: payload.received_qty,
      p_posted_at: payload.posted_at ?? null,
      p_notes: payload.notes ?? null,
      p_command_key: payload.command_key ?? null,
    })

    if (error) throw error

    const snapshot = await loadProductionOrderInventoryExecutionSnapshot(supabase, companyId, id)

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "CREATE",
      table: "production_order_receipt_events",
      recordId: data?.receipt_event_id || id,
      recordIdentifier: existing.order_no,
      newData: {
        received_qty: payload.received_qty,
        total_cost: data?.total_cost ?? null,
        unit_cost: data?.unit_cost ?? null,
        fifo_cost_lot_id: data?.fifo_cost_lot_id ?? null,
        command_key: payload.command_key ?? null,
      },
      reason: "Posted production finished-goods receipt via atomic RPC",
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
