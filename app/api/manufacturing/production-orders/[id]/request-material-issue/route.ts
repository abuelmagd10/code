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
import { notifyWarehouseStaff } from "@/lib/manufacturing/notification-helpers"

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

    const currentApprovalStatus = String(existing.material_issue_approval_status || "none")

    const { data: pendingApproval } = await admin
      .from("manufacturing_material_issue_approvals")
      .select("id")
      .eq("production_order_id", id)
      .eq("company_id", companyId)
      .eq("status", "pending")
      .maybeSingle()

    const { data: materialRequirements, error: requirementsError } = await admin
      .from("production_order_material_requirements")
      .select("id, gross_required_qty, approved_quantity, issued_quantity, is_optional")
      .eq("production_order_id", id)
      .eq("company_id", companyId)

    if (requirementsError) throw requirementsError

    const issueLines = (materialRequirements || []).filter((line: any) => !line.is_optional)
    const totalRemainingQty = issueLines.reduce((sum: number, line: any) => {
      const requiredQty = Number(line.gross_required_qty ?? 0)
      const approvedQty = Number(line.approved_quantity ?? 0)
      const issuedQty = Number(line.issued_quantity ?? 0)
      return sum + Math.max(0, requiredQty - Math.max(approvedQty, issuedQty))
    }, 0)

    const hasRequirementSnapshot = issueLines.length > 0

    // ── التحقق من عدم وجود طلب اعتماد قائم، ثم السماح بطلب المتبقي فقط إذا كان هناك صرف جزئي
    if (currentApprovalStatus === "pending") {
      return NextResponse.json(
        { success: false, error: "يوجد طلب اعتماد معلق بالفعل لهذا الأمر" },
        { status: 409 }
      )
    }
    if (pendingApproval) {
      return NextResponse.json(
        { success: false, error: "يوجد طلب اعتماد معلق بالفعل لهذا الأمر" },
        { status: 409 }
      )
    }
    if (hasRequirementSnapshot && totalRemainingQty <= 0) {
      return NextResponse.json(
        { success: false, error: "تم صرف جميع المواد الخام المطلوبة لهذا الأمر" },
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

    // ── warehouse-specific notification (R8.2) ─────────────────
    const notifBase = {
      p_company_id:       companyId,
      p_reference_type:   "manufacturing_material_issue_approval",
      p_reference_id:     approval.id,
      p_title:            "🏭 طلب اعتماد صرف مواد خام",
      p_message:          `طلب صرف مواد للأمر ${existing.order_no} — يتطلب موافقتك قبل بدء الإنتاج`,
      p_created_by:       user.id,
      p_branch_id:        approvalBranchId,
      p_warehouse_id:     existing.issue_warehouse_id ?? null,
      p_cost_center_id:   null as string | null,
      p_assigned_to_role: null as string | null,
      p_assigned_to_user: null as string | null,
      p_priority:         "high",
      p_severity:         "warning",
      p_category:         "approvals",
    }
    await notifyWarehouseStaff({
      admin, companyId,
      warehouseId:    existing.issue_warehouse_id ?? null,
      notifBase,
      eventKeyPrefix: "mmia_request",
      referenceId:    approval.id,
    })

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
