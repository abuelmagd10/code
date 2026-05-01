/**
 * SubscriptionService — 7ESAB ERP
 * Manages company subscription state synced with Paymob webhooks.
 *
 * Design:
 * - Payment provider agnostic where possible
 * - All DB writes go through service_role (bypasses RLS)
 * - Idempotent webhook handling via seat_transactions unique index
 * - Grace period of 3 days on payment failure before restricting
 */

import { createClient } from '@supabase/supabase-js'
import { increaseSeats } from './seat-service'

const GRACE_PERIOD_DAYS = 3

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw new Error('Supabase admin credentials missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type SubscriptionStatus =
  | 'free'
  | 'active'
  | 'past_due'
  | 'payment_failed'
  | 'canceled'

export interface CompanySubscription {
  company_id: string
  subscription_status: SubscriptionStatus
  current_period_start: string | null
  current_period_end: string | null
  paymob_order_id: string | null
  is_in_grace_period: boolean
  can_invite: boolean
}

export interface PaymobWebhookPayload {
  transaction_id: string
  order_id: string
  company_id: string
  additional_users: number
  amount_cents: number
  success: boolean
  pending: boolean
  error_occured: boolean
}

// ─────────────────────────────────────────
// getSubscription
// ─────────────────────────────────────────
export async function getSubscription(companyId: string): Promise<CompanySubscription> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('companies')
    .select('id, subscription_status, current_period_start, current_period_end, paymob_order_id')
    .eq('id', companyId)
    .single()

  if (error) throw new Error(error.message)

  const status = (data?.subscription_status || 'free') as SubscriptionStatus
  const now = new Date()
  const periodEnd = data?.current_period_end ? new Date(data.current_period_end) : null

  // Grace period: payment failed but within 3 days of period end
  const isInGracePeriod =
    status === 'past_due' &&
    periodEnd !== null &&
    now <= new Date(periodEnd.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)

  // Can invite: active subscription OR within grace period OR free (owner only, will be blocked at seat level)
  const canInvite = status === 'active' || isInGracePeriod

  return {
    company_id: companyId,
    subscription_status: status,
    current_period_start: data?.current_period_start || null,
    current_period_end: data?.current_period_end || null,
    paymob_order_id: data?.paymob_order_id || null,
    is_in_grace_period: isInGracePeriod,
    can_invite: canInvite,
  }
}

// ─────────────────────────────────────────
// handlePaymentSuccess
// Called from Paymob webhook — idempotent
// ─────────────────────────────────────────
export async function handlePaymentSuccess(payload: PaymobWebhookPayload): Promise<{
  success: boolean
  idempotent?: boolean
  error?: string
}> {
  try {
    // increaseSeats handles idempotency via unique paymob_transaction_id index
    const result = await increaseSeats(
      payload.company_id,
      payload.additional_users,
      payload.transaction_id,
      Math.round(payload.amount_cents / 100), // convert piasters to EGP
    )

    if (!result.success) {
      return { success: false, error: result.error }
    }

    // Log to audit_logs
    try {
      const admin = getAdminClient()
      await admin.from('audit_logs').insert({
        action: 'payment_success',
        company_id: payload.company_id,
        target_table: 'company_seats',
        new_data: {
          paymob_transaction_id: payload.transaction_id,
          seats_added: payload.additional_users,
          amount_egp: Math.round(payload.amount_cents / 100),
        },
      })
    } catch (logErr) {
      console.error('[SubscriptionService] audit log failed:', logErr)
    }

    return { success: true, idempotent: result.idempotent }
  } catch (err: any) {
    console.error('[SubscriptionService] handlePaymentSuccess error:', err)
    return { success: false, error: err.message }
  }
}

// ─────────────────────────────────────────
// handlePaymentFailed
// Sets company to past_due — does NOT remove users immediately
// ─────────────────────────────────────────
export async function handlePaymentFailed(companyId: string): Promise<void> {
  const admin = getAdminClient()

  await admin
    .from('companies')
    .update({ subscription_status: 'past_due' })
    .eq('id', companyId)

  try {
    await admin.from('audit_logs').insert({
      action: 'payment_failed',
      company_id: companyId,
      target_table: 'companies',
      new_data: { subscription_status: 'past_due' },
    })
  } catch { /* audit failure should not crash */ }
}

// ─────────────────────────────────────────
// cancelSubscription
// Sets company to canceled — seats remain until period_end
// ─────────────────────────────────────────
export async function cancelSubscription(
  companyId: string,
  performedBy?: string
): Promise<void> {
  const admin = getAdminClient()

  await admin
    .from('companies')
    .update({ subscription_status: 'canceled' })
    .eq('id', companyId)

  try {
    await admin.from('audit_logs').insert({
      action: 'subscription_canceled',
      company_id: companyId,
      user_id: performedBy || null,
      target_table: 'companies',
      new_data: { subscription_status: 'canceled' },
    })
  } catch { /* audit failure should not crash */ }
}

// ─────────────────────────────────────────
// reactivateSubscription
// ─────────────────────────────────────────
export async function reactivateSubscription(companyId: string): Promise<void> {
  const admin = getAdminClient()

  await admin
    .from('companies')
    .update({
      subscription_status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq('id', companyId)
}

// ─────────────────────────────────────────
// syncSubscriptionFromWebhook
// Main entry point for Paymob webhook processing
// Determines event type and routes accordingly
// ─────────────────────────────────────────
export async function syncSubscriptionFromWebhook(
  payload: PaymobWebhookPayload
): Promise<{ success: boolean; action: string; idempotent?: boolean; error?: string }> {
  // Successful, non-pending transaction
  if (payload.success && !payload.pending && !payload.error_occured) {
    const result = await handlePaymentSuccess(payload)
    return { ...result, action: 'payment_success' }
  }

  // Failed transaction (not pending)
  if (!payload.pending && (payload.error_occured || !payload.success)) {
    await handlePaymentFailed(payload.company_id)
    return { success: true, action: 'payment_failed' }
  }

  // Pending — do nothing, wait for final status
  return { success: true, action: 'ignored_pending' }
}
