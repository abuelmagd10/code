/**
 * POST /api/discount-approvals/[id]/decide
 * v3.74.373 — Decide on a discount approval (Stage 2 of 5).
 *
 * Thin wrapper around the SECURITY DEFINER RPC `decide_discount_approval`.
 * The RPC enforces:
 *   - approval row exists and belongs to a company the caller is a
 *     member of
 *   - status = 'pending' (idempotency: no re-deciding settled rows)
 *   - caller satisfies can_approve_discount (owner / admin /
 *     general_manager)
 *   - rejection requires a non-empty note (matches the existing
 *     /approvals page UX for every other rejection flow)
 *
 * We keep the route boring on purpose. All the business logic
 * lives in the DB so the gates we wire up in stages 3–5 (booking
 * activation, sales invoice posting, purchase invoice posting)
 * can call the same RPC and get the same guarantees.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing approval id" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({} as any))
    const decisionRaw = String(body?.decision || "").toLowerCase().trim()
    const note: string | null = typeof body?.note === "string" && body.note.trim()
      ? body.note.trim()
      : null

    if (decisionRaw !== "approved" && decisionRaw !== "rejected") {
      return NextResponse.json(
        { success: false, error: "decision must be 'approved' or 'rejected'" },
        { status: 400 }
      )
    }
    if (decisionRaw === "rejected" && !note) {
      return NextResponse.json(
        { success: false, error: "Rejection requires a note" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.rpc("decide_discount_approval", {
      p_approval_id: id,
      p_decision: decisionRaw,
      p_decision_note: note,
    })

    if (error) {
      // PostgreSQL RAISE EXCEPTION maps to error.message. Surface
      // a 409 for "already decided" / "not pending" so the page
      // can refresh rather than show a generic 500.
      const status = /not pending|already (decided|approved|rejected|cancelled)/i.test(error.message)
        ? 409
        : /forbidden|not allowed|cannot/i.test(error.message)
          ? 403
          : 500
      return NextResponse.json({ success: false, error: error.message }, { status })
    }

    return NextResponse.json({ success: true, data })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Internal error" }, { status: 500 })
  }
}
