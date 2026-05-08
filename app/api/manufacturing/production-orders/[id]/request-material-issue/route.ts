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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)

    // ── التحقق من حالة الأمر: يجب أن يكون مُصدراً أو قيد التنفيذ
    if (existing.status !== "released" && existing.status !== "in_progress") {
      return NextResponse.json(
        { success: false, error: "يجب أن يكون أمر الإنتاج في حالة 'مُصدر' أو 'قيد التنفيذ' لطلب اعتماد الصرف" },
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

    let approvalBranchId = existing.branch_id ?? null
    if (existing.issue_warehouse_id) {
      const { data: issueWarehouse } = await admin
        .from("warehouses")
        .select("branch_id")
        .eq("id", existing.issue_warehouse_id)
        .eq("company_id", companyId)
        .maybeSingle()

      approvalBranchId = issueWarehouse?.branch_id ?? approvalBranchId
    }

    // ── إنشاء سجل الاعتماد
    const { data: approval, error: insertError } = await admin
      .from("manufacturing_material_issue_approvals")
      .insert({
        company_id: companyId,
        production_order_id: id,
        warehouse_id: existing.issue_warehouse_id ?? null,
        branch_id: approvalBranchId,
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

    // ── إرسال إشعار لمسؤول المخزن (store_manager) والمالك (owner) ──
    // نستخدم admin client مباشرةً لأن governance-layer يستخدم browser client
    // ويفشل في سياق API route
    const notifBase = {
      p_company_id: companyId,
      p_reference_type: "manufacturing_material_issue_approval",
      // reference_id = approval.id حتى يفتح الإشعار صفحة تفاصيل اعتماد الصرف مباشرةً
      p_reference_id: approval.id,
      p_title: "🏭 طلب اعتماد صرف مواد خام",
      p_message: `طلب صرف مواد للأمر ${existing.order_no} — يتطلب موافقتك قبل بدء الإنتاج`,
      p_created_by: user.id,
      // branch_id = null عمداً: مسؤول المخزن قد يكون في فرع مختلف عن فرع أمر الإنتاج
      // ووضع branch_id خاطئ يمنع وصول الإشعار بسبب فلتر get_user_notifications
      p_branch_id: null as string | null,
      p_warehouse_id: existing.issue_warehouse_id ?? null,
      p_cost_center_id: null as string | null,
      p_assigned_to_user: null as string | null,
      p_priority: "high",
      p_severity: "warning",
      p_category: "approvals",
    }
    // إشعار لمسؤول المخزن (store_manager) — الدور الموجود فعلاً في قاعدة البيانات
    try {
      await admin.rpc("create_notification", {
        ...notifBase,
        p_assigned_to_role: "store_manager",
        p_event_key: `mmia_request_sm_${approval.id}`,
      })
    } catch { /* الإشعار غير حرج */ }
    // إشعار للمالك (owner) — دور احتياطي لضمان وصول الطلب
    try {
      await admin.rpc("create_notification", {
        ...notifBase,
        p_assigned_to_role: "owner",
        p_event_key: `mmia_request_owner_${approval.id}`,
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
      newData: { production_order_id: id, status: "pending", warehouse_id: existing.issue_warehouse_id, branch_id: approvalBranchId },
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
