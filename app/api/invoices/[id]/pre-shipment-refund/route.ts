/**
 * v3.74.250 / 3.74.255 — POST /api/invoices/[id]/pre-shipment-refund
 *
 * v3.74.255: re-routed to customer_refund_requests (existing table +
 * approval page) with source_type='pre_shipment'. Owner / GM still self-
 * execute immediately. Everyone else creates a row that appears on the
 * existing /customer-refund-requests page, filtered by source_type.
 *
 * mode (cancel_invoice / keep_open) is stored in the metadata jsonb.
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { executePreShipmentRefund } from "@/lib/pre-shipment-refund"

const REQUEST_ROLES = new Set(["owner","general_manager","admin","manager","accountant"])
const SELF_EXECUTE_ROLES = new Set(["owner","general_manager"])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  const actorRole = String(context.member?.role || "").toLowerCase()
  if (!REQUEST_ROLES.has(actorRole)) {
    return NextResponse.json(
      { success: false, error: "Insufficient permission for pre-shipment refund" },
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
    if (modeRaw !== "cancel_invoice" && modeRaw !== "keep_open") {
      return NextResponse.json(
        { success: false, error: "Mode must be 'cancel_invoice' or 'keep_open'" }, { status: 400 }
      )
    }

    const admin = createServiceClient()

    if (SELF_EXECUTE_ROLES.has(actorRole)) {
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
          { success: false, error: result.error || "Refund failed" }, { status: 400 }
        )
      }
      return NextResponse.json({
        success: true,
        executed: true,
        data: {
          refundedAmount: result.refundedAmount,
          reversedPaymentCount: result.reversedPaymentCount,
          revenueReversalJeId: result.revenueReversalJeId,
          paymentReversalJeIds: result.paymentReversalJeIds,
        },
      })
    }

    // Regular role -> file a customer_refund_requests row, source_type='pre_shipment'.
    const { data: inv, error: invErr } = await admin
      .from("invoices")
      .select("id, company_id, customer_id, branch_id, cost_center_id, status, warehouse_status, paid_amount, pre_shipment_refund_at, currency_code, exchange_rate_used")
      .eq("id", id)
      .eq("company_id", context.companyId)
      .maybeSingle()
    if (invErr) return NextResponse.json({ success: false, error: invErr.message }, { status: 500 })
    if (!inv) return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 })

    if ((inv as any).pre_shipment_refund_at) {
      return NextResponse.json({ success: false, error: "Invoice already refunded" }, { status: 409 })
    }
    if (String((inv as any).warehouse_status || "").toLowerCase() === "approved") {
      return NextResponse.json(
        { success: false, error: "Warehouse already approved dispatch - use a sales return" },
        { status: 409 }
      )
    }
    const paid = Number((inv as any).paid_amount || 0)
    if (paid <= 0) {
      return NextResponse.json({ success: false, error: "Invoice has no paid amount" }, { status: 400 })
    }

    // Block if there's already an active request for this invoice in
    // the existing table (no unique index there, so we check manually).
    const { data: existingActive } = await admin
      .from("customer_refund_requests")
      .select("id")
      .eq("company_id", context.companyId)
      .eq("invoice_id", id)
      .eq("source_type", "pre_shipment")
      .in("status", ["pending", "approved"])
      .maybeSingle()
    if (existingActive) {
      return NextResponse.json(
        { success: false, error: "There is already an active pre-shipment refund request for this invoice" },
        { status: 409 }
      )
    }

    const { data: req, error: reqErr } = await admin
      .from("customer_refund_requests")
      .insert({
        company_id: context.companyId,
        customer_id: (inv as any).customer_id,
        invoice_id: id,
        source_type: "pre_shipment",
        amount: paid,
        refund_account_id: settlementAccountId,
        refund_method: "cash",
        branch_id: (inv as any).branch_id || null,
        cost_center_id: (inv as any).cost_center_id || null,
        currency: (inv as any).currency_code || "EGP",
        exchange_rate: Number((inv as any).exchange_rate_used || 1) || 1,
        base_amount: paid,
        notes: reason,
        status: "pending",
        requested_by: context.user?.id || null,
        metadata: { mode: modeRaw, reason },
      })
      .select("id")
      .single()
    if (reqErr || !req?.id) {
      return NextResponse.json(
        { success: false, error: reqErr?.message || "Failed to create refund request" },
        { status: 500 }
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
      { success: false, error: error?.message || "Failed to process pre-shipment refund" },
      { status: 500 }
    )
  }
}
