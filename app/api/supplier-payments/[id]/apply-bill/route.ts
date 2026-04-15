import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { SupplierPaymentCommandService } from "@/lib/services/supplier-payment-command.service"

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
    const billId = String(body?.billId || body?.bill_id || "").trim()
    const amount = Number(body?.amount || 0)
    const uiSurface = String(body?.uiSurface || body?.ui_surface || "payments_page_apply_bill")

    if (!billId) {
      return NextResponse.json({ success: false, error: "Bill is required" }, { status: 400 })
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: "Allocation amount must be greater than zero" }, { status: 400 })
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["supplier-payment-apply-bill", context.companyId, id, billId, amount.toFixed(2)]
    )

    const requestHash = buildFinancialRequestHash({
      paymentId: id,
      billId,
      amount,
      uiSurface,
      actorId: context.user.id,
    })

    const authSupabase = await createClient()
    const adminSupabase = createServiceClient()
    const service = new SupplierPaymentCommandService(authSupabase, adminSupabase)

    const result = await service.applyPaymentToBill(
      {
        companyId: context.companyId,
        actorId: context.user.id,
        actorRole: context.member.role,
        actorBranchId: context.member.branch_id,
      },
      id,
      billId,
      amount,
      { idempotencyKey, requestHash, uiSurface }
    )

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[SUPPLIER_PAYMENT_APPLY_BILL]", error)
    const message = String(error?.message || "Unexpected error while applying supplier payment to bill")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
