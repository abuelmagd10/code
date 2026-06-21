/**
 * v3.74.253 — POST /api/refund-requests/[id]/approve
 *
 * Owner / general_manager approves a pending refund request and triggers
 * the actual execution (calls the same executors v3.74.250 / v3.74.251
 * use directly for self-execute roles).
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { executePreShipmentRefund } from "@/lib/pre-shipment-refund"
import { executePreReceiptRefund } from "@/lib/pre-receipt-refund"

const APPROVER_ROLES = new Set(["owner", "general_manager"])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  const role = String(context.member?.role || "").toLowerCase()
  if (!APPROVER_ROLES.has(role)) {
    return NextResponse.json(
      { success: false, error: "Only the owner or general manager can approve refund requests" },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    const admin = createServiceClient()

    const { data: req, error: reqErr } = await admin
      .from("refund_requests")
      .select("*")
      .eq("id", id)
      .eq("company_id", context.companyId)
      .maybeSingle()
    if (reqErr) return NextResponse.json({ success: false, error: reqErr.message }, { status: 500 })
    if (!req) return NextResponse.json({ success: false, error: "Refund request not found" }, { status: 404 })
    if (String(req.status).toLowerCase() !== "pending_approval") {
      return NextResponse.json(
        { success: false, error: "Only pending requests can be approved" },
        { status: 409 }
      )
    }

    let execResult: any
    let headJeId: string | null = null
    if (req.source_type === "invoice") {
      const r = await executePreShipmentRefund(admin as any, {
        companyId: context.companyId,
        invoiceId: req.source_id,
        settlementAccountId: req.settlement_account_id,
        mode: req.mode as "cancel_invoice" | "keep_open",
        reason: req.reason,
        actorUserId: context.user?.id || "",
        lang: "ar",
      })
      execResult = r
      headJeId = r.revenueReversalJeId || r.paymentReversalJeIds?.[0] || null
    } else if (req.source_type === "bill") {
      const r = await executePreReceiptRefund(admin as any, {
        companyId: context.companyId,
        billId: req.source_id,
        settlementAccountId: req.settlement_account_id,
        mode: req.mode as "cancel_bill" | "keep_open",
        reason: req.reason,
        actorUserId: context.user?.id || "",
        lang: "ar",
      })
      execResult = r
      headJeId = r.billReversalJeId || r.paymentReversalJeIds?.[0] || null
    } else {
      return NextResponse.json({ success: false, error: "Unknown source_type" }, { status: 400 })
    }

    if (!execResult?.success) {
      return NextResponse.json(
        { success: false, error: execResult?.error || "Refund execution failed" },
        { status: 400 }
      )
    }

    await admin
      .from("refund_requests")
      .update({
        status: "approved_completed",
        approved_by: context.user?.id || null,
        approved_at: new Date().toISOString(),
        execution_je_id: headJeId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    return NextResponse.json({
      success: true,
      data: {
        request_id: id,
        executionJeId: headJeId,
        refundedAmount: execResult.refundedAmount,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to approve refund request" },
      { status: 500 }
    )
  }
}
