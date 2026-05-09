/**
 * POST /api/manufacturing/production-orders/[id]/request-product-receive
 * إنشاء طلب اعتماد استلام المنتج النهائي لأمر إنتاج قيد التنفيذ
 * يتطلب موافقة مسؤول المخزن قبل إضافة المنتج للمستودع
 */
import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertProductionOrderAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
} from "@/lib/manufacturing/production-order-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)

    // التحقق من الحالة: يجب أن يكون قيد التنفيذ
    if (existing.status !== "in_progress") {
      return NextResponse.json(
        { success: false, error: "يجب أن يكون أمر الإنتاج قيد التنفيذ (in_progress) لطلب اعتماد الاستلام" },
        { status: 422 }
      )
    }

    // التحقق من عدم وجود طلب اعتماد معلق
    if (existing.product_receive_approval_status === "pending") {
      return NextResponse.json(
        { success: false, error: "يوجد طلب اعتماد استلام معلق بالفعل لهذا الأمر" },
        { status: 409 }
      )
    }

    // قراءة الكمية والملاحظات
    let proposedQuantity: number = Number(existing.planned_quantity) || 0
    let notes: string | null = null
    try {
      const body = await request.json()
      if (body?.proposed_quantity) proposedQuantity = Number(body.proposed_quantity)
      notes = body?.notes ?? null
    } catch { /* body فارغ */ }

    if (proposedQuantity <= 0) {
      return NextResponse.json(
        { success: false, error: "يجب أن تكون الكمية المقترحة للاستلام أكبر من صفر" },
        { status: 422 }
      )
    }

    const plannedQty = Number(existing.planned_quantity) || 0
    if (proposedQuantity > plannedQty) {
      return NextResponse.json(
        { success: false, error: `لا يمكن أن تتجاوز الكمية المستلمة (${proposedQuantity}) الكمية المخططة (${plannedQty})` },
        { status: 422 }
      )
    }

    const receiptWarehouseId = existing.receipt_warehouse_id ?? existing.issue_warehouse_id ?? null
    let approvalBranchId = existing.branch_id ?? null
    if (receiptWarehouseId) {
      const { data: receiptWarehouse } = await admin
        .from("warehouses")
        .select("branch_id")
        .eq("id", receiptWarehouseId)
        .eq("company_id", companyId)
        .maybeSingle()

      approvalBranchId = receiptWarehouse?.branch_id ?? approvalBranchId
    }

    // إنشاء سجل الاعتماد
    const { data: approval, error: insertError } = await admin
      .from("manufacturing_product_receive_approvals")
      .insert({
        company_id: companyId,
        production_order_id: id,
        warehouse_id: receiptWarehouseId,
        branch_id: approvalBranchId,
        proposed_quantity: proposedQuantity,
        requested_by: user.id,
        notes,
        status: "pending",
      })
      .select("id")
      .single()

    if (insertError) throw insertError

    // تحديث حالة الاعتماد في أمر الإنتاج
    await admin
      .from("manufacturing_production_orders")
      .update({ product_receive_approval_status: "pending" })
      .eq("id", id)
      .eq("company_id", companyId)

    // إرسال إشعارات لمسؤولي المخزن — نستخدم admin.rpc مباشرةً لأن governance-layer يستخدم browser client
    const notifBase = {
      p_company_id: companyId,
      p_reference_type: "manufacturing_product_receive_approval",
      p_reference_id: approval.id,
      p_title: "📦 طلب اعتماد استلام منتج تصنيع",
      p_message: `طلب استلام المنتج النهائي للأمر ${existing.order_no} — الكمية: ${proposedQuantity}`,
      p_created_by: user.id,
      p_branch_id: approvalBranchId,
      p_warehouse_id: receiptWarehouseId,
      p_cost_center_id: null as string | null,
      p_assigned_to_user: null as string | null,
      p_priority: "high",
      p_severity: "warning",
      p_category: "approvals",
    }
    try {
      await admin.rpc("create_notification", { ...notifBase, p_assigned_to_role: "warehouse_manager", p_event_key: `mpra_request_wm_${approval.id}` })
    } catch { /* غير حرج */ }
    try {
      await admin.rpc("create_notification", { ...notifBase, p_assigned_to_role: "store_manager", p_event_key: `mpra_request_sm_${approval.id}` })
    } catch { /* غير حرج */ }

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "CREATE",
      table: "manufacturing_product_receive_approvals",
      recordId: approval.id,
      recordIdentifier: existing.order_no,
      newData: {
        production_order_id: id,
        status: "pending",
        proposed_quantity: proposedQuantity,
        warehouse_id: receiptWarehouseId,
        branch_id: approvalBranchId,
      },
      reason: "Requested product receive approval for production order",
    })

    return NextResponse.json({
      success: true,
      data: { approval_id: approval.id },
      message: "تم إرسال طلب الاعتماد لمسؤول المخزن",
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
