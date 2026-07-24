/**
 * GET /api/discount-approvals
 * v3.74.373 — Discount approval inbox (Stage 2 of 5).
 *
 * Returns pending discount approvals for the active company. The
 * approval workflow itself sits behind `can_approve_discount`
 * (owner / admin / general_manager), which is also what the badge
 * RPC checks before counting; we re-check it here in the route so
 * unauthorized callers get a clean 403 rather than an empty list.
 *
 * Filters
 *   status — defaults to 'pending'. Pass 'all' to retrieve every
 *            status (used by the history view if/when it lands).
 *
 * Notes
 *   - We deliberately don't join the source documents here. The
 *     foundation table snapshots document_no, document_total and
 *     party_name at request time so the inbox card has everything
 *     it needs without four extra joins.
 *   - Requester display name is best-effort from auth.users; the
 *     foundation already keeps requested_by as a UUID so the page
 *     can fall back to the UUID prefix if no profile is available.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const companyIdParam = searchParams.get("company_id")
    const statusParam = (searchParams.get("status") || "pending").toLowerCase()
    // v3.74.462 — optional document_id filter so the bill/invoice
    // view pages can fetch just the approvals attached to the current
    // document without pulling the whole inbox.
    const documentIdParam = searchParams.get("document_id")
    const companyId = companyIdParam || await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ success: false, error: "No active company" }, { status: 404 })
    }

    // Authorization — only approvers see the inbox. We use the
    // SECURITY DEFINER helper so the check matches what the badge
    // RPC counts; otherwise badge and inbox could disagree.
    const { data: canApprove, error: canErr } = await supabase.rpc("can_approve_discount", {
      p_company_id: companyId,
      p_user_id: user.id,
    })
    if (canErr) {
      return NextResponse.json({ success: false, error: canErr.message }, { status: 500 })
    }
    if (canApprove !== true) {
      // v3.74.810 — was a 403. Every non-approver page-load (warehouse
      // manager's inbox, accountant's bill view) logged a red network
      // error in the console — the owner flagged the noise repeatedly.
      // An empty list carries zero information a non-approver shouldn't
      // have, and the callers already render nothing for empty data.
      return NextResponse.json({ success: true, data: [], can_approve: false })
    }

    // Load approvals. We use the service client for the join into
    // auth.users so the request id can render with the requester's
    // email — service role bypasses RLS on auth.users which is
    // otherwise opaque from anon/authed callers.
    const baseQuery = supabase
      .from("discount_approvals")
      .select(`
        id, company_id, document_type, document_id, document_no,
        discount_value, discount_type, document_total, party_name,
        reason, status, requested_by, requested_at,
        decided_by, decided_at, decision_note,
        supersedes_approval_id, items_snapshot,
        shipping_snapshot, adjustment_snapshot,
        tax_amount_snapshot, subtotal_snapshot,
        shipping_tax_rate_snapshot, discount_position_snapshot,
        tax_inclusive_snapshot, supplier_name_snapshot
      `)
      .eq("company_id", companyId)
      .order("requested_at", { ascending: true })
      .limit(200)

    // v3.74.462 — optional document_id narrows to a single document.
    const scopedQuery = documentIdParam
      ? baseQuery.eq("document_id", documentIdParam)
      : baseQuery

    const { data: rows, error: rowsErr } = statusParam === "all"
      ? await scopedQuery
      : await scopedQuery.eq("status", statusParam)

    if (rowsErr) {
      return NextResponse.json({ success: false, error: rowsErr.message }, { status: 500 })
    }

    // v3.74.461 — for rows that supersede a prior approval, fetch
    // the prior row's snapshots so the diff card can render "before"
    // side-by-side with "after" without a second round trip.
    const supersededIds = Array.from(new Set(
      (rows || [])
        .map((r: any) => r.supersedes_approval_id)
        .filter(Boolean) as string[]
    ))
    const priorMap: Record<string, any> = {}
    if (supersededIds.length > 0) {
      const { data: priorRows } = await supabase
        .from("discount_approvals")
        .select(`id, discount_value, discount_type, document_total,
                 items_snapshot, shipping_snapshot, adjustment_snapshot,
                 tax_amount_snapshot, subtotal_snapshot,
                 shipping_tax_rate_snapshot, discount_position_snapshot,
                 tax_inclusive_snapshot, supplier_name_snapshot,
                 decided_at, decision_note, status, party_name`)
        .in("id", supersededIds)
      for (const p of priorRows || []) priorMap[p.id] = p
    }

    // Enrich with requester + decider emails (best-effort).
    // v3.74.434 — history view needs decided_by email too, so we
    // build a single lookup that covers both columns.
    const userMap: Record<string, { email?: string }> = {}
    try {
      const userIds = Array.from(new Set(
        (rows || [])
          .flatMap(r => [r.requested_by, (r as any).decided_by])
          .filter(Boolean) as string[]
      ))
      if (userIds.length > 0) {
        const svc = createServiceClient()
        for (const uid of userIds) {
          const { data: ures } = await svc.auth.admin.getUserById(uid)
          if (ures?.user) userMap[uid] = { email: ures.user.email || undefined }
        }
      }
    } catch {
      // Non-fatal — proceed without enrichment.
    }

    const enriched = (rows || []).map(r => ({
      ...r,
      requested_by_email: userMap[r.requested_by]?.email ?? null,
      decided_by_email: (r as any).decided_by ? userMap[(r as any).decided_by]?.email ?? null : null,
      // v3.74.461 — attach prior approval snapshots so the UI can
      // render the diff card without a second API round trip.
      prior_approval: (r as any).supersedes_approval_id
        ? priorMap[(r as any).supersedes_approval_id] ?? null
        : null,
    }))

    return NextResponse.json({ success: true, data: enriched })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Internal error" }, { status: 500 })
  }
}
