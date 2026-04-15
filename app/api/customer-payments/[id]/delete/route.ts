import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { CustomerPaymentCommandService } from "@/lib/services/customer-payment-command.service"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const uiSurface = String(body?.uiSurface || body?.ui_surface || "payments_page_delete_dialog")
    const idempotencyKey = resolveFinancialIdempotencyKey(request.headers.get("Idempotency-Key"), ["customer-payment-delete", context.companyId, id])
    const requestHash = buildFinancialRequestHash({ paymentId: id, uiSurface, actorId: context.user.id })
    const service = new CustomerPaymentCommandService(await createClient(), createServiceClient())
    const result = await service.deletePayment(
      { companyId: context.companyId, actorId: context.user.id, actorRole: context.member.role, actorBranchId: context.member.branch_id },
      id,
      { idempotencyKey, requestHash, uiSurface }
    )
    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[CUSTOMER_PAYMENT_DELETE]", error)
    const message = String(error?.message || "Unexpected error while deleting customer payment")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
