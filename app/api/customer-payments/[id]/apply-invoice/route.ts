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
    const invoiceId = String(body?.invoiceId || body?.invoice_id || "").trim()
    const amount = Number(body?.amount || 0)
    const uiSurface = String(body?.uiSurface || body?.ui_surface || "payments_page_apply_invoice")
    if (!invoiceId) return NextResponse.json({ success: false, error: "Invoice is required" }, { status: 400 })
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ success: false, error: "Allocation amount must be greater than zero" }, { status: 400 })

    const idempotencyKey = resolveFinancialIdempotencyKey(request.headers.get("Idempotency-Key"), ["customer-payment-apply-invoice", context.companyId, id, invoiceId, amount.toFixed(2)])
    const requestHash = buildFinancialRequestHash({ paymentId: id, invoiceId, amount, uiSurface, actorId: context.user.id })
    const service = new CustomerPaymentCommandService(await createClient(), createServiceClient())
    const result = await service.applyPaymentToInvoice(
      { companyId: context.companyId, actorId: context.user.id, actorRole: context.member.role, actorBranchId: context.member.branch_id },
      id,
      invoiceId,
      amount,
      { idempotencyKey, requestHash, uiSurface }
    )
    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[CUSTOMER_PAYMENT_APPLY_INVOICE]", error)
    const message = String(error?.message || "Unexpected error while applying customer payment to invoice")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
