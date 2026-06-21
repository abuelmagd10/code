/**
 * v3.74.248 — Edit + read a single capital contribution.
 *
 * PATCH lets the requester correct the amount (and optionally the date /
 * notes) when the contribution was posted with the wrong number. The
 * linked journal entry is rewritten in lockstep so the cash/bank account
 * and the equity capital account both reflect the corrected amount —
 * without this, an "Edit" button would silently desync the books.
 *
 * GET returns the row so the UI can preload the edit dialog.
 *
 * Reversal lives in /reverse/route.ts — keep edit and reverse separate
 * so audit trails stay readable.
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"

const PRIVILEGED_ROLES = new Set(["owner", "admin", "manager", "general_manager", "accountant"])

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("capital_contributions")
    .select("id, company_id, shareholder_id, contribution_date, amount, notes, is_reversed, reversed_at, reversal_reason, original_amount, last_edited_at, created_at")
    .eq("id", id)
    .eq("company_id", context.companyId)
    .maybeSingle()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ success: false, error: "Contribution not found" }, { status: 404 })
  return NextResponse.json({ success: true, data })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  const actorRole = String(context.member?.role || "").toLowerCase()
  if (!PRIVILEGED_ROLES.has(actorRole)) {
    return NextResponse.json(
      { success: false, error: "Insufficient permission to edit capital contributions" },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    const body = await request.json()
    const newAmountRaw = body?.amount
    const newDate = body?.contributionDate || body?.contribution_date || null
    const newNotes = (body?.notes ?? null) as string | null

    const newAmount = Number(newAmountRaw)
    if (!Number.isFinite(newAmount) || newAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "Amount must be a positive number" },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // 1. Load the contribution + check governance flags.
    const { data: contribution, error: cErr } = await supabase
      .from("capital_contributions")
      .select("id, company_id, shareholder_id, contribution_date, amount, notes, is_reversed, original_amount")
      .eq("id", id)
      .eq("company_id", context.companyId)
      .maybeSingle()
    if (cErr) return NextResponse.json({ success: false, error: cErr.message }, { status: 500 })
    if (!contribution) return NextResponse.json({ success: false, error: "Contribution not found" }, { status: 404 })
    if (contribution.is_reversed) {
      return NextResponse.json(
        { success: false, error: "Cannot edit a reversed contribution. Add a new one instead." },
        { status: 409 }
      )
    }

    const effectiveDate = newDate || contribution.contribution_date
    await requireOpenFinancialPeriod(context.companyId, effectiveDate)

    // v3.74.262 — Use the atomic RPC. It sets app.allow_direct_post for
    // the transaction so the two governance triggers
    // (enforce_posted_entry_no_edit + enforce_posted_entry_lines_no_edit)
    // let the audited fields through. The RPC rewrites the contribution
    // row, the JE header date (if changed) and the two JE lines in one
    // transaction — no more partial-failure window between three
    // separate REST calls.
    const userId = context.user?.id || null
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      "update_capital_contribution_amount",
      {
        p_contribution_id: id,
        p_new_amount: newAmount,
        p_new_date: newDate || null,
        p_new_notes: body?.notes !== undefined ? newNotes : null,
        p_user_id: userId,
      }
    )
    if (rpcErr) {
      return NextResponse.json({ success: false, error: rpcErr.message }, { status: 500 })
    }
    const rpc: any = rpcResult || {}

    return NextResponse.json({
      success: true,
      data: {
        id,
        amount: newAmount,
        contribution_date: effectiveDate,
        journal_entry_id: rpc?.journal_entry_id ?? null,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to edit contribution" },
      { status: 500 }
    )
  }
}
