/**
 * POST /api/manufacturing/material-issue-approvals/[id]/reject
 * رفض طلب اعتماد صرف المواد — يُعيد الأمر لحالة "مرفوض"
 * مخصص لمسؤولي المخزن والإدارة
 *
 * ملاحظة: لا نستخدم getManufacturingApiContext هنا لأنها تتحقق من صلاحية
 * manufacturing_boms وهي غير مرتبطة بعملية الاعتماد هنا.
 */
import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { archiveApprovalNotificationsForRecord } from "@/lib/notifications/archive-on-action"

const ALLOWED_APPROVER_ROLES = [
  "store_manager", "manager", "owner", "admin",
  "general_manager", "warehouse_manager",
]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // ── مصادقة المستخدم
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const companyIdParam = searchParams.get("company_id")
    const companyId = companyIdParam || await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ success: false, error: "No active company" }, { status: 404 })
    }

    // ── التحقق من الدور
    const { data: memberRow } = await supabase
      .from("company_members")
      .select("role, branch_id, warehouse_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .single()

    if (!memberRow || !ALLOWED_APPROVER_ROLES.includes(memberRow.role)) {
      return NextResponse.json(
        { success: false, error: "غير مصرح لك بالرفض. مخصص لمسؤولي المخزن والإدارة فقط" },
        { status: 403 }
      )
    }

    const admin = createServiceClient()

    // ── قراءة سبب الرفض
    let rejectionReason: string | null = null
    try {
      const body = await request.json()
      rejectionReason = body?.rejection_reason ?? body?.reason ?? null
    } catch { /* body فارغ */ }

    // ── جلب طلب الاعتماد
    const { data: approval, error: fetchError } = await admin
      .from("manufacturing_material_issue_approvals")
      .select("id, status, production_order_id, requested_by, warehouse_id, branch_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (fetchError || !approval) {
      return NextResponse.json({ success: false, error: "طلب الاعتماد غير موجود" }, { status: 404 })
    }

    const role = String(memberRow.role || "").trim().toLowerCase()
    const companyWideRoles = new Set(["owner", "admin", "general_manager", "manager"])
    if (!companyWideRoles.has(role)) {
      const scopedWarehouseId = memberRow.warehouse_id || null
      const scopedBranchId = memberRow.branch_id || null
      let approvalWarehouseBranchId: string | null = null

      if (approval.warehouse_id) {
        const { data: approvalWarehouse } = await admin
          .from("warehouses")
          .select("branch_id")
          .eq("id", approval.warehouse_id)
          .eq("company_id", companyId)
          .maybeSingle()
        approvalWarehouseBranchId = approvalWarehouse?.branch_id ?? null
      }

      const isInWarehouseScope = scopedWarehouseId && approval.warehouse_id === scopedWarehouseId
      const isInBranchScope = scopedBranchId && (
        approval.branch_id === scopedBranchId ||
        approvalWarehouseBranchId === scopedBranchId
      )

      if (!isInWarehouseScope && !isInBranchScope) {
        return NextResponse.json(
          { success: false, error: "لا يمكنك رفض طلب صرف مواد خارج نطاق فرعك أو مخزنك" },
          { status: 403 }
        )
      }
    }

    const REJECTABLE_STATUSES = ["pending", "management_approved", "partially_approved"]
    if (!REJECTABLE_STATUSES.includes(approval.status)) {
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

    // v3.74.18 — Archive pending approval-category notifications for this
    // workflow record now that the action is committed. Runs BEFORE any
    // follow-up "result" notification we send to the creator below, so the
    // new one isn't archived too.
    await archiveApprovalNotificationsForRecord({
      supabase: admin,
      companyId,
      referenceType: "manufacturing_material_issue_approval",
      referenceId: id,
    })

    // ── 2. تحديث حالة أمر الإنتاج
    await admin
      .from("manufacturing_production_orders")
      .update({ material_issue_approval_status: "rejected" })
      .eq("id", approval.production_order_id)
      .eq("company_id", companyId)

    // ── 3. جلب بيانات أمر الإنتاج (للمستودع والفرع)
    const { data: productionOrder } = await admin
      .from("manufacturing_production_orders")
      .select("id, order_no, branch_id, issue_warehouse_id")
      .eq("id", approval.production_order_id)
      .single()

    const rejectMsg = `رُفض طلب صرف المواد${productionOrder?.order_no ? ` — أمر إنتاج: ${productionOrder.order_no}` : ""}${rejectionReason ? ` — السبب: ${rejectionReason}` : ""}`

    // ── 4. إشعار لمقدم الطلب بالرفض
    try {
      await admin.rpc("create_notification", {
        p_company_id: companyId,
        p_branch_id: null,
        p_assigned_to_role: null,
        p_assigned_to_user: approval.requested_by,
        p_title: "❌ رُفض طلب صرف المواد",
        p_message: rejectMsg,
        p_reference_id: id,
        p_reference_type: "manufacturing_material_issue_approval",
        p_created_by: user.id,
        p_priority: "high",
        p_severity: "error",
        p_category: "approvals",
        p_event_key: `mmia_rejected_${id}`,
      })
    } catch { /* الإشعار غير حرج */ }

    // ── 5. إشعار محاسب الفرع التابع للمستودع
      // resolve warehouse branch: try issue_warehouse_id → approval.warehouse_id → production order branch
      const warehouseIdToResolve = productionOrder?.issue_warehouse_id || (approval as any).warehouse_id
      let warehouseBranchId: string | null = null
      if (warehouseIdToResolve) {
        const { data: wh, error: whErr } = await admin
          .from("warehouses")
          .select("branch_id")
          .eq("id", warehouseIdToResolve)
          .single()
        if (whErr) console.error(`[MMIA_REJECT] Warehouse lookup error:`, whErr.message)
        warehouseBranchId = wh?.branch_id ?? null
      }
      const accountantBranchId = warehouseBranchId || productionOrder?.branch_id || null
      console.log(`[MMIA_REJECT] Branch resolution: warehouseId=${warehouseIdToResolve}, warehouseBranchId=${warehouseBranchId}, productionOrder.branch_id=${productionOrder?.branch_id}, accountantBranchId=${accountantBranchId}`)

      if (accountantBranchId) {
        const { data: notifData, error: notifErr } = await admin.rpc("create_notification", {
          p_company_id: companyId,
          p_branch_id: accountantBranchId,
          p_assigned_to_role: "accountant",
          p_assigned_to_user: null,
          p_title: "❌ رُفض طلب صرف مواد تصنيع",
          p_message: rejectMsg,
          p_reference_id: id,
          p_reference_type: "manufacturing_material_issue_approval",
          p_created_by: user.id,
          p_priority: "high",
          p_severity: "warning",
          p_category: "approvals",
          p_event_key: `mmia_rejected_${id}_accountant`,
        })
        if (notifErr) console.error(`[MMIA_REJECT] ❌ Accountant notification error:`, notifErr.message)
        else console.log(`[MMIA_REJECT] ✅ Accountant notification sent: branch=${accountantBranchId}, id=${notifData}`)
      } else {
        console.warn(`[MMIA_REJECT] ⚠️ No branch resolved for accountant notification`)
      }
    // ── 6. إشعار الأدوار العليا بالرفض (owner و admin يرون كل الإشعارات تلقائياً)
    {
      for (const seniorRole of ["general_manager"]) {
        try {
          await admin.rpc("create_notification", {
            p_company_id: companyId,
            p_branch_id: accountantBranchId,
            p_assigned_to_role: seniorRole,
            p_assigned_to_user: null,
            p_title: "❌ رُفض طلب صرف مواد تصنيع",
            p_message: rejectMsg,
            p_reference_id: id,
            p_reference_type: "manufacturing_material_issue_approval",
            p_created_by: user.id,
            p_priority: "high",
            p_severity: "error",
            p_category: "approvals",
            p_event_key: `mmia_rejected_${id}_${seniorRole}`,
          })
        } catch { /* غير حرج */ }
      }
    }

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "UPDATE",
      table: "manufacturing_material_issue_approvals",
      recordId: id,
      recordIdentifier: String(approval.production_order_id),
      oldData: { status: approval.status },
      newData: { status: "rejected", rejected_by: user.id, rejection_reason: rejectionReason },
      reason: "Rejected material issue request",
    })

    return NextResponse.json({
      success: true,
      message: "تم رفض طلب صرف المواد",
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    )
  }
}
