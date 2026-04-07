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

export async function GET(req: NextRequest) {
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

    const service = new ConsolidationService(createServiceClient() as any, authSupabase as any)
    const runs = await service.listRunsForActor(user.id)

    return NextResponse.json({
      success: true,
      data: runs,
    })
  } catch (error: any) {
    return serverError(`Failed to list consolidation runs: ${error?.message || "unknown_error"}`)
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
    const hostCompanyId = String(body?.hostCompanyId || "").trim()
    const consolidationGroupId = String(body?.consolidationGroupId || "").trim()
    const periodStart = String(body?.periodStart || "").trim()
    const periodEnd = String(body?.periodEnd || "").trim()
    const asOfTimestamp = String(body?.asOfTimestamp || new Date().toISOString()).trim()
    const runType = String(body?.runType || "dry_run").trim()
    const executionMode = String(body?.executionMode || "dry_run").trim()

    if (!hostCompanyId) return badRequestError("hostCompanyId is required")
    if (!consolidationGroupId) return badRequestError("consolidationGroupId is required")
    if (!periodStart) return badRequestError("periodStart is required")
    if (!periodEnd) return badRequestError("periodEnd is required")

    const scope = body?.scope || { scopeMode: "full_group" }
    const rateSetLock = body?.rateSetLock || {
      rateSetCode: "GROUP_DEFAULT_RATESET",
      rateSource: "manual_lock",
      asOfTimestamp,
      closingRateDate: periodEnd,
      averageRateWindowStart: periodStart,
      averageRateWindowEnd: periodEnd,
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      req.headers.get("Idempotency-Key"),
      [
        "consolidation-run-create",
        hostCompanyId,
        consolidationGroupId,
        periodStart,
        periodEnd,
        runType,
        executionMode,
        asOfTimestamp,
      ]
    )

    const requestHash = buildFinancialRequestHash(body)
    const service = new ConsolidationService(createServiceClient() as any, authSupabase as any)
    const result = await service.createRun(
      {
        hostCompanyId,
        consolidationGroupId,
        periodStart,
        periodEnd,
        runType: runType as any,
        executionMode: executionMode as any,
        asOfTimestamp,
        runVersion: body?.runVersion ?? 1,
        parentRunId: body?.parentRunId ?? null,
        scope,
        rateSetLock,
        statementMappingVersion: String(body?.statementMappingVersion || "GROUP_DEFAULT_V1"),
        eliminationRuleSetCode: String(body?.eliminationRuleSetCode || "DEFAULT_ELIM_RULES"),
      },
      actorOf(user),
      {
        idempotencyKey,
        requestHash,
        replayFromRunId: body?.replayFromRunId ?? null,
      }
    )

    return NextResponse.json({
      success: true,
      run: result.run,
      traceId: result.traceId || null,
      alreadyExists: !!result.alreadyExists,
    })
  } catch (error: any) {
    return serverError(`Failed to create consolidation run: ${error?.message || "unknown_error"}`)
  }
}
