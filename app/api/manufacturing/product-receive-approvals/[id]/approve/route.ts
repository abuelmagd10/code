/**
 * POST /api/manufacturing/product-receive-approvals/[id]/approve
 * اعتماد طلب استلام المنتج النهائي — يسجل الاستلام ويغلق أمر التصنيع عند استلام كامل الكمية
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
      .select("id, order_no, status, planned_quantity, receipt_warehouse_id")
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

    const { data: previousReceiptLines, error: previousReceiptError } = await admin
      .from("production_order_receipt_lines")
      .select("received_qty")
      .eq("production_order_id", approval.production_order_id)
      .eq("company_id", companyId)

    if (previousReceiptError) throw previousReceiptError

    const plannedQty = Number(order.planned_quantity || 0)
    const alreadyReceivedQty = (previousReceiptLines || []).reduce(
      (sum: number, line: any) => sum + Number(line.received_qty || 0),
      0
    )
    const requestedQty = Number(approval.proposed_quantity || 0)
    const remainingQty = Math.max(0, plannedQty - alreadyReceivedQty)
    const isFullReceipt = plannedQty > 0 && requestedQty >= remainingQty - 0.0001

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
    let completeResult: any = null

    if (isFullReceipt) {
      const { error: operationsError } = await admin
        .from("manufacturing_production_order_operations")
        .update({
          status: "completed",
          completed_quantity: plannedQty,
          actual_start_at: approvedAt,
          actual_end_at: approvedAt,
          started_by: user.id,
          completed_by: user.id,
          updated_by: user.id,
        })
        .eq("production_order_id", approval.production_order_id)
        .eq("company_id", companyId)
        .neq("status", "completed")

      if (operationsError) throw operationsError

      const { data: completionData, error: completionError } = await admin.rpc("complete_manufacturing_production_order_atomic", {
        p_company_id: companyId,
        p_production_order_id: approval.production_order_id,
        p_completed_by: user.id,
        p_completed_quantity: plannedQty,
        p_completed_at: approvedAt,
      })

      if (completionError) throw completionError
      completeResult = completionData
    }

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
        p_message: isFullReceipt
          ? "تمت الموافقة على استلام كامل المنتج النهائي — تم إضافة المنتج للمستودع وإكمال أمر التصنيع"
          : "تمت الموافقة على طلب استلام المنتج النهائي — تم إضافة المنتج للمستودع",
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
      newData: { status: "approved", approved_by: user.id, auto_completed_order: isFullReceipt },
      reason: isFullReceipt
        ? "Approved full product receive request, posted finished-goods receipt, and auto-completed production order"
        : "Approved product receive request and posted finished-goods receipt",
    })

    return NextResponse.json({
      success: true,
      data: { receipt_result: receiptResult, complete_result: completeResult, auto_completed_order: isFullReceipt },
      message: isFullReceipt
        ? "تمت الموافقة على استلام كامل المنتج وتم إكمال أمر التصنيع تلقائياً"
        : "تمت الموافقة على استلام المنتج وتمت إضافة المنتج للمستودع",
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
