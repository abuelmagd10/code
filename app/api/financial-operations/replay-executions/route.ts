import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { FinancialReplayRecoveryService } from "@/lib/services/financial-replay-recovery.service"
import { GovernanceNotificationService } from "@/lib/services/governance-notification.service"

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

const isReplayExecutionPolicyViolation = (message: string) =>
  message.includes("BLOCKED") ||
  message.includes("NOT_ACTIVE") ||
  message.includes("EXPIRED") ||
  message.includes("TOKEN_INVALID") ||
  message.includes("MISMATCH")

export async function POST(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request, {
    resource: "reports",
    action: "approve",
  })
  if (errorResponse || !context) return errorResponse

  let intentId = ""

  try {
    const body = await request.json()
    const serviceClient = createServiceClient()
    const service = new FinancialReplayRecoveryService(serviceClient)
    intentId = asString(body?.intent_id || body?.intentId)
    const result = await service.activateReplayExecution({
      companyId: context.companyId,
      actorId: context.user.id,
      intentId,
      token: asString(body?.token),
      previewResultHash: asString(body?.preview_result_hash || body?.previewResultHash),
      uiSurface: body?.ui_surface || body?.uiSurface || "financial_replay_execution_api",
    })

    try {
      await new GovernanceNotificationService(serviceClient).notifyReplayExecutionActivated({
        companyId: context.companyId,
        createdBy: context.user.id,
        executionId: result.execution.id,
        commitIntentId: result.execution.commit_intent_id,
        sourceTraceId: result.execution.source_trace_id,
        eventType: result.execution.event_type,
        payloadVersion: result.execution.payload_version,
        financialWritesPerformed: result.execution.financial_writes_performed,
        executedAt: result.execution.executed_at,
      })
    } catch (notificationError: any) {
      console.error("[FINANCIAL_REPLAY_EXECUTION_NOTIFICATION]", notificationError)
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[FINANCIAL_REPLAY_EXECUTION_ACTIVATION]", error)
    const message = String(error?.message || "Failed to activate replay execution")
    if (context?.user?.id && isReplayExecutionPolicyViolation(message)) {
      try {
        const serviceClient = createServiceClient()
        await new GovernanceNotificationService(serviceClient).notifyReplayPolicyViolation({
          companyId: context.companyId,
          createdBy: context.user.id,
          violationId: intentId || "unknown_replay_intent",
          stage: "execution_activation",
          subjectId: intentId || "unknown_replay_intent",
          subjectType: "intent",
          reason: message,
          uiSurface: "financial_replay_execution_api",
        })
      } catch (notificationError: any) {
        console.error("[FINANCIAL_REPLAY_EXECUTION_POLICY_NOTIFICATION]", notificationError)
      }
    }
    return NextResponse.json({ success: false, error: message }, { status: statusForReplayExecutionError(message) })
  }
}
