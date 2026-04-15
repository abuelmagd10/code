import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { FinancialReplayRecoveryService } from "@/lib/services/financial-replay-recovery.service"

const asNullableString = (value: unknown) => {
  const parsed = String(value || "").trim()
  return parsed.length > 0 ? parsed : null
}

export async function POST(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request, {
    resource: "reports",
    action: "read",
  })
  if (errorResponse || !context) return errorResponse

  try {
    const body = await request.json()
    const idempotencyKey = asNullableString(body?.idempotency_key || body?.idempotencyKey)
    if (!idempotencyKey) {
      return NextResponse.json({ success: false, error: "idempotency_key is required" }, { status: 400 })
    }

    const dryRun = body?.dry_run !== false && body?.dryRun !== false
    const service = new FinancialReplayRecoveryService(createServiceClient())
    const result = dryRun
      ? await service.planReplay({
          companyId: context.companyId,
          actorId: context.user.id,
          idempotencyKey,
          requestHash: asNullableString(body?.request_hash || body?.requestHash),
          dryRun: true,
          uiSurface: body?.ui_surface || body?.uiSurface || "financial_replay_api",
        })
      : await service.executeReplay({
          companyId: context.companyId,
          actorId: context.user.id,
          idempotencyKey,
          requestHash: asNullableString(body?.request_hash || body?.requestHash),
          dryRun: false,
          uiSurface: body?.ui_surface || body?.uiSurface || "financial_replay_api",
        })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[FINANCIAL_REPLAY_BY_IDEMPOTENCY]", error)
    const message = String(error?.message || "Failed to plan financial replay")
    const status = message.includes("not found") ? 404 :
      message.includes("multiple traces") || message.includes("required") ? 400 :
      message.includes("blocked") || message.includes("not registered") || message.includes("not implemented") ? 409 :
      500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
