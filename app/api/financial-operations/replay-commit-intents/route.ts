import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { FinancialReplayRecoveryService } from "@/lib/services/financial-replay-recovery.service"

const asNullableString = (value: unknown) => {
  const parsed = String(value || "").trim()
  return parsed.length > 0 ? parsed : null
}

const parseTtlMinutes = (value: unknown) => {
  const parsed = Number(value || 15)
  return Number.isFinite(parsed) ? parsed : 15
}

const statusForReplayCommitError = (message: string) => {
  if (message.includes("not found")) return 404
  if (
    message.includes("required") ||
    message.includes("Use either") ||
    message.includes("MISMATCH")
  ) return 400
  if (
    message.includes("BLOCKED") ||
    message.includes("manual_approval_missing") ||
    message.includes("ALREADY_ISSUED")
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
    const traceId = asNullableString(body?.trace_id || body?.traceId)
    const idempotencyKey = asNullableString(body?.idempotency_key || body?.idempotencyKey)
    const previewResultHash = asNullableString(body?.preview_result_hash || body?.previewResultHash)

    const service = new FinancialReplayRecoveryService(createServiceClient())
    const result = await service.issueReplayCommitIntent({
      companyId: context.companyId,
      actorId: context.user.id,
      traceId,
      idempotencyKey,
      requestHash: asNullableString(body?.request_hash || body?.requestHash),
      previewResultHash: previewResultHash || "",
      manualApproval: body?.manual_approval === true || body?.manualApproval === true,
      ttlMinutes: parseTtlMinutes(body?.ttl_minutes || body?.ttlMinutes),
      uiSurface: body?.ui_surface || body?.uiSurface || "financial_replay_commit_intent_api",
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[FINANCIAL_REPLAY_COMMIT_INTENT]", error)
    const message = String(error?.message || "Failed to issue replay commit intent")
    return NextResponse.json({ success: false, error: message }, { status: statusForReplayCommitError(message) })
  }
}
