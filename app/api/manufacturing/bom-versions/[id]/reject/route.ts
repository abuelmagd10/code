import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import { createNotification } from "@/lib/governance-layer"
import {
  assertBomVersionAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
  parseJsonBody,
  rejectBomVersionSchema,
} from "@/lib/manufacturing/bom-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "approve")
    const payload = await parseJsonBody(request, rejectBomVersionSchema)
    const version = await assertBomVersionAccessible(supabase, companyId, id)

    const { data, error } = await admin.rpc("reject_manufacturing_bom_version_atomic", {
      p_company_id: companyId,
      p_bom_version_id: id,
      p_rejected_by: user.id,
      p_rejection_reason: payload.rejection_reason,
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
      newData: { status: "rejected", rejection_reason: payload.rejection_reason },
      reason: "Rejected manufacturing BOM version",
    })

    // Notify submitter that their BOM version was rejected
    if (version.submitted_by) {
      try {
        await createNotification({
          companyId,
          referenceType: "manufacturing_bom_version",
          referenceId: id,
          title: "❌ رُفضت نسخة BOM",
          message: `رُفضت نسخة BOM رقم ${version.version_no}${payload.rejection_reason ? ` — السبب: ${payload.rejection_reason}` : ""}`,
          createdBy: user.id,
          branchId: version.branch_id ?? undefined,
          assignedToUser: version.submitted_by,
          priority: "high",
          severity: "error",
          category: "approvals",
          eventKey: `bom_v_rejected_${id}`,
        })
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
