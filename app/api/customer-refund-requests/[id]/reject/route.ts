import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { archiveApprovalNotificationsForRecord } from "@/lib/notifications/archive-on-action"

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

    const { data: refundReq } = await supabase
      .from("customer_refund_requests")
      .select("*, customers(name), invoices(invoice_number)")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (!refundReq) return NextResponse.json({ error: "Refund request not found" }, { status: 404 })
    if (refundReq.status !== "pending") {
      return NextResponse.json({ error: "Request is not in pending status" }, { status: 400 })
    }

    let notes: string | null = null
    try {
      const body = await request.json()
      if (body?.notes) notes = body.notes
    } catch { }

    if (!notes || notes.trim().length < 3) {
      return NextResponse.json({ error: "Rejection reason is required (min 3 chars)" }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from("customer_refund_requests")
      .update({ status: "cancelled", notes })
      .eq("id", id)

    if (updateError) throw updateError

    // v3.74.18 — Archive pending approval-category notifications for this
    // workflow record now that the action is committed. Runs BEFORE any
    // follow-up "result" notification we send to the creator below, so the
    // new one isn't archived too.
    await archiveApprovalNotificationsForRecord({
      supabase,
      companyId,
      referenceType: "customer_refund_request",
      referenceId: id,
    })

    return NextResponse.json({
      success: true,
      message: `تم رفض طلب الاسترداد للعميل ${refundReq.customers?.name || ""}`
    })
  } catch (error: any) {
    console.error("[REFUND_REJECT]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
