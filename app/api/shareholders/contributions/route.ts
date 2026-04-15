import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createServiceClient } from "@/lib/supabase/server"
import {
  ShareholderCapitalCommandService,
  type ShareholderCapitalContributionCommand,
} from "@/lib/services/shareholder-capital-command.service"

export async function POST(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  try {
    const body = await request.json()
    const shareholderId = String(body?.shareholderId || body?.shareholder_id || "").trim()
    const contributionDate = String(body?.contributionDate || body?.contribution_date || "").trim()
    const amount = Number(body?.amount || 0)
    const paymentAccountId = String(body?.paymentAccountId || body?.payment_account_id || "").trim()
    const notes = body?.notes || null
    const branchId = body?.branchId || body?.branch_id || null
    const costCenterId = body?.costCenterId || body?.cost_center_id || null
    const uiSurface = body?.uiSurface || body?.ui_surface || "shareholders_page"

    if (!shareholderId) {
      return NextResponse.json({ success: false, error: "Shareholder is required" }, { status: 400 })
    }
    if (!contributionDate) {
      return NextResponse.json({ success: false, error: "Contribution date is required" }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: "Contribution amount must be greater than zero" }, { status: 400 })
    }
    if (!paymentAccountId) {
      return NextResponse.json({ success: false, error: "Payment account is required" }, { status: 400 })
    }

    const command: ShareholderCapitalContributionCommand = {
      companyId: context.companyId,
      shareholderId,
      contributionDate,
      amount,
      paymentAccountId,
      notes,
      branchId,
      costCenterId,
      uiSurface,
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["capital-contribution", context.companyId, shareholderId, contributionDate, amount.toFixed(2), paymentAccountId]
    )
    const requestHash = buildFinancialRequestHash({ ...command, actorId: context.user.id })

    const service = new ShareholderCapitalCommandService(createServiceClient())
    const result = await service.recordContribution(
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
    console.error("[SHAREHOLDER_CAPITAL_CONTRIBUTION_COMMAND]", error)
    const message = String(error?.message || "Unexpected error while recording capital contribution")
    const status = message.includes("Idempotency key already used") ? 409 : message.includes("Insufficient permission") ? 403 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
