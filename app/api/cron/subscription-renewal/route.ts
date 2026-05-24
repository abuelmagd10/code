/**
 * GET /api/cron/subscription-renewal
 *
 * Vercel-Cron-driven job (daily). Performs the subscription lifecycle:
 *
 *   1. Companies whose `current_period_end` is ≤ 2 days away:
 *      send "renewal due soon" reminder (once per period)
 *
 *   2. Companies whose `current_period_end` is in the past AND status='active':
 *      transition to 'past_due' (grace period starts) + send notice
 *
 *   3. Companies whose status='past_due' AND `current_period_end` is more
 *      than `GRACE_PERIOD_DAYS` (3) days past:
 *      suspend (status='payment_failed' + company_seats.status='suspended')
 *      + send suspension notice
 *
 * Auth: Vercel injects `Authorization: Bearer <CRON_SECRET>` for cron requests
 *       (CRON_SECRET env var). Manual calls from the dashboard must include it.
 *
 * The endpoint is idempotent — re-running on the same day does nothing
 * because the underlying DB transitions are guarded by status checks and
 * reminders are gated by `renewal_reminder_sent_at`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendRenewalReminder,
  sendPastDueNotice,
  sendSuspensionNotice,
} from '@/lib/billing/renewal-emails'
import { buildRenewalUrl } from '@/lib/billing/renewal-token'
import {
  notifyRenewalReminder,
  notifyPastDue,
  notifySuspension,
} from '@/lib/billing/subscription-notifications'
import { shouldDeliverChannel } from '@/lib/notifications/dispatcher'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GRACE_PERIOD_DAYS = 3
const REMINDER_LEAD_DAYS = 2  // send reminder 2 days before period_end

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw new Error('Supabase admin credentials missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

interface CronResult {
  ok: boolean
  ran_at: string
  reminders_sent: number
  past_due_transitions: number
  suspensions: number
  emails_failed: number
  errors: string[]
}

export async function GET(req: NextRequest) {
  // ── Auth check ──
  const expectedSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization') || ''
  if (expectedSecret) {
    if (authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  } else {
    // No secret set — only allow Vercel internal cron header
    const isVercelCron = req.headers.get('x-vercel-cron') === '1' || req.headers.get('x-vercel-internal') === '1'
    if (!isVercelCron) {
      console.warn('[cron] CRON_SECRET not set — accepting request anyway (dev mode)')
    }
  }

  const result: CronResult = {
    ok: true,
    ran_at: new Date().toISOString(),
    reminders_sent: 0,
    past_due_transitions: 0,
    suspensions: 0,
    emails_failed: 0,
    errors: [],
  }

  try {
    const admin = getAdminClient()
    const now = new Date()
    const nowIso = now.toISOString()
    const reminderThreshold = new Date(now.getTime() + REMINDER_LEAD_DAYS * 86400_000).toISOString()
    const graceEndThreshold = new Date(now.getTime() - GRACE_PERIOD_DAYS * 86400_000).toISOString()

    // ─────────────────────────────────────────
    // STEP 1: Renewal reminders (active subscriptions expiring within REMINDER_LEAD_DAYS)
    // ─────────────────────────────────────────
    const { data: dueSoon } = await admin
      .from('companies')
      .select('id, name, user_id, current_period_end, renewal_reminder_sent_at, current_period_start')
      .eq('subscription_status', 'active')
      .lte('current_period_end', reminderThreshold)
      .gte('current_period_end', nowIso)  // not yet expired
      .limit(500)

    for (const c of dueSoon || []) {
      // Skip if we already sent a reminder this period
      if (c.renewal_reminder_sent_at && c.current_period_start &&
          new Date(c.renewal_reminder_sent_at) >= new Date(c.current_period_start)) {
        continue
      }

      const email = await resolveOwnerEmail(admin, c.user_id)
      if (!email) continue

      const seatsCount = await fetchSeatsCount(admin, c.id)
      const periodEnd = c.current_period_end ? new Date(c.current_period_end) : new Date()
      const billingPeriod = await fetchLastBillingPeriod(admin, c.id)
      const renewalUrl = safeBuildRenewalUrl(c.id, seatsCount, billingPeriod)

      // Phase L: respect user email preference (severity=warning, NOT critical)
      const emailAllowed = c.user_id ? await shouldDeliverChannel({
        userId: c.user_id,
        companyId: c.id,
        category: 'billing',
        channel: 'email',
        severity: 'warning',
      }) : true

      const mailRes = emailAllowed
        ? await sendRenewalReminder({
            to: email,
            companyName: c.name || 'عميلنا العزيز',
            periodEnd,
            seats: seatsCount,
            renewalUrl,
          })
        : { sent: false, skipped: true } as const

      // In-app notification (non-blocking — even if email failed)
      try {
        await notifyRenewalReminder({
          companyId: c.id,
          periodEnd,
          seats: seatsCount,
        })
      } catch (e) { /* non-fatal */ }

      if (mailRes.sent) {
        result.reminders_sent++
        await admin
          .from('companies')
          .update({ renewal_reminder_sent_at: nowIso })
          .eq('id', c.id)
      } else if (!mailRes.skipped) {
        result.emails_failed++
      }
    }

    // ─────────────────────────────────────────
    // STEP 2: Transition expired active → past_due
    // ─────────────────────────────────────────
    const { data: expired } = await admin
      .from('companies')
      .select('id, name, user_id, current_period_end')
      .eq('subscription_status', 'active')
      .lt('current_period_end', nowIso)
      .limit(500)

    for (const c of expired || []) {
      const { data: rpcResult } = await admin
        .rpc('mark_subscription_past_due', { p_company_id: c.id })

      const wasTransitioned = (rpcResult as any)?.transitioned === true
      if (!wasTransitioned) continue

      result.past_due_transitions++

      const email = await resolveOwnerEmail(admin, c.user_id)
      if (!email) continue

      const periodEnd = c.current_period_end ? new Date(c.current_period_end) : new Date()
      const graceEndsAt = new Date(periodEnd.getTime() + GRACE_PERIOD_DAYS * 86400_000)

      const seatsCount = await fetchSeatsCount(admin, c.id)
      const billingPeriod = await fetchLastBillingPeriod(admin, c.id)
      const renewalUrl = safeBuildRenewalUrl(c.id, seatsCount, billingPeriod)

      // Phase L: severity=error — user MAY mute (but most won't for billing)
      const emailAllowed = c.user_id ? await shouldDeliverChannel({
        userId: c.user_id,
        companyId: c.id,
        category: 'billing',
        channel: 'email',
        severity: 'error',
      }) : true

      const mailRes = emailAllowed
        ? await sendPastDueNotice({
            to: email,
            companyName: c.name || 'عميلنا العزيز',
            graceEndsAt,
            renewalUrl,
          })
        : { sent: false, skipped: true } as const
      if (!mailRes.sent && !mailRes.skipped) result.emails_failed++

      // In-app notification — past_due
      try {
        await notifyPastDue({ companyId: c.id, graceEndsAt })
      } catch (e) { /* non-fatal */ }
    }

    // ─────────────────────────────────────────
    // STEP 3: Suspend past_due companies beyond grace period
    // ─────────────────────────────────────────
    const { data: gracedOut } = await admin
      .from('companies')
      .select('id, name, user_id')
      .eq('subscription_status', 'past_due')
      .lt('current_period_end', graceEndThreshold)
      .limit(500)

    for (const c of gracedOut || []) {
      const { data: rpcResult } = await admin
        .rpc('suspend_subscription', { p_company_id: c.id })

      const wasSuspended = (rpcResult as any)?.suspended === true
      if (!wasSuspended) continue

      result.suspensions++

      const email = await resolveOwnerEmail(admin, c.user_id)
      if (!email) continue

      const seatsCount = await fetchSeatsCount(admin, c.id)
      const billingPeriod = await fetchLastBillingPeriod(admin, c.id)
      const renewalUrl = safeBuildRenewalUrl(c.id, seatsCount, billingPeriod)

      // Phase L: severity=critical — BYPASSES preferences (always sends)
      // suspension is a hard event that the owner MUST know about, even
      // if they muted billing emails. Skip the preference check entirely.
      const mailRes = await sendSuspensionNotice({
        to: email,
        companyName: c.name || 'عميلنا العزيز',
        renewalUrl,
      })
      if (!mailRes.sent && !mailRes.skipped) result.emails_failed++

      // In-app notification — suspended (severity=critical also bypasses prefs)
      try {
        await notifySuspension({ companyId: c.id })
      } catch (e) { /* non-fatal */ }
    }

    // ─────────────────────────────────────────
    // Audit log entry summarizing the run
    // ─────────────────────────────────────────
    try {
      await admin.from('audit_logs').insert({
        action: 'cron_subscription_renewal',
        target_table: 'companies',
        new_data: result as any,
      })
    } catch { /* non-fatal */ }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[cron/subscription-renewal] fatal:', err)
    result.ok = false
    result.errors.push(err?.message || 'unknown_error')
    return NextResponse.json(result, { status: 500 })
  }
}

// Allow POST too (some cron schedulers prefer it)
export async function POST(req: NextRequest) {
  return GET(req)
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

async function resolveOwnerEmail(
  admin: ReturnType<typeof getAdminClient>,
  userId: string | null | undefined
): Promise<string | null> {
  if (!userId) return null
  try {
    const { data } = await admin.auth.admin.getUserById(userId)
    return data?.user?.email || null
  } catch {
    return null
  }
}

async function fetchSeatsCount(
  admin: ReturnType<typeof getAdminClient>,
  companyId: string
): Promise<number> {
  const { data } = await admin
    .from('company_seats')
    .select('total_paid_seats')
    .eq('company_id', companyId)
    .maybeSingle()
  return (data?.total_paid_seats as number) || 0
}

/**
 * Look up the last billing_period from invoices so we renew under the
 * same plan. Defaults to 'monthly' if no prior invoice exists.
 */
async function fetchLastBillingPeriod(
  admin: ReturnType<typeof getAdminClient>,
  companyId: string
): Promise<'monthly' | 'annual'> {
  const { data } = await admin
    .from('billing_invoices')
    .select('billing_period')
    .eq('company_id', companyId)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.billing_period === 'annual' ? 'annual' : 'monthly'
}

/**
 * Build a renewal URL or return undefined if token generation fails
 * (e.g. RENEWAL_TOKEN_SECRET missing). Email helpers fall back to the
 * generic /settings/billing link in that case.
 */
function safeBuildRenewalUrl(
  companyId: string,
  seats: number,
  billingPeriod: 'monthly' | 'annual'
): string | undefined {
  if (seats < 1) return undefined
  try {
    return buildRenewalUrl({ companyId, seats, billingPeriod })
  } catch (e) {
    console.warn('[cron] renewal URL generation failed:', e)
    return undefined
  }
}
