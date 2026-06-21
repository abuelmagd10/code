/**
 * v3.74.250 / 3.74.253 — POST /api/invoices/[id]/pre-shipment-refund
 *
 * v3.74.253: owner/general_manager self-execute. Anyone else creates a
 * refund_request that lands in /refund-approvals for owner/GM review.
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { executePreShipmentRefund } from "@/lib/pre-shipment-refund"
import { notifyRefundRequestSubmitted } from "@/lib/refund-request-notifications"

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
          revenueReversalJeId: result.revenueReversalJeId,
          paymentReversalJeIds: result.paymentReversalJeIds,
        },
      })
    }

    const { data: inv, error: invErr } = await admin
      .from("invoices")
      .select("id, company_id, branch_id, status, warehouse_status, paid_amount, pre_shipment_refund_at")
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

    const { data: req, error: reqErr } = await admin
      .from("refund_requests")
      .insert({
        company_id: context.companyId,
        branch_id: (inv as any).branch_id || null,
        source_type: "invoice",
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
            ? "There is already an active refund request for this invoice"
            : reqErr?.message || "Failed to create refund request",
        },
        { status: dup ? 409 : 500 }
      )
    }

    // v3.74.254 — notify owner / general_manager that a request is waiting.
    const inv2 = inv as any
    let invNumberForNotify = ""
    try {
      const { data: invRow } = await admin
        .from("invoices").select("invoice_number").eq("id", id).maybeSingle()
      invNumberForNotify = (invRow as any)?.invoice_number || id.slice(0, 8)
    } catch {}
    await notifyRefundRequestSubmitted(admin as any, {
      companyId: context.companyId,
      requestId: req.id,
      sourceType: 'invoice',
      sourceNumber: invNumberForNotify,
      branchId: inv2.branch_id || null,
      createdBy: context.user?.id || '',
      amount: paid,
      modeLabel: modeRaw === 'cancel_invoice' ? 'إلغاء الفاتورة' : 'إبقاء مفتوحة',
    })

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
