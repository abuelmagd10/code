import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { buildNotificationEventKey, normalizeNotificationSeverity } from "@/lib/notification-workflow"
import { NotificationRecipientResolverService } from "@/lib/services/notification-recipient-resolver.service"
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

    // v3.74.105 - approve restricted to owner/general_manager. The board
    // policy is that only top management can sign off on a refund/correction
    // before it touches the GL.
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle()
    const role = String((member as any)?.role || "")
    if (!["owner", "general_manager"].includes(role)) {
      return NextResponse.json({
        error: "Forbidden: only owner/general manager may approve refund requests"
      }, { status: 403 })
    }

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

    // Notify accountant to execute + originator of the decision.
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

      // v3.74.23 — Tell the originator the management decision. The
      // workflow previously only notified the next-stage actor (the
      // accountant) and left the requester guessing. Self-approval
      // guard: skip if requester is the approver. Failures swallowed
      // (UX cleanup, not correctness).
      const requesterId = refundReq.requested_by || refundReq.created_by
      if (requesterId && requesterId !== user.id) {
        const requesterRecipient = resolver.resolveUserRecipient(
          requesterId,
          null,
          refundReq.branch_id || null,
          null,
          refundReq.cost_center_id || null
        )
        await supabase.rpc("create_notification", {
          p_company_id: companyId,
          p_reference_type: "customer_refund_request",
          p_reference_id: id,
          p_title: "تم اعتماد طلب الاسترداد",
          p_message: `تم اعتماد طلب استرداد بمبلغ ${Number(refundReq.amount).toLocaleString()} للعميل ${refundReq.customers?.name || ""}. الطلب الآن قيد التنفيذ من المحاسبة.`,
          p_created_by: user.id,
          p_branch_id: requesterRecipient.branchId ?? null,
          p_cost_center_id: requesterRecipient.costCenterId ?? null,
          p_warehouse_id: null,
          p_assigned_to_role: null,
          p_assigned_to_user: requesterId,
          p_priority: "normal",
          p_event_key: buildNotificationEventKey(
            "payments",
            "customer_refund_request",
            id,
            "approved_requester",
            ...resolver.buildRecipientScopeSegments(requesterRecipient)
          ),
          p_severity: normalizeNotificationSeverity("info"),
          p_category: "approvals"
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
