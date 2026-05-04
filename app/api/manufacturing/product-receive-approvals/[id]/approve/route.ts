/**
 * POST /api/manufacturing/product-receive-approvals/[id]/approve
 * اعتماد طلب استلام المنتج النهائي — يكمل أمر الإنتاج تلقائياً
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
        { success: false, error: "غير مصرح لك بالاعتماد. مخصص لمسؤولي المخزن والإدارة فقط" },
        { status: 403 }
      )
    }

    let notes: string | null = null
    try {
      const body = await request.json()
      notes = body?.notes ?? null
    } catch { /* body فارغ */ }

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
        { success: false, error: `لا يمكن الاعتماد — حالة الطلب الحالية: ${approval.status}` },
        { status: 422 }
      )
    }

    // تحديث حالة الاعتماد في أمر الإنتاج أولاً (قبل الإكمال الذرّي، لأن الإكمال يحول الأمر لحالة terminal)
    await admin
      .from("manufacturing_production_orders")
      .update({ product_receive_approval_status: "approved" })
      .eq("id", approval.production_order_id)
      .eq("company_id", companyId)

    // تحديث سجل الاعتماد
    await admin
      .from("manufacturing_product_receive_approvals")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        notes: notes ?? approval.notes,
      })
      .eq("id", id)

    // إكمال أمر الإنتاج ذرّياً (يغيّر الحالة لـ completed — لذلك يجب أن يكون آخراً)
    const { error: completeError } = await admin.rpc("complete_manufacturing_production_order_atomic", {
      p_company_id: companyId,
      p_production_order_id: approval.production_order_id,
      p_completed_by: user.id,
      p_completed_quantity: approval.proposed_quantity,
      p_completed_at: null,
    })

    if (completeError) throw completeError

    // إشعار لمقدم الطلب
    try {
      await createNotification({
        companyId,
        referenceType: "manufacturing_product_receive_approval",
        referenceId: id,
        title: "✅ تمت الموافقة على استلام المنتج",
        message: "تمت الموافقة على طلب استلام المنتج النهائي — تم إضافة المنتج للمستودع تلقائياً",
        createdBy: user.id,
        assignedToUser: approval.requested_by,
        priority: "high",
        severity: "info",
        category: "approvals",
        eventKey: `mpra_approved_${id}`,
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
      newData: { status: "approved", approved_by: user.id },
      reason: "Approved product receive request — production order completed",
    })

    return NextResponse.json({
      success: true,
      message: "تمت الموافقة على استلام المنتج وتم إكمال أمر الإنتاج",
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
