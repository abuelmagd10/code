/**
 * GET /api/invoices/[id]/discount-approval
 * v3.74.375 — Stage 4 of 5: surface the discount approval state to
 * the sales-invoice page so it can show a banner and disable
 * "ترحيل الفاتورة" while the discount is in flight.
 *
 * Mirrors /api/bookings/[id]/discount-approval. Same gate vocabulary
 * (open / blocked_no_request / blocked_pending / blocked_rejected),
 * different document_type filter on the discount_approvals table.
 *
 * Note that posting gate semantics differ slightly between the two
 * surfaces: bookings cannot transition to in_progress without an
 * approved discount; sales invoices cannot transition from 'draft' to
 * 'sent' / 'paid' / 'posted'. The page only cares about the resolved
 * gate field.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ success: false, error: "No active company" }, { status: 404 })
    }

    const { id: invoiceId } = await params

    const { data: invoice, error: iErr } = await supabase
      .from("invoices")
      .select("id, discount_value, discount_type, status, sales_order_id")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .maybeSingle()
    if (iErr) {
      return NextResponse.json({ success: false, error: iErr.message }, { status: 500 })
    }
    if (!invoice) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 })
    }

    const { data: approval, error: aErr } = await supabase
      .from("discount_approvals")
      .select(`
        id, status, discount_value, discount_type,
        document_total, party_name, reason,
        requested_by, requested_at,
        decided_by, decided_at, decision_note
      `)
      .eq("document_type", "sales_invoice")
      .eq("document_id", invoiceId)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (aErr) {
      return NextResponse.json({ success: false, error: aErr.message }, { status: 500 })
    }

    // v3.74.456 — mirror of the bill fix. Invoices auto-created from a
    // sales order inherit the SO's discount approval.
    let soApproval: any = null
    if ((invoice as any).sales_order_id) {
      const { data } = await supabase
        .from("discount_approvals")
        .select(`id, status, discount_value, discount_type, document_total,
                 party_name, reason, requested_by, requested_at,
                 decided_by, decided_at, decision_note`)
        .eq("document_type", "sales_order")
        .eq("document_id", (invoice as any).sales_order_id)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      soApproval = data ?? null
    }

    const amount = Number(invoice.discount_value || 0)
    const typ = invoice.discount_type || "amount"
    let gate: "open" | "blocked_no_request" | "blocked_pending" | "blocked_rejected" = "open"
    let effectiveApproval = approval

    // Discounts on already-posted invoices don't need a gate any
    // more — the posting decision is sealed. Surface "open" so the
    // banner stays out of the way.
    // v3.74.464 — extend the gate to 'pending_approval' too. Same
    // reason as on the bill side: an amended invoice awaits the owner's
    // decision on the amendment, and the discount gate mirrors that.
    if (amount > 0 && (invoice.status === "draft" || invoice.status === "pending_approval")) {
      // v3.74.465 — invoice-level approval takes precedence over the
      // parent SO's. Mirrors the bill side. Order: invoice approval
      // (if any) → SO approval fallback.
      if (approval) {
        if (
          approval.status === "approved"
          && Number(approval.discount_value) === amount
          && (approval.discount_type || "amount") === typ
        ) {
          gate = "open"
        } else if (approval.status === "pending") {
          gate = "blocked_pending"
        } else if (approval.status === "rejected") {
          gate = "blocked_rejected"
        } else {
          gate = "blocked_no_request"
        }
      } else if (soApproval && soApproval.status === "approved") {
        gate = "open"
        if (!effectiveApproval) effectiveApproval = soApproval
      } else if (soApproval && soApproval.status === "rejected") {
        gate = "blocked_rejected"
        effectiveApproval = soApproval
      } else if (soApproval && soApproval.status === "pending") {
        gate = "blocked_pending"
        effectiveApproval = soApproval
      } else {
        gate = "blocked_no_request"
      }
    }

    return NextResponse.json({
      success: true,
      discount_value: amount,
      discount_type: typ,
      invoice_status: invoice.status,
      gate,
      approval: effectiveApproval ?? null,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Internal error" }, { status: 500 })
  }
}
