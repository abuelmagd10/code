import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createServiceClient } from "@/lib/supabase/server"
import { BillReceiptWorkflowService } from "@/lib/services/bill-receipt-workflow.service"
// v3.74.137 — Archive moved INTO BillReceiptWorkflowService.approveBill so it
// runs BEFORE the new "تم اعتماد الفاتورة" notification is created.

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
    const appLang = String(body?.appLang || body?.app_lang || "ar").trim().toLowerCase() === "en" ? "en" : "ar"

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["bill-approve", context.companyId, id]
    )

    const requestHash = buildFinancialRequestHash({
      operation: "approve_bill",
      billId: id,
      companyId: context.companyId,
      actorId: context.user.id,
      uiSurface,
    })

    const serviceClient = createServiceClient()
    const service = new BillReceiptWorkflowService(serviceClient)
    const result = await service.approveBill(
      {
        companyId: context.companyId,
        actorId: context.user.id,
        actorRole: context.member.role,
        actorBranchId: context.member.branch_id,
        actorWarehouseId: context.member.warehouse_id,
      },
      id,
      { idempotencyKey, requestHash, uiSurface, appLang }
    )

    // v3.74.137 — Archive call removed here (moved inside approveBill).

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[BILL_APPROVE]", error)
    const message = String(error?.message || "Unexpected error while approving bill")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
