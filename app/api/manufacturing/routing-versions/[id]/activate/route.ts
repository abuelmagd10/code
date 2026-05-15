import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import { createNotification } from "@/lib/governance-layer"
import {
  ManufacturingApiError,
  assertRoutingVersionAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
} from "@/lib/manufacturing/routing-api"
import { assertRoutingVersionOwnershipForOfficer } from "@/lib/manufacturing/bom-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user, member } = await getManufacturingApiContext(request, "update")
    const version = await assertRoutingVersionAccessible(supabase, companyId, id)
    await assertRoutingVersionOwnershipForOfficer(supabase, companyId, version.routing_id, member, user.id)
    const { count: operationCount, error: operationsError } = await supabase
      .from("manufacturing_routing_operations")
      .select("id", { count: "exact", head: true })
      .eq("routing_version_id", id)
      .eq("company_id", companyId)

    if (operationsError) throw operationsError
    if ((operationCount || 0) <= 0) {
      throw new ManufacturingApiError(
        409,
        "لا يمكن تفعيل نسخة مسار التصنيع قبل إضافة عملية واحدة على الأقل وحفظها."
      )
    }

    // ── التحقق من الاعتماد (Phase R3) ───────────────────────
    // approval_status يجب أن يكون 'approved' قبل التفعيل
    const approvalStatus = (version as any).approval_status
    if (approvalStatus && approvalStatus !== "approved") {
      throw new ManufacturingApiError(
        409,
        approvalStatus === "pending_approval"
          ? "نسخة مسار التصنيع بانتظار الاعتماد — يجب انتظار موافقة الإدارة قبل التفعيل."
          : approvalStatus === "draft"
            ? "نسخة مسار التصنيع لم تُرسَل للاعتماد بعد — يرجى إرسالها للاعتماد أولاً."
            : `لا يمكن تفعيل النسخة — حالة الاعتماد: ${approvalStatus}`
      )
    }

    const { data, error } = await admin.rpc("activate_manufacturing_routing_version_atomic", {
      p_company_id: companyId,
      p_routing_version_id: id,
      p_updated_by: user.id,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "manufacturing_routing_versions",
      recordId: id,
      recordIdentifier: `routing-version-${version.version_no}`,
      oldData: { status: version.status },
      newData: {
        status: "active",
        previous_active_version_id: data?.previous_active_version_id || null,
      },
      reason: "Activated manufacturing routing version",
    })

    // Notify manager that routing version is now active
    try {
      await createNotification({
        companyId,
        referenceType: "manufacturing_routing_version",
        referenceId: id,
        title: "✅ نسخة مسار التصنيع نشطة",
        message: `نسخة مسار التصنيع رقم ${version.version_no} أصبحت نشطة ويمكن استخدامها في أوامر الإنتاج`,
        createdBy: user.id,
        branchId: version.branch_id ?? undefined,
        assignedToRole: "manager",
        priority: "normal",
        severity: "info",
        category: "approvals",
        eventKey: `routing_v_activated_mgr_${id}`,
      })
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
