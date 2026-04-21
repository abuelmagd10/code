import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createServiceClient } from "@/lib/supabase/server"
import { BillReceiptNotificationService } from "@/lib/services/bill-receipt-notification.service"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) {
    return errorResponse
  }

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const uiSurface = String(body?.uiSurface || body?.ui_surface || "bill_edit_page")
    const reason = String(body?.reason || body?.trigger_reason || "bill_edit_after_receipt_rejection")

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["bill-approval-restart-notification", context.companyId, id, reason]
    )

    const requestHash = buildFinancialRequestHash({
      operation: "notify_bill_approval_restart_after_receipt_rejection",
      billId: id,
      companyId: context.companyId,
      actorId: context.user.id,
      uiSurface,
      reason,
    })

    const supabase = createServiceClient()

    const { data: trace } = await supabase
      .from("financial_operation_traces")
      .select("transaction_id, request_hash")
      .eq("company_id", context.companyId)
      .eq("event_type", "bill_approval_restart_notification")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()

    if (trace?.transaction_id) {
      if (trace.request_hash && trace.request_hash !== requestHash) {
        return NextResponse.json(
          { success: false, error: "Idempotency key already used with a different request payload" },
          { status: 409 }
        )
      }

      return NextResponse.json({
        success: true,
        cached: true,
        transactionId: trace.transaction_id,
      })
    }

    const { data: bill, error: billError } = await supabase
      .from("bills")
      .select(`
        id,
        bill_number,
        company_id,
        branch_id,
        warehouse_id,
        cost_center_id,
        purchase_order_id,
        created_by,
        created_by_user_id,
        status,
        approval_status,
        receipt_status
      `)
      .eq("company_id", context.companyId)
      .eq("id", id)
      .maybeSingle()

    if (billError || !bill) {
      return NextResponse.json({ success: false, error: billError?.message || "Bill not found" }, { status: 404 })
    }

    if (String(bill.receipt_status || "").toLowerCase() !== "rejected") {
      return NextResponse.json(
        { success: false, error: "Approval restart notifications are only supported after receipt rejection" },
        { status: 400 }
      )
    }

    if (String(bill.approval_status || "").toLowerCase() !== "pending") {
      return NextResponse.json(
        { success: false, error: "Bill is not currently pending approval restart" },
        { status: 400 }
      )
    }

    const metadata = {
      branch_id: bill.branch_id,
      warehouse_id: bill.warehouse_id,
      cost_center_id: bill.cost_center_id,
      purchase_order_id: bill.purchase_order_id,
      ui_surface: uiSurface,
      reason,
    }

    const { data: createdTrace, error: traceError } = await supabase.rpc("create_financial_operation_trace", {
      p_company_id: context.companyId,
      p_source_entity: "bill",
      p_source_id: bill.id,
      p_event_type: "bill_approval_restart_notification",
      p_actor_id: context.user.id,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
      p_metadata: metadata,
      p_audit_flags: [],
    })

    if (traceError) {
      throw new Error(traceError.message || "Failed to create bill approval restart notification trace")
    }

    const transactionId = String(createdTrace || "")

    await supabase.rpc("link_financial_operation_trace", {
      p_transaction_id: transactionId,
      p_entity_type: "bill",
      p_entity_id: bill.id,
      p_link_role: "bill",
      p_reference_type: "bill_approval_restart_notification",
    })

    await new BillReceiptNotificationService(supabase).notifyApprovalRestartAfterReceiptRejection(
      { companyId: context.companyId, actorId: context.user.id },
      bill,
      transactionId
    )

    try {
      await supabase.from("audit_logs").insert({
        company_id: context.companyId,
        user_id: context.user.id,
        action: "bill_approval_restart_notification_dispatched",
        target_table: "bills",
        record_id: bill.id,
        record_identifier: bill.bill_number,
        new_data: metadata,
      })
    } catch (auditError: any) {
      console.warn("[BILL_APPROVAL_RESTART_NOTIFICATION]", auditError?.message || auditError)
    }

    return NextResponse.json({
      success: true,
      cached: false,
      transactionId,
    })
  } catch (error: any) {
    console.error("[BILL_APPROVAL_RESTART_NOTIFICATION]", error)
    const message = String(error?.message || "Unexpected error while dispatching bill approval restart notifications")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
