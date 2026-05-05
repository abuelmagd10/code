import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import { createNotification } from "@/lib/governance-layer"
import {
  assertProductionOrderAccessible,
  completeProductionOrderSchema,
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
    const payload = await parseJsonBody(request, completeProductionOrderSchema)
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)

    const { data, error } = await admin.rpc("complete_manufacturing_production_order_atomic", {
      p_company_id: companyId,
      p_production_order_id: id,
      p_completed_by: user.id,
      p_completed_quantity: payload.completed_quantity,
      p_completed_at: payload.completed_at ?? null,
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
        status: existing.status,
        completed_quantity: existing.completed_quantity,
      },
      newData: {
        status: snapshot.order.status,
        completed_quantity: snapshot.order.completed_quantity,
        completed_at: snapshot.order.completed_at,
      },
      reason: "Completed manufacturing production order",
    })

    // Notify manager + admin that production order is complete
    const completeBase = {
      companyId,
      referenceType: "manufacturing_production_order",
      referenceId: id,
      title: "✅ اكتمل أمر الإنتاج",
      message: `أمر الإنتاج ${existing.order_no} اكتمل بنجاح — الكمية المنتجة: ${payload.completed_quantity}`,
      createdBy: user.id,
      branchId: existing.branch_id ?? undefined,
      priority: "high" as const,
      severity: "info" as const,
      category: "approvals" as const,
    }
    try {
      await createNotification({ ...completeBase, assignedToRole: "manager", eventKey: `po_completed_mgr_${id}` })
    } catch { /* non-critical */ }
    try {
      await createNotification({ ...completeBase, assignedToRole: "admin", eventKey: `po_completed_admin_${id}` })
    } catch { /* non-critical */ }

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
