import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { PaymentApprovalNotificationService } from "@/lib/services/payment-approval-notification.service"
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
    const appLang = body?.appLang === "en" ? "en" : "ar"

    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json({ success: false, error: "Unsupported supplier payment action" }, { status: 400 })
    }

    if (action === "REJECT" && !String(rejectionReason || "").trim()) {
      return NextResponse.json({ success: false, error: "Rejection reason is required" }, { status: 400 })
    }

    const authSupabase = await createClient()
    const adminSupabase = createServiceClient()

    const { data: payment } = await adminSupabase
      .from("payments")
      .select("id, supplier_id, branch_id, cost_center_id, created_by, amount, currency_code, original_currency")
      .eq("id", id)
      .eq("company_id", context.companyId)
      .maybeSingle()

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

    if (payment?.created_by && payment?.supplier_id) {
      const { data: supplier } = await adminSupabase
        .from("suppliers")
        .select("name")
        .eq("id", payment.supplier_id)
        .eq("company_id", context.companyId)
        .maybeSingle()

      const notificationService = new PaymentApprovalNotificationService(adminSupabase)

      if (action === "REJECT") {
        await notificationService.notifyRejected({
          companyId: context.companyId,
          paymentId: id,
          partyName: String(supplier?.name || "مورد"),
          amount: Number(payment.amount || 0),
          currency: String(payment.original_currency || payment.currency_code || "EGP"),
          branchId: payment.branch_id,
          costCenterId: payment.cost_center_id,
          createdBy: payment.created_by,
          rejectedBy: context.user.id,
          reason: String(rejectionReason || "").trim(),
          paymentType: "supplier",
          appLang,
        })
      } else if (result.status === "approved") {
        await notificationService.notifyApproved({
          companyId: context.companyId,
          paymentId: id,
          partyName: String(supplier?.name || "مورد"),
          amount: Number(payment.amount || 0),
          currency: String(payment.original_currency || payment.currency_code || "EGP"),
          branchId: payment.branch_id,
          costCenterId: payment.cost_center_id,
          createdBy: payment.created_by,
          approvedBy: context.user.id,
          paymentType: "supplier",
          appLang,
        })
      } else if (!result.approved) {
        await notificationService.notifyApprovalRequested({
          companyId: context.companyId,
          paymentId: id,
          partyName: String(supplier?.name || "مورد"),
          amount: Number(payment.amount || 0),
          currency: String(payment.original_currency || payment.currency_code || "EGP"),
          branchId: payment.branch_id,
          costCenterId: payment.cost_center_id,
          createdBy: payment.created_by,
          paymentType: "supplier",
          appLang,
        })
      }
    }

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[SUPPLIER_PAYMENTS_DECISION]", error)
    const message = String(error?.message || "Unexpected error while processing supplier payment decision")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
