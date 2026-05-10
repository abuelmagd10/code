import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import { createNotification } from "@/lib/governance-layer"
import {
  assertBomVersionAccessible,
  assertBomVersionReadyForApproval,
  getManufacturingApiContext,
  handleManufacturingApiError,
} from "@/lib/manufacturing/bom-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const version = await assertBomVersionAccessible(supabase, companyId, id)

    await assertBomVersionReadyForApproval(admin, {
      companyId,
      bomVersionId: id,
    })

    const { data, error } = await admin.rpc("submit_manufacturing_bom_version_for_approval_atomic", {
      p_company_id: companyId,
      p_bom_version_id: id,
      p_submitted_by: user.id,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "manufacturing_bom_versions",
      recordId: id,
      recordIdentifier: `bom-version-${version.version_no}`,
      oldData: { status: version.status },
      newData: { status: "pending_approval", approval_request_id: data?.approval_request_id || null },
      reason: "Submitted manufacturing BOM version for approval",
    })

    // Notify approvers: manager + admin + general_manager
    const notificationBase = {
      companyId,
      referenceType: "manufacturing_bom_version",
      referenceId: id,
      title: "📋 طلب اعتماد نسخة BOM",
      message: `نسخة BOM رقم ${version.version_no} بانتظار اعتمادك — يرجى المراجعة والاعتماد`,
      createdBy: user.id,
      branchId: version.branch_id ?? undefined,
      priority: "high" as const,
      severity: "warning" as const,
      category: "approvals" as const,
    }
    try {
      await createNotification({ ...notificationBase, assignedToRole: "manager", eventKey: `bom_v_submitted_mgr_${id}` })
    } catch { /* non-critical */ }
    try {
      await createNotification({ ...notificationBase, assignedToRole: "admin", eventKey: `bom_v_submitted_admin_${id}` })
    } catch { /* non-critical */ }
    try {
      await createNotification({ ...notificationBase, assignedToRole: "general_manager", eventKey: `bom_v_submitted_gm_${id}` })
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
