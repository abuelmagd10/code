import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createServiceClient } from "@/lib/supabase/server"
import { SalesInvoiceDraftDeleteCommandService } from "@/lib/services/sales-invoice-draft-delete-command.service"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  try {
    const body = await request.json().catch(() => ({}))
    const command = {
      companyId: context.companyId,
      invoiceId: id,
      uiSurface: body?.uiSurface || body?.ui_surface || "invoices_page",
    }
    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["sales-invoice-draft-delete", context.companyId, id]
    )
    const requestHash = buildFinancialRequestHash({ ...command, actorId: context.user.id })

    const service = new SalesInvoiceDraftDeleteCommandService(createServiceClient())
    const result = await service.deleteDraftInvoice(
      {
        actorId: context.user.id,
        actorRole: context.member.role,
        actorBranchId: context.member.branch_id,
      },
      command,
      { idempotencyKey, requestHash }
    )

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[SALES_INVOICE_DRAFT_DELETE_COMMAND]", error)
    const message = String(error?.message || "Unexpected error while deleting draft invoice")
    const status = message.includes("Idempotency key already used") ? 409 :
      message.includes("permission") ? 403 :
      message.includes("not found") ? 404 :
      message.includes("Only draft") || message.includes("Use Return") ? 400 :
      500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
