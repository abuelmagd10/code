import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { SupplierPaymentCommandService, type SupplierPaymentDecisionAction } from "@/lib/services/supplier-payment-command.service"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) {
    return errorResponse
  }

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || "APPROVE").trim().toUpperCase() as SupplierPaymentDecisionAction
    const rejectionReason = body?.rejectionReason || body?.rejection_reason || null
    const uiSurface = body?.uiSurface || body?.ui_surface || "payments_page"

    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json({ success: false, error: "Unsupported supplier payment action" }, { status: 400 })
    }

    if (action === "REJECT" && !String(rejectionReason || "").trim()) {
      return NextResponse.json({ success: false, error: "Rejection reason is required" }, { status: 400 })
    }

    const authSupabase = await createClient()
    const adminSupabase = createServiceClient()

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      [
        "supplier-payment-decision",
        id,
        action,
        String(rejectionReason || "").trim() || "none",
      ]
    )

    const requestHash = buildFinancialRequestHash({
      paymentId: id,
      action,
      rejectionReason: String(rejectionReason || "").trim() || null,
      uiSurface,
      actorId: context.user.id,
    })

    const service = new SupplierPaymentCommandService(authSupabase, adminSupabase)
    const result = await service.processDecision(
      {
        companyId: context.companyId,
        actorId: context.user.id,
        actorRole: context.member.role,
        actorBranchId: context.member.branch_id,
      },
      id,
      action,
      rejectionReason ? String(rejectionReason).trim() : null,
      { idempotencyKey, requestHash, uiSurface }
    )

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[SUPPLIER_PAYMENTS_DECISION]", error)
    const message = String(error?.message || "Unexpected error while processing supplier payment decision")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
