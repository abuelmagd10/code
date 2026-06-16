/**
 * POST /api/customers/refund-requests/[id]/reject
 *
 * v3.74.183 — privileged role declines a customer-credit refund request.
 * Marks the row 'rejected' and notifies the requester so they can fix
 * and resubmit. Mirrors the vendor refund reject path (v3.74.177).
 */

import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"

const PRIVILEGED_ROLES = new Set(["owner", "admin", "general_manager"])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const rejectionReason = String(body?.rejectionReason || body?.reason || "").trim()

    if (!rejectionReason) {
      return NextResponse.json({ success: false, error: "Rejection reason is required" }, { status: 400 })
    }

    if (!PRIVILEGED_ROLES.has(String(context.member.role || ""))) {
      return NextResponse.json(
        { success: false, error: "Forbidden: only owner / admin / general_manager can reject" },
        { status: 403 }
      )
    }

    const admin = createServiceClient()

    const { data: req, error: selectErr } = await admin
      .from("customer_refund_requests")
      .select("id, status, source_type, customer_id, amount, currency, branch_id, cost_center_id, metadata, requested_by")
      .eq("id", id)
      .eq("company_id", context.companyId)
      .maybeSingle()

    if (selectErr || !req) {
      return NextResponse.json({ success: false, error: "Refund request not found" }, { status: 404 })
    }
    if (req.status !== "pending") {
      return NextResponse.json({ success: false, error: `Cannot reject a ${req.status} request` }, { status: 400 })
    }
    if (req.source_type !== "credit_refund") {
      return NextResponse.json({ success: false, error: "Wrong source_type for this endpoint" }, { status: 400 })
    }

    await admin
      .from("customer_refund_requests")
      .update({
        status: "rejected",
        rejected_by: context.user.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: rejectionReason,
      })
      .eq("id", id)
      .eq("company_id", context.companyId)

    // Notify the requester.
    try {
      const customerName = ((req.metadata as any) || {})?.customer_name || "العَميل"
      const amountText = `${Number(req.amount).toLocaleString()} ${req.currency || "EGP"}`
      await admin.rpc("create_notification", {
        p_company_id: context.companyId,
        p_reference_type: "customer_refund_request",
        p_reference_id: id,
        p_title: `تم رفض صرف الرَّصيد — ${customerName}`,
        p_message: `تم رفض طلب صرف رصيد عميل بقيمة ${amountText} للعميل "${customerName}". السبب: ${rejectionReason}`,
        p_created_by: context.user.id,
        p_branch_id: req.branch_id,
        p_cost_center_id: req.cost_center_id,
        p_warehouse_id: null,
        p_assigned_to_role: null,
        p_assigned_to_user: req.requested_by,
        p_priority: "high",
        p_event_key: `customer_refund_request:${id}:rejected:user:${req.requested_by}`,
        p_severity: "warning",
        p_category: "approvals",
      })
    } catch { /* notification optional */ }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[CUSTOMER_REFUND_REQUEST_REJECT]", error)
    return NextResponse.json({ success: false, error: error?.message || "Rejection failed" }, { status: 500 })
  }
}
