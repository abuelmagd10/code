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

    // v3.74.115 - execute is allowed for:
    //   - owner/general_manager (back-office fallback so the workflow never
    //     stalls if the requester is unavailable), OR
    //   - the user who FILED the request (the requester) — they understand
    //     the timing and impact of the correction best.
    // Segregation of duties: the executor must NOT be the same person who
    // approved the request. The approver decides, someone else applies.
    const { data: member } = await supabase
      .from("company_members").select("role")
      .eq("user_id", user.id).eq("company_id", companyId).maybeSingle()
    const role = String((member as any)?.role || "")

    // Parse body
    let body: { account_id?: string; execution_date?: string; notes?: string | null } = {}
    try { body = await request.json() } catch { }

    // v3.74.105 - payment_correction requests reverse an existing payment via
    // RPC and do not need an account_id (the reversal posts to the original
    // payment's account). Detect the source_type first.
    // v3.74.116 hotfix - customer_refund_requests has NO branch_id / cost_center_id
    // columns. Listing them in select() makes PostgREST 400 the query and Supabase
    // returns data=null silently, which we surfaced as "Refund request not found".
    // Pull the branch via the joined invoice instead.
    const { data: refundReq, error: selectErr } = await supabase
      .from("customer_refund_requests")
      .select("id, status, amount, customer_id, invoice_id, source_type, original_payment_id, requested_by, approved_by, customers(name), invoices(invoice_number, branch_id)")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (selectErr) {
      console.error("[REFUND_EXECUTE] select error:", selectErr)
      return NextResponse.json({ error: selectErr.message || "Failed to load refund request" }, { status: 500 })
    }

    if (!refundReq) {
      return NextResponse.json({ error: "Refund request not found" }, { status: 404 })
    }
    if (refundReq.status !== "approved") {
      return NextResponse.json({ error: "Request must be approved before execution" }, { status: 400 })
    }

    // v3.74.115 - permission gate (needs the request row to compare ids).
    const isBoard = ["owner", "general_manager"].includes(role)
    const isRequester = (refundReq as any).requested_by === user.id
    if (!isBoard && !isRequester) {
      return NextResponse.json({
        error: "Forbidden: only the requester (or owner/general manager) may execute this request"
      }, { status: 403 })
    }
    // SoD: approver cannot also execute.
    if ((refundReq as any).approved_by === user.id) {
      return NextResponse.json({
        error: "فَصل الواجِبات: مَن اعتَمَدَ الطَّلَب لا يَستَطيع تَنفيذَهُ. على مُقَدِّم الطَّلَب أَو دور آخَر تَنفيذ التَّصحيح."
      }, { status: 403 })
    }

    // v3.74.255 — pre-shipment refund branch: customer paid an invoice
    // but warehouse hasn't approved dispatch. Delegate to the
    // executePreShipmentRefund helper which voids payments + reverses
    // revenue JE + optionally cancels invoice & sales order.
    if ((refundReq as any).source_type === 'pre_shipment') {
      const { createClient: createServiceClient } = await import("@supabase/supabase-js")
      const admin = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      const { data: full } = await admin
        .from("customer_refund_requests")
        .select("id, invoice_id, refund_account_id, metadata, notes")
        .eq("id", id)
        .maybeSingle()
      const settlementAccountId = (full as any)?.refund_account_id || null
      const metaMode = (full as any)?.metadata?.mode
      const mode = (metaMode === 'cancel_invoice' || metaMode === 'keep_open') ? metaMode : 'cancel_invoice'
      if (!settlementAccountId || !(full as any)?.invoice_id) {
        return NextResponse.json({ error: "Refund request is missing the settlement account or invoice" }, { status: 400 })
      }
      const { executePreShipmentRefund } = await import("@/lib/pre-shipment-refund")
      const r = await executePreShipmentRefund(admin as any, {
        companyId,
        invoiceId: (full as any).invoice_id,
        settlementAccountId,
        mode,
        reason: (full as any).notes || null,
        actorUserId: user.id,
        lang: "ar",
      })
      if (!r.success) {
        return NextResponse.json({ error: r.error || "Pre-shipment refund failed" }, { status: 400 })
      }
      await admin
        .from("customer_refund_requests")
        .update({
          status: 'executed',
          executed_by: user.id,
          executed_at: new Date().toISOString(),
          reversal_journal_entry_id: r.revenueReversalJeId || r.paymentReversalJeIds?.[0] || null,
        })
        .eq("id", id)
      return NextResponse.json({
        success: true,
        message: "تم تنفيذ استرداد قبل الشحن",
        refundedAmount: r.refundedAmount,
      })
    }

    // payment_correction: delegate to execute_payment_correction RPC
    if ((refundReq as any).source_type === 'payment_correction') {
      const { data: rpcResult, error: rpcErr } = await supabase.rpc("execute_payment_correction", {
        p_request_id: id,
        p_company_id: companyId,
        p_executor_id: user.id,
      })
      if (rpcErr) {
        return NextResponse.json({ error: rpcErr.message || "Failed to execute correction" }, { status: 500 })
      }

      // v3.74.105 - tell the requester their correction is now applied
      try {
        const { data: full } = await supabase
          .from("customer_refund_requests")
          .select("requested_by, amount, customers(name)")
          .eq("id", id)
          .maybeSingle()
        const requesterId = (full as any)?.requested_by
        if (requesterId && requesterId !== user.id) {
          await supabase.rpc("create_notification", {
            p_company_id: companyId,
            p_reference_type: "customer_refund_request",
            p_reference_id: id,
            p_title: "تَمَّ تَنفيذ تَصحيح الدَّفعَة",
            p_message: `تَمَّ تَنفيذ طَلَب تَصحيح الدَّفعَة بمَبلَغ ${Number((full as any)?.amount || 0).toLocaleString()}${(full as any)?.customers?.name ? ` للعَميل ${(full as any).customers.name}` : ""}.`,
            p_created_by: user.id,
            p_branch_id: null,
            p_cost_center_id: null,
            p_warehouse_id: null,
            p_assigned_to_role: null,
            p_assigned_to_user: requesterId,
            p_priority: "normal",
            p_event_key: `payments:payment_correction:${id}:executed:requester`,
            p_severity: "info",
            p_category: "approvals",
          })
        }
      } catch (e: any) {
        console.warn("[PAYMENT_CORRECTION_NOTIFY_REQUESTER] failed:", e?.message || e)
      }

      return NextResponse.json({
        success: true,
        message: `تَمَّ تَنفيذ تَصحيح الدَّفعَة بنَجاح`,
        ...((rpcResult as any) || {})
      })
    }

    if (!body.account_id) {
      return NextResponse.json({ error: "account_id is required" }, { status: 400 })
    }

    // v3.74.45 — Enterprise rule: prevent cash overdraft on customer refund execution.
    // The refund credits body.account_id (cash going out to the customer).
    try {
      const { assertCashOutflowAllowed, CashOverdraftError } = await import("@/lib/accounting/cash-balance-validator")
      await assertCashOutflowAllowed(supabase, {
        accountId: body.account_id,
        amount: Number(refundReq.amount ?? 0),
        companyId,
        description: `Customer refund request ${id}`,
      })
    } catch (e: any) {
      if (e?.name === "CashOverdraftError") {
        return NextResponse.json({ error: e.message }, { status: 400 })
      }
      throw e
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
      // v3.74.116 - branch comes from the invoice (the request row has no branch col).
      const branchId = ((refundReq as any).invoices?.branch_id as string | undefined) || null
      const recipients = resolver.resolveBranchAccountantRecipients(branchId, null)
      for (const recipient of recipients) {
        await supabase.rpc("create_notification", {
          p_company_id:       companyId,
          p_reference_type:   "customer_refund_request",
          p_reference_id:     id,
          p_title:            "تم ترحيل قيد استرداد نقدي",
          p_message:          `تم تنفيذ استرداد نقدي بقيمة ${amount.toLocaleString()} للعميل ${customerName}. رقم القيد: ${rpcData.entry_number}`,
          p_created_by:       user.id,
          p_branch_id:        recipient.branchId ?? branchId ?? null,
          p_cost_center_id:   recipient.costCenterId ?? null,
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

    // v3.74.105 - notify requester for the regular refund branch too
    try {
      const requesterId = (refundReq as any).requested_by
      if (requesterId && requesterId !== user.id) {
        await supabase.rpc("create_notification", {
          p_company_id: companyId,
          p_reference_type: "customer_refund_request",
          p_reference_id: id,
          p_title: "تَمَّ تَنفيذ طَلَب الاسترداد",
          p_message: `تَمَّ تَنفيذ طَلَبك لاسترداد ${amount.toLocaleString()} للعَميل ${customerName}. رَقم القَيد: ${rpcData.entry_number}`,
          p_created_by: user.id,
          p_branch_id: null,
          p_cost_center_id: null,
          p_warehouse_id: null,
          p_assigned_to_role: null,
          p_assigned_to_user: requesterId,
          p_priority: "normal",
          p_event_key: `payments:customer_refund_request:${id}:executed:requester`,
          p_severity: "info",
          p_category: "approvals",
        })
      }
    } catch (e: any) { console.warn("[REFUND_NOTIFY_REQUESTER] failed:", e?.message || e) }

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
