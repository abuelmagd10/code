/**
 * POST /api/manufacturing/material-issue-approvals/[id]/management-approve
 * المرحلة الأولى من اعتماد صرف المواد — موافقة الإدارة
 *
 * - يتحقق أن الطلب في حالة pending
 * - يُحدِّث status → management_approved ويُسجل management_approved_by/at
 * - يُرسل إشعاراً لمسؤولي المخزن لإتمام المرحلة الثانية
 * - لا يصدر مواد من المخزن (الإصدار في المرحلة الثانية /approve)
 *
 * الأدوار المسموح لها: admin, owner, general_manager, manager
 */
import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { notifyWarehouseStaff } from "@/lib/manufacturing/notification-helpers"
import {
  recordApprovalAction,
  buildApprovalSnapshot,
} from "@/lib/manufacturing/approval-history"

const MANAGEMENT_ROLES = ["admin", "owner", "general_manager", "manager"]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    // ── التحقق من الدور ────────────────────────────────────────
    const { data: memberRow } = await supabase
      .from("company_members")
      .select("role, branch_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .single()

    if (!memberRow || !MANAGEMENT_ROLES.includes(String(memberRow.role || "").toLowerCase())) {
      return NextResponse.json(
        { success: false, error: "غير مصرح — مخصص للإدارة العليا فقط (admin, owner, general_manager, manager)" },
        { status: 403 }
      )
    }

    const admin = createServiceClient()

    // ── قراءة الملاحظات ───────────────────────────────────────
    let notes: string | null = null
    try {
      const body = await request.json()
      notes = body?.notes ?? null
    } catch { /* body فارغ */ }

    // ── جلب الطلب ────────────────────────────────────────────
    const { data: approval, error: fetchError } = await admin
      .from("manufacturing_material_issue_approvals")
      .select("id, status, production_order_id, requested_by, warehouse_id, branch_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (fetchError || !approval) {
      return NextResponse.json({ success: false, error: "طلب الاعتماد غير موجود" }, { status: 404 })
    }

    if (approval.status !== "pending") {
      return NextResponse.json(
        { success: false, error: `لا يمكن اعتماد الإدارة — حالة الطلب الحالية: ${approval.status}` },
        { status: 422 }
      )
    }

    // ── اعتماد المرحلة الأولى ─────────────────────────────────
    const { error: updateError } = await admin
      .from("manufacturing_material_issue_approvals")
      .update({
        status:                   "management_approved",
        management_approved_by:   user.id,
        management_approved_at:   new Date().toISOString(),
        management_approved_notes: notes,
      })
      .eq("id", id)

    if (updateError) throw updateError

    // جلب بيانات أمر الإنتاج للإشعار
    const { data: productionOrder } = await admin
      .from("manufacturing_production_orders")
      .select("id, order_no, branch_id, issue_warehouse_id")
      .eq("id", approval.production_order_id)
      .single()

    // تسجيل في approval_history
    try {
      await recordApprovalAction({
        supabase: admin, companyId,
        referenceType: "material_issue",
        referenceId: id,
        cycleNo: 1,
        action: "approved_management",
        actorId: user.id,
        actorRole: memberRow.role,
        reason: notes || "موافقة الإدارة على صرف المواد — المرحلة الأولى",
        snapshotData: buildApprovalSnapshot({
          statusBefore: "pending",
          statusAfter: "management_approved",
          extraFields: { order_no: productionOrder?.order_no },
        }),
        branchId: approval.branch_id || productionOrder?.branch_id || null,
      })
    } catch { /* approval_history غير حرج */ }

    // ── إشعار warehouse-specific (R8.2) ────────────────────────
    const effectiveWarehouseId = approval.warehouse_id || productionOrder?.issue_warehouse_id || null
    const notifBase = {
      p_company_id:       companyId,
      p_reference_type:   "manufacturing_material_issue_approval",
      p_reference_id:     id,
      p_title:            "✅ موافقة الإدارة — طلب صرف مواد تصنيع",
      p_message:          `أمر الإنتاج ${productionOrder?.order_no || ""} — وافقت الإدارة على الصرف. يرجى مراجعة المخزون وإتمام الاعتماد`,
      p_created_by:       user.id,
      p_branch_id:        approval.branch_id || productionOrder?.branch_id || null,
      p_warehouse_id:     effectiveWarehouseId,
      p_cost_center_id:   null as string | null,
      p_assigned_to_role: null as string | null,
      p_assigned_to_user: null as string | null,
      p_priority:         "high",
      p_severity:         "info",
      p_category:         "approvals",
    }
    // إرسال لمسؤولي المخزن المحدد فقط (warehouse-specific routing)
    await notifyWarehouseStaff({
      admin, companyId,
      warehouseId:    effectiveWarehouseId,
      notifBase,
      eventKeyPrefix: "mmia_mgmt_approved",
      referenceId:    id,
    })

    // إشعار لمقدم الطلب
    if (approval.requested_by) {
      try {
        await admin.rpc("create_notification", {
          ...notifBase,
          p_title:           "✅ الإدارة وافقت على طلب صرف المواد",
          p_message:         `تمت موافقة الإدارة على صرف مواد أمر الإنتاج ${productionOrder?.order_no || ""} — بانتظار اعتماد مسؤول المخزن`,
          p_assigned_to_role: null,
          p_assigned_to_user: approval.requested_by,
          p_event_key:        `mmia_mgmt_approved_req_${id}`,
        })
      } catch { /* non-critical */ }
    }

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "UPDATE",
      table: "manufacturing_material_issue_approvals",
      recordId: id,
      recordIdentifier: String(approval.production_order_id),
      oldData: { status: "pending" },
      newData: { status: "management_approved", management_approved_by: user.id },
      reason: "Management Stage 1 approval for material issue request",
    })

    return NextResponse.json({
      success: true,
      message: "تمت موافقة الإدارة على طلب الصرف — بانتظار اعتماد مسؤول المخزن",
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    )
  }
}
