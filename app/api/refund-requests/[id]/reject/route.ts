/**
 * v3.74.253 — POST /api/refund-requests/[id]/reject
 * Owner / GM rejects a refund request.
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { notifyRefundRequestRejected } from "@/lib/refund-request-notifications"

const APPROVER_ROLES = new Set(["owner", "general_manager"])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  const role = String(context.member?.role || "").toLowerCase()
  if (!APPROVER_ROLES.has(role)) {
    return NextResponse.json(
      { success: false, error: "Only the owner or general manager can reject refund requests" },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const reason = (body?.reason || "").toString().trim() || null
    const admin = createServiceClient()

    const { data: req } = await admin
      .from("refund_requests")
      .select("id, status, source_type, source_id, branch_id, requested_by, amount")
      .eq("id", id)
      .eq("company_id", context.companyId)
      .maybeSingle()
    if (!req) return NextResponse.json({ success: false, error: "Refund request not found" }, { status: 404 })
    if (String(req.status).toLowerCase() !== "pending_approval") {
      return NextResponse.json(
        { success: false, error: "Only pending requests can be rejected" },
        { status: 409 }
      )
    }

    await admin
      .from("refund_requests")
      .update({
        status: "rejected",
        rejected_by: context.user?.id || null,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    // v3.74.254 — notify the requester with the rejection reason.
    let srcNumber = ""
    try {
      if ((req as any).source_type === "invoice") {
        const { data: inv } = await admin
          .from("invoices").select("invoice_number").eq("id", (req as any).source_id).maybeSingle()
        srcNumber = (inv as any)?.invoice_number || String((req as any).source_id).slice(0, 8)
      } else {
        const { data: bill } = await admin
          .from("bills").select("bill_number").eq("id", (req as any).source_id).maybeSingle()
        srcNumber = (bill as any)?.bill_number || String((req as any).source_id).slice(0, 8)
      }
    } catch {}
    await notifyRefundRequestRejected(admin as any, {
      companyId: context.companyId,
      requestId: id,
      sourceType: (req as any).source_type,
      sourceNumber: srcNumber,
      branchId: (req as any).branch_id || null,
      createdBy: context.user?.id || "",
      requesterUserId: (req as any).requested_by || null,
      reason,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to reject refund request" },
      { status: 500 }
    )
  }
}
