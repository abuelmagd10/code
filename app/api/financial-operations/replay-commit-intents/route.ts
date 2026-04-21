import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { FinancialReplayRecoveryService } from "@/lib/services/financial-replay-recovery.service"
import { GovernanceNotificationService } from "@/lib/services/governance-notification.service"

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

const isReplayCommitPolicyViolation = (message: string) =>
  message.includes("BLOCKED") ||
  message.includes("manual_approval_missing") ||
  message.includes("MISMATCH") ||
  message.includes("ALREADY_ISSUED")

export async function POST(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request, {
    resource: "reports",
    action: "approve",
  })
  if (errorResponse || !context) return errorResponse

  let traceId: string | null = null
  let idempotencyKey: string | null = null

  try {
    const body = await request.json()
    traceId = asNullableString(body?.trace_id || body?.traceId)
    idempotencyKey = asNullableString(body?.idempotency_key || body?.idempotencyKey)
    const previewResultHash = asNullableString(body?.preview_result_hash || body?.previewResultHash)

    const serviceClient = createServiceClient()
    const service = new FinancialReplayRecoveryService(serviceClient)
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

    try {
      await new GovernanceNotificationService(serviceClient).notifyReplayCommitIntentIssued({
        companyId: context.companyId,
        createdBy: context.user.id,
        intentId: result.intent.id,
        sourceTraceId: result.intent.source_trace_id,
        eventType: result.intent.event_type,
        payloadVersion: result.intent.payload_version,
        expiresAt: result.intent.expires_at,
      })
    } catch (notificationError: any) {
      console.error("[FINANCIAL_REPLAY_COMMIT_INTENT_NOTIFICATION]", notificationError)
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[FINANCIAL_REPLAY_COMMIT_INTENT]", error)
    const message = String(error?.message || "Failed to issue replay commit intent")
    if (context?.user?.id && isReplayCommitPolicyViolation(message)) {
      try {
        const serviceClient = createServiceClient()
        await new GovernanceNotificationService(serviceClient).notifyReplayPolicyViolation({
          companyId: context.companyId,
          createdBy: context.user.id,
          violationId: traceId || idempotencyKey || "unknown_replay_subject",
          stage: "commit_intent",
          subjectId: traceId || idempotencyKey || "unknown_replay_subject",
          subjectType: traceId ? "trace" : "idempotency_key",
          reason: message,
          uiSurface: "financial_replay_commit_intent_api",
        })
      } catch (notificationError: any) {
        console.error("[FINANCIAL_REPLAY_COMMIT_INTENT_POLICY_NOTIFICATION]", notificationError)
      }
    }
    return NextResponse.json({ success: false, error: message }, { status: statusForReplayCommitError(message) })
  }
}
