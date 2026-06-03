import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import {
  SalesInvoiceWarehouseCommandError,
  SalesInvoiceWarehouseCommandService,
} from "@/lib/services/sales-invoice-warehouse-command.service"
import { archiveApprovalNotificationsForRecord } from "@/lib/notifications/archive-on-action"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: "Company context missing" }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const service = new SalesInvoiceWarehouseCommandService(supabase)
    const result = await service.rejectDelivery(
      { companyId, userId: user.id },
      {
        invoiceId,
        notes: body?.notes || null,
        idempotencyKey: request.headers.get("Idempotency-Key"),
      }
    )

    // v3.74.18 — Archive pending approval-category notifications for this
    // workflow record now that the action is committed. Runs BEFORE any
    // follow-up "result" notification we send to the creator below, so the
    // new one isn't archived too.
    await archiveApprovalNotificationsForRecord({
      supabase,
      companyId,
      referenceType: "invoice",
      referenceId: invoiceId,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    if (error instanceof SalesInvoiceWarehouseCommandError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error("Error in warehouse reject API:", error)
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 })
  }
}
