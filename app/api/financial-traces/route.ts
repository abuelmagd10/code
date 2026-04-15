import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { FinancialTraceExplorerService } from "@/lib/services/financial-trace-explorer.service"

const getParam = (params: URLSearchParams, ...names: string[]) => {
  for (const name of names) {
    const value = params.get(name)
    if (value && value.trim()) return value.trim()
  }
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
    const limit = Number(params.get("limit") || 50)
    const service = new FinancialTraceExplorerService(createServiceClient())
    const result = await service.search({
      companyId: context.companyId,
      from: getParam(params, "from", "date_from"),
      to: getParam(params, "to", "date_to"),
      cursor: getParam(params, "cursor", "page_cursor"),
      sourceEntity: getParam(params, "source_entity", "sourceEntity"),
      sourceId: getParam(params, "source_id", "sourceId"),
      eventType: getParam(params, "event_type", "eventType"),
      idempotencyKey: getParam(params, "idempotency_key", "idempotencyKey"),
      entityType: getParam(params, "entity_type", "entityType"),
      entityId: getParam(params, "entity_id", "entityId"),
      limit: Number.isFinite(limit) ? limit : 50,
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error("[FINANCIAL_TRACE_EXPLORER]", error)
    return NextResponse.json(
      { success: false, error: String(error?.message || "Failed to load financial traces") },
      { status: 500 }
    )
  }
}
