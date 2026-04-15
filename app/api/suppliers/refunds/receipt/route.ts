import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createServiceClient } from "@/lib/supabase/server"
import {
  SupplierRefundReceiptCommandService,
  type SupplierRefundReceiptCommand,
} from "@/lib/services/supplier-refund-receipt-command.service"

export async function POST(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  try {
    const body = await request.json()
    const supplierId = String(body?.supplierId || body?.supplier_id || "").trim()
    const amount = Number(body?.amount || 0)
    const currencyCode = String(body?.currencyCode || body?.currency || "EGP").trim() || "EGP"
    const exchangeRate = Number(body?.exchangeRate || body?.exchange_rate || 1)
    const baseAmount = Number(body?.baseAmount || body?.base_amount || amount)
    const receiptAccountId = String(body?.receiptAccountId || body?.receipt_account_id || "").trim()
    const receiptDate = String(body?.receiptDate || body?.receipt_date || "").trim()
    const notes = body?.notes || null
    const branchId = body?.branchId || body?.branch_id || null
    const costCenterId = body?.costCenterId || body?.cost_center_id || null
    const exchangeRateId = body?.exchangeRateId || body?.exchange_rate_id || null
    const rateSource = body?.rateSource || body?.rate_source || null
    const uiSurface = body?.uiSurface || body?.ui_surface || "supplier_receipt_dialog"

    if (!supplierId) {
      return NextResponse.json({ success: false, error: "Supplier is required" }, { status: 400 })
    }
    if (!receiptAccountId) {
      return NextResponse.json({ success: false, error: "Receipt account is required" }, { status: 400 })
    }
    if (!receiptDate) {
      return NextResponse.json({ success: false, error: "Receipt date is required" }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: "Receipt amount must be greater than zero" }, { status: 400 })
    }

    const command: SupplierRefundReceiptCommand = {
      companyId: context.companyId,
      supplierId,
      amount,
      currencyCode,
      exchangeRate,
      baseAmount,
      receiptAccountId,
      receiptDate,
      notes,
      branchId,
      costCenterId,
      exchangeRateId,
      rateSource,
      uiSurface,
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["supplier-refund-receipt", context.companyId, supplierId, receiptDate, amount.toFixed(2), currencyCode, receiptAccountId]
    )
    const requestHash = buildFinancialRequestHash({ ...command, actorId: context.user.id })

    const service = new SupplierRefundReceiptCommandService(createServiceClient())
    const result = await service.recordReceipt(
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
    console.error("[SUPPLIER_REFUND_RECEIPT_COMMAND]", error)
    const message = String(error?.message || "Unexpected error while recording supplier refund receipt")
    const status = message.includes("Idempotency key already used") ? 409 : message.includes("Insufficient permission") ? 403 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
