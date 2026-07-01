/**
 * GET /api/bills/[id]/discount-approval
 * v3.74.376 — Stage 5 of 5: surface the discount approval state to
 * the bill detail page so it can show a banner and disable
 * "submit for receipt" while the discount is in flight.
 *
 * Mirrors /api/invoices/[id]/discount-approval but filters
 * discount_approvals on document_type='purchase_invoice'. Same gate
 * vocabulary, same response shape.
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

    const { id: billId } = await params

    const { data: bill, error: bErr } = await supabase
      .from("bills")
      .select("id, discount_value, discount_type, status, purchase_order_id")
      .eq("id", billId)
      .eq("company_id", companyId)
      .maybeSingle()
    if (bErr) {
      return NextResponse.json({ success: false, error: bErr.message }, { status: 500 })
    }
    if (!bill) {
      return NextResponse.json({ success: false, error: "Bill not found" }, { status: 404 })
    }

    const { data: approval, error: aErr } = await supabase
      .from("discount_approvals")
      .select(`
        id, status, discount_value, discount_type,
        document_total, party_name, reason,
        requested_by, requested_at,
        decided_by, decided_at, decision_note
      `)
      .eq("document_type", "purchase_invoice")
      .eq("document_id", billId)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (aErr) {
      return NextResponse.json({ success: false, error: aErr.message }, { status: 500 })
    }

    // v3.74.456 — for an auto-created bill that inherits its discount
    // from a PO, there is no bill-level discount_approval row. The
    // parent PO's approval is the source of truth. Look it up.
    let poApproval: any = null
    if ((bill as any).purchase_order_id) {
      const { data } = await supabase
        .from("discount_approvals")
        .select(`id, status, discount_value, discount_type, document_total,
                 party_name, reason, requested_by, requested_at,
                 decided_by, decided_at, decision_note`)
        .eq("document_type", "purchase_order")
        .eq("document_id", (bill as any).purchase_order_id)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      poApproval = data ?? null
    }

    const amount = Number(bill.discount_value || 0)
    const typ = bill.discount_type || "amount"
    let gate: "open" | "blocked_no_request" | "blocked_pending" | "blocked_rejected" = "open"
    let effectiveApproval = approval

    if (amount > 0 && bill.status === "draft") {
      // v3.74.456 — if the parent PO's discount was approved, the bill
      // inherits that approval. The evaluator stores approvals as
      // 'amount', but the bill/PO row keeps its original type — so we
      // do NOT compare the type/value here, only require that the PO
      // discount is approved. bill_request_discount_approval_trg
      // (v3.74.424) already enforces PO-approval matching at write
      // time; the banner just needs to reflect the current state.
      if (poApproval && poApproval.status === "approved") {
        gate = "open"
        if (!effectiveApproval) effectiveApproval = poApproval
      } else if (poApproval && poApproval.status === "rejected") {
        gate = "blocked_rejected"
        effectiveApproval = poApproval
      } else if (poApproval && poApproval.status === "pending") {
        gate = "blocked_pending"
        effectiveApproval = poApproval
      } else if (!approval) {
        gate = "blocked_no_request"
      } else if (
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
    }

    return NextResponse.json({
      success: true,
      discount_value: amount,
      discount_type: typ,
      bill_status: bill.status,
      gate,
      // v3.74.456 — expose whichever approval determined the gate so
      // the banner can show decided_at / decision_note when it came
      // from the PO.
      approval: effectiveApproval ?? null,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Internal error" }, { status: 500 })
  }
}
