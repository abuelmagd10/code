import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createServiceClient } from "@/lib/supabase/server"
import {
  CustomerVoucherCommandService,
  type CustomerVoucherCommand,
} from "@/lib/services/customer-voucher-command.service"

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
    const voucherDate = String(body?.voucherDate || body?.voucher_date || "").trim()
    const voucherMethod = String(body?.voucherMethod || body?.voucher_method || "cash").trim() || "cash"
    const voucherAccountId = String(body?.voucherAccountId || body?.voucher_account_id || "").trim()
    const referenceNumber = body?.referenceNumber || body?.reference_number || null
    const notes = body?.notes || null
    const exchangeRateId = body?.exchangeRateId || body?.exchange_rate_id || null
    const rateSource = body?.rateSource || body?.rate_source || null
    const uiSurface = body?.uiSurface || body?.ui_surface || "customer_voucher_dialog"

    if (!customerId) {
      return NextResponse.json({ success: false, error: "Customer is required" }, { status: 400 })
    }
    if (!voucherAccountId) {
      return NextResponse.json({ success: false, error: "Voucher account is required" }, { status: 400 })
    }
    if (!voucherDate) {
      return NextResponse.json({ success: false, error: "Voucher date is required" }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: "Voucher amount must be greater than zero" }, { status: 400 })
    }

    const command: CustomerVoucherCommand = {
      companyId: context.companyId,
      customerId,
      amount,
      currencyCode,
      exchangeRate,
      baseAmount,
      voucherDate,
      voucherMethod,
      voucherAccountId,
      referenceNumber,
      notes,
      exchangeRateId,
      rateSource,
      uiSurface,
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["customer-voucher", context.companyId, customerId, voucherDate, amount.toFixed(2), currencyCode, voucherAccountId, referenceNumber || "none"]
    )
    const requestHash = buildFinancialRequestHash({ ...command, actorId: context.user.id })

    const service = new CustomerVoucherCommandService(createServiceClient())
    const result = await service.createVoucher(
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
    console.error("[CUSTOMER_VOUCHER_COMMAND]", error)
    const message = String(error?.message || "Unexpected error while creating customer voucher")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
