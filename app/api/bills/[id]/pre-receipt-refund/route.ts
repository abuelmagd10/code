/**
 * v3.74.251 / 3.74.253 — POST /api/bills/[id]/pre-receipt-refund
 *
 * v3.74.253: owner/GM self-execute. Other roles create a refund_request.
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { executePreReceiptRefund } from "@/lib/pre-receipt-refund"

const REQUEST_ROLES = new Set([
  "owner", "general_manager",
  "admin", "manager", "accountant",
])
const SELF_EXECUTE_ROLES = new Set(["owner", "general_manager"])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  const actorRole = String(context.member?.role || "").toLowerCase()
  if (!REQUEST_ROLES.has(actorRole)) {
    return NextResponse.json(
      { success: false, error: "Insufficient permission for pre-receipt refund" },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const settlementAccountId = String(
      body?.settlement_account_id || body?.settlementAccountId || ""
    ).trim()
    const modeRaw = String(body?.mode || "").trim()
    const reason = (body?.reason || null) as string | null

    if (!settlementAccountId) {
      return NextResponse.json(
        { success: false, error: "Settlement account is required" },
        { status: 400 }
      )
    }
    if (modeRaw !== "cancel_bill" && modeRaw !== "keep_open") {
      return NextResponse.json(
        { success: false, error: "Mode must be 'cancel_bill' or 'keep_open'" },
        { status: 400 }
      )
    }

    const admin = createServiceClient()

    if (SELF_EXECUTE_ROLES.has(actorRole)) {
      const result = await executePreReceiptRefund(admin as any, {
        companyId: context.companyId,
        billId: id,
        settlementAccountId,
        mode: modeRaw as "cancel_bill" | "keep_open",
        reason,
        actorUserId: context.user?.id || "",
        lang: "ar",
      })
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || "Refund failed" },
          { status: 400 }
        )
      }
      return NextResponse.json({
        success: true,
        executed: true,
        data: {
          refundedAmount: result.refundedAmount,
          reversedPaymentCount: result.reversedPaymentCount,
          billReversalJeId: result.billReversalJeId,
          paymentReversalJeIds: result.paymentReversalJeIds,
        },
      })
    }

    const { data: bill, error: billErr } = await admin
      .from("bills")
      .select("id, company_id, branch_id, status, receipt_status, paid_amount, pre_receipt_refund_at")
      .eq("id", id)
      .eq("company_id", context.companyId)
      .maybeSingle()
    if (billErr) return NextResponse.json({ success: false, error: billErr.message }, { status: 500 })
    if (!bill) return NextResponse.json({ success: false, error: "Bill not found" }, { status: 404 })

    if ((bill as any).pre_receipt_refund_at) {
      return NextResponse.json({ success: false, error: "Bill already refunded" }, { status: 409 })
    }
    if (String((bill as any).receipt_status || "").toLowerCase() === "received") {
      return NextResponse.json(
        { success: false, error: "Warehouse already confirmed receipt - use a purchase return" },
        { status: 409 }
      )
    }
    const paid = Number((bill as any).paid_amount || 0)
    if (paid <= 0) {
      return NextResponse.json({ success: false, error: "Bill has no paid amount" }, { status: 400 })
    }

    const { data: req, error: reqErr } = await admin
      .from("refund_requests")
      .insert({
        company_id: context.companyId,
        branch_id: (bill as any).branch_id || null,
        source_type: "bill",
        source_id: id,
        mode: modeRaw,
        settlement_account_id: settlementAccountId,
        amount: paid,
        reason,
        status: "pending_approval",
        requested_by: context.user?.id || null,
      })
      .select("id")
      .single()
    if (reqErr || !req?.id) {
      const dup = String(reqErr?.message || "").toLowerCase().includes("unique")
      return NextResponse.json(
        {
          success: false,
          error: dup
            ? "There is already an active refund request for this bill"
            : reqErr?.message || "Failed to create refund request",
        },
        { status: dup ? 409 : 500 }
      )
    }

    return NextResponse.json({
      success: true,
      executed: false,
      pending_approval: true,
      data: { request_id: req.id },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to process pre-receipt refund" },
      { status: 500 }
    )
  }
}
