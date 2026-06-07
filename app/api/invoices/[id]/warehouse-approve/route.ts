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
    const result = await service.approveDelivery(
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
      // v3.74.74: forward structured shortages so dispatch-approvals
      // opens its shortage modal instead of a raw error toast.
      const payload: Record<string, any> = {
        success: false,
        error: error.message,
      }
      const shortages = error.details?.shortages
      if (shortages && shortages.length > 0) {
        // UI shape in dispatch-approvals/page.tsx (interface ShortageItem):
        // { product_id, product_name, required_qty, available_qty, uom }
        payload.shortages = shortages.map((s: any) => ({
          product_id: s.product_id,
          product_name: s.product_name || "",
          required_qty: s.requested,
          available_qty: s.available,
          uom: s.uom || "",
        }))
      }
      return NextResponse.json(payload, { status: error.status })
    }
    console.error("Error in warehouse approve API:", error)
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 })
  }
}
