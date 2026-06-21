/**
 * v3.74.253 — GET /api/refund-approvals
 *
 * List refund_requests rows the owner / GM can approve. Defaults to
 * status=pending_approval; the UI can switch to all|approved_completed|
 * rejected|cancelled to see history.
 *
 * Lives at a separate path from the legacy /api/refund-requests so the
 * old credit-refund governance endpoints aren't disturbed.
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  const url = new URL(request.url)
  const statusParam = (url.searchParams.get("status") || "pending_approval").toLowerCase()
  const supabase = createServiceClient()

  let q = supabase
    .from("refund_requests")
    .select("*")
    .eq("company_id", context.companyId)
    .order("requested_at", { ascending: false })
    .limit(200)

  if (statusParam !== "all") q = q.eq("status", statusParam)

  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const items = data || []
  const invoiceIds = items.filter((r: any) => r.source_type === "invoice").map((r: any) => r.source_id)
  const billIds    = items.filter((r: any) => r.source_type === "bill").map((r: any) => r.source_id)

  const invMap = new Map<string, any>()
  const billMap = new Map<string, any>()
  if (invoiceIds.length > 0) {
    const { data: invs } = await supabase
      .from("invoices")
      .select("id, invoice_number, customer_id, status, customers:customer_id(name)")
      .in("id", invoiceIds)
    for (const i of (invs || [])) invMap.set(String((i as any).id), i)
  }
  if (billIds.length > 0) {
    const { data: bills } = await supabase
      .from("bills")
      .select("id, bill_number, supplier_id, status, suppliers:supplier_id(name)")
      .in("id", billIds)
    for (const b of (bills || [])) billMap.set(String((b as any).id), b)
  }

  const hydrated = items.map((r: any) => {
    if (r.source_type === "invoice") {
      const inv = invMap.get(String(r.source_id))
      return { ...r, _source_number: inv?.invoice_number, _party_name: inv?.customers?.name || null, _source_status: inv?.status }
    }
    const bill = billMap.get(String(r.source_id))
    return { ...r, _source_number: bill?.bill_number, _party_name: bill?.suppliers?.name || null, _source_status: bill?.status }
  })

  return NextResponse.json({ success: true, data: hydrated })
}
