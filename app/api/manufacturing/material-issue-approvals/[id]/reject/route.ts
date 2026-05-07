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
      .select("role")
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
      .select("id, status, production_order_id, requested_by")
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (fetchError || !approval) {
      return NextResponse.json({ success: false, error: "طلب الاعتماد غير موجود" }, { status: 404 })
    }

    if (approval.status !== "pending" && approval.status !== "partially_approved") {
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

    // ── 2. تحديث حالة أمر الإنتاج
    await admin
      .from("manufacturing_production_orders")
      .update({ material_issue_approval_status: "rejected" })
      .eq("id", approval.production_order_id)
      .eq("company_id", companyId)

    // ── 3. إشعار لمقدم الطلب بالرفض
    try {
      await admin.rpc("create_notification", {
        p_company_id: companyId,
        p_branch_id: null,
        p_assigned_to_role: null,
        p_assigned_to_user: approval.requested_by,
        p_title: "❌ رُفض طلب صرف المواد",
        p_message: `رُفض طلب صرف المواد${rejectionReason ? ` — السبب: ${rejectionReason}` : ""}`,
        p_reference_id: approval.production_order_id,
        p_reference_type: "manufacturing_material_issue_approval",
        p_created_by: user.id,
        p_priority: "high",
        p_severity: "error",
        p_category: "approvals",
        p_event_key: `mmia_rejected_${id}_${Date.now()}`,
      })
    } catch { /* الإشعار غير حرج */ }

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
