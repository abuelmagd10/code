import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createServiceClient } from "@/lib/supabase/server"
import { BankTransferCommandService, isPrivilegedBankingRole, type BankTransferCommand } from "@/lib/services/bank-transfer-command.service"

export async function POST(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  try {
    if (!isPrivilegedBankingRole(context.member.role)) {
      return NextResponse.json({ success: false, error: "Insufficient permission to record bank transfers" }, { status: 403 })
    }

    const body = await request.json()
    const fromAccountId = String(body?.fromAccountId || body?.from_id || "").trim()
    const toAccountId = String(body?.toAccountId || body?.to_id || "").trim()
    const amount = Number(body?.amount || 0)
    const transferDate = String(body?.transferDate || body?.date || "").trim()
    const description = body?.description || null
    const currencyCode = String(body?.currencyCode || body?.currency || "EGP").trim() || "EGP"
    const exchangeRate = Number(body?.exchangeRate || body?.exchange_rate || 1)
    const baseAmount = Number(body?.baseAmount || body?.base_amount || amount)
    const exchangeRateId = body?.exchangeRateId || body?.exchange_rate_id || null
    const rateSource = body?.rateSource || body?.rate_source || null
    const uiSurface = body?.uiSurface || body?.ui_surface || "banking_page"

    if (!fromAccountId || !toAccountId) {
      return NextResponse.json({ success: false, error: "Both transfer accounts are required" }, { status: 400 })
    }
    if (fromAccountId === toAccountId) {
      return NextResponse.json({ success: false, error: "Transfer accounts must be different" }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: "Transfer amount must be greater than zero" }, { status: 400 })
    }
    if (!transferDate) {
      return NextResponse.json({ success: false, error: "Transfer date is required" }, { status: 400 })
    }

    const command: BankTransferCommand = {
      companyId: context.companyId,
      fromAccountId,
      toAccountId,
      amount,
      transferDate,
      description,
      currencyCode,
      exchangeRate,
      baseAmount,
      exchangeRateId,
      rateSource,
      uiSurface,
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["bank-transfer", context.companyId, fromAccountId, toAccountId, transferDate, amount.toFixed(2), currencyCode, exchangeRate]
    )
    const requestHash = buildFinancialRequestHash({ ...command, actorId: context.user.id })

    const service = new BankTransferCommandService(createServiceClient())
    const result = await service.recordTransfer(
      {
        actorId: context.user.id,
        actorRole: context.member.role,
        actorBranchId: context.member.branch_id,
      },
      command,
      { idempotencyKey, requestHash }
    )

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[BANK_TRANSFER_COMMAND]", error)
    const message = String(error?.message || "Unexpected error while recording bank transfer")
    const status = message.includes("Idempotency key already used") ? 409 : message.includes("Insufficient permission") ? 403 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
