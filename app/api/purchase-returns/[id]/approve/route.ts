import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { PurchaseReturnCommandService, type PurchaseReturnDecisionAction } from "@/lib/services/purchase-return-command.service"
import { PurchaseReturnNotificationService } from "@/lib/services/purchase-return-notification.service"

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
    const action = String(body?.action || "APPROVE").trim().toUpperCase() as PurchaseReturnDecisionAction
    const rejectionReason = String(body?.rejectionReason || body?.rejection_reason || "").trim() || null
    const uiSurface = body?.uiSurface || body?.ui_surface || "purchase_returns_page"
    const appLang = String(body?.appLang || body?.app_lang || "ar").trim().toLowerCase() === "en" ? "en" : "ar"

    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json({ success: false, error: "Unsupported purchase return decision action" }, { status: 400 })
    }

    if (action === "REJECT" && !rejectionReason) {
      return NextResponse.json({ success: false, error: "Rejection reason is required" }, { status: 400 })
    }

    const authSupabase = await createClient()
    const adminSupabase = createServiceClient()

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["purchase-return-decision", id, action, rejectionReason || "none"]
    )

    const requestHash = buildFinancialRequestHash({
      purchaseReturnId: id,
      action,
      rejectionReason,
      uiSurface,
      actorId: context.user.id,
    })

    const service = new PurchaseReturnCommandService(authSupabase, adminSupabase)
    const result = await service.processDecision(
      {
        companyId: context.companyId,
        actorId: context.user.id,
        actorRole: context.member.role,
        actorBranchId: context.member.branch_id,
        actorWarehouseId: context.member.warehouse_id,
      },
      id,
      action,
      rejectionReason,
      { idempotencyKey, requestHash, uiSurface }
    )

    if (!result.cached) {
      const notificationService = new PurchaseReturnNotificationService(adminSupabase)

      await notificationService.archiveApprovalRequestNotifications({
        companyId: context.companyId,
        purchaseReturnId: id,
      })

      if (action === "APPROVE") {
        await notificationService.archiveWarehousePendingNotifications({
          companyId: context.companyId,
          purchaseReturnId: id,
        })
        await notificationService.notifyApproved({
          companyId: context.companyId,
          purchaseReturnId: id,
          actorUserId: context.user.id,
          appLang,
        })
        await notificationService.notifyWarehousePending({
          companyId: context.companyId,
          purchaseReturnId: id,
          actorUserId: context.user.id,
          appLang,
        })
      } else if (rejectionReason) {
        await notificationService.notifyRejected({
          companyId: context.companyId,
          purchaseReturnId: id,
          actorUserId: context.user.id,
          appLang,
          rejectionReason,
        })
      }
    }

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[PURCHASE_RETURNS_DECISION]", error)
    const message = String(error?.message || "Unexpected error while processing purchase return decision")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
