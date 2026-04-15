import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import {
  FinancialIntegrityCheckService,
  FinancialIntegritySeverity,
} from "@/lib/services/financial-integrity-check.service"

const getParam = (params: URLSearchParams, ...names: string[]) => {
  for (const name of names) {
    const value = params.get(name)
    if (value && value.trim()) return value.trim()
  }
  return null
}

const normalizeSeverity = (value: string | null): FinancialIntegritySeverity | null => {
  if (value === "high" || value === "medium" || value === "low") return value
  return null
}

export async function GET(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request, {
    resource: "reports",
    action: "read",
  })
  if (errorResponse || !context) return errorResponse

  try {
    const params = request.nextUrl.searchParams
    const limit = Number(params.get("limit") || 200)
    const service = new FinancialIntegrityCheckService(createServiceClient())
    const result = await service.run({
      companyId: context.companyId,
      from: getParam(params, "from", "date_from"),
      to: getParam(params, "to", "date_to"),
      severity: normalizeSeverity(getParam(params, "severity")),
      limit: Number.isFinite(limit) ? limit : 200,
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error("[FINANCIAL_INTEGRITY_CHECKS]", error)
    return NextResponse.json(
      { success: false, error: String(error?.message || "Failed to run financial integrity checks") },
      { status: 500 }
    )
  }
}
