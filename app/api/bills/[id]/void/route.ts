import { NextRequest, NextResponse } from "next/server"

import { apiGuard } from "@/lib/core/security/api-guard"
import { createClient } from "@/lib/supabase/server"

/**
 * v3.74.402 — Soft-cancel a draft bill instead of hard-deleting it.
 *
 * Routes through the void_bill_atomic RPC so the cascade is atomic:
 *   - bill.status = 'voided'
 *   - voided_by / voided_at / voided_reason recorded
 *   - pending discount_approvals on the bill → cancelled
 *   - linked PO unblocked: bill_id → NULL, status → 'pending_approval'
 *     so the owner can re-approve and a fresh bill gets auto-created
 *   - audit_logs entry
 *
 * Permission: owner / admin / general_manager / accountant only
 * (mirrors the RPC's internal gate).
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

    const { data, error } = await supabase.rpc("void_bill_atomic", {
      p_bill_id: id,
      p_user_id: context.user.id,
      p_company_id: context.companyId,
      p_reason: reason || null,
    })

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || "Failed to void bill" },
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
    console.error("[BILL_VOID]", err)
    return NextResponse.json(
      { success: false, error: String(err?.message || "Unexpected error while voiding bill") },
      { status: 500 }
    )
  }
}
