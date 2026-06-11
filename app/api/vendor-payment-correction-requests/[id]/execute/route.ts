/**
 * v3.74.127 — execute an approved vendor payment correction request.
 *
 * SoD: requester OR owner/GM may execute, but the approver may NOT also execute.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) return NextResponse.json({ error: "Company context missing" }, { status: 400 })

    const { data: req, error: selectErr } = await supabase
      .from("vendor_payment_correction_requests")
      .select("*, suppliers(name)")
      .eq("id", id).eq("company_id", companyId).maybeSingle()
    if (selectErr) {
      return NextResponse.json({ error: selectErr.message }, { status: 500 })
    }
    if (!req) return NextResponse.json({ error: "Correction request not found" }, { status: 404 })
    if ((req as any).status !== "approved") {
      return NextResponse.json({ error: "Request is not approved yet" }, { status: 400 })
    }

    // Auth: requester OR owner/GM allowed; approver may NOT execute.
    const requesterId = (req as any).requested_by
    const approverId = (req as any).approved_by

    const { data: member } = await supabase
      .from("company_members").select("role")
      .eq("user_id", user.id).eq("company_id", companyId).maybeSingle()
    const role = String((member as any)?.role || "")
    const isOwnerOrGm = ["owner", "general_manager"].includes(role)
    const isRequester = user.id === requesterId

    if (!isRequester && !isOwnerOrGm) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (user.id === approverId) {
      return NextResponse.json({
        error: "SoD violation: the approver may not also execute this correction"
      }, { status: 403 })
    }

    const { data, error } = await supabase.rpc("execute_vendor_payment_correction", {
      p_request_id: id,
      p_company_id: companyId,
      p_executor_id: user.id,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: "تَمَّ تَنفيذ التَّصحيح بنَجاح",
      ...((data as any) || {})
    })
  } catch (error: any) {
    console.error("[VENDOR_CORRECTION_EXECUTE]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
