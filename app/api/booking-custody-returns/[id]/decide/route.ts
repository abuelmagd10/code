/**
 * POST /api/booking-custody-returns/[id]/decide
 *
 * v3.74.686 — approve/reject the RECEIPT of materials returned from a
 * technician's custody after a booking was cancelled (bcr tab in the unified
 * approvals inbox). Thin wrapper over the SECURITY DEFINER RPC
 * decide_booking_custody_return, which enforces the permission/branch rules
 * (store/warehouse manager of the branch, or management) and posts the return
 * to the warehouse (Dr inventory / Cr custody) on approval.
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

    const { data, error } = await supabase.rpc("decide_booking_custody_return", {
      p_withdrawal_id: id,
      p_approve: approve,
      p_notes: notes,
    })

    if (error) {
      const raw = String(error.message || "")
      const status = raw.includes("FORBIDDEN") ? 403
        : raw.includes("ALREADY_DECIDED") ? 409
        : 400
      const msg = raw.replace(/^RETURN_[A-Z_]+:\s*/, "")
      return NextResponse.json({ success: false, error: msg || "تعذر تنفيذ القرار" }, { status })
    }

    return NextResponse.json({ success: true, result: data })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Internal error" }, { status: 500 })
  }
}
