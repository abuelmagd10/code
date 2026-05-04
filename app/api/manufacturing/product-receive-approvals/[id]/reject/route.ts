/**
 * POST /api/manufacturing/product-receive-approvals/[id]/reject
 * رفض طلب استلام المنتج النهائي مع سبب إجباري
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

    if (!ALLOWED_APPROVER_ROLES.includes(member.role)) {
      return NextResponse.json(
        { success: false, error: "غير مصرح لك بالرفض. مخصص لمسؤولي المخزن والإدارة فقط" },
        { status: 403 }
      )
    }

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
    const { data: approval, error: fetchError } = await supabase
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

    // تحديث سجل الاعتماد
    await admin
      .from("manufacturing_product_receive_approvals")
      .update({
        status: "rejected",
        rejected_by: user.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: rejectionReason,
      })
      .eq("id", id)

    // تحديث حالة الاعتماد في أمر الإنتاج
    await admin
      .from("manufacturing_production_orders")
      .update({ product_receive_approval_status: "rejected" })
      .eq("id", approval.production_order_id)
      .eq("company_id", companyId)

    // إشعار لمقدم الطلب بالرفض
    try {
      await createNotification({
        companyId,
        referenceType: "manufacturing_product_receive_approval",
        referenceId: id,
        title: "❌ رُفض طلب استلام المنتج",
        message: `تم رفض طلب الاستلام — السبب: ${rejectionReason}`,
        createdBy: user.id,
        assignedToUser: approval.requested_by,
        priority: "high",
        severity: "error",
        category: "approvals",
        eventKey: `mpra_rejected_${id}`,
      })
    } catch { /* غير حرج */ }

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
