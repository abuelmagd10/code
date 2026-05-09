/**
 * POST /api/manufacturing/product-receive-approvals/[id]/reject
 * رفض طلب استلام المنتج النهائي مع سبب إجباري
 */
import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertProductReceiveApprovalScope,
  getProductReceiveApprovalApiContext,
  handleManufacturingApiError,
} from "@/lib/manufacturing/product-receive-approval-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { admin, companyId, user, member } = await getProductReceiveApprovalApiContext(request)

    let rejectionReason: string | null = null
    try {
      const body = await request.json()
      rejectionReason = body?.rejection_reason?.trim() || null
    } catch { /* body فارغ */ }

    if (!rejectionReason) {
      return NextResponse.json(
        { success: false, error: "سبب الرفض مطلوب" },
        { status: 422 }
      )
    }

    // جلب طلب الاعتماد
    const { data: approval, error: fetchError } = await admin
      .from("manufacturing_product_receive_approvals")
      .select("*")
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

    assertProductReceiveApprovalScope(member, approval)

    // تحديث سجل الاعتماد
    const { error: approvalUpdateError } = await admin
      .from("manufacturing_product_receive_approvals")
      .update({
        status: "rejected",
        rejected_by: user.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: rejectionReason,
      })
      .eq("id", id)
      .eq("company_id", companyId)
    if (approvalUpdateError) throw approvalUpdateError

    // تحديث حالة الاعتماد في أمر الإنتاج
    const { error: orderStatusError } = await admin
      .from("manufacturing_production_orders")
      .update({ product_receive_approval_status: "rejected" })
      .eq("id", approval.production_order_id)
      .eq("company_id", companyId)
    if (orderStatusError) throw orderStatusError

    // إشعار لمقدم الطلب بالرفض — نستخدم admin.rpc مباشرةً
    try {
      await admin.rpc("create_notification", {
        p_company_id: companyId,
        p_reference_type: "manufacturing_product_receive_approval",
        p_reference_id: id,
        p_title: "❌ رُفض طلب استلام المنتج",
        p_message: `تم رفض طلب الاستلام — السبب: ${rejectionReason}`,
        p_created_by: user.id,
        p_assigned_to_user: approval.requested_by,
        p_assigned_to_role: null,
        p_branch_id: null,
        p_warehouse_id: null,
        p_cost_center_id: null,
        p_priority: "high",
        p_severity: "error",
        p_category: "approvals",
        p_event_key: `mpra_rejected_${id}`,
      })
    } catch { /* غير حرج */ }

    // إشعار الأدوار العليا بالرفض (owner و admin يرون كل الإشعارات تلقائياً فلا نكررها)
    const timestampSuffix = Date.now()
    for (const seniorRole of ["general_manager"]) {
      try {
        await admin.rpc("create_notification", {
          p_company_id: companyId,
          p_reference_type: "manufacturing_product_receive_approval",
          p_reference_id: id,
          p_title: "❌ رُفض طلب استلام منتج تصنيع",
          p_message: `تم رفض طلب الاستلام — السبب: ${rejectionReason}`,
          p_created_by: user.id,
          p_assigned_to_role: seniorRole,
          p_assigned_to_user: null,
          p_branch_id: null,
          p_warehouse_id: null,
          p_cost_center_id: null,
          p_priority: "high",
          p_severity: "error",
          p_category: "approvals",
          p_event_key: `mpra_rejected_${id}_${seniorRole}_${timestampSuffix}`,
        })
      } catch { /* غير حرج */ }
    }

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "UPDATE",
      table: "manufacturing_product_receive_approvals",
      recordId: id,
      recordIdentifier: String(approval.production_order_id),
      oldData: { status: "pending" },
      newData: { status: "rejected", rejected_by: user.id, rejection_reason: rejectionReason },
      reason: "Rejected product receive request",
    })

    return NextResponse.json({
      success: true,
      message: "تم رفض طلب الاستلام",
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
