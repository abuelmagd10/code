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
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const order = await assertProductionOrderAccessible(supabase, companyId, id)

    const currentApprovalStatus = (order as any).approval_status ?? "draft"
    if (!["draft", "rejected"].includes(currentApprovalStatus)) {
      return NextResponse.json(
        { error: `لا يمكن إرسال أمر الإنتاج للاعتماد — الحالة الحالية: ${currentApprovalStatus}` },
        { status: 409 }
      )
    }

    const { data, error } = await admin.rpc("submit_production_order_for_approval_atomic", {
      p_company_id:           companyId,
      p_production_order_id:  id,
      p_submitted_by:         user.id,
    })
    if (error) throw error

    const cycleNo = await getNextCycleNo(supabase, companyId, "production_order", id)
    const isResubmit = currentApprovalStatus === "rejected"
    await recordApprovalAction({
      supabase, companyId,
      referenceType: "production_order",
      referenceId: id,
      cycleNo,
      action: isResubmit ? "re_submitted" : "submitted",
      actorId: user.id,
      actorRole: "manufacturing_officer",
      snapshotData: buildApprovalSnapshot({
        statusBefore: currentApprovalStatus,
        statusAfter: "pending_approval",
        extraFields: { order_no: order.order_no },
      }),
      branchId: order.branch_id,
    })

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "manufacturing_production_orders",
      recordId: id,
      recordIdentifier: order.order_no,
      oldData: { approval_status: currentApprovalStatus },
      newData: { approval_status: "pending_approval" },
      reason: "Submitted production order for approval",
    })

    const notificationBase = {
      companyId,
      referenceType: "manufacturing_production_order",
      referenceId: id,
      title: "📋 طلب اعتماد أمر إنتاج",
      message: `أمر الإنتاج ${order.order_no} بانتظار اعتمادك`,
      createdBy: user.id,
      branchId: order.branch_id ?? undefined,
      priority: "high" as const,
      severity: "warning" as const,
      category: "approvals" as const,
      kind: "action" as const, // v3.74.588 — أمر إنتاج بانتظار الاعتماد (مرحلة طلب)
    }
    try { await createNotification({ ...notificationBase, assignedToRole: "admin",           eventKey: `po_submitted_admin_${id}` }) } catch { /* non-critical */ }
    try { await createNotification({ ...notificationBase, assignedToRole: "owner",           eventKey: `po_submitted_owner_${id}` }) } catch { /* non-critical */ }
    try { await createNotification({ ...notificationBase, assignedToRole: "general_manager", eventKey: `po_submitted_gm_${id}`    }) } catch { /* non-critical */ }
    // v3.74.22 — branch manager was missing. They're the branch-level
    // authority for production orders raised at their branch and must
    // receive the approval request alongside the company executives.
    try { await createNotification({ ...notificationBase, assignedToRole: "manager",         eventKey: `po_submitted_mgr_${id}` }) } catch { /* non-critical */ }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
