import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import { createNotification } from "@/lib/governance-layer"
import {
  assertProductionOrderAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
} from "@/lib/manufacturing/production-order-api"
import {
  recordApprovalAction,
  getNextCycleNo,
  buildApprovalSnapshot,
} from "@/lib/manufacturing/approval-history"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "approve")
    const order = await assertProductionOrderAccessible(supabase, companyId, id)

    const { data, error } = await admin.rpc("approve_production_order_atomic", {
      p_company_id:           companyId,
      p_production_order_id:  id,
      p_approved_by:          user.id,
    })
    if (error) throw error

    const cycleNo = await getNextCycleNo(supabase, companyId, "production_order", id)
    await recordApprovalAction({
      supabase, companyId,
      referenceType: "production_order",
      referenceId: id,
      cycleNo,
      action: "approved",
      actorId: user.id,
      actorRole: "admin",
      snapshotData: buildApprovalSnapshot({
        statusBefore: "pending_approval",
        statusAfter: "approved",
        extraFields: { order_no: order.order_no },
      }),
      branchId: order.branch_id,
    })

    asyncAuditLog({
      companyId, userId: user.id, userEmail: user.email || undefined,
      action: "UPDATE", table: "manufacturing_production_orders", recordId: id,
      recordIdentifier: order.order_no,
      oldData: { approval_status: "pending_approval" }, newData: { approval_status: "approved" },
      reason: "Approved production order",
    })

    const submittedBy = (order as any).submitted_by
    if (submittedBy) {
      try {
        await createNotification({
          companyId,
          referenceType: "manufacturing_production_order",
          referenceId: id,
          title: "✅ تمت الموافقة على أمر الإنتاج",
          message: `تمت الموافقة على أمر الإنتاج ${order.order_no} — يمكن إصداره الآن`,
          createdBy: user.id,
          branchId: order.branch_id ?? undefined,
          assignedToUser: submittedBy,
          priority: "high",
          severity: "info",
          category: "approvals",
          eventKey: `po_approved_${id}`,
        })
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
