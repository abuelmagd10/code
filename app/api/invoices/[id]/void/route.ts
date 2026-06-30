import { NextRequest, NextResponse } from "next/server"

import { apiGuard } from "@/lib/core/security/api-guard"
import { createClient } from "@/lib/supabase/server"

/**
 * v3.74.406 — Soft-cancel a draft sales invoice.
 *
 * Routes through the void_invoice_atomic RPC for an atomic cascade:
 *   - invoice.status = 'voided' (+ voided_by / voided_at / voided_reason)
 *   - pending discount_approvals on the invoice → cancelled
 *   - linked sales_order.invoice_id → NULL (SO can be re-invoiced;
 *     status not changed because SO has no approval workflow yet)
 *   - audit_logs entry with action='VOID'
 *
 * Refuses if: status is not draft, has payments, has posted JEs, or has
 * inventory transactions. Permission: owner / admin / general_manager /
 * accountant.
 */
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
    const reason = typeof body?.reason === "string" ? body.reason.trim() : ""

    const supabase = await createClient()

    const { data, error } = await supabase.rpc("void_invoice_atomic", {
      p_invoice_id: id,
      p_user_id: context.user.id,
      p_company_id: context.companyId,
      p_reason: reason || null,
    })

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || "Failed to void invoice" },
        { status: 500 }
      )
    }

    if (data && data.success === false) {
      return NextResponse.json(
        { success: false, error: data.error || "Void rejected" },
        { status: 400 }
      )
    }

    return NextResponse.json(data ?? { success: true }, { status: 200 })
  } catch (err: any) {
    console.error("[INVOICE_VOID]", err)
    return NextResponse.json(
      { success: false, error: String(err?.message || "Unexpected error while voiding invoice") },
      { status: 500 }
    )
  }
}
