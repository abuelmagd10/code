/**
 * v3.74.253 — POST /api/refund-requests/[id]/cancel
 * The requester (or owner/GM) cancels their own pending request before
 * it gets approved or rejected.
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  try {
    const { id } = await params
    const admin = createServiceClient()
    const { data: req } = await admin
      .from("refund_requests")
      .select("id, status, requested_by")
      .eq("id", id)
      .eq("company_id", context.companyId)
      .maybeSingle()
    if (!req) return NextResponse.json({ success: false, error: "Refund request not found" }, { status: 404 })
    if (String(req.status).toLowerCase() !== "pending_approval") {
      return NextResponse.json(
        { success: false, error: "Only pending requests can be cancelled" },
        { status: 409 }
      )
    }

    const role = String(context.member?.role || "").toLowerCase()
    const isApprover = role === "owner" || role === "general_manager"
    const isRequester = req.requested_by && req.requested_by === context.user?.id
    if (!isApprover && !isRequester) {
      return NextResponse.json(
        { success: false, error: "Only the requester or owner / general manager can cancel this request" },
        { status: 403 }
      )
    }

    await admin
      .from("refund_requests")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to cancel refund request" },
      { status: 500 }
    )
  }
}
