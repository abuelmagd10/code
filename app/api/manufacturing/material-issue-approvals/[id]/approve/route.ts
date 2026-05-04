/**
 * POST /api/manufacturing/material-issue-approvals/[id]/approve
 * اعتماد طلب صرف المواد — يبدأ تنفيذ أمر الإنتاج تلقائياً
 * مخصص لمسؤولي المخزن والإدارة
 */
import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  getManufacturingApiContext,
  handleManufacturingApiError,
} from "@/lib/manufacturing/production-order-api"
import { createNotification } from "@/lib/governance-layer"

const ALLOWED_APPROVER_ROLES = ["manager", "owner", "admin", "warehouse_manager"]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user, member } = await getManufacturingApiContext(request, "update")

    // ── التحقق من صلاحية المُعتمِد
    if (!ALLOWED_APPROVER_ROLES.includes(member.role)) {
      return NextResponse.json(
        { success: false, error: "غير مصرح لك بالاعتماد. مخصص لمسؤولي المخزن والإدارة فقط" },
        { status: 403 }
      )
    }

    // ── قراءة الملاحظات (اختياري)
    let notes: string | null = null
    try {
      const body = await request.json()
      notes = body?.notes ?? null
    } catch { /* body فارغ */ }

    // ── جلب طلب الاعتماد
    const { data: approval, error: fetchError } = await supabase
      .from("manufacturing_material_issue_approvals")
      .select("*, production_order:manufacturing_production_orders(id, order_no, status, branch_id, issue_warehouse_id, requested_by:manufacturing_production_orders(*))")
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (fetchError || !approval) {
      return NextResponse.json({ success: false, error: "طلب الاعتماد غير موجود" }, { status: 404 })
    }

    if (approval.status !== "pending") {
      return NextResponse.json(
        { success: false, error: `لا يمكن الاعتماد — حالة الطلب الحالية: ${approval.status}` },
        { status: 422 }
      )
    }

    // ── 1. تشغيل أمر الإنتاج (start_manufacturing_production_order_atomic)
    const { error: startError } = await admin.rpc("start_manufacturing_production_order_atomic", {
      p_company_id: companyId,
      p_production_order_id: approval.production_order_id,
      p_started_by: user.id,
      p_started_at: null,
    })

    if (startError) throw startError

    // ── 2. تحديث سجل الاعتماد
    const { error: updateApprovalError } = await admin
      .from("manufacturing_material_issue_approvals")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        notes: notes ?? approval.notes,
      })
      .eq("id", id)

    if (updateApprovalError) throw updateApprovalError

    // ── 3. تحديث حالة الاعتماد في أمر الإنتاج
    await admin
      .from("manufacturing_production_orders")
      .update({ material_issue_approval_status: "approved" })
      .eq("id", approval.production_order_id)
      .eq("company_id", companyId)

    // ── 4. إشعار لمقدم الطلب بالموافقة
    try {
      await createNotification({
        companyId,
        referenceType: "manufacturing_material_issue_approval",
        referenceId: id,
        title: "✅ تمت الموافقة على صرف المواد",
        message: `تمت الموافقة على طلب صرف المواد — أمر الإنتاج بدأ تلقائياً`,
        createdBy: user.id,
        assignedToUser: approval.requested_by,
        priority: "high",
        severity: "info",
        category: "approvals",
        eventKey: `mmia_approved_${id}`,
      })
    } catch { /* الإشعار غير حرج */ }

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "UPDATE",
      table: "manufacturing_material_issue_approvals",
      recordId: id,
      recordIdentifier: String(approval.production_order_id),
      oldData: { status: "pending" },
      newData: { status: "approved", approved_by: user.id },
      reason: "Approved material issue request — production order started",
    })

    return NextResponse.json({
      success: true,
      message: "تمت الموافقة على صرف المواد وتم بدء تنفيذ أمر الإنتاج",
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
