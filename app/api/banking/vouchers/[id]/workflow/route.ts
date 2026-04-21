import { NextRequest, NextResponse } from "next/server"

import { apiGuard } from "@/lib/core/security/api-guard"
import { BankVoucherNotificationService } from "@/lib/services/bank-voucher-notification.service"
import { createClient, createServiceClient } from "@/lib/supabase/server"

type VoucherWorkflowAction = "APPROVE" | "REJECT" | "POST"

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
    const action = String(body?.action || "").trim().toUpperCase() as VoucherWorkflowAction
    const reason = String(body?.reason || body?.rejectionReason || "").trim()
    const appLang = body?.appLang === "en" ? "en" : "ar"

    if (!["APPROVE", "REJECT", "POST"].includes(action)) {
      return NextResponse.json({ success: false, error: "Unsupported bank voucher action" }, { status: 400 })
    }

    if (action === "REJECT" && !reason) {
      return NextResponse.json({ success: false, error: "Rejection reason is required" }, { status: 400 })
    }

    const authSupabase = await createClient()
    const adminSupabase = createServiceClient()

    const { data: requestRow, error: requestError } = await adminSupabase
      .from("bank_voucher_requests")
      .select("id, company_id, branch_id, cost_center_id, voucher_type, amount, currency, created_by, status")
      .eq("id", id)
      .eq("company_id", context.companyId)
      .maybeSingle()

    if (requestError || !requestRow) {
      return NextResponse.json({ success: false, error: "Bank voucher request not found" }, { status: 404 })
    }

    if (action === "APPROVE") {
      const { error } = await authSupabase.rpc("approve_bank_voucher", {
        p_request_id: id,
        p_approved_by: context.user.id,
      })
      if (error) throw error

      if (requestRow.created_by) {
        const notificationService = new BankVoucherNotificationService(adminSupabase)
        await notificationService.notifyApproved({
          companyId: context.companyId,
          requestId: id,
          voucherType: requestRow.voucher_type,
          amount: Number(requestRow.amount || 0),
          currency: String(requestRow.currency || "EGP"),
          branchId: requestRow.branch_id,
          costCenterId: requestRow.cost_center_id,
          createdBy: requestRow.created_by,
          approvedBy: context.user.id,
          appLang,
        })
      }

      return NextResponse.json({ success: true, action: "APPROVE" })
    }

    if (action === "REJECT") {
      const { error } = await authSupabase.rpc("reject_bank_voucher", {
        p_request_id: id,
        p_rejected_by: context.user.id,
        p_reason: reason,
      })
      if (error) throw error

      if (requestRow.created_by) {
        const notificationService = new BankVoucherNotificationService(adminSupabase)
        await notificationService.notifyRejected({
          companyId: context.companyId,
          requestId: id,
          voucherType: requestRow.voucher_type,
          amount: Number(requestRow.amount || 0),
          currency: String(requestRow.currency || "EGP"),
          branchId: requestRow.branch_id,
          costCenterId: requestRow.cost_center_id,
          createdBy: requestRow.created_by,
          rejectedBy: context.user.id,
          reason,
          appLang,
        })
      }

      return NextResponse.json({ success: true, action: "REJECT" })
    }

    const { error } = await authSupabase.rpc("post_bank_voucher", {
      p_request_id: id,
      p_posted_by: context.user.id,
    })
    if (error) throw error

    return NextResponse.json({ success: true, action: "POST" })
  } catch (error: any) {
    console.error("[BANK_VOUCHER_WORKFLOW]", error)
    return NextResponse.json(
      { success: false, error: String(error?.message || "Unexpected error while processing bank voucher workflow") },
      { status: 500 }
    )
  }
}
