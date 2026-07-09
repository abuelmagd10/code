/**
 * POST /api/customers/refund-requests
 *
 * v3.74.183 — file a customer-credit refund request that needs management
 * approval before any money moves. Replaces the immediate /api/customers/
 * refunds path for non-privileged users. Stores in customer_refund_requests
 * with source_type='credit_refund' (separate from the existing payment-
 * correction rows).
 *
 * Notification: targets admin only (UI cross-visibility surfaces it to
 * owner + general_manager too).
 */

import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  try {
    const body = await request.json()
    const customerId = String(body?.customerId || body?.customer_id || "").trim()
    const amount = Number(body?.amount || 0)
    const currencyCode = String(body?.currencyCode || body?.currency || "EGP").trim() || "EGP"
    const exchangeRate = Number(body?.exchangeRate || body?.exchange_rate || 1)
    const baseAmount = Number(body?.baseAmount || body?.base_amount || amount)
    const refundAccountId = String(body?.refundAccountId || body?.refund_account_id || "").trim()
    const refundDate = String(body?.refundDate || body?.refund_date || "").trim()
    const refundMethod = String(body?.refundMethod || body?.refund_method || "cash").trim() || "cash"
    const notes = body?.notes || null
    const invoiceId = body?.invoiceId || body?.invoice_id || null
    const invoiceNumber = body?.invoiceNumber || body?.invoice_number || null
    const branchId = body?.branchId || body?.branch_id || null
    const costCenterId = body?.costCenterId || body?.cost_center_id || null
    // v3.74.200 — Account FX. Persisted in metadata so the approver can
    // execute the refund with the same conversion the accountant chose.
    const accountCurrency = body?.accountCurrency || body?.account_currency || null
    const accountFxRate = body?.accountFxRate != null ? Number(body.accountFxRate) : null
    const accountFxRateId = body?.accountFxRateId || body?.account_fx_rate_id || null
    const accountFxSource = body?.accountFxSource || body?.account_fx_source || null
    const accountNativeAmount = body?.accountNativeAmount != null ? Number(body.accountNativeAmount) : null

    if (!customerId) return NextResponse.json({ success: false, error: "Customer is required" }, { status: 400 })
    if (!refundAccountId) return NextResponse.json({ success: false, error: "Refund account is required" }, { status: 400 })
    if (!refundDate) return NextResponse.json({ success: false, error: "Refund date is required" }, { status: 400 })
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: "Refund amount must be greater than zero" }, { status: 400 })
    }

    const admin = createServiceClient()

    // Pull customer name + branch for notification text + branch fallback.
    const { data: customer } = await admin
      .from("customers").select("name, branch_id")
      .eq("id", customerId).eq("company_id", context.companyId).maybeSingle()

    const { data: refundReq, error: insertErr } = await admin
      .from("customer_refund_requests")
      .insert({
        company_id: context.companyId,
        customer_id: customerId,
        invoice_id: invoiceId || null,
        source_type: "credit_refund",
        amount,
        status: "pending",
        notes,
        requested_by: context.user.id,
        metadata: {
          customer_name: customer?.name || null,
          invoice_number: invoiceNumber || null,
          // v3.74.200 — Account FX snapshot for the approver.
          account_currency: accountCurrency,
          account_fx_rate: accountFxRate,
          account_fx_rate_id: accountFxRateId,
          account_fx_source: accountFxSource,
          account_native_amount: accountNativeAmount,
        },
        refund_account_id: refundAccountId,
        branch_id: branchId || (customer as any)?.branch_id || null,
        cost_center_id: costCenterId,
        refund_method: refundMethod,
        currency: currencyCode,
        exchange_rate: exchangeRate,
        base_amount: baseAmount,
        refund_date: refundDate,
      })
      .select("id")
      .single()

    if (insertErr || !refundReq?.id) {
      console.error("[CUSTOMER_REFUND_REQUEST_CREATE]", insertErr)
      return NextResponse.json({ success: false, error: insertErr?.message || "Failed to file refund request" }, { status: 500 })
    }

    // Notify admin (UI rule lifts this to owner + general_manager too).
    try {
      const amountText = `${amount.toLocaleString()} ${currencyCode}`
      const supplierName = customer?.name || "العَميل"
      const title = `طلب صرف رصيد عميل — ${supplierName}`
      const message = `تم رفع طلب صرف رصيد عميل دائن بقيمة ${amountText} للعميل "${supplierName}" ويحتاج إلى اعتمادك.`
      await admin.rpc("create_notification", {
        p_company_id: context.companyId,
        p_reference_type: "customer_refund_request",
        p_reference_id: refundReq.id,
        p_title: title,
        p_message: message,
        p_created_by: context.user.id,
        p_branch_id: branchId || (customer as any)?.branch_id || null,
        p_cost_center_id: costCenterId,
        p_warehouse_id: null,
        p_assigned_to_role: "admin",
        p_assigned_to_user: null,
        p_priority: "high",
        p_event_key: `customer_refund_request:${refundReq.id}:created:admin`,
        p_severity: "warning",
        p_category: "approvals",
        // v3.74.588 — طلب صرف رصيد عميل بانتظار الاعتماد (مرحلة طلب)
        p_kind: "action",
      })
    } catch (notifErr) {
      console.warn("[CUSTOMER_REFUND_REQUEST_CREATE] notification error (non-fatal):", notifErr)
    }

    return NextResponse.json({ success: true, request_id: refundReq.id })
  } catch (error: any) {
    console.error("[CUSTOMER_REFUND_REQUEST_CREATE]", error)
    return NextResponse.json({ success: false, error: error?.message || "Unexpected error" }, { status: 500 })
  }
}
