/**
 * v3.74.250 — POST /api/invoices/[id]/pre-shipment-refund
 *
 * Refund the customer's payments on an invoice that has NOT yet been
 * approved by the warehouse. The requester picks the disbursement
 * account (cash drawer / bank account) and a mode:
 *
 *   cancel_invoice  — full unwind. Reverse payments + reverse revenue
 *                     JE + set invoice + linked sales order to cancelled.
 *   keep_open       — light unwind. Reverse payments only; invoice stays
 *                     'sent' with paid_amount = 0 so the customer can
 *                     re-pay later. SO stays linked.
 *
 * Authorisation: owner / admin / general_manager / accountant.
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { executePreShipmentRefund } from "@/lib/pre-shipment-refund"

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
      {
        success: false,
        error: "Insufficient permission for pre-shipment refund",
      },
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
    if (modeRaw !== "cancel_invoice" && modeRaw !== "keep_open") {
      return NextResponse.json(
        { success: false, error: "Mode must be 'cancel_invoice' or 'keep_open'" },
        { status: 400 }
      )
    }

    const admin = createServiceClient()
    const result = await executePreShipmentRefund(admin as any, {
      companyId: context.companyId,
      invoiceId: id,
      settlementAccountId,
      mode: modeRaw as "cancel_invoice" | "keep_open",
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
        revenueReversalJeId: result.revenueReversalJeId,
        paymentReversalJeIds: result.paymentReversalJeIds,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to process pre-shipment refund",
      },
      { status: 500 }
    )
  }
}
