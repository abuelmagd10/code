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

    const paymentDate = String(body?.paymentDate || body?.payment_date || "").trim()
    const paymentMethod = String(body?.paymentMethod || body?.payment_method || "").trim()
    const accountIdRaw = body?.accountId ?? body?.account_id ?? null
    const accountId = accountIdRaw ? String(accountIdRaw).trim() : null
    const referenceNumber = body?.referenceNumber ?? body?.reference_number ?? null
    const notes = body?.notes ?? null
    const uiSurface = String(body?.uiSurface || body?.ui_surface || "payments_page_edit_dialog")

    if (!paymentDate) {
      return NextResponse.json({ success: false, error: "Payment date is required" }, { status: 400 })
    }

    if (!paymentMethod) {
      return NextResponse.json({ success: false, error: "Payment method is required" }, { status: 400 })
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      [
        "supplier-payment-update",
        context.companyId,
        id,
        paymentDate,
        paymentMethod,
        accountId || "none",
        String(referenceNumber || "").trim() || "none",
        String(notes || "").trim() || "none",
      ]
    )

    const requestHash = buildFinancialRequestHash({
      paymentId: id,
      paymentDate,
      paymentMethod,
      accountId,
      referenceNumber: referenceNumber ? String(referenceNumber).trim() : null,
      notes: notes ? String(notes).trim() : null,
      uiSurface,
      actorId: context.user.id,
    })

    const authSupabase = await createClient()
    const adminSupabase = createServiceClient()
    const service = new SupplierPaymentCommandService(authSupabase, adminSupabase)

    const result = await service.updatePayment(
      {
        companyId: context.companyId,
        actorId: context.user.id,
        actorRole: context.member.role,
        actorBranchId: context.member.branch_id,
      },
      id,
      {
        paymentDate,
        paymentMethod,
        accountId,
        referenceNumber: referenceNumber ? String(referenceNumber).trim() : null,
        notes: notes ? String(notes).trim() : null,
        uiSurface,
      },
      { idempotencyKey, requestHash }
    )

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[SUPPLIER_PAYMENT_UPDATE]", error)
    const message = String(error?.message || "Unexpected error while updating supplier payment")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
