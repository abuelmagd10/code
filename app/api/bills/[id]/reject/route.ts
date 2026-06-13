import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createServiceClient } from "@/lib/supabase/server"
import { BillReceiptWorkflowService } from "@/lib/services/bill-receipt-workflow.service"
// v3.74.137 — Archive moved INTO BillReceiptWorkflowService.rejectBill so it
// runs BEFORE the rejection notification is created. Doing it here at the
// route layer (i.e. AFTER rejectBill returned) used to auto-archive the new
// "تم رفض الفاتورة" ping immediately after it was inserted, so the accountant
// never saw it. Keep the archive call removed from this file.

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
      ["bill-reject", context.companyId, id, rejectionReason]
    )

    const requestHash = buildFinancialRequestHash({
      operation: "reject_bill",
      billId: id,
      companyId: context.companyId,
      actorId: context.user.id,
      rejectionReason,
      uiSurface,
    })

    const serviceClient = createServiceClient()
    const service = new BillReceiptWorkflowService(serviceClient)
    const result = await service.rejectBill(
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

    // v3.74.137 — Archive call removed here. It now lives inside
    // BillReceiptWorkflowService.rejectBill, sequenced BEFORE
    // notifyBillAdminRejected so the new rejection notification survives.

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[BILL_REJECT]", error)
    const message = String(error?.message || "Unexpected error while rejecting bill")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
