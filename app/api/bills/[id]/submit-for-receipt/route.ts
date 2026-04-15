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
    const uiSurface = String(body?.uiSurface || body?.ui_surface || "bill_detail_page")

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["bill-submit-receipt", context.companyId, id]
    )

    const requestHash = buildFinancialRequestHash({
      operation: "submit_bill_for_receipt",
      billId: id,
      companyId: context.companyId,
      actorId: context.user.id,
      uiSurface,
    })

    const service = new BillReceiptWorkflowService(createServiceClient())
    const result = await service.submitForReceipt(
      {
        companyId: context.companyId,
        actorId: context.user.id,
        actorRole: context.member.role,
        actorBranchId: context.member.branch_id,
        actorWarehouseId: context.member.warehouse_id,
      },
      id,
      { idempotencyKey, requestHash, uiSurface }
    )

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[BILL_SUBMIT_FOR_RECEIPT]", error)
    const message = String(error?.message || "Unexpected error while submitting bill for receipt")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
