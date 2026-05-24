/**
 * Subscription In-App Notifications - 7ESAB ERP v3.37.0
 *
 * Companion to renewal-emails.ts: while emails reach users wherever they
 * are, these in-app notifications surface inside the ERP so the company
 * owner sees them the moment they open the dashboard.
 *
 * All four lifecycle events post a notification targeted at the company
 * OWNER (companies.user_id) via the existing notifications table + RPC
 * `create_notification`.
 *
 * Design notes:
 * - Server-side only (uses service role client). Called from cron + webhook.
 * - Non-blocking by design: a notification failure must NOT abort the
 *   billing flow that triggered it. Wrap in try/catch upstream.
 * - event_key is set so the realtime UI can deduplicate / replace stale
 *   notifications for the same company+period (best-effort, depends on
 *   how the DB-level RPC treats the key).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────

const REF_TYPE = 'subscription'  // groups all billing notifications

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://7esab.com')

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw new Error('Supabase admin credentials missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Resolve the company's owner user_id (the admin who pays).
 * Returns null if the company doesn't exist or has no owner set.
 */
async function getCompanyOwnerId(
  admin: SupabaseClient,
  companyId: string
): Promise<string | null> {
  const { data } = await admin
    .from('companies')
    .select('user_id')
    .eq('id', companyId)
    .maybeSingle()
  return (data?.user_id as string) || null
}

/**
 * Core wrapper: calls create_notification RPC with sensible defaults
 * for billing events. The notification is ALWAYS assigned to the company
 * owner (admin) and targeted at the 'owner' role too as a safety net.
 */
async function postSubscriptionNotification(args: {
  companyId: string
  referenceId: string
  title: string
  message: string
  priority?: 'low' | 'normal' | 'high' | 'critical'
  severity?: 'info' | 'warning' | 'error' | 'critical'
  eventKey?: string
}): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  try {
    const admin = getAdminClient()
    const ownerId = await getCompanyOwnerId(admin, args.companyId)

    const createdBy = ownerId
    if (!createdBy) {
      console.warn('[subscription-notifications] No owner found for company', args.companyId)
      return { sent: false, error: 'no_owner_found' }
    }

    // ── Check user preference (Phase K)
    // Critical severity bypasses preferences automatically (DB function logic)
    const severity = args.severity || 'warning'
    try {
      const { data: shouldNotify } = await admin.rpc('should_user_be_notified', {
        p_user_id: ownerId,
        p_company_id: args.companyId,
        p_category: 'billing',
        p_channel: 'in_app',
        p_severity: severity,
      })
      if (shouldNotify === false) {
        // User explicitly muted billing in_app notifications and this isn't critical
        return { sent: false, skipped: true }
      }
    } catch (prefErr) {
      // If preference lookup fails, default to sending (fail-open for billing safety)
      console.warn('[subscription-notifications] preference check failed, sending anyway:', prefErr)
    }

    const { error } = await admin.rpc('create_notification', {
      p_company_id: args.companyId,
      p_reference_type: REF_TYPE,
      p_reference_id: args.referenceId,
      p_title: args.title,
      p_message: args.message,
      p_created_by: createdBy,
      p_branch_id: null,
      p_cost_center_id: null,
      p_warehouse_id: null,
      p_assigned_to_role: 'owner',
      p_assigned_to_user: ownerId,
      p_priority: args.priority || 'high',
      p_event_key: args.eventKey || null,
      p_severity: severity,
      p_category: 'billing',
    })

    if (error) {
      console.error('[subscription-notifications] RPC error:', error)
      return { sent: false, error: error.message }
    }
    return { sent: true }
  } catch (err: any) {
    console.error('[subscription-notifications] exception:', err)
    return { sent: false, error: err?.message || 'unknown' }
  }
}

// ─────────────────────────────────────────
// Public API — one helper per lifecycle event
// ─────────────────────────────────────────

/**
 * Day -2: subscription expires soon. Reminder.
 * Triggered by cron when current_period_end is within 2 days.
 */
export async function notifyRenewalReminder(args: {
  companyId: string
  periodEnd: Date
  seats: number
}) {
  const dateStr = args.periodEnd.toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  return postSubscriptionNotification({
    companyId: args.companyId,
    referenceId: args.companyId,  // billing notifications reference the company
    title: '🔔 تذكير: اشتراكك ينتهى قريباً',
    message: `اشتراكك (${args.seats} مقعد) ينتهى فى ${dateStr}. اضغط هنا للتجديد بنقرة واحدة.`,
    priority: 'high',
    severity: 'warning',
    eventKey: `subscription:reminder:${args.companyId}:${args.periodEnd.toISOString().slice(0, 10)}`,
  })
}

/**
 * Day 0: subscription expired, grace period started.
 * Triggered when cron transitions active → past_due.
 */
export async function notifyPastDue(args: {
  companyId: string
  graceEndsAt: Date
}) {
  const graceStr = args.graceEndsAt.toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  return postSubscriptionNotification({
    companyId: args.companyId,
    referenceId: args.companyId,
    title: '⚠️ انتهى اشتراكك — فترة سماح 3 أيام',
    message: `لم نتلقَّ الدفعة الجديدة. الحساب يعمل بشكل كامل حتى ${graceStr}، ثم سيُوقَف الموظفون. ادفع الآن لتجنب الإيقاف.`,
    priority: 'critical',
    severity: 'error',
    eventKey: `subscription:past_due:${args.companyId}:${args.graceEndsAt.toISOString().slice(0, 10)}`,
  })
}

/**
 * Day +3: grace exceeded → account suspended.
 * Triggered when cron transitions past_due → payment_failed.
 */
export async function notifySuspension(args: {
  companyId: string
}) {
  return postSubscriptionNotification({
    companyId: args.companyId,
    referenceId: args.companyId,
    title: '🛑 تم إيقاف حساب شركتك',
    message: 'انتهت فترة السماح بدون تجديد. الموظفون لا يستطيعون تسجيل الدخول حالياً. بياناتك آمنة 100% — ادفع لاستعادة الوصول فوراً.',
    priority: 'critical',
    severity: 'critical',
    eventKey: `subscription:suspended:${args.companyId}:${new Date().toISOString().slice(0, 10)}`,
  })
}

/**
 * Reactivation: subscription restored after payment.
 * Triggered from handlePaymentSuccess when reactivation.was_reactivated=true.
 */
export async function notifyReactivation(args: {
  companyId: string
  newPeriodEnd: Date
}) {
  const dateStr = args.newPeriodEnd.toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  return postSubscriptionNotification({
    companyId: args.companyId,
    referenceId: args.companyId,
    title: '🎉 أهلاً بك مرة أخرى! تم تفعيل الاشتراك',
    message: `تم استلام الدفعة وتفعيل الحساب. الاشتراك ساري حتى ${dateStr}. كل الموظفين يمكنهم العودة للعمل فوراً.`,
    priority: 'high',
    severity: 'info',
    eventKey: `subscription:reactivated:${args.companyId}:${new Date().toISOString().slice(0, 10)}`,
  })
}

// ─────────────────────────────────────────
// Optional: also notify on successful add-seats payment (not just reactivation)
// ─────────────────────────────────────────

/**
 * Payment success: any successful seat payment (renewal OR add-seats).
 * Lighter than notifyReactivation — used when subscription was already active.
 */
export async function notifyPaymentSuccess(args: {
  companyId: string
  seatsAdded: number
  amountEgp: number
}) {
  return postSubscriptionNotification({
    companyId: args.companyId,
    referenceId: args.companyId,
    title: '✅ تم استلام الدفعة بنجاح',
    message: `تم إضافة ${args.seatsAdded} مقعد. المبلغ المُحصَّل: ${args.amountEgp.toLocaleString('ar-EG')} جنيه.`,
    priority: 'normal',
    severity: 'info',
    eventKey: `subscription:payment:${args.companyId}:${Date.now()}`,
  })
}
