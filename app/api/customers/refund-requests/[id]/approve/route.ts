/**
 * POST /api/customers/refund-requests/[id]/approve
 *
 * v3.74.183 — approves a customer-credit refund request and executes the
 * actual refund (single-step approval-then-execute, matching how
 * accountants and owners actually work). The journal entry / payment /
 * customer_credit_ledger lines come from the existing
 * CustomerRefundCommandService.recordRefund() path with operationId
 * already unique per call (v3.74.182).
 *
 * Allowed roles: owner / admin / general_manager. The accountant who
 * filed the request cannot approve their own.
 */

import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createServiceClient } from "@/lib/supabase/server"
import { CustomerRefundCommandService } from "@/lib/services/customer-refund-command.service"

const PRIVILEGED_ROLES = new Set(["owner", "admin", "general_manager"])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  try {
    const { id } = await params

    if (!PRIVILEGED_ROLES.has(String(context.member.role || ""))) {
      return NextResponse.json(
        { success: false, error: "Forbidden: only owner / admin / general_manager can approve" },
        { status: 403 }
      )
    }

    const admin = createServiceClient()

    // Read the request row.
    const { data: req, error: selectErr } = await admin
      .from("customer_refund_requests")
      .select("id, status, source_type, customer_id, invoice_id, amount, currency, exchange_rate, base_amount, refund_account_id, refund_date, refund_method, notes, branch_id, cost_center_id, metadata, requested_by")
      .eq("id", id)
      .eq("company_id", context.companyId)
      .maybeSingle()

    if (selectErr || !req) {
      return NextResponse.json({ success: false, error: "Refund request not found" }, { status: 404 })
    }
    if (req.status !== "pending") {
      return NextResponse.json({ success: false, error: `Cannot approve a ${req.status} request` }, { status: 400 })
    }
    if (req.source_type !== "credit_refund") {
      return NextResponse.json(
        { success: false, error: "This endpoint approves credit_refund requests only" },
        { status: 400 }
      )
    }
    if (req.requested_by === context.user.id) {
      return NextResponse.json(
        { success: false, error: "Segregation of duties: the requester cannot approve their own request" },
        { status: 403 }
      )
    }

    // Execute the refund using the existing service. operationId is minted
    // inside recordRefund and feeds the JE reference_id (v3.74.182), so
    // there is no DUPLICATE_JOURNAL_VIOLATION risk.
    const command = {
      companyId: context.companyId,
      customerId: req.customer_id,
      amount: Number(req.amount),
      currencyCode: req.currency || "EGP",
      exchangeRate: Number(req.exchange_rate || 1),
      baseAmount: Number(req.base_amount || req.amount),
      refundAccountId: req.refund_account_id || "",
      refundDate: req.refund_date ? String(req.refund_date) : new Date().toISOString().slice(0, 10),
      refundMethod: req.refund_method || "cash",
      notes: req.notes || null,
      invoiceId: req.invoice_id || null,
      invoiceNumber: ((req.metadata as any) || {})?.invoice_number || null,
      branchId: req.branch_id || null,
      costCenterId: req.cost_center_id || null,
      exchangeRateId: null,
      rateSource: null,
      uiSurface: "customer_refund_approval",
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["customer-refund-approve", context.companyId, id]
    )
    const requestHash = buildFinancialRequestHash({ ...command, requestId: id })

    const service = new CustomerRefundCommandService(admin)
    const result = await service.recordRefund(
      {
        actorId: context.user.id,
        actorRole: context.member.role,
        actorBranchId: context.member.branch_id,
        actorCostCenterId: context.member.cost_center_id,
      },
      command,
      { idempotencyKey, requestHash }
    )

    // Mark the request row executed.
    await admin
      .from("customer_refund_requests")
      .update({
        status: "executed",
        approved_by: context.user.id,
        approved_at: new Date().toISOString(),
        executed_by: context.user.id,
        executed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", context.companyId)

    // Notify the requester.
    try {
      const customerName = ((req.metadata as any) || {})?.customer_name || "العَميل"
      const amountText = `${Number(req.amount).toLocaleString()} ${req.currency || "EGP"}`
      await admin.rpc("create_notification", {
        p_company_id: context.companyId,
        p_reference_type: "customer_refund_request",
        p_reference_id: id,
        p_title: `تم اعتماد صرف الرَّصيد — ${customerName}`,
        p_message: `تم اعتماد طلب صرف رصيد عميل بقيمة ${amountText} للعميل "${customerName}" وتنفيذه.`,
        p_created_by: context.user.id,
        p_branch_id: req.branch_id,
        p_cost_center_id: req.cost_center_id,
        p_warehouse_id: null,
        p_assigned_to_role: null,
        p_assigned_to_user: req.requested_by,
        p_priority: "normal",
        p_event_key: `customer_refund_request:${id}:approved:user:${req.requested_by}`,
        p_severity: "info",
        p_category: "approvals",
      })
    } catch { /* notification optional */ }

    return NextResponse.json({ success: true, result })
  } catch (error: any) {
    console.error("[CUSTOMER_REFUND_REQUEST_APPROVE]", error)
    return NextResponse.json({ success: false, error: error?.message || "Approval failed" }, { status: 500 })
  }
}
