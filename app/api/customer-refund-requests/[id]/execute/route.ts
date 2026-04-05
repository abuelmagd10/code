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

    const { data: refundReq } = await supabase
      .from("customer_refund_requests")
      .select("*, customers(name, id), invoices(invoice_number)")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (!refundReq) return NextResponse.json({ error: "Refund request not found" }, { status: 404 })
    if (refundReq.status !== "approved") {
      return NextResponse.json({ error: "Request must be approved before execution" }, { status: 400 })
    }

    let notes: string | null = null
    try {
      const body = await request.json()
      if (body?.notes) notes = body.notes
    } catch { }

    // ===================================================================
    // ACCOUNTING: Dr Customer Liability (AR) / Cr Cash or Bank
    // Note: The actual cash/bank account selection and journal entry
    // creation should be handled here or via a dedicated RPC.
    // For now, we record the execution and mark the status.
    // Full GL integration will be added in Phase 5 (refund execution).
    // ===================================================================

    // Mark as executed
    const { error: updateError } = await supabase
      .from("customer_refund_requests")
      .update({
        status: "executed",
        executed_by: user.id,
        executed_at: new Date().toISOString(),
        notes: notes || refundReq.notes
      })
      .eq("id", id)

    if (updateError) throw updateError

    // Notify general_manager of execution
    try {
      await supabase.rpc("create_notification", {
        p_company_id: companyId,
        p_reference_type: "customer_refund_request",
        p_reference_id: id,
        p_title: "تم تنفيذ استرداد نقدي للعميل",
        p_message: `تم تنفيذ استرداد نقدي بمبلغ ${Number(refundReq.amount).toLocaleString()} للعميل ${refundReq.customers?.name || ""}`,
        p_created_by: user.id,
        p_branch_id: null,
        p_cost_center_id: null,
        p_warehouse_id: null,
        p_assigned_to_role: "general_manager",
        p_assigned_to_user: null,
        p_priority: "normal",
        p_event_key: `customer_refund:${id}:executed`,
        p_severity: "success",
        p_category: "finance"
      })
    } catch (notifErr: any) {
      console.warn("⚠️ Notification failed:", notifErr.message)
    }

    return NextResponse.json({
      success: true,
      message: `تم تنفيذ الاسترداد النقدي بمبلغ ${Number(refundReq.amount).toLocaleString()} للعميل ${refundReq.customers?.name || ""}`
    })
  } catch (error: any) {
    console.error("[REFUND_EXECUTE]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
