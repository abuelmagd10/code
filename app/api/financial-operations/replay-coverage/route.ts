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
    const sampleLimit = Number(searchParams.get("sample_limit") || searchParams.get("sampleLimit") || "5000")
    const service = new FinancialReplayRecoveryService(createServiceClient())
    const result = await service.getHandlerCoverage(context.companyId, Number.isFinite(sampleLimit) ? sampleLimit : 5000)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[FINANCIAL_REPLAY_COVERAGE]", error)
    return NextResponse.json(
      { success: false, error: String(error?.message || "Failed to load replay coverage") },
      { status: 500 }
    )
  }
}
