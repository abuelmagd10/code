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
    const mode = String(body?.mode || body?.execution_mode || "shadow").trim().toLowerCase()
    if (mode !== "shadow") {
      const executionSwitch = FinancialReplayRecoveryService.resolveExecutionReadinessSwitch({
        currentStabilityStatus: "NOT_EVALUATED",
        manualApprovalPresent: body?.manual_approval === true || body?.manualApproval === true,
      })
      return NextResponse.json(
        {
          success: false,
          error: "Replay execution is disabled by the X2.4 Phase B.6 governance switch. Use mode=shadow or issue an audit-only commit intent.",
          execution_switch: executionSwitch,
        },
        { status: 409 }
      )
    }

    const traceId = asNullableString(body?.trace_id || body?.traceId)
    const idempotencyKey = asNullableString(body?.idempotency_key || body?.idempotencyKey)
    if (!traceId && !idempotencyKey) {
      return NextResponse.json({ success: false, error: "trace_id or idempotency_key is required" }, { status: 400 })
    }
    if (traceId && idempotencyKey) {
      return NextResponse.json({ success: false, error: "Use either trace_id or idempotency_key, not both" }, { status: 400 })
    }

    const service = new FinancialReplayRecoveryService(createServiceClient())
    const result = await service.shadowReplayExecution({
      companyId: context.companyId,
      actorId: context.user.id,
      traceId,
      idempotencyKey,
      requestHash: asNullableString(body?.request_hash || body?.requestHash),
      dryRun: true,
      uiSurface: body?.ui_surface || body?.uiSurface || "financial_replay_execute_shadow_api",
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[FINANCIAL_REPLAY_EXECUTE_SHADOW]", error)
    const message = String(error?.message || "Failed to evaluate replay execution gates")
    const status = message.includes("not found") ? 404 :
      message.includes("multiple traces") || message.includes("required") ? 400 :
      500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
