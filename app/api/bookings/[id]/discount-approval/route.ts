/**
 * GET /api/bookings/[id]/discount-approval
 * v3.74.374 — Stage 3 of 5: surface the discount approval state to
 * the booking page so it can show a banner and disable
 * "تنفيذ الخدمة" while the discount is in flight.
 *
 * Returns the latest approval row for the booking (any status) along
 * with the booking's current discount_amount. The page uses this to
 * decide what to render:
 *
 *   amount = 0                         → no banner, button enabled
 *   amount > 0 + no approval row       → "Click 'request approval'"
 *                                        (auto-created by trigger, so
 *                                        this only happens if the row
 *                                        was created before v3.74.374)
 *   amount > 0 + status=pending        → "Pending owner / GM approval"
 *   amount > 0 + status=approved       → green ✓, button enabled
 *   amount > 0 + status=rejected       → red banner with decision_note
 *   amount > 0 + status=cancelled      → treat like "no approval"
 *
 * The endpoint is scoped to the user's active company via the standard
 * apiGuard; the discount_approvals RLS policy already restricts reads
 * to company members so nothing extra to do there.
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core"
import { createClient } from "@/lib/supabase/server"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, {
      requireAuth: true,
      requireCompany: true,
    })
    if (errorResponse) return errorResponse

    const { companyId } = context!
    const { id: bookingId } = await params

    const supabase = await createClient()

    // Read the booking's current discount so the UI knows whether
    // it should care about the approval state at all.
    const { data: booking, error: bErr } = await supabase
      .from("bookings")
      .select("id, discount_amount, status, invoice_id")
      .eq("id", bookingId)
      .eq("company_id", companyId)
      .maybeSingle()
    if (bErr) {
      return NextResponse.json({ success: false, error: bErr.message }, { status: 500 })
    }
    if (!booking) {
      return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 })
    }

    // Latest approval for this booking (any status, most recent
    // request_at). We don't filter on discount_value here because the
    // page wants to detect "stale" rows too — e.g. an approved row at
    // a different value should NOT count as approval for the new
    // amount, but the page still wants to display the history.
    const { data: approval, error: aErr } = await supabase
      .from("discount_approvals")
      .select(`
        id, status, discount_value, discount_type,
        document_total, party_name, reason,
        requested_by, requested_at,
        decided_by, decided_at, decision_note
      `)
      .eq("document_type", "booking")
      .eq("document_id", bookingId)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (aErr) {
      return NextResponse.json({ success: false, error: aErr.message }, { status: 500 })
    }

    // Derived state: is the activation gate currently open?
    const amount = Number(booking.discount_amount || 0)
    let gate: "open" | "blocked_no_request" | "blocked_pending" | "blocked_rejected" = "open"
    if (amount > 0) {
      if (!approval) {
        gate = "blocked_no_request"
      } else if (approval.status === "approved" && Number(approval.discount_value) === amount) {
        gate = "open"
      } else if (approval.status === "pending") {
        gate = "blocked_pending"
      } else if (approval.status === "rejected") {
        gate = "blocked_rejected"
      } else {
        // cancelled / mismatched approved — treat as needs new request
        gate = "blocked_no_request"
      }
    }

    return NextResponse.json({
      success: true,
      discount_amount: amount,
      booking_status: booking.status,
      gate,
      approval: approval ?? null,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Internal error" }, { status: 500 })
  }
}
