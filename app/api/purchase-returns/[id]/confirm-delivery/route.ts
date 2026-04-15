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
    const allocationId = String(body?.allocationId || body?.allocation_id || "").trim() || null
    const notes = String(body?.notes || "").trim() || null
    const uiSurface = body?.uiSurface || body?.ui_surface || "purchase_returns_page"

    const authSupabase = await createClient()
    const adminSupabase = createServiceClient()

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["purchase-return-confirm", id, allocationId || "single", notes || "none"]
    )

    const requestHash = buildFinancialRequestHash({
      purchaseReturnId: id,
      allocationId,
      notes,
      uiSurface,
      actorId: context.user.id,
    })

    const service = new PurchaseReturnCommandService(authSupabase, adminSupabase)
    const result = await service.confirmDelivery(
      {
        companyId: context.companyId,
        actorId: context.user.id,
        actorRole: context.member.role,
        actorBranchId: context.member.branch_id,
        actorWarehouseId: context.member.warehouse_id,
      },
      id,
      { allocationId, notes, uiSurface },
      { idempotencyKey, requestHash }
    )

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[PURCHASE_RETURNS_CONFIRM_DELIVERY]", error)
    const message = String(error?.message || "Unexpected error while confirming purchase return delivery")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
