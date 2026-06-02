/**
 * Bonus Reversal Service — v3.74.12
 *
 * Pro-rata clawback for sales bonuses when an invoice is returned (partially
 * or fully). Standard ERP behavior:
 *
 *   return_ratio  = returned_amount / original_invoice_total
 *   reverse_each  = bonus_amount × return_ratio
 *
 * The original bonus rows are NEVER modified — we only INSERT adjustment
 * rows (negative bonus_amount) linked via parent_bonus_id. This preserves
 * the audit trail and lets the bonuses dashboard sum (original + negative
 * adjustments) to get the effective amount.
 *
 * Status of the adjustment row depends on the original status:
 *   original.status = 'pending'    → adjustment.status = 'pending'
 *                                    (nets to less before any payroll touches it)
 *   original.status = 'scheduled'  → adjustment.status = 'scheduled'
 *                                    (nets in the same payroll run that pays the original)
 *   original.status = 'paid'       → adjustment.status = 'scheduled'
 *                                    (clawback against next payroll run —
 *                                     never deducted retroactively from a
 *                                     salary that was already disbursed)
 *
 * Idempotency: the unique index on
 *   (parent_bonus_id, sales_return_request_id)
 * guarantees the same return cannot clawback the same bonus twice. If a
 * second call comes in (e.g. retry), the insert raises 23505 and we treat
 * it as already-processed.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type AdjustmentRow = {
  id: string
  parent_bonus_id: string
  bonus_amount: number
  status: 'pending' | 'scheduled'
  user_id: string
}

export type BonusReversalResult =
  | {
      ok: true
      adjustments: AdjustmentRow[]
      returnRatio: number
      totalReversed: number
    }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string }

export interface ReverseBonusForSalesReturnOptions {
  /** Admin Supabase client — service role, bypasses RLS */
  admin: SupabaseClient
  /** The original invoice that's being returned */
  invoiceId: string
  /** The company that owns the invoice */
  companyId: string
  /** The amount being returned in THIS event (not cumulative) */
  returnedAmount: number
  /** Original gross invoice total used as the denominator for the ratio */
  originalInvoiceTotal: number
  /** The sales_return_request_id (used as the idempotency key) */
  salesReturnRequestId: string
  /** Who triggered the reversal (audit + created_by) */
  actorUserId: string
  /** Human-readable reason stored on each adjustment row */
  reason?: string
}

export async function reverseBonusForSalesReturn(
  opts: ReverseBonusForSalesReturnOptions
): Promise<BonusReversalResult> {
  const {
    admin,
    invoiceId,
    companyId,
    returnedAmount,
    originalInvoiceTotal,
    salesReturnRequestId,
    actorUserId,
    reason,
  } = opts

  if (!invoiceId) return { ok: false, skipped: false, error: "invoiceId required" }
  if (!companyId) return { ok: false, skipped: false, error: "companyId required" }
  if (!salesReturnRequestId) return { ok: false, skipped: false, error: "salesReturnRequestId required" }
  if (!Number.isFinite(returnedAmount) || returnedAmount <= 0) {
    return { ok: false, skipped: true, reason: "returned_amount_not_positive" }
  }
  if (!Number.isFinite(originalInvoiceTotal) || originalInvoiceTotal <= 0) {
    return { ok: false, skipped: true, reason: "original_total_not_positive" }
  }

  const returnRatio = Math.min(1, returnedAmount / originalInvoiceTotal)

  // ── Find active ORIGINAL bonus rows (positive, non-clawback) ────────
  // Exclude rows that are themselves adjustments (parent_bonus_id NOT NULL)
  // and already reversed/cancelled rows.
  const { data: originals, error: fetchErr } = await admin
    .from("user_bonuses")
    .select("id, user_id, employee_id, sales_order_id, bonus_amount, bonus_currency, bonus_type, status, payroll_run_id")
    .eq("company_id", companyId)
    .eq("invoice_id", invoiceId)
    .is("parent_bonus_id", null)
    .gt("bonus_amount", 0)
    .not("status", "in", '("reversed","cancelled")')

  if (fetchErr) {
    return { ok: false, skipped: false, error: `bonus lookup failed: ${fetchErr.message}` }
  }

  if (!originals || originals.length === 0) {
    return { ok: false, skipped: true, reason: "no_active_bonus_to_reverse" }
  }

  const adjustments: AdjustmentRow[] = []
  let totalReversed = 0

  for (const original of originals) {
    const originalAmount = Number(original.bonus_amount || 0)
    if (originalAmount <= 0) continue

    // Sum any pre-existing adjustment rows on this same parent — defends
    // against double clawback when multiple partial returns add up to 100%
    // over several events.
    const { data: existingAdjustments } = await admin
      .from("user_bonuses")
      .select("bonus_amount, sales_return_request_id")
      .eq("company_id", companyId)
      .eq("parent_bonus_id", original.id)
      .not("status", "in", '("reversed","cancelled")')

    // If the SAME sales return already clawed back this parent, skip — the
    // unique index would catch it too but we short-circuit cleanly.
    const sameReturn = (existingAdjustments || []).some(
      (a: any) => a.sales_return_request_id === salesReturnRequestId
    )
    if (sameReturn) continue

    const previouslyReversed = (existingAdjustments || []).reduce(
      (sum: number, r: any) => sum + Math.abs(Number(r.bonus_amount || 0)),
      0
    )
    const remaining = originalAmount - previouslyReversed
    if (remaining <= 0) continue

    // Pro-rata amount for THIS return, capped at remaining so total
    // clawback can never exceed the original bonus.
    const rawReverse = Math.round(originalAmount * returnRatio * 100) / 100
    const reverseAmount = Math.min(rawReverse, remaining)
    if (reverseAmount <= 0) continue

    // Adjustment status mirrors the original's lifecycle stage. 'paid'
    // becomes 'scheduled' so it offsets the NEXT payroll (Egyptian labor
    // law: you don't deduct from a salary that's already been disbursed).
    const adjustmentStatus: 'pending' | 'scheduled' =
      original.status === 'paid' ? 'scheduled' :
      original.status === 'scheduled' ? 'scheduled' :
      'pending'

    const noteText =
      `Pro-rata clawback for sales return ${salesReturnRequestId} ` +
      `(ratio=${returnRatio.toFixed(4)}, original=${originalAmount}, reverse=${reverseAmount})` +
      (reason ? ` — ${reason}` : '')

    const { data: adjustment, error: insertErr } = await admin
      .from("user_bonuses")
      .insert({
        company_id: companyId,
        user_id: original.user_id,
        employee_id: original.employee_id,
        invoice_id: invoiceId,
        sales_order_id: original.sales_order_id,
        parent_bonus_id: original.id,
        sales_return_request_id: salesReturnRequestId,
        bonus_amount: -reverseAmount,      // ← negative = clawback
        bonus_currency: original.bonus_currency,
        bonus_type: original.bonus_type,   // CHECK constraint forces this; we keep the parent's type
        calculation_base: returnedAmount,
        calculation_rate: returnRatio,
        status: adjustmentStatus,
        created_by: actorUserId,
        note: noteText,
      })
      .select("id, parent_bonus_id, bonus_amount, status, user_id")
      .single()

    if (insertErr) {
      // 23505 = the idempotency unique index — treat as already-processed
      if ((insertErr as any).code === '23505') continue
      return { ok: false, skipped: false, error: `adjustment insert failed: ${insertErr.message}` }
    }

    adjustments.push(adjustment as AdjustmentRow)
    totalReversed += reverseAmount

    // Audit log per adjustment — best effort
    try {
      await admin.from("audit_logs").insert({
        company_id: companyId,
        user_id: actorUserId,
        action: "REVERSE",
        target_table: "user_bonuses",
        record_id: (adjustment as any)?.id,
        reason: "bonus_pro_rata_clawback",
        metadata: {
          parent_bonus_id: original.id,
          beneficiary_user_id: original.user_id,
          invoice_id: invoiceId,
          sales_return_request_id: salesReturnRequestId,
          return_ratio: returnRatio,
          returned_amount: returnedAmount,
          original_invoice_total: originalInvoiceTotal,
          original_bonus_amount: originalAmount,
          adjustment_amount: -reverseAmount,
          adjustment_status: adjustmentStatus,
          original_status: original.status,
        }
      })
    } catch {
      /* audit failure must not break the clawback */
    }
  }

  return { ok: true, adjustments, returnRatio, totalReversed }
}
