import { NextRequest, NextResponse } from "next/server"
import { secureApiRequest, serverError } from "@/lib/api-security-enhanced"
import { enterpriseFinanceFlags } from "@/lib/enterprise-finance-flags"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { IntercompanyService } from "@/lib/services/intercompany.service"
import { createClient, createServiceClient } from "@/lib/supabase/server"

function disabledResponse() {
  return NextResponse.json(
    { success: false, error: "Intercompany consolidation is not enabled" },
    { status: 403 }
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!enterpriseFinanceFlags.intercompanyConsolidationEnabled) {
      return disabledResponse()
    }

    const { id } = await params
    const authSupabase = await createClient()
    const { user, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      supabase: authSupabase,
    })
    if (error) return error

    const body = await req.json().catch(() => ({}))
    const idempotencyKey = resolveFinancialIdempotencyKey(
      req.headers.get("Idempotency-Key"),
      ["consolidation-eliminate", id]
    )
    const requestHash = buildFinancialRequestHash(body)

    const service = new IntercompanyService(createServiceClient() as any, authSupabase as any)
    const result = await service.triggerElimination(
      id,
      { userId: user.id, email: user.email || null },
      { idempotencyKey, requestHash }
    )

    return NextResponse.json({
      success: true,
      run: result.run,
      eliminationEntries: result.eliminationEntries || [],
      traceId: result.traceId || null,
      alreadyEliminated: !!result.alreadyEliminated,
    })
  } catch (error: any) {
    return serverError(`Failed to trigger elimination: ${error?.message || "unknown_error"}`)
  }
}
