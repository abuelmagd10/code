/**
 * v3.74.256 — POST /api/vendor-refund-requests/[id]/execute-pre-receipt
 *
 * Called by the suppliers page when approving a vendor_refund_requests row
 * whose source_type='pre_receipt'. It reads the request, calls
 * executePreReceiptRefund, then marks the request as executed.
 *
 * Only owner / general_manager may execute (mirrors the sales-side rule).
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
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
      { success: false, error: "Only owner or general manager can approve" },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    const admin = createServiceClient()

    const { data: req, error: reqErr } = await admin
      .from("vendor_refund_requests")
      .select("id, status, source_type, bill_id, receipt_account_id, metadata, notes")
      .eq("id", id)
      .eq("company_id", context.companyId)
      .maybeSingle()
    if (reqErr) return NextResponse.json({ success: false, error: reqErr.message }, { status: 500 })
    if (!req) return NextResponse.json({ success: false, error: "Refund request not found" }, { status: 404 })
    if (String(req.status).toLowerCase() !== "pending_approval") {
      return NextResponse.json({ success: false, error: "Only pending requests can be approved" }, { status: 409 })
    }
    if (String((req as any).source_type || "").toLowerCase() !== "pre_receipt") {
      return NextResponse.json({ success: false, error: "Not a pre_receipt request" }, { status: 400 })
    }

    const settlementAccountId = (req as any).receipt_account_id || (req as any).metadata?.settlement_account_id || null
    const metaMode = (req as any).metadata?.mode
    const mode = (metaMode === 'cancel_bill' || metaMode === 'keep_open') ? metaMode : 'cancel_bill'
    if (!settlementAccountId || !(req as any).bill_id) {
      return NextResponse.json(
        { success: false, error: "Refund request is missing the settlement account or bill" },
        { status: 400 }
      )
    }

    const r = await executePreReceiptRefund(admin as any, {
      companyId: context.companyId,
      billId: (req as any).bill_id,
      settlementAccountId,
      mode: mode as "cancel_bill" | "keep_open",
      reason: (req as any).notes || null,
      actorUserId: context.user?.id || "",
      lang: "ar",
    })
    if (!r.success) {
      return NextResponse.json({ success: false, error: r.error || "Pre-receipt refund failed" }, { status: 400 })
    }

    await admin
      .from("vendor_refund_requests")
      .update({
        status: 'executed',
        approved_by: context.user?.id || null,
        approved_at: new Date().toISOString(),
        executed_by: context.user?.id || null,
        executed_at: new Date().toISOString(),
        journal_entry_id: r.billReversalJeId || r.paymentReversalJeIds?.[0] || null,
      })
      .eq("id", id)

    return NextResponse.json({
      success: true,
      data: { refundedAmount: r.refundedAmount },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to execute pre-receipt refund" },
      { status: 500 }
    )
  }
}
