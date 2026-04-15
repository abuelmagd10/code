import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createServiceClient } from "@/lib/supabase/server"
import {
  CustomerRefundCommandService,
  type CustomerRefundCommand,
} from "@/lib/services/customer-refund-command.service"

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
    const exchangeRateId = body?.exchangeRateId || body?.exchange_rate_id || null
    const rateSource = body?.rateSource || body?.rate_source || null
    const uiSurface = body?.uiSurface || body?.ui_surface || "customer_refund_dialog"

    if (!customerId) {
      return NextResponse.json({ success: false, error: "Customer is required" }, { status: 400 })
    }
    if (!refundAccountId) {
      return NextResponse.json({ success: false, error: "Refund account is required" }, { status: 400 })
    }
    if (!refundDate) {
      return NextResponse.json({ success: false, error: "Refund date is required" }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: "Refund amount must be greater than zero" }, { status: 400 })
    }

    const command: CustomerRefundCommand = {
      companyId: context.companyId,
      customerId,
      amount,
      currencyCode,
      exchangeRate,
      baseAmount,
      refundAccountId,
      refundDate,
      refundMethod,
      notes,
      invoiceId,
      invoiceNumber,
      branchId,
      costCenterId,
      exchangeRateId,
      rateSource,
      uiSurface,
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["customer-refund", context.companyId, customerId, refundDate, amount.toFixed(2), currencyCode, refundAccountId, invoiceId || "none"]
    )
    const requestHash = buildFinancialRequestHash({ ...command, actorId: context.user.id })

    const service = new CustomerRefundCommandService(createServiceClient())
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

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[CUSTOMER_REFUND_COMMAND]", error)
    const message = String(error?.message || "Unexpected error while recording customer refund")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
