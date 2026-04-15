import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { PurchaseReturnCommandService } from "@/lib/services/purchase-return-command.service"

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
    const rejectionReason = String(body?.rejectionReason || body?.rejection_reason || body?.reason || "").trim()
    const uiSurface = body?.uiSurface || body?.ui_surface || "purchase_returns_page"

    if (!rejectionReason) {
      return NextResponse.json({ success: false, error: "Rejection reason is required" }, { status: 400 })
    }

    const authSupabase = await createClient()
    const adminSupabase = createServiceClient()

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["purchase-return-warehouse-reject", id, rejectionReason]
    )

    const requestHash = buildFinancialRequestHash({
      purchaseReturnId: id,
      rejectionReason,
      uiSurface,
      actorId: context.user.id,
    })

    const service = new PurchaseReturnCommandService(authSupabase, adminSupabase)
    const result = await service.rejectWarehouse(
      {
        companyId: context.companyId,
        actorId: context.user.id,
        actorRole: context.member.role,
        actorBranchId: context.member.branch_id,
        actorWarehouseId: context.member.warehouse_id,
      },
      id,
      rejectionReason,
      { idempotencyKey, requestHash, uiSurface }
    )

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[PURCHASE_RETURNS_WAREHOUSE_REJECT]", error)
    const message = String(error?.message || "Unexpected error while rejecting warehouse purchase return")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
