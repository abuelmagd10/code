import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { CustomerPaymentCommandService, type CustomerPaymentAllocationCommand, type CreateCustomerPaymentCommand } from "@/lib/services/customer-payment-command.service"

function normalizeAllocations(raw: unknown): CustomerPaymentAllocationCommand[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item: any) => ({
      invoiceId: String(item?.invoiceId || item?.invoice_id || "").trim(),
      amount: Number(item?.amount || 0),
    }))
    .filter((item) => item.invoiceId && item.amount > 0)
    .sort((left, right) => left.invoiceId.localeCompare(right.invoiceId))
}

export async function POST(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  try {
    const body = await request.json()
    const allocations = normalizeAllocations(body?.allocations)
    const customerId = String(body?.customerId || body?.customer_id || "").trim()
    const amount = Number(body?.amount || body?.payment_amount || 0)
    const paymentDate = String(body?.paymentDate || body?.payment_date || "").trim()
    const paymentMethod = String(body?.paymentMethod || body?.payment_method || "").trim()
    const accountId = String(body?.accountId || body?.account_id || "").trim()
    const branchId = body?.branchId || body?.branch_id || context.member.branch_id || null
    const costCenterId = body?.costCenterId || body?.cost_center_id || null
    const warehouseId = body?.warehouseId || body?.warehouse_id || null
    const referenceNumber = body?.referenceNumber || body?.reference_number || null
    const notes = body?.notes || null
    const currencyCode = String(body?.currencyCode || body?.currency_code || "EGP").trim() || "EGP"
    const exchangeRate = Number(body?.exchangeRate || body?.exchange_rate || 1)
    const baseCurrencyAmount = Number(body?.baseCurrencyAmount || body?.base_currency_amount || amount)
    const originalAmount = Number(body?.originalAmount || body?.original_amount || amount)
    const originalCurrency = String(body?.originalCurrency || body?.original_currency || currencyCode).trim() || currencyCode
    const exchangeRateId = body?.exchangeRateId || body?.exchange_rate_id || null
    const rateSource = body?.rateSource || body?.rate_source || null
    const uiSurface = String(body?.uiSurface || body?.ui_surface || "payments_page_customer_create")

    if (!customerId) return NextResponse.json({ success: false, error: "Customer is required" }, { status: 400 })
    if (!paymentDate) return NextResponse.json({ success: false, error: "Payment date is required" }, { status: 400 })
    if (!paymentMethod) return NextResponse.json({ success: false, error: "Payment method is required" }, { status: 400 })
    if (!accountId) return NextResponse.json({ success: false, error: "Receipt account is required" }, { status: 400 })
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ success: false, error: "Payment amount must be greater than zero" }, { status: 400 })

    const command: CreateCustomerPaymentCommand = {
      customerId,
      amount,
      paymentDate,
      paymentMethod,
      accountId,
      branchId,
      costCenterId,
      warehouseId,
      referenceNumber,
      notes,
      currencyCode,
      exchangeRate,
      baseCurrencyAmount,
      originalAmount,
      originalCurrency,
      exchangeRateId,
      rateSource,
      allocations,
      uiSurface,
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["customer-payment-create", context.companyId, customerId, paymentDate, amount.toFixed(2), paymentMethod, accountId, referenceNumber || "none", JSON.stringify(allocations)]
    )
    const requestHash = buildFinancialRequestHash({ ...command, actorId: context.user.id })
    const service = new CustomerPaymentCommandService(await createClient(), createServiceClient())
    const result = await service.createPayment(
      {
        companyId: context.companyId,
        actorId: context.user.id,
        actorRole: context.member.role,
        actorBranchId: context.member.branch_id,
      },
      command,
      { idempotencyKey, requestHash }
    )

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[CUSTOMER_PAYMENTS_CREATE]", error)
    const message = String(error?.message || "Unexpected error while creating customer payment")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
