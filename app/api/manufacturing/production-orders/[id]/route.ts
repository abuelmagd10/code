import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import { createNotification } from "@/lib/governance-layer"
import {
  assertProductionOrderAccessible,
  assertProductionOrderDeleteAllowed,
  assertProductionOrderEditable,
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadProductionOrderSnapshot,
  parseJsonBody,
  updateProductionOrderSchema,
} from "@/lib/manufacturing/production-order-api"
import {
  recordApprovalAction,
  buildApprovalSnapshot,
} from "@/lib/manufacturing/approval-history"
import { assertManufacturingOfficerOwnership } from "@/lib/manufacturing/bom-api"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, companyId, user, member } = await getManufacturingApiContext(request, "read")
    const order = await assertProductionOrderAccessible(supabase, companyId, id)
    assertManufacturingOfficerOwnership(order, member, user.id, "Production order not found")
    const snapshot = await loadProductionOrderSnapshot(supabase, companyId, id)

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
    const payload = await parseJsonBody(request, updateProductionOrderSchema)
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)
    assertManufacturingOfficerOwnership(existing, member, user.id, "Production order not found")

    assertProductionOrderEditable(existing)

    // ── Re-approval on edit (Phase R4) ───────────────────────
    const currentApprovalStatus = (existing as any).approval_status ?? "draft"
    const wasApproved = currentApprovalStatus === "approved"
    const reapprovalFields = wasApproved
      ? {
          approval_status: "pending_approval",
          cycle_no: ((existing as any).cycle_no ?? 1) + 1,
          po_approved_by: null,
          po_approved_at: null,
        }
      : {}

    const updateData: Record<string, unknown> = {
      updated_by: user.id,
      ...reapprovalFields,
    }

    if ("bom_id" in payload) {
      updateData.bom_id = payload.bom_id
      updateData.bom_version_id = payload.bom_version_id
    }
    if ("issue_warehouse_id" in payload) updateData.issue_warehouse_id = payload.issue_warehouse_id ?? null
    if ("receipt_warehouse_id" in payload) updateData.receipt_warehouse_id = payload.receipt_warehouse_id ?? null
    if ("order_uom" in payload) updateData.order_uom = payload.order_uom ?? null
    if ("planned_start_at" in payload) updateData.planned_start_at = payload.planned_start_at ?? null
    if ("planned_end_at" in payload) updateData.planned_end_at = payload.planned_end_at ?? null
    if ("notes" in payload) updateData.notes = payload.notes ?? null

    const { error } = await supabase
      .from("manufacturing_production_orders")
      .update(updateData)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("id")
      .single()

    if (error) throw error

    if (wasApproved) {
      const newCycleNo = ((existing as any).cycle_no ?? 1) + 1
      await recordApprovalAction({
        supabase, companyId,
        referenceType: "production_order",
        referenceId: id,
        cycleNo: newCycleNo,
        action: "edit_triggered_reapproval",
        actorId: user.id,
        actorRole: "manufacturing_officer",
        reason: "تعديل أمر الإنتاج بعد الموافقة أعاد دورة الاعتماد",
        snapshotData: buildApprovalSnapshot({
          statusBefore: "approved",
          statusAfter: "pending_approval",
          extraFields: { order_no: existing.order_no, edited_fields: Object.keys(payload) },
        }),
        branchId: existing.branch_id,
      })

      const notifBase = {
        companyId,
        referenceType: "manufacturing_production_order",
        referenceId: id,
        title: "🔄 إعادة اعتماد أمر إنتاج بعد تعديل",
        message: `أمر الإنتاج ${existing.order_no} تم تعديله — يحتاج إعادة اعتماد`,
        createdBy: user.id,
        branchId: existing.branch_id ?? undefined,
        priority: "high" as const,
        severity: "warning" as const,
        category: "approvals" as const,
      }
      try { await createNotification({ ...notifBase, assignedToRole: "admin",           eventKey: `po_reapproval_admin_${id}` }) } catch { /* non-critical */ }
      try { await createNotification({ ...notifBase, assignedToRole: "owner",           eventKey: `po_reapproval_owner_${id}` }) } catch { /* non-critical */ }
      try { await createNotification({ ...notifBase, assignedToRole: "general_manager", eventKey: `po_reapproval_gm_${id}`    }) } catch { /* non-critical */ }
    }

    const snapshot = await loadProductionOrderSnapshot(supabase, companyId, id)

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "manufacturing_production_orders",
      recordId: id,
      recordIdentifier: existing.order_no,
      oldData: {
        bom_id: existing.bom_id,
        bom_version_id: existing.bom_version_id,
        issue_warehouse_id: existing.issue_warehouse_id,
        receipt_warehouse_id: existing.receipt_warehouse_id,
        order_uom: existing.order_uom,
        planned_start_at: existing.planned_start_at,
        planned_end_at: existing.planned_end_at,
        notes: existing.notes,
      },
      newData: payload,
      reason: "Updated draft production order header",
    })

    return NextResponse.json({ success: true, data: snapshot })
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
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)
    assertManufacturingOfficerOwnership(existing, member, user.id, "Production order not found")

    assertProductionOrderDeleteAllowed(existing)

    const { data, error } = await supabase
      .from("manufacturing_production_orders")
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
      table: "manufacturing_production_orders",
      recordId: existing.id,
      recordIdentifier: existing.order_no,
      oldData: existing,
      reason: "Deleted draft manufacturing production order",
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
