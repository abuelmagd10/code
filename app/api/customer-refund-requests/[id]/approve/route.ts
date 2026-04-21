import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { buildNotificationEventKey, normalizeNotificationSeverity } from "@/lib/notification-workflow"
import { NotificationRecipientResolverService } from "@/lib/services/notification-recipient-resolver.service"

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

    // Fetch the refund request
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

    // Approve: pending → approved
    const { error: updateError } = await supabase
      .from("customer_refund_requests")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        notes: notes || refundReq.notes
      })
      .eq("id", id)

    if (updateError) throw updateError

    // Notify accountant to execute
    try {
      const resolver = new NotificationRecipientResolverService(supabase)
      const recipients = resolver.resolveBranchAccountantRecipients(refundReq.branch_id || null, refundReq.cost_center_id || null)

      for (const recipient of recipients) {
        await supabase.rpc("create_notification", {
          p_company_id: companyId,
          p_reference_type: "customer_refund_request",
          p_reference_id: id,
          p_title: "تمت الموافقة على طلب استرداد عميل",
          p_message: `تمت الموافقة على طلب استرداد نقدي بمبلغ ${Number(refundReq.amount).toLocaleString()} للعميل ${refundReq.customers?.name || ""}. يرجى تنفيذ الدفع.`,
          p_created_by: user.id,
          p_branch_id: recipient.branchId ?? refundReq.branch_id ?? null,
          p_cost_center_id: recipient.costCenterId ?? refundReq.cost_center_id ?? null,
          p_warehouse_id: recipient.warehouseId ?? null,
          p_assigned_to_role: recipient.kind === "role" ? recipient.role : null,
          p_assigned_to_user: recipient.kind === "user" ? recipient.userId : null,
          p_priority: "high",
          p_event_key: buildNotificationEventKey(
            "payments",
            "customer_refund_request",
            id,
            "approved_for_execution",
            ...resolver.buildRecipientScopeSegments(recipient)
          ),
          p_severity: normalizeNotificationSeverity("info"),
          p_category: "finance"
        })
      }
    } catch (notifErr: any) {
      console.warn("⚠️ Notification failed:", notifErr.message)
    }

    return NextResponse.json({
      success: true,
      message: `تم اعتماد طلب الاسترداد بمبلغ ${Number(refundReq.amount).toLocaleString()}`
    })
  } catch (error: any) {
    console.error("[REFUND_APPROVE]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
