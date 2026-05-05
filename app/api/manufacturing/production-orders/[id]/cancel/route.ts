import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import { createNotification } from "@/lib/governance-layer"
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

    // Notify creator + manager that order was cancelled
    const cancelBase = {
      companyId,
      referenceType: "manufacturing_production_order",
      referenceId: id,
      title: "🚫 تم إلغاء أمر الإنتاج",
      message: `أمر الإنتاج ${existing.order_no} تم إلغاؤه${payload.cancellation_reason ? ` — السبب: ${payload.cancellation_reason}` : ""}`,
      createdBy: user.id,
      branchId: existing.branch_id ?? undefined,
      priority: "high" as const,
      severity: "warning" as const,
      category: "approvals" as const,
    }
    if (existing.created_by && existing.created_by !== user.id) {
      try {
        await createNotification({ ...cancelBase, assignedToUser: existing.created_by, eventKey: `po_cancelled_creator_${id}` })
      } catch { /* non-critical */ }
    }
    try {
      await createNotification({ ...cancelBase, assignedToRole: "manager", eventKey: `po_cancelled_mgr_${id}` })
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
