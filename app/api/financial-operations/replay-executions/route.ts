import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { FinancialReplayRecoveryService } from "@/lib/services/financial-replay-recovery.service"

const asString = (value: unknown) => String(value || "").trim()

const statusForReplayExecutionError = (message: string) => {
  if (message.includes("NOT_FOUND")) return 404
  if (
    message.includes("required") ||
    message.includes("MISMATCH") ||
    message.includes("TOKEN_INVALID")
  ) return 400
  if (
    message.includes("BLOCKED") ||
    message.includes("NOT_ACTIVE") ||
    message.includes("EXPIRED")
  ) return 409
  return 500
}

export async function POST(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request, {
    resource: "reports",
    action: "approve",
  })
  if (errorResponse || !context) return errorResponse

  try {
    const body = await request.json()
    const service = new FinancialReplayRecoveryService(createServiceClient())
    const result = await service.activateReplayExecution({
      companyId: context.companyId,
      actorId: context.user.id,
      intentId: asString(body?.intent_id || body?.intentId),
      token: asString(body?.token),
      previewResultHash: asString(body?.preview_result_hash || body?.previewResultHash),
      uiSurface: body?.ui_surface || body?.uiSurface || "financial_replay_execution_api",
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[FINANCIAL_REPLAY_EXECUTION_ACTIVATION]", error)
    const message = String(error?.message || "Failed to activate replay execution")
    return NextResponse.json({ success: false, error: message }, { status: statusForReplayExecutionError(message) })
  }
}
