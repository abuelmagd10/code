import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import {
  SalesInvoiceWarehouseCommandError,
  SalesInvoiceWarehouseCommandService,
} from "@/lib/services/sales-invoice-warehouse-command.service"

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
