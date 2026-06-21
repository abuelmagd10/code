/**
 * v3.74.251 — POST /api/bills/[id]/pre-receipt-refund
 *
 * Purchases-side mirror of v3.74.250's invoice route. Refund our payment
 * to a supplier on a bill that hasn't been receipt-confirmed yet. The
 * requester picks the disbursement account (where the supplier returned
 * the cash to) and a mode:
 *
 *   cancel_bill — full unwind. Reverse payments + reverse bill JE +
 *                 set bill + linked PO to cancelled.
 *   keep_open   — light unwind. Reverse payments only; bill stays open
 *                 with paid_amount = 0 so the supplier can be re-paid.
 *
 * Authorisation: owner / admin / general_manager / accountant.
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { executePreReceiptRefund } from "@/lib/pre-receipt-refund"

const PRIVILEGED_ROLES = new Set([
  "owner",
  "admin",
  "manager",
  "general_manager",
  "accountant",
])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  const actorRole = String(context.member?.role || "").toLowerCase()
  if (!PRIVILEGED_ROLES.has(actorRole)) {
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
      data: {
        refundedAmount: result.refundedAmount,
        reversedPaymentCount: result.reversedPaymentCount,
        billReversalJeId: result.billReversalJeId,
        paymentReversalJeIds: result.paymentReversalJeIds,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to process pre-receipt refund" },
      { status: 500 }
    )
  }
}
