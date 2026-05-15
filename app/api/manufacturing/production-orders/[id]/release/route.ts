import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import { createNotification } from "@/lib/governance-layer"
import {
  assertProductionOrderAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadProductionOrderSnapshot,
  parseOptionalJsonBody,
  releaseProductionOrderSchema,
  ManufacturingApiError,
} from "@/lib/manufacturing/production-order-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const payload = await parseOptionalJsonBody(request, releaseProductionOrderSchema)
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)

    // يجب أن تكون approval_status = 'approved' قبل الإصدار
    const approvalStatus = (existing as any).approval_status
    if (approvalStatus && approvalStatus !== "approved") {
      throw new ManufacturingApiError(
        409,
        `لا يمكن إصدار أمر الإنتاج قبل اعتماده — حالة الاعتماد: ${approvalStatus}`
      )
    }

    const { data, error } = await admin.rpc("release_manufacturing_production_order_atomic", {
      p_company_id: companyId,
      p_production_order_id: id,
      p_updated_by: user.id,
      p_released_at: payload.released_at ?? null,
    })

    if (error) throw error

    const snapshot = await loadProductionOrderSnapshot(supabase, companyId, id)

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "manufacturing_production_orders",
      recordId: id,
      recordIdentifier: existing.order_no,
      oldData: { status: existing.status },
      newData: { status: "released" },
      reason: "Released manufacturing production order",
    })

    // Notify production manager + manager that order is released and ready to start
    const releaseBase = {
      companyId,
      referenceType: "manufacturing_production_order",
      referenceId: id,
      title: "🚀 أمر إنتاج جاهز للتنفيذ",
      message: `أمر الإنتاج ${existing.order_no} تم إصداره وأصبح جاهزاً لبدء التصنيع`,
      createdBy: user.id,
      branchId: existing.branch_id ?? undefined,
      priority: "normal" as const,
      severity: "info" as const,
      category: "approvals" as const,
    }
    try {
      await createNotification({ ...releaseBase, assignedToRole: "manager", eventKey: `po_released_mgr_${id}` })
    } catch { /* non-critical */ }

    return NextResponse.json({
      success: true,
      data: snapshot,
      meta: {
        command_result: data,
      },
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
