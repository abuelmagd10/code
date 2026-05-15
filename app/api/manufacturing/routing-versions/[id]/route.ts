import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import { createNotification } from "@/lib/governance-layer"
import {
  assertRoutingVersionAccessible,
  assertRoutingVersionDeleteAllowed,
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadRoutingVersionSnapshot,
  parseJsonBody,
  updateRoutingVersionSchema,
} from "@/lib/manufacturing/routing-api"
import {
  recordApprovalAction,
  buildApprovalSnapshot,
} from "@/lib/manufacturing/approval-history"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, companyId } = await getManufacturingApiContext(request, "read")
    const snapshot = await loadRoutingVersionSnapshot(supabase, companyId, id)

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
    const payload = await parseJsonBody(request, updateRoutingVersionSchema)
    const existing = await assertRoutingVersionAccessible(supabase, companyId, id)

    // ── Re-approval on edit (Phase R3) ───────────────────────
    const currentApprovalStatus = (existing as any).approval_status ?? "draft"
    const wasApproved = currentApprovalStatus === "approved"
    const reapprovalFields = wasApproved
      ? {
          approval_status: "pending_approval",
          cycle_no: ((existing as any).cycle_no ?? 1) + 1,
          approved_by: null,
          approved_at: null,
        }
      : {}

    const { data, error } = await supabase
      .from("manufacturing_routing_versions")
      .update({
        ...payload,
        ...reapprovalFields,
        updated_by: user.id,
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single()

    if (error) throw error

    if (wasApproved) {
      const newCycleNo = ((existing as any).cycle_no ?? 1) + 1
      await recordApprovalAction({
        supabase, companyId,
        referenceType: "routing",
        referenceId: id,
        cycleNo: newCycleNo,
        action: "edit_triggered_reapproval",
        actorId: user.id,
        actorRole: "manufacturing_officer",
        reason: "تعديل النسخة بعد الموافقة أعاد دورة الاعتماد",
        snapshotData: buildApprovalSnapshot({
          statusBefore: "approved",
          statusAfter: "pending_approval",
          extraFields: { version_no: existing.version_no, edited_fields: Object.keys(payload) },
        }),
        branchId: existing.branch_id,
      })

      const notifBase = {
        companyId,
        referenceType: "manufacturing_routing_version",
        referenceId: id,
        title: "🔄 إعادة اعتماد نسخة مسار تصنيع بعد تعديل",
        message: `نسخة مسار التصنيع رقم ${existing.version_no} تم تعديلها — تحتاج إعادة اعتماد`,
        createdBy: user.id,
        branchId: existing.branch_id ?? undefined,
        priority: "high" as const,
        severity: "warning" as const,
        category: "approvals" as const,
      }
      try { await createNotification({ ...notifBase, assignedToRole: "admin",           eventKey: `rv_reapproval_admin_${id}` }) } catch { /* non-critical */ }
      try { await createNotification({ ...notifBase, assignedToRole: "owner",           eventKey: `rv_reapproval_owner_${id}` }) } catch { /* non-critical */ }
      try { await createNotification({ ...notifBase, assignedToRole: "general_manager", eventKey: `rv_reapproval_gm_${id}`    }) } catch { /* non-critical */ }
    }

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "manufacturing_routing_versions",
      recordId: data.id,
      recordIdentifier: `routing-version-${data.version_no}`,
      oldData: {
        effective_from: existing.effective_from,
        effective_to: existing.effective_to,
        change_summary: existing.change_summary,
        notes: existing.notes,
      },
      newData: payload,
      reason: "Updated manufacturing routing version header",
    })

    return NextResponse.json({ success: true, data })
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
    const existing = await assertRoutingVersionAccessible(supabase, companyId, id)

    assertRoutingVersionDeleteAllowed(existing)

    const { data, error } = await supabase
      .from("manufacturing_routing_versions")
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
      table: "manufacturing_routing_versions",
      recordId: existing.id,
      recordIdentifier: `routing-version-${existing.version_no}`,
      oldData: existing,
      reason: "Deleted manufacturing routing version",
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
