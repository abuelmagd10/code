/**
 * Bonus Calculator Service — v3.74.11
 *
 * Shared logic for calculating a sales-bonus when an invoice reaches paid
 * status. Extracted from app/api/bonuses/route.ts so it can be called from
 * two places:
 *
 *   1. **Server-side, automatically** after `record-payment` succeeds and the
 *      invoice transitions to `paid`. This is the path that matters for
 *      governance: the bonus is calculated regardless of which user role
 *      pressed "Record Payment", because the call goes through with the
 *      service-role admin client, not the requesting user's permissions.
 *
 *   2. **Manually** via POST /api/bonuses for an authorized user
 *      (owner/admin/manager) who wants to retroactively run the calc for an
 *      invoice that didn't get one (e.g. data import, historical fix).
 *
 * Bonus attribution rule (preserved from the original route):
 *   - Primary: sales_orders.created_by_user_id  (the salesperson)
 *   - Fallback: invoices.created_by_user_id     (POS / walk-in sales)
 *
 * Skip conditions (return { skipped: true, reason }):
 *   - Company bonus_enabled = false
 *   - employee_bonus_config.bonus_enabled = false for the attributed user
 *   - Invoice not in 'paid' status
 *   - No creator found anywhere
 *   - A bonus already exists for this invoice (idempotent)
 *   - Monthly cap reached for the user
 *
 * Caller is responsible for not blocking the parent transaction if this
 * service throws — bonus calc is non-essential to the payment itself.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Result envelope. `ok=true` means a bonus row was created. `ok=false` plus
 * `skipped=true` means the run was intentionally short-circuited (not an
 * error — e.g. bonus system disabled). `ok=false` with `error` means a real
 * problem the caller may want to log.
 */
export type BonusCalculationResult =
  | { ok: true; bonus: any; configSource: 'employee_override' | 'company_default'; creatorSource: 'sales_order' | 'invoice'; beneficiaryUserId: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string }

export interface CalculateBonusOptions {
  /** Admin Supabase client — service role, bypasses RLS */
  admin: SupabaseClient
  /** The invoice whose payment just closed it */
  invoiceId: string
  /** The company that owns the invoice */
  companyId: string
  /** The user who triggered the calculation (used for audit + created_by) */
  actorUserId: string
}

export async function calculateBonusForPaidInvoice(
  opts: CalculateBonusOptions
): Promise<BonusCalculationResult> {
  const { admin, invoiceId, companyId, actorUserId } = opts

  if (!invoiceId) return { ok: false, skipped: false, error: "invoiceId required" }
  if (!companyId) return { ok: false, skipped: false, error: "companyId required" }
  if (!actorUserId) return { ok: false, skipped: false, error: "actorUserId required" }

  // ── Company settings ────────────────────────────────────────────────
  const { data: company, error: companyErr } = await admin
    .from("companies")
    .select("bonus_enabled, bonus_type, bonus_percentage, bonus_fixed_amount, bonus_points_per_value, bonus_daily_cap, bonus_monthly_cap, bonus_payout_mode, base_currency, currency")
    .eq("id", companyId)
    .maybeSingle()

  if (companyErr) return { ok: false, skipped: false, error: `company lookup failed: ${companyErr.message}` }
  if (!company) return { ok: false, skipped: false, error: "company not found" }
  if (!company.bonus_enabled) return { ok: false, skipped: true, reason: "bonus_disabled_for_company" }

  // ── Invoice ─────────────────────────────────────────────────────────
  const { data: invoice, error: invErr } = await admin
    .from("invoices")
    .select("id, company_id, total_amount, status, currency, sales_order_id, created_by_user_id")
    .eq("id", invoiceId)
    .maybeSingle()

  if (invErr) return { ok: false, skipped: false, error: `invoice lookup failed: ${invErr.message}` }
  if (!invoice) return { ok: false, skipped: false, error: "invoice not found" }
  if (invoice.status !== "paid") return { ok: false, skipped: true, reason: `invoice_status_is_${invoice.status}` }

  // ── Attribution: SO creator first, invoice creator as fallback ──────
  let creatorUserId: string | null = null
  let creatorSource: 'sales_order' | 'invoice' | null = null

  if (invoice.sales_order_id) {
    const { data: so } = await admin
      .from("sales_orders")
      .select("created_by_user_id")
      .eq("id", invoice.sales_order_id)
      .maybeSingle()
    if (so?.created_by_user_id) {
      creatorUserId = so.created_by_user_id
      creatorSource = 'sales_order'
    }
  }

  if (!creatorUserId) {
    creatorUserId = invoice.created_by_user_id
    if (creatorUserId) creatorSource = 'invoice'
  }

  if (!creatorUserId || !creatorSource) {
    return { ok: false, skipped: true, reason: "no_creator_found" }
  }

  // ── Per-employee config ─────────────────────────────────────────────
  const { data: empConfig } = await admin
    .from("employee_bonus_config")
    .select("bonus_enabled, bonus_type, bonus_percentage, bonus_fixed_amount, bonus_points_per_value, bonus_daily_cap, bonus_monthly_cap, bonus_payout_mode, is_active")
    .eq("company_id", companyId)
    .eq("user_id", creatorUserId)
    .eq("is_active", true)
    .maybeSingle()

  if (empConfig && empConfig.bonus_enabled === false) {
    return { ok: false, skipped: true, reason: "bonus_disabled_for_employee" }
  }

  const effective = {
    bonus_type: empConfig?.bonus_type ?? company.bonus_type,
    bonus_percentage: empConfig?.bonus_percentage ?? company.bonus_percentage,
    bonus_fixed_amount: empConfig?.bonus_fixed_amount ?? company.bonus_fixed_amount,
    bonus_points_per_value: empConfig?.bonus_points_per_value ?? company.bonus_points_per_value,
    bonus_daily_cap: empConfig?.bonus_daily_cap ?? company.bonus_daily_cap,
    bonus_monthly_cap: empConfig?.bonus_monthly_cap ?? company.bonus_monthly_cap,
    bonus_payout_mode: empConfig?.bonus_payout_mode ?? company.bonus_payout_mode,
  }

  const configSource: 'employee_override' | 'company_default' = empConfig ? 'employee_override' : 'company_default'

  // ── Idempotency: skip if a non-reversed bonus already exists ────────
  const { data: existingBonus } = await admin
    .from("user_bonuses")
    .select("id")
    .eq("company_id", companyId)
    .eq("invoice_id", invoiceId)
    .not("status", "in", '("reversed","cancelled")')
    .maybeSingle()

  if (existingBonus) {
    return { ok: false, skipped: true, reason: "already_calculated" }
  }

  // ── Amount ──────────────────────────────────────────────────────────
  const invoiceTotal = Number(invoice.total_amount || 0)
  let bonusAmount = 0
  let calculationRate = 0

  switch (effective.bonus_type) {
    case "percentage":
      calculationRate = Number(effective.bonus_percentage || 0)
      bonusAmount = Math.round(invoiceTotal * (calculationRate / 100) * 100) / 100
      break
    case "fixed":
      bonusAmount = Number(effective.bonus_fixed_amount || 0)
      break
    case "points": {
      const pointsPerValue = Number(effective.bonus_points_per_value || 100)
      bonusAmount = Math.floor(invoiceTotal / pointsPerValue)
      calculationRate = pointsPerValue
      break
    }
  }

  // ── Monthly cap ─────────────────────────────────────────────────────
  if (effective.bonus_monthly_cap && Number(effective.bonus_monthly_cap) > 0) {
    const now = new Date()
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const { data: monthlyBonuses } = await admin
      .from("user_bonuses")
      .select("bonus_amount")
      .eq("company_id", companyId)
      .eq("user_id", creatorUserId)
      .gte("calculated_at", startOfMonth)
      .not("status", "in", '("reversed","cancelled")')

    const currentMonthTotal = (monthlyBonuses || []).reduce((sum, b) => sum + Number(b.bonus_amount || 0), 0)
    const remaining = Number(effective.bonus_monthly_cap) - currentMonthTotal
    if (remaining <= 0) {
      return { ok: false, skipped: true, reason: "monthly_cap_reached" }
    }
    bonusAmount = Math.min(bonusAmount, remaining)
  }

  // ── Find linked employee row, if any ────────────────────────────────
  const { data: employee } = await admin
    .from("employees")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", creatorUserId)
    .maybeSingle()

  // ── Insert ──────────────────────────────────────────────────────────
  const { data: bonus, error: insertErr } = await admin
    .from("user_bonuses")
    .insert({
      company_id: companyId,
      user_id: creatorUserId,
      employee_id: employee?.id || null,
      invoice_id: invoiceId,
      sales_order_id: invoice.sales_order_id || null,
      bonus_amount: bonusAmount,
      bonus_currency: invoice.currency || (company as any).base_currency || (company as any).currency || "EGP",
      bonus_type: effective.bonus_type,
      calculation_base: invoiceTotal,
      calculation_rate: calculationRate,
      status: effective.bonus_payout_mode === "immediate" ? "scheduled" : "pending",
      created_by: actorUserId,
      note: `Bonus for invoice ${invoiceId} (config: ${configSource})`
    })
    .select()
    .single()

  if (insertErr) {
    return { ok: false, skipped: false, error: `bonus insert failed: ${insertErr.message}` }
  }

  // ── Audit log (best-effort) ─────────────────────────────────────────
  try {
    await admin.from("audit_logs").insert({
      company_id: companyId,
      user_id: actorUserId,
      action: "INSERT",
      target_table: "user_bonuses",
      record_id: bonus?.id,
      reason: "bonus_calculated",
      metadata: {
        invoice_id: invoiceId,
        sales_order_id: invoice.sales_order_id,
        bonus_amount: bonusAmount,
        beneficiary_user_id: creatorUserId,
        creator_source: creatorSource,
        config_source: configSource,
        triggered_by_actor: actorUserId,
      }
    })
  } catch {
    /* audit failure must not break the bonus calc */
  }

  return { ok: true, bonus, configSource, creatorSource, beneficiaryUserId: creatorUserId }
}
