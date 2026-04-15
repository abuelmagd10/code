import { NextRequest, NextResponse } from "next/server"
import { secureApiRequest, badRequestError, serverError } from "@/lib/api-security-enhanced"
import { enterpriseFinanceFlags } from "@/lib/enterprise-finance-flags"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { ConsolidationService } from "@/lib/services/consolidation.service"
import { createClient, createServiceClient } from "@/lib/supabase/server"

function disabledResponse() {
  return NextResponse.json(
    { success: false, error: "Consolidation engine is not enabled" },
    { status: 403 }
  )
}

function actorOf(user: any) {
  return {
    userId: user?.id || "",
    email: user?.email || null,
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!enterpriseFinanceFlags.consolidationEngineEnabled) {
      return disabledResponse()
    }

    const authSupabase = await createClient()
    const { user, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      supabase: authSupabase,
    })
    if (error) return error

    const body = await req.json()
    const runId = String(body?.runId || "").trim()
    const executionMode = String(body?.executionMode || "dry_run").trim()
    const replayFromRunId = body?.replayFromRunId ? String(body.replayFromRunId).trim() : null

    if (!runId) return badRequestError("runId is required")

    const idempotencyKey = resolveFinancialIdempotencyKey(
      req.headers.get("Idempotency-Key"),
      [
        "consolidation-run-execute",
        runId,
        executionMode,
        JSON.stringify(body?.steps || []),
        JSON.stringify(body?.statementTypes || []),
      ]
    )

    const requestHash = buildFinancialRequestHash(body)
    const service = new ConsolidationService(createServiceClient() as any, authSupabase as any)
    const result = await service.executeRun(
      {
        runId,
        executionMode: executionMode as any,
        steps: Array.isArray(body?.steps) ? body.steps : undefined,
        statementTypes: Array.isArray(body?.statementTypes) ? body.statementTypes : undefined,
      },
      actorOf(user),
      {
        idempotencyKey,
        requestHash,
        replayFromRunId,
        uiSurface: "consolidation_execute_api",
      }
    )

    return NextResponse.json({
      success: true,
      run: result.run,
      executedSteps: result.executedSteps,
      statementRuns: result.statementRuns,
      traceId: result.traceId || null,
      alreadyCompleted: !!result.alreadyCompleted,
      idempotencyKey,
      requestHash,
    })
  } catch (error: any) {
    return serverError(`Failed to execute consolidation run: ${error?.message || "unknown_error"}`)
  }
}
