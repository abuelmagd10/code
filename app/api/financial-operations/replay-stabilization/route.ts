import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { FinancialReplayRecoveryService } from "@/lib/services/financial-replay-recovery.service"

export async function GET(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request, {
    resource: "reports",
    action: "read",
  })
  if (errorResponse || !context) return errorResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const windowCount = Number(searchParams.get("window_count") || searchParams.get("windowCount") || "5")
    const perWindowLimit = Number(searchParams.get("per_window_limit") || searchParams.get("perWindowLimit") || "10")
    const service = new FinancialReplayRecoveryService(createServiceClient())
    const result = await service.stabilizeReplayConfidence(
      context.companyId,
      context.user.id,
      Number.isFinite(windowCount) ? windowCount : 5,
      Number.isFinite(perWindowLimit) ? perWindowLimit : 10
    )
    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[FINANCIAL_REPLAY_STABILIZATION]", error)
    return NextResponse.json(
      { success: false, error: String(error?.message || "Failed to load replay confidence stabilization") },
      { status: 500 }
    )
  }
}
