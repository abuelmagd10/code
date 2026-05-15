import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import { createNotification } from "@/lib/governance-layer"
import {
  assertRoutingVersionAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
} from "@/lib/manufacturing/routing-api"
import { assertRoutingVersionOwnershipForOfficer } from "@/lib/manufacturing/bom-api"
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
    const { supabase, admin, companyId, user, member } = await getManufacturingApiContext(request, "update")
    const version = await assertRoutingVersionAccessible(supabase, companyId, id)
    await assertRoutingVersionOwnershipForOfficer(supabase, companyId, version.routing_id, member, user.id)

    // يجب أن تكون في حالة draft أو rejected
    const currentApprovalStatus = (version as any).approval_status ?? "draft"
    if (!["draft", "rejected"].includes(currentApprovalStatus)) {
      return NextResponse.json(
        { error: `لا يمكن إرسال النسخة للاعتماد — الحالة الحالية: ${currentApprovalStatus}` },
        { status: 409 }
      )
    }

    const { data, error } = await admin.rpc("submit_routing_version_for_approval_atomic", {
      p_company_id:         companyId,
      p_routing_version_id: id,
      p_submitted_by:       user.id,
    })
    if (error) throw error

    // ── approval_history ─────────────────────────────────────
    const cycleNo = await getNextCycleNo(supabase, companyId, "routing", id)
    const isResubmit = currentApprovalStatus === "rejected"
    await recordApprovalAction({
      supabase, companyId,
      referenceType: "routing",
      referenceId: id,
      cycleNo,
      action: isResubmit ? "re_submitted" : "submitted",
      actorId: user.id,
      actorRole: "manufacturing_officer",
      snapshotData: buildApprovalSnapshot({
        statusBefore: currentApprovalStatus,
        statusAfter: "pending_approval",
        extraFields: { version_no: version.version_no },
      }),
      branchId: version.branch_id,
    })

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "manufacturing_routing_versions",
      recordId: id,
      recordIdentifier: `routing-version-${version.version_no}`,
      oldData: { approval_status: currentApprovalStatus },
      newData: { approval_status: "pending_approval" },
      reason: "Submitted routing version for approval",
    })

    // إشعار الأدوار العليا
    const notificationBase = {
      companyId,
      referenceType: "manufacturing_routing_version",
      referenceId: id,
      title: "📋 طلب اعتماد نسخة مسار التصنيع",
      message: `نسخة مسار التصنيع رقم ${version.version_no} بانتظار اعتمادك`,
      createdBy: user.id,
      branchId: version.branch_id ?? undefined,
      priority: "high" as const,
      severity: "warning" as const,
      category: "approvals" as const,
    }
    try { await createNotification({ ...notificationBase, assignedToRole: "admin",           eventKey: `rv_submitted_admin_${id}` }) } catch { /* non-critical */ }
    try { await createNotification({ ...notificationBase, assignedToRole: "owner",           eventKey: `rv_submitted_owner_${id}` }) } catch { /* non-critical */ }
    try { await createNotification({ ...notificationBase, assignedToRole: "general_manager", eventKey: `rv_submitted_gm_${id}`    }) } catch { /* non-critical */ }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
