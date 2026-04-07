import { NextRequest, NextResponse } from "next/server"
import { secureApiRequest, serverError } from "@/lib/api-security-enhanced"
import { enterpriseFinanceFlags } from "@/lib/enterprise-finance-flags"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { IntercompanyService } from "@/lib/services/intercompany.service"
import { createClient, createServiceClient } from "@/lib/supabase/server"

function disabledResponse() {
  return NextResponse.json(
    { success: false, error: "Intercompany transactions are not enabled" },
    { status: 403 }
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!enterpriseFinanceFlags.intercompanyEnabled) {
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
      ["intercompany-reconcile", id]
    )
    const requestHash = buildFinancialRequestHash(body)

    const service = new IntercompanyService(createServiceClient() as any, authSupabase as any)
    const result = await service.reconcileIntercompany(
      id,
      { userId: user.id, email: user.email || null },
      { idempotencyKey, requestHash }
    )

    return NextResponse.json({
      success: true,
      transaction: result.transaction,
      reconciliation: result.reconciliation || null,
      traceId: result.traceId || null,
      alreadyReconciled: !!result.alreadyReconciled,
    })
  } catch (error: any) {
    return serverError(`Failed to reconcile intercompany transaction: ${error?.message || "unknown_error"}`)
  }
}
