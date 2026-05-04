/**
 * POST /api/manufacturing/production-orders/[id]/request-material-issue
 * إنشاء طلب اعتماد صرف المواد الخام لأمر إنتاج مُصدر
 * يتطلب موافقة مسؤول المخزن قبل تنفيذ الصرف الفعلي
 */
import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertProductionOrderAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
} from "@/lib/manufacturing/production-order-api"
import { createNotification } from "@/lib/governance-layer"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)

    // ── التحقق من حالة الأمر: يجب أن يكون مُصدراً (released)
    if (existing.status !== "released") {
      return NextResponse.json(
        { success: false, error: "يجب أن يكون أمر الإنتاج في حالة 'مُصدر' لطلب اعتماد الصرف" },
        { status: 422 }
      )
    }

    // ── التحقق من عدم وجود طلب اعتماد معلق مسبقاً
    if (existing.material_issue_approval_status === "pending") {
      return NextResponse.json(
        { success: false, error: "يوجد طلب اعتماد معلق بالفعل لهذا الأمر" },
        { status: 409 }
      )
    }

    // ── قراءة الملاحظات من الـ body (اختياري)
    let notes: string | null = null
    try {
      const body = await request.json()
      notes = body?.notes ?? null
    } catch { /* body فارغ - مقبول */ }

    // ── إنشاء سجل الاعتماد
    const { data: approval, error: insertError } = await admin
      .from("manufacturing_material_issue_approvals")
      .insert({
        company_id: companyId,
        production_order_id: id,
        warehouse_id: existing.issue_warehouse_id ?? null,
        branch_id: existing.branch_id ?? null,
        requested_by: user.id,
        notes,
        status: "pending",
      })
      .select("id")
      .single()

    if (insertError) throw insertError

    // ── تحديث حالة الاعتماد في أمر الإنتاج
    const { error: updateError } = await admin
      .from("manufacturing_production_orders")
      .update({ material_issue_approval_status: "pending" })
      .eq("id", id)
      .eq("company_id", companyId)

    if (updateError) throw updateError

    // ── إرسال إشعار لكلٍّ من مسؤول المخزن (warehouse_manager) والمدير (manager) ──
    // نُرسل إشعارَين منفصلَين لضمان وصول الطلب للدور الصحيح في كل منشأة
    const notificationPayload = {
      companyId,
      referenceType: "manufacturing_material_issue_approval",
      referenceId: approval.id,
      title: "🏭 طلب اعتماد صرف مواد خام",
      message: `طلب صرف مواد للأمر ${existing.order_no} — يتطلب موافقتك قبل بدء الإنتاج`,
      createdBy: user.id,
      branchId: existing.branch_id ?? undefined,
      warehouseId: existing.issue_warehouse_id ?? undefined,
      priority: "high" as const,
      severity: "warning" as const,
      category: "approvals" as const,
    }
    try {
      // إشعار لمسؤول المخزن (الدور الأكثر تخصصاً)
      await createNotification({
        ...notificationPayload,
        assignedToRole: "warehouse_manager",
        eventKey: `mmia_request_wm_${approval.id}`,
      })
    } catch { /* الإشعار غير حرج */ }
    try {
      // إشعار للمدير (دور احتياطي في حال لم يوجد warehouse_manager)
      await createNotification({
        ...notificationPayload,
        assignedToRole: "manager",
        eventKey: `mmia_request_mgr_${approval.id}`,
      })
    } catch { /* الإشعار غير حرج */ }

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "CREATE",
      table: "manufacturing_material_issue_approvals",
      recordId: approval.id,
      recordIdentifier: existing.order_no,
      newData: { production_order_id: id, status: "pending", warehouse_id: existing.issue_warehouse_id },
      reason: "Requested material issue approval for production order",
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
