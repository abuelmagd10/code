import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertProductionOrderAccessible,
  assertProductionOrderDeleteAllowed,
  assertProductionOrderEditable,
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadProductionOrderSnapshot,
  parseJsonBody,
  updateProductionOrderSchema,
} from "@/lib/manufacturing/production-order-api"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, companyId } = await getManufacturingApiContext(request, "read")
    const snapshot = await loadProductionOrderSnapshot(supabase, companyId, id)

    return NextResponse.json({
      success: true,
      data: snapshot,
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, companyId, user } = await getManufacturingApiContext(request, "update")
    const payload = await parseJsonBody(request, updateProductionOrderSchema)
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)

    assertProductionOrderEditable(existing)

    const updateData: Record<string, unknown> = {
      updated_by: user.id,
    }

    if ("bom_id" in payload) {
      updateData.bom_id = payload.bom_id
      updateData.bom_version_id = payload.bom_version_id
    }
    if ("issue_warehouse_id" in payload) updateData.issue_warehouse_id = payload.issue_warehouse_id ?? null
    if ("receipt_warehouse_id" in payload) updateData.receipt_warehouse_id = payload.receipt_warehouse_id ?? null
    if ("order_uom" in payload) updateData.order_uom = payload.order_uom ?? null
    if ("planned_start_at" in payload) updateData.planned_start_at = payload.planned_start_at ?? null
    if ("planned_end_at" in payload) updateData.planned_end_at = payload.planned_end_at ?? null
    if ("notes" in payload) updateData.notes = payload.notes ?? null

    const { error } = await supabase
      .from("manufacturing_production_orders")
      .update(updateData)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("id")
      .single()

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
        issue_warehouse_id: existing.issue_warehouse_id,
        receipt_warehouse_id: existing.receipt_warehouse_id,
        order_uom: existing.order_uom,
        planned_start_at: existing.planned_start_at,
        planned_end_at: existing.planned_end_at,
        notes: existing.notes,
      },
      newData: payload,
      reason: "Updated draft production order header",
    })

    return NextResponse.json({ success: true, data: snapshot })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, companyId, user } = await getManufacturingApiContext(request, "delete")
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)

    assertProductionOrderDeleteAllowed(existing)

    const { data, error } = await supabase
      .from("manufacturing_production_orders")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single()

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "DELETE",
      table: "manufacturing_production_orders",
      recordId: existing.id,
      recordIdentifier: existing.order_no,
      oldData: existing,
      reason: "Deleted draft manufacturing production order",
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
