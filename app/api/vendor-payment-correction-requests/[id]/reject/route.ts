/**
 * v3.74.127 — reject a vendor payment correction request. Owner/GM only.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) return NextResponse.json({ error: "Company context missing" }, { status: 400 })

    const { data: member } = await supabase
      .from("company_members").select("role")
      .eq("user_id", user.id).eq("company_id", companyId).maybeSingle()
    const role = String((member as any)?.role || "")
    if (!["owner", "general_manager"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let reason = ""
    try { const body = await request.json(); reason = String(body?.reason || "").trim() } catch { }
    if (reason.length < 3) {
      return NextResponse.json({ error: "سَبَب الرَّفض مَطلوب" }, { status: 400 })
    }

    const { data: req } = await supabase
      .from("vendor_payment_correction_requests")
      .select("*, suppliers(name)")
      .eq("id", id).eq("company_id", companyId).maybeSingle()
    if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if ((req as any).status !== "pending") {
      return NextResponse.json({ error: "Request is not pending" }, { status: 400 })
    }

    const { error } = await supabase
      .from("vendor_payment_correction_requests")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        rejection_reason: reason
      })
      .eq("id", id)
    if (error) throw error

    // Notify requester
    try {
      const requesterId = (req as any).requested_by
      if (requesterId && requesterId !== user.id) {
        await supabase.rpc("create_notification", {
          p_company_id: companyId,
          p_reference_type: "vendor_payment_correction_request",
          p_reference_id: id,
          p_title: "تَم رَفض طَلَبَك",
          p_message: `تَم رَفض طَلَب التَّصحيح للمُورِّد ${(req as any).suppliers?.name || ""}. السَّبَب: ${reason.substring(0, 120)}`,
          p_created_by: user.id,
          p_branch_id: null, p_cost_center_id: null, p_warehouse_id: null,
          p_assigned_to_role: null, p_assigned_to_user: requesterId,
          p_priority: "high",
          p_event_key: `payments:vendor_payment_correction:${id}:rejected:user:${requesterId}`,
          p_severity: "warning",
          p_category: "approvals"
        })
      }
    } catch { }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[VENDOR_CORRECTION_REJECT]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
