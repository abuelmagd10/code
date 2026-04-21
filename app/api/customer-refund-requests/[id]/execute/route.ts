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

    // Parse body
    let body: { account_id?: string; execution_date?: string; notes?: string | null } = {}
    try { body = await request.json() } catch { }

    if (!body.account_id) {
      return NextResponse.json({ error: "account_id is required" }, { status: 400 })
    }

    // Validate the refund request exists and belongs to this company
    const { data: refundReq } = await supabase
      .from("customer_refund_requests")
      .select("id, status, amount, customer_id, branch_id, cost_center_id, customers(name), invoices(invoice_number)")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (!refundReq) {
      return NextResponse.json({ error: "Refund request not found" }, { status: 404 })
    }
    if (refundReq.status !== "approved") {
      return NextResponse.json({ error: "Request must be approved before execution" }, { status: 400 })
    }

    // Execute via atomic GL RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc("execute_customer_refund", {
      p_refund_request_id: id,
      p_account_id:        body.account_id,
      p_executed_by:       user.id,
      p_execution_date:    body.execution_date || new Date().toISOString().slice(0, 10),
      p_notes:             body.notes || null
    })

    if (rpcError) {
      console.error("[REFUND_EXECUTE] RPC Error:", rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 400 })
    }

    if (!rpcData?.success) {
      return NextResponse.json({ error: rpcData?.error || "فشل في تنفيذ الاسترداد" }, { status: 400 })
    }

    const customerName = (refundReq as any)?.customers?.name || ""
    const amount = Number(refundReq.amount)
    const resolver = new NotificationRecipientResolverService(supabase)

    // Notify Accountant
    try {
      const recipients = resolver.resolveBranchAccountantRecipients(refundReq.branch_id || null, refundReq.cost_center_id || null)
      for (const recipient of recipients) {
        await supabase.rpc("create_notification", {
          p_company_id:       companyId,
          p_reference_type:   "customer_refund_request",
          p_reference_id:     id,
          p_title:            "تم ترحيل قيد استرداد نقدي",
          p_message:          `تم تنفيذ استرداد نقدي بقيمة ${amount.toLocaleString()} للعميل ${customerName}. رقم القيد: ${rpcData.entry_number}`,
          p_created_by:       user.id,
          p_branch_id:        recipient.branchId ?? refundReq.branch_id ?? null,
          p_cost_center_id:   recipient.costCenterId ?? refundReq.cost_center_id ?? null,
          p_warehouse_id:     recipient.warehouseId ?? null,
          p_assigned_to_role: recipient.kind === "role" ? recipient.role : null,
          p_assigned_to_user: recipient.kind === "user" ? recipient.userId : null,
          p_priority:         "normal",
          p_event_key:        buildNotificationEventKey(
            "payments",
            "customer_refund_request",
            id,
            "executed_accountant",
            ...resolver.buildRecipientScopeSegments(recipient)
          ),
          p_severity:         normalizeNotificationSeverity("info"),
          p_category:         "finance"
        })
      }
    } catch (e: any) { console.warn("⚠️ Notification failed:", e.message) }

    // Notify Management
    try {
      const recipients = resolver.resolveRoleRecipients(["general_manager"], null, null, null)
      for (const recipient of recipients) {
        await supabase.rpc("create_notification", {
          p_company_id:       companyId,
          p_reference_type:   "customer_refund_request",
          p_reference_id:     id,
          p_title:            "تم صرف استرداد نقدي لعميل",
          p_message:          `تم صرف استرداد نقدي بقيمة ${amount.toLocaleString()} للعميل ${customerName}. رقم القيد المحاسبي: ${rpcData.entry_number}`,
          p_created_by:       user.id,
          p_branch_id:        recipient.branchId ?? null,
          p_cost_center_id:   recipient.costCenterId ?? null,
          p_warehouse_id:     recipient.warehouseId ?? null,
          p_assigned_to_role: recipient.kind === "role" ? recipient.role : null,
          p_assigned_to_user: recipient.kind === "user" ? recipient.userId : null,
          p_priority:         "normal",
          p_event_key:        buildNotificationEventKey(
            "payments",
            "customer_refund_request",
            id,
            "executed_management",
            ...resolver.buildRecipientScopeSegments(recipient)
          ),
          p_severity:         normalizeNotificationSeverity("info"),
          p_category:         "finance"
        })
      }
    } catch (e: any) { console.warn("⚠️ Notification failed:", e.message) }

    return NextResponse.json({
      success:           true,
      message:           `تم تنفيذ الاسترداد النقدي بقيمة ${amount.toLocaleString()} للعميل ${customerName}`,
      journal_entry_id:  rpcData.journal_entry_id,
      entry_number:      rpcData.entry_number
    })

  } catch (error: any) {
    console.error("[REFUND_EXECUTE]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
