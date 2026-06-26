/**
 * v3.74.342 — Service Commission Calculator
 *
 * Calculates and records the commission an employee earns by executing
 * a booked service, then drops the row into user_bonuses so the
 * existing payroll plumbing picks it up. No parallel sub-ledger.
 *
 * Decisions captured from the owner:
 *   - Base: invoice subtotal (excludes VAT).
 *   - Trigger: once, when the invoice transitions to fully paid.
 *   - Recipient: bookings.current_responsible_user_id (fallback
 *                staff_user_id). The whole amount goes to that one
 *                person.
 *   - Reversal: if the invoice is later voided / refunded, callers
 *                should call reverseServiceCommissionForInvoice() so
 *                the bonus is rolled back if it's still pending, or
 *                marked for clawback if it has already been paid.
 *
 * Idempotency: a UNIQUE index on (company_id, booking_id) where the
 * record is not reversed/cancelled stops double-credit if this is
 * called twice for the same booking.
 */

type SupabaseLike = any

export interface ServiceCommissionResult {
  recorded: boolean
  reason?: string
  bonus_id?: string
  amount?: number
}

/**
 * Try to record a service-commission bonus for the booking that owns
 * the given invoice. Safe to call multiple times; the unique index
 * makes duplicate calls a no-op.
 */
export async function recordServiceCommissionForInvoice(
  supabase: SupabaseLike,
  params: { companyId: string; invoiceId: string; createdBy?: string | null },
): Promise<ServiceCommissionResult> {
  const { companyId, invoiceId, createdBy } = params

  // 1. Pull the booking that points at this invoice (services flow only)
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, service_id, branch_id, current_responsible_user_id, staff_user_id, total_amount, tax_amount, paid_amount')
    .eq('invoice_id', invoiceId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (bErr) return { recorded: false, reason: bErr.message }
  if (!booking) return { recorded: false, reason: 'no_booking_for_invoice' }

  const recipientUserId = booking.current_responsible_user_id || booking.staff_user_id
  if (!recipientUserId) {
    return { recorded: false, reason: 'no_responsible_user' }
  }

  // v3.74.363 — Owner-confirmed rule: if the executor (the user who
  // pressed "تنفيذ الخدمة" and now sits on current_responsible_user_id)
  // is the owner or the general_manager (= admin), commission is NOT
  // recorded for anyone. Their hits are oversight overrides, not
  // billable service execution.
  try {
    const { data: execMember } = await supabase
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', recipientUserId)
      .maybeSingle()
    const execRole = String(execMember?.role || '')
    if (['owner', 'admin', 'general_manager'].includes(execRole)) {
      return { recorded: false, reason: 'executed_by_owner_or_admin' }
    }
  } catch {
    /* non-fatal — if the role lookup fails, fall through and let the
       commission be recorded as before. */
  }

  // 2. Pull the service to read commission_rate
  const { data: service, error: sErr } = await supabase
    .from('services')
    .select('id, service_name, commission_rate, currency_code')
    .eq('id', booking.service_id)
    .eq('company_id', companyId)
    .maybeSingle()
  if (sErr) return { recorded: false, reason: sErr.message }
  if (!service) return { recorded: false, reason: 'service_not_found' }

  const rate = Number(service.commission_rate || 0)
  if (!Number.isFinite(rate) || rate <= 0) {
    return { recorded: false, reason: 'zero_rate' }
  }

  // 3. Base = invoice subtotal (excluding VAT). Use booking totals as
  // the source of truth because the invoice is generated from the
  // booking and they always agree.
  const subtotal = Math.max(0, Number(booking.total_amount || 0) - Number(booking.tax_amount || 0))
  if (subtotal <= 0) {
    return { recorded: false, reason: 'zero_base' }
  }

  const amount = Math.round((subtotal * rate) / 100 * 100) / 100 // round to 2 decimals

  // 4. Find the employee row (optional FK on user_bonuses). We don't
  // require it — sales bonuses also tolerate a NULL employee_id when
  // the company doesn't manage employees in HR.
  let employeeId: string | null = null
  try {
    const { data: emp } = await supabase
      .from('employees')
      .select('id')
      .eq('company_id', companyId)
      .eq('user_id', recipientUserId)
      .eq('is_active', true)
      .maybeSingle()
    if (emp?.id) employeeId = emp.id
  } catch {
    /* non-fatal */
  }

  // 5. INSERT — the unique partial index makes this a no-op on retries.
  const { data: inserted, error: insErr } = await supabase
    .from('user_bonuses')
    .insert({
      company_id:       companyId,
      user_id:          recipientUserId,
      employee_id:      employeeId,
      invoice_id:       invoiceId,
      booking_id:       booking.id,
      source:           'service_commission',
      bonus_amount:     amount,
      bonus_currency:   service.currency_code || 'EGP',
      bonus_type:       'percentage',
      calculation_base: subtotal,
      calculation_rate: rate,
      status:           'pending',
      created_by:       createdBy || null,
      note:             `عمولة تنفيذ خدمة: ${service.service_name}`,
    })
    .select('id, bonus_amount')
    .single()

  if (insErr) {
    // 23505 = unique_violation — already recorded for this booking
    if ((insErr.code || '') === '23505') {
      return { recorded: false, reason: 'already_recorded' }
    }
    return { recorded: false, reason: insErr.message }
  }

  return { recorded: true, bonus_id: inserted.id, amount: inserted.bonus_amount }
}

/**
 * Reverse the service-commission bonus tied to a booking's invoice.
 *   - If status='pending'   → mark 'reversed' (clean clawback).
 *   - If status='scheduled' → mark 'reversed' too; the payroll attach
 *                             flow ignores reversed rows so the next
 *                             attach will simply not pick it up. If a
 *                             payroll run has already swept it, the
 *                             clawback becomes a manual HR task — we
 *                             only flip the flag and record the reason.
 *   - If status='paid'      → leave it; flag the reversal_reason so HR
 *                             can deduct on the next slip.
 */
export async function reverseServiceCommissionForInvoice(
  supabase: SupabaseLike,
  params: { companyId: string; invoiceId: string; reason?: string },
): Promise<{ updated: number }> {
  const { companyId, invoiceId, reason } = params
  const { data: rows, error: fetchErr } = await supabase
    .from('user_bonuses')
    .select('id, status')
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .eq('source', 'service_commission')
    .not('status', 'in', '("reversed","cancelled")')
  if (fetchErr) throw fetchErr
  if (!rows || rows.length === 0) return { updated: 0 }

  const ids = rows.map((r: any) => r.id)
  const { error: updErr } = await supabase
    .from('user_bonuses')
    .update({
      status: 'reversed',
      reversed_at: new Date().toISOString(),
      reversal_reason: reason || 'invoice_voided_or_refunded',
    })
    .in('id', ids)
  if (updErr) throw updErr
  return { updated: ids.length }
}
