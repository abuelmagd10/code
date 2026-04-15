import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createServiceClient } from "@/lib/supabase/server"
import { BillReceiptWorkflowService } from "@/lib/services/bill-receipt-workflow.service"

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
    const uiSurface = String(body?.uiSurface || body?.ui_surface || "bill_detail_page")

    if (!rejectionReason) {
      return NextResponse.json({ success: false, error: "Rejection reason is required" }, { status: 400 })
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["bill-reject-receipt", context.companyId, id, rejectionReason]
    )

    const requestHash = buildFinancialRequestHash({
      operation: "reject_bill_receipt",
      billId: id,
      companyId: context.companyId,
      actorId: context.user.id,
      rejectionReason,
      uiSurface,
    })

    const service = new BillReceiptWorkflowService(createServiceClient())
    const result = await service.rejectReceipt(
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
    console.error("[BILL_REJECT_RECEIPT]", error)
    const message = String(error?.message || "Unexpected error while rejecting bill receipt")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
