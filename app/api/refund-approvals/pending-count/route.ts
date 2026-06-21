/**
 * v3.74.254 — GET /api/refund-approvals/pending-count
 * Returns the count of refund_requests in 'pending_approval' for the
 * active company. The sidebar uses this to show the badge.
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  const supabase = createServiceClient()
  const { count, error } = await supabase
    .from("refund_requests")
    .select("id", { count: "exact", head: true })
    .eq("company_id", context.companyId)
    .eq("status", "pending_approval")

  if (error) {
    return NextResponse.json({ success: false, error: error.message, count: 0 }, { status: 500 })
  }
  return NextResponse.json({ success: true, count: count || 0 })
}
