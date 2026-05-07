/**
 * POST /api/manufacturing/material-issue-approvals/[id]/reject
 * رفض طلب اعتماد صرف المواد — يُعيد الأمر لحالة "لا يوجد اعتماد"
 * مخصص لمسؤولي المخزن والإدارة
 */
import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  getManufacturingApiContext,
  handleManufacturingApiError,
} from "@/lib/manufacturing/production-order-api"
import { createNotification } from "@/lib/governance-layer"

const ALLOWED_APPROVER_ROLES = ["store_manager", "manager", "owner", "admin", "general_manager", "warehouse_manager"]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user, member } = await getManufacturingApiContext(request, "update")

    // ── التحقق من صلاحية
    if (!ALLOWED_APPROVER_ROLES.includes(member.role)) {
      return NextResponse.json(
        { success: false, error: "غير مصرح لك بالرفض. مخصص لمسؤولي المخزن والإدارة فقط" },
        { status: 403 }
      )
    }

    // ── قراءة سبب الرفض (مطلوب)
    let rejectionReason: string | null = null
    try {
      const body = await request.json()
      rejectionReason = body?.rejection_reason ?? body?.reason ?? null
    } catch { /* body فارغ */ }

    // ── جلب طلب الاعتماد
    const { data: approval, error: fetchError } = await supabase
      .from("manufacturing_material_issue_approvals")
      .select("id, status, production_order_id, requested_by")
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (fetchError || !approval) {
      return NextResponse.json({ success: false, error: "طلب الاعتماد غير موجود" }, { status: 404 })
    }

    if (approval.status !== "pending") {
      return NextResponse.json(
        { success: false, error: `لا يمكن الرفض — حالة الطلب الحالية: ${approval.status}` },
        { status: 422 }
      )
    }

    // ── 1. تحديث سجل الاعتماد
    const { error: updateApprovalError } = await admin
      .from("manufacturing_material_issue_approvals")
      .update({
        status: "rejected",
        rejected_by: user.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: rejectionReason,
      })
      .eq("id", id)

    if (updateApprovalError) throw updateApprovalError

    // ── 2. إعادة حالة أمر الإنتاج لـ 'none' ليمكن إعادة إرسال طلب جديد
    await admin
      .from("manufacturing_production_orders")
      .update({ material_issue_approval_status: "rejected" })
      .eq("id", approval.production_order_id)
      .eq("company_id", companyId)

    // ── 3. إشعار لمقدم الطلب بالرفض
    try {
      await createNotification({
        companyId,
        referenceType: "manufacturing_material_issue_approval",
        referenceId: id,
        title: "❌ رُفض طلب صرف المواد",
        message: `رُفض طلب صرف المواد${rejectionReason ? ` — السبب: ${rejectionReason}` : ""}`,
        createdBy: user.id,
        assignedToUser: approval.requested_by,
        priority: "high",
        severity: "error",
        category: "approvals",
        eventKey: `mmia_rejected_${id}`,
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
      newData: { status: "rejected", rejected_by: user.id, rejection_reason: rejectionReason },
      reason: "Rejected material issue request",
    })

    return NextResponse.json({
      success: true,
      message: "تم رفض طلب صرف المواد",
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
