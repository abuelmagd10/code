/**
 * v3.74.248 — Reverse a capital contribution.
 *
 * Instead of editing in place (which is the right answer for "wrong
 * amount, fix it now"), reversal is the right primitive when the user
 * actually wants to UNDO the contribution — say, they posted it under
 * the wrong shareholder, or it was a duplicate. We don't delete the
 * original row; we post an opposing journal entry and flag the original
 * as reversed. The audit trail then shows the full history (original
 * post + reversal) which is what an auditor or owner expects.
 *
 * Books-side effect:
 *   Dr capital_account   amount   (reverse the credit to equity)
 *   Cr cash/bank_account amount   (cash leaves the books again,
 *                                  reversing the original receipt)
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"

const PRIVILEGED_ROLES = new Set(["owner", "admin", "manager", "general_manager", "accountant"])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  const actorRole = String(context.member?.role || "").toLowerCase()
  if (!PRIVILEGED_ROLES.has(actorRole)) {
    return NextResponse.json(
      { success: false, error: "Insufficient permission to reverse capital contributions" },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const reason = (body?.reason || "").toString().trim() || null

    const supabase = createServiceClient()

    // 1. Load the contribution and bail if already reversed.
    const { data: contribution, error: cErr } = await supabase
      .from("capital_contributions")
      .select("id, company_id, shareholder_id, contribution_date, amount, is_reversed")
      .eq("id", id)
      .eq("company_id", context.companyId)
      .maybeSingle()
    if (cErr) return NextResponse.json({ success: false, error: cErr.message }, { status: 500 })
    if (!contribution) return NextResponse.json({ success: false, error: "Contribution not found" }, { status: 404 })
    if (contribution.is_reversed) {
      return NextResponse.json(
        { success: false, error: "Contribution is already reversed" },
        { status: 409 }
      )
    }

    const today = new Date().toISOString().slice(0, 10)
    await requireOpenFinancialPeriod(context.companyId, today)

    // 2. Read the original JE + its lines so we know which two accounts
    //    to flip. The original posted Dr cash/bank, Cr capital_account.
    const { data: origJe, error: jeErr } = await supabase
      .from("journal_entries")
      .select("id, branch_id, cost_center_id, description")
      .eq("company_id", context.companyId)
      .eq("reference_type", "capital_contribution")
      .eq("reference_id", id)
      .maybeSingle()
    if (jeErr) return NextResponse.json({ success: false, error: jeErr.message }, { status: 500 })
    if (!origJe) {
      return NextResponse.json(
        { success: false, error: "Original journal entry not found — nothing to reverse" },
        { status: 409 }
      )
    }

    const { data: origLines, error: lErr } = await supabase
      .from("journal_entry_lines")
      .select("id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id")
      .eq("journal_entry_id", origJe.id)
    if (lErr || !origLines || origLines.length < 2) {
      return NextResponse.json(
        { success: false, error: "Original journal lines are malformed; cannot reverse safely" },
        { status: 409 }
      )
    }

    const debitLine  = origLines.find((l: any) => Number(l.debit_amount  || 0) > 0)
    const creditLine = origLines.find((l: any) => Number(l.credit_amount || 0) > 0)
    if (!debitLine || !creditLine) {
      return NextResponse.json(
        { success: false, error: "Could not identify Dr/Cr lines on the original JE" },
        { status: 409 }
      )
    }

    const amount = Number(contribution.amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Original contribution amount is invalid" },
        { status: 409 }
      )
    }

    // 3. Insert the reversal JE shell + flip the lines.
    const { data: revJe, error: revJeErr } = await supabase
      .from("journal_entries")
      .insert({
        company_id: context.companyId,
        reference_type: "capital_contribution_reversal",
        reference_id: id,
        entry_date: today,
        description: reason
          ? `Reversal of capital contribution — ${reason}`
          : "Reversal of capital contribution",
        branch_id: origJe.branch_id || null,
        cost_center_id: origJe.cost_center_id || null,
        status: "draft",
      })
      .select("id")
      .single()
    if (revJeErr || !revJe?.id) {
      return NextResponse.json(
        { success: false, error: revJeErr?.message || "Failed to create reversal JE" },
        { status: 500 }
      )
    }

    const { error: revLinesErr } = await supabase
      .from("journal_entry_lines")
      .insert([
        // Flip the equity credit: Dr capital_account
        {
          journal_entry_id: revJe.id,
          account_id: creditLine.account_id,
          debit_amount: amount,
          credit_amount: 0,
          description: "Reverse capital contribution credit",
          branch_id: creditLine.branch_id || origJe.branch_id || null,
          cost_center_id: creditLine.cost_center_id || origJe.cost_center_id || null,
        },
        // Flip the cash/bank debit: Cr cash/bank_account
        {
          journal_entry_id: revJe.id,
          account_id: debitLine.account_id,
          debit_amount: 0,
          credit_amount: amount,
          description: "Reverse cash receipt from capital contribution",
          branch_id: debitLine.branch_id || origJe.branch_id || null,
          cost_center_id: debitLine.cost_center_id || origJe.cost_center_id || null,
        },
      ])
    if (revLinesErr) {
      // Roll back the reversal JE so we don't leave an orphan draft.
      await supabase.from("journal_entries").delete().eq("id", revJe.id)
      return NextResponse.json(
        { success: false, error: revLinesErr.message },
        { status: 500 }
      )
    }

    await supabase
      .from("journal_entries")
      .update({ status: "posted" })
      .eq("id", revJe.id)

    // 4. Flag the original contribution as reversed.
    const userId = context.user?.id || null
    await supabase
      .from("capital_contributions")
      .update({
        is_reversed: true,
        reversed_at: new Date().toISOString(),
        reversed_by: userId,
        reversal_journal_entry_id: revJe.id,
        reversal_reason: reason,
      })
      .eq("id", id)

    return NextResponse.json({
      success: true,
      data: {
        contribution_id: id,
        reversal_journal_entry_id: revJe.id,
        amount,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to reverse contribution" },
      { status: 500 }
    )
  }
}
