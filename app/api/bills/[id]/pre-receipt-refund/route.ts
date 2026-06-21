/**
 * v3.74.251 / 3.74.255 — POST /api/bills/[id]/pre-receipt-refund
 *
 * Refund our payment to a supplier on a bill the warehouse hasn't
 * confirmed receipt for. Modes: cancel_bill / keep_open.
 *
 * v3.74.255: tightened to owner / general_manager only while the
 * purchases-side approval workflow is being integrated into the
 * existing vendor_refund_requests table. Other roles see "Insufficient
 * permission" for now and must ask the owner/GM directly. The full
 * workflow will be re-enabled once vendor_refund_requests is extended.
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { executePreReceiptRefund } from "@/lib/pre-receipt-refund"

const SELF_EXECUTE_ROLES = new Set(["owner", "general_manager"])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  const actorRole = String(context.member?.role || "").toLowerCase()
  if (!SELF_EXECUTE_ROLES.has(actorRole)) {
    return NextResponse.json(
      { success: false, error: "Only the owner or general manager can refund a pre-receipt payment" },
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
        { success: false, error: "Settlement account is required" }, { status: 400 }
      )
    }
    if (modeRaw !== "cancel_bill" && modeRaw !== "keep_open") {
      return NextResponse.json(
        { success: false, error: "Mode must be 'cancel_bill' or 'keep_open'" }, { status: 400 }
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
        { success: false, error: result.error || "Refund failed" }, { status: 400 }
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
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to process pre-receipt refund" },
      { status: 500 }
    )
  }
}
