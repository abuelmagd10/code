import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { asyncAuditLog } from "@/lib/core"
import { createNotification } from "@/lib/governance-layer"
import {
  assertRoutingVersionAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
  parseJsonBody,
} from "@/lib/manufacturing/routing-api"
import {
  recordApprovalAction,
  getNextCycleNo,
  buildApprovalSnapshot,
} from "@/lib/manufacturing/approval-history"
import { archiveApprovalNotificationsForRecord } from "@/lib/notifications/archive-on-action"

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
    const version = await assertRoutingVersionAccessible(supabase, companyId, id)

    const { data, error } = await admin.rpc("reject_routing_version_atomic", {
      p_company_id:         companyId,
      p_routing_version_id: id,
      p_rejected_by:        user.id,
      p_rejection_reason:   payload.rejection_reason,
    })
    if (error) throw error

    // v3.74.18 — Archive pending approval-category notifications for this
    // workflow record now that the action is committed. Runs BEFORE any
    // follow-up "result" notification we send to the creator below, so the
    // new one isn't archived too.
    await archiveApprovalNotificationsForRecord({
      supabase: admin,
      companyId,
      referenceType: "manufacturing_routing_version",
      referenceId: id,
    })

    // ── approval_history ─────────────────────────────────────
    const cycleNo = await getNextCycleNo(supabase, companyId, "routing", id)
    await recordApprovalAction({
      supabase, companyId,
      referenceType: "routing",
      referenceId: id,
      cycleNo,
      action: "rejected",
      actorId: user.id,
      actorRole: "admin",
      reason: payload.rejection_reason,
      snapshotData: buildApprovalSnapshot({
        statusBefore: "pending_approval",
        statusAfter: "rejected",
        extraFields: { version_no: version.version_no },
      }),
      branchId: version.branch_id,
    })

    asyncAuditLog({
      companyId, userId: user.id, userEmail: user.email || undefined,
      action: "UPDATE", table: "manufacturing_routing_versions", recordId: id,
      recordIdentifier: `routing-version-${version.version_no}`,
      oldData: { approval_status: "pending_approval" },
      newData: { approval_status: "rejected", rejection_reason: payload.rejection_reason },
      reason: "Rejected routing version",
    })

    // إشعار مقدّم الطلب
    const submittedBy = (version as any).submitted_by
    if (submittedBy) {
      try {
        await createNotification({
          companyId,
          referenceType: "manufacturing_routing_version",
          referenceId: id,
          title: "❌ رُفضت نسخة مسار التصنيع",
          message: `رُفضت نسخة مسار التصنيع رقم ${version.version_no}${payload.rejection_reason ? ` — السبب: ${payload.rejection_reason}` : ""}`,
          createdBy: user.id,
          branchId: version.branch_id ?? undefined,
          assignedToUser: submittedBy,
          priority: "high",
          severity: "error",
          category: "approvals",
          eventKey: `rv_rejected_${id}`,
        })
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
