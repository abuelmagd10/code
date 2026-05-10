/**
 * POST /api/manufacturing/product-receive-approvals/[id]/approve
 * اعتماد طلب استلام المنتج النهائي — يسجل استلام المنتج في المخزون
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

    let notes: string | null = null
    try {
      const body = await request.json()
      notes = body?.notes ?? null
    } catch { /* body فارغ */ }

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
        { success: false, error: `لا يمكن الاعتماد — حالة الطلب الحالية: ${approval.status}` },
        { status: 422 }
      )
    }

    assertProductReceiveApprovalScope(member, approval)

    const { data: order, error: orderError } = await admin
      .from("manufacturing_production_orders")
      .select("id, order_no, status, receipt_warehouse_id")
      .eq("id", approval.production_order_id)
      .eq("company_id", companyId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ success: false, error: "أمر التصنيع غير موجود" }, { status: 404 })
    }

    if (order.status !== "in_progress") {
      return NextResponse.json(
        { success: false, error: `لا يمكن اعتماد الاستلام — حالة أمر التصنيع الحالية: ${order.status}` },
        { status: 422 }
      )
    }

    if (!order.receipt_warehouse_id) {
      return NextResponse.json(
        { success: false, error: "أمر التصنيع لا يحتوي على مخزن استلام للمنتج النهائي" },
        { status: 422 }
      )
    }

    const { data: receiptResult, error: receiptError } = await admin.rpc("receipt_manufacturing_production_order_output_atomic", {
      p_company_id: companyId,
      p_production_order_id: approval.production_order_id,
      p_posted_by: user.id,
      p_received_qty: approval.proposed_quantity,
      p_posted_at: null,
      p_notes: notes ?? approval.notes,
      p_command_key: `mpra_${id}`,
    })

    if (receiptError) throw receiptError

    const approvedAt = new Date().toISOString()

    // تحديث سجل الاعتماد بعد نجاح حركة المخزون
    const { error: approvalUpdateError } = await admin
      .from("manufacturing_product_receive_approvals")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: approvedAt,
        notes: notes ?? approval.notes,
      })
      .eq("id", id)
      .eq("company_id", companyId)
    if (approvalUpdateError) throw approvalUpdateError

    const { error: orderStatusError } = await admin
      .from("manufacturing_production_orders")
      .update({ product_receive_approval_status: "approved" })
      .eq("id", approval.production_order_id)
      .eq("company_id", companyId)
    if (orderStatusError) throw orderStatusError

    // إشعار لمقدم الطلب — نستخدم admin.rpc مباشرةً
    try {
      await admin.rpc("create_notification", {
        p_company_id: companyId,
        p_reference_type: "manufacturing_product_receive_approval",
        p_reference_id: id,
        p_title: "✅ تمت الموافقة على استلام المنتج",
        p_message: "تمت الموافقة على طلب استلام المنتج النهائي — تم إضافة المنتج للمستودع",
        p_created_by: user.id,
        p_assigned_to_user: approval.requested_by,
        p_assigned_to_role: null,
        p_branch_id: approval.branch_id ?? null,
        p_warehouse_id: approval.warehouse_id ?? null,
        p_cost_center_id: null,
        p_priority: "high",
        p_severity: "info",
        p_category: "approvals",
        p_event_key: `mpra_approved_${id}`,
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
      reason: "Approved product receive request and posted finished-goods receipt",
    })

    return NextResponse.json({
      success: true,
      data: { receipt_result: receiptResult },
      message: "تمت الموافقة على استلام المنتج وتمت إضافة المنتج للمستودع",
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
