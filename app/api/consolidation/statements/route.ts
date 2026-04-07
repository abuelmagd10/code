import { NextRequest, NextResponse } from "next/server"
import { secureApiRequest, badRequestError, serverError } from "@/lib/api-security-enhanced"
import { enterpriseFinanceFlags } from "@/lib/enterprise-finance-flags"
import { ConsolidationService } from "@/lib/services/consolidation.service"
import { createClient, createServiceClient } from "@/lib/supabase/server"

function disabledResponse() {
  return NextResponse.json(
    { success: false, error: "Group statements are not enabled" },
    { status: 403 }
  )
}

export async function GET(req: NextRequest) {
  try {
    if (!enterpriseFinanceFlags.consolidationEngineEnabled || !enterpriseFinanceFlags.groupStatementsEnabled) {
      return disabledResponse()
    }

    const authSupabase = await createClient()
    const { user, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      supabase: authSupabase,
    })
    if (error) return error

    const { searchParams } = new URL(req.url)
    const runId = String(searchParams.get("runId") || "").trim()
    const statementType = String(searchParams.get("statementType") || "").trim()

    if (!runId) return badRequestError("runId is required")

    const service = new ConsolidationService(createServiceClient() as any, authSupabase as any)
    const result = await service.fetchStatements(runId, statementType ? statementType as any : undefined)

    return NextResponse.json({
      success: true,
      run: result.run,
      statements: result.statements,
      actorUserId: user.id,
    })
  } catch (error: any) {
    return serverError(`Failed to fetch consolidated statements: ${error?.message || "unknown_error"}`)
  }
}
