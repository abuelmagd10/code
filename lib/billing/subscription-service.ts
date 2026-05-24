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
import { createInvoiceForPayment, type PricingSnapshot } from './invoice-generator'
import { sendReactivationNotice } from './renewal-emails'
import { notifyReactivation, notifyPaymentSuccess } from './subscription-notifications'

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
  /** Subscription billing period — used to drive invoice line item & period_end */
  billing_period?: 'monthly' | 'annual'
  /** Full pricing breakdown captured at checkout time (from pricing-engine) */
  pricing_snapshot?: PricingSnapshot
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
  invoiceNumber?: string
  invoiceError?: string
  error?: string
}> {
  try {
    // increaseSeats handles idempotency via unique paymob_transaction_id index
    const result = await increaseSeats(
      payload.company_id,
      payload.additional_users,
      payload.transaction_id,
      Math.round(payload.amount_cents / 100), // convert piasters to EGP
      undefined,
      payload.billing_period ?? 'monthly',
    )

    if (!result.success) {
      return { success: false, error: result.error }
    }

    // ── Reactivation email + in-app notification (if company was suspended/past_due/canceled) ──
    if (result.reactivation?.was_reactivated && !result.idempotent) {
      try {
        const admin = getAdminClient()
        const { data: company } = await admin
          .from('companies')
          .select('name, user_id, current_period_end')
          .eq('id', payload.company_id)
          .single()

        const newPeriodEnd = new Date(company?.current_period_end || Date.now() + 30 * 86400_000)

        // Send reactivation email (best-effort)
        if (company?.user_id) {
          const { data: userData } = await admin.auth.admin.getUserById(company.user_id)
          const ownerEmail = userData?.user?.email
          if (ownerEmail) {
            await sendReactivationNotice({
              to: ownerEmail,
              companyName: company.name || 'عميلنا العزيز',
              newPeriodEnd,
            })
          }
        }

        // In-app notification — welcome back (non-blocking)
        try {
          await notifyReactivation({
            companyId: payload.company_id,
            newPeriodEnd,
          })
        } catch (e) { /* non-fatal */ }
      } catch (mailErr) {
        console.error('[SubscriptionService] reactivation email failed:', mailErr)
      }
    } else if (!result.idempotent) {
      // Normal add-seats payment (not reactivation) — lighter notification
      try {
        await notifyPaymentSuccess({
          companyId: payload.company_id,
          seatsAdded: payload.additional_users,
          amountEgp: Math.round(payload.amount_cents / 100),
        })
      } catch (e) { /* non-fatal */ }
    }

    // ── Generate invoice + PDF (idempotent on paymob_transaction_id) ──
    // Non-blocking semantics: an invoice failure should NOT undo seat activation
    let invoiceNumber: string | undefined
    let invoiceError: string | undefined
    if (payload.pricing_snapshot) {
      try {
        const invoiceResult = await createInvoiceForPayment({
          companyId: payload.company_id,
          pricingSnapshot: payload.pricing_snapshot,
          billingPeriod: payload.billing_period ?? 'monthly',
          paymobTransactionId: payload.transaction_id,
          paidAt: new Date().toISOString(),
          invoiceType: 'subscription',
        })
        if (invoiceResult.success) {
          invoiceNumber = invoiceResult.invoiceNumber
          if (invoiceResult.error) {
            invoiceError = invoiceResult.error  // e.g. pdf_render_failed (row was created)
          }
        } else {
          invoiceError = invoiceResult.error
          console.error('[SubscriptionService] invoice creation failed:', invoiceResult.error)
        }
      } catch (invoiceErr: any) {
        invoiceError = invoiceErr.message
        console.error('[SubscriptionService] invoice exception:', invoiceErr)
      }
    } else {
      invoiceError = 'pricing_snapshot_missing_in_payload'
      console.warn('[SubscriptionService] No pricing_snapshot in payload — skipping invoice generation')
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
          invoice_number: invoiceNumber ?? null,
          invoice_error: invoiceError ?? null,
        },
      })
    } catch (logErr) {
      console.error('[SubscriptionService] audit log failed:', logErr)
    }

    return { success: true, idempotent: result.idempotent, invoiceNumber, invoiceError }
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
): Promise<{
  success: boolean
  action: string
  idempotent?: boolean
  error?: string
  invoiceNumber?: string
  invoiceError?: string
}> {
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
