import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { asyncAuditLog } from "@/lib/core"
import { createNotification } from "@/lib/governance-layer"
import {
  assertProductionOrderAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
  parseJsonBody,
} from "@/lib/manufacturing/production-order-api"
import {
  recordApprovalAction,
  getNextCycleNo,
  buildApprovalSnapshot,
} from "@/lib/manufacturing/approval-history"

const rejectSchema = z.object({
  rejection_reason: z.string().min(1, "سبب الرفض مطلوب"),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "approve")
    const payload = await parseJsonBody(request, rejectSchema)
    const order = await assertProductionOrderAccessible(supabase, companyId, id)

    const { data, error } = await admin.rpc("reject_production_order_atomic", {
      p_company_id:           companyId,
      p_production_order_id:  id,
      p_rejected_by:          user.id,
      p_rejection_reason:     payload.rejection_reason,
    })
    if (error) throw error

    const cycleNo = await getNextCycleNo(supabase, companyId, "production_order", id)
    await recordApprovalAction({
      supabase, companyId,
      referenceType: "production_order",
      referenceId: id,
      cycleNo,
      action: "rejected",
      actorId: user.id,
      actorRole: "admin",
      reason: payload.rejection_reason,
      snapshotData: buildApprovalSnapshot({
        statusBefore: "pending_approval",
        statusAfter: "rejected",
        extraFields: { order_no: order.order_no },
      }),
      branchId: order.branch_id,
    })

    asyncAuditLog({
      companyId, userId: user.id, userEmail: user.email || undefined,
      action: "UPDATE", table: "manufacturing_production_orders", recordId: id,
      recordIdentifier: order.order_no,
      oldData: { approval_status: "pending_approval" },
      newData: { approval_status: "rejected", rejection_reason: payload.rejection_reason },
      reason: "Rejected production order",
    })

    const submittedBy = (order as any).submitted_by
    if (submittedBy) {
      try {
        await createNotification({
          companyId,
          referenceType: "manufacturing_production_order",
          referenceId: id,
          title: "❌ رُفض أمر الإنتاج",
          message: `رُفض أمر الإنتاج ${order.order_no}${payload.rejection_reason ? ` — السبب: ${payload.rejection_reason}` : ""}`,
          createdBy: user.id,
          branchId: order.branch_id ?? undefined,
          assignedToUser: submittedBy,
          priority: "high",
          severity: "error",
          category: "approvals",
          eventKey: `po_rejected_${id}`,
        })
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
