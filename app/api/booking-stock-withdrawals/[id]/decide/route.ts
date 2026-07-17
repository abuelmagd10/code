/**
 * POST /api/booking-stock-withdrawals/[id]/decide
 *
 * v3.74.680 — approve/reject a booking stock-withdrawal from the unified
 * approvals inbox (bwd tab). Thin wrapper over the SECURITY DEFINER RPC
 * decide_booking_stock_withdrawal, which enforces the permission/branch rules
 * (store/warehouse manager of the branch, or management) and idempotency.
 *
 * Body: { approve: boolean, notes?: string }
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({} as any))
    const approve = body?.approve === true
    const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim() : null

    const { data, error } = await supabase.rpc("decide_booking_stock_withdrawal", {
      p_withdrawal_id: id,
      p_approve: approve,
      p_notes: notes,
    })

    if (error) {
      const raw = String(error.message || "")
      const status = raw.includes("FORBIDDEN") ? 403
        : raw.includes("ALREADY_DECIDED") ? 409
        : raw.includes("INSUFFICIENT_STOCK") ? 409
        : 400
      // Strip the internal WITHDRAWAL_* code prefix so the user sees only the
      // human message (v3.74.684 — e.g. the insufficient-stock explanation).
      const msg = raw.replace(/^WITHDRAWAL_[A-Z_]+:\s*/, "")
      return NextResponse.json({ success: false, error: msg || "تعذر تنفيذ القرار" }, { status })
    }

    return NextResponse.json({ success: true, result: data })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Internal error" }, { status: 500 })
  }
}
