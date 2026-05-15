import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import { createNotification } from "@/lib/governance-layer"
import {
  assertBomVersionAccessible,
  assertBomVersionOwnershipForOfficer,
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadBomVersionSnapshot,
  parseJsonBody,
  updateBomVersionSchema,
} from "@/lib/manufacturing/bom-api"
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
    const { supabase, companyId, user, member } = await getManufacturingApiContext(request, "read")
    const version = await assertBomVersionAccessible(supabase, companyId, id)
    await assertBomVersionOwnershipForOfficer(supabase, companyId, version.bom_id, member, user.id)
    const snapshot = await loadBomVersionSnapshot(supabase, companyId, id)

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
    const { supabase, companyId, user, member } = await getManufacturingApiContext(request, "update")
    const payload = await parseJsonBody(request, updateBomVersionSchema)
    const existing = await assertBomVersionAccessible(supabase, companyId, id)
    await assertBomVersionOwnershipForOfficer(supabase, companyId, existing.bom_id, member, user.id)

    // ── Re-approval on edit (Phase R3) ───────────────────────
    // إذا كانت النسخة معتمدة وتم تعديلها → إعادة دورة الاعتماد
    const wasApproved = existing.status === "approved"
    const reapprovalFields = wasApproved
      ? {
          status: "pending_approval",
          cycle_no: ((existing as any).cycle_no ?? 1) + 1,
          approved_by: null,
          approved_at: null,
        }
      : {}

    const { data, error } = await supabase
      .from("manufacturing_bom_versions")
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

    // تسجيل إعادة الدورة في approval_history
    if (wasApproved) {
      const newCycleNo = ((existing as any).cycle_no ?? 1) + 1
      await recordApprovalAction({
        supabase, companyId,
        referenceType: "bom_version",
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

      // إشعار الأدوار العليا بإعادة الدورة
      const notifBase = {
        companyId,
        referenceType: "manufacturing_bom_version",
        referenceId: id,
        title: "🔄 إعادة اعتماد نسخة BOM بعد تعديل",
        message: `نسخة BOM رقم ${existing.version_no} تم تعديلها بعد الموافقة — تحتاج إعادة اعتماد`,
        createdBy: user.id,
        branchId: existing.branch_id ?? undefined,
        priority: "high" as const,
        severity: "warning" as const,
        category: "approvals" as const,
      }
      try { await createNotification({ ...notifBase, assignedToRole: "admin",           eventKey: `bom_v_reapproval_admin_${id}` }) } catch { /* non-critical */ }
      try { await createNotification({ ...notifBase, assignedToRole: "owner",           eventKey: `bom_v_reapproval_owner_${id}` }) } catch { /* non-critical */ }
      try { await createNotification({ ...notifBase, assignedToRole: "general_manager", eventKey: `bom_v_reapproval_gm_${id}`    }) } catch { /* non-critical */ }
    }

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "manufacturing_bom_versions",
      recordId: data.id,
      recordIdentifier: `bom-version-${data.version_no}`,
      oldData: {
        effective_from: existing.effective_from,
        effective_to: existing.effective_to,
        base_output_qty: existing.base_output_qty,
        change_summary: existing.change_summary,
        notes: existing.notes,
      },
      newData: payload,
      reason: "Updated manufacturing BOM version header",
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
    const { supabase, companyId, user, member } = await getManufacturingApiContext(request, "delete")
    const existing = await assertBomVersionAccessible(supabase, companyId, id)
    await assertBomVersionOwnershipForOfficer(supabase, companyId, existing.bom_id, member, user.id)

    const { data, error } = await supabase
      .from("manufacturing_bom_versions")
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
      table: "manufacturing_bom_versions",
      recordId: existing.id,
      recordIdentifier: `bom-version-${existing.version_no}`,
      oldData: existing,
      reason: "Deleted manufacturing BOM version",
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
