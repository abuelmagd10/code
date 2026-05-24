/**
 * Generic Notification Dispatcher - Phase L (v3.39.0)
 *
 * Unified entry point for sending notifications across multiple channels
 * (in_app, email) with automatic respect for user preferences.
 *
 * Key behavior:
 * - Always checks `should_user_be_notified()` per channel BEFORE sending.
 * - `severity = 'critical'` bypasses preferences (cannot be muted).
 * - Email is only attempted if email content is provided.
 * - Each channel reports independently — partial success is normal.
 *
 * Use this from any business workflow (billing, sales, approvals, etc.)
 * to ensure consistent multi-channel delivery with preferences applied.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type NotificationCategory =
  | 'billing' | 'finance' | 'sales' | 'approvals'
  | 'system' | 'inventory' | 'hr' | 'manufacturing'

export type NotificationSeverity = 'info' | 'warning' | 'error' | 'critical'
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical'
export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push'

export interface DispatchArgs {
  /** Recipient user id (the company member who'll get notified) */
  userId: string
  /** Tenant scope */
  companyId: string
  category: NotificationCategory
  severity: NotificationSeverity
  priority?: NotificationPriority

  /** Required for in_app notification */
  title: string
  message: string
  referenceType: string
  referenceId: string

  /** Optional dedup key */
  eventKey?: string

  /** Optional UI targeting hints */
  assignedToRole?: string

  /** Provide email content to also send via email channel */
  email?: {
    /** Recipient email address. If absent, will resolve from auth user */
    to?: string
    /** Subject line — defaults to title */
    subject?: string
    /** Rich HTML body. If absent, message is wrapped in a default layout */
    html?: string
  }
}

export interface ChannelResult {
  sent: boolean
  skipped?: boolean
  error?: string
}

export interface DispatchResult {
  in_app: ChannelResult
  email: ChannelResult
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw new Error('Supabase admin credentials missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

let cachedTransporter: nodemailer.Transporter | null = null
function getMailTransporter(): nodemailer.Transporter | null {
  if (cachedTransporter) return cachedTransporter
  const host = process.env.SMTP_HOST
  const port = parseInt(process.env.SMTP_PORT || '587', 10)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) return null
  cachedTransporter = nodemailer.createTransport({
    host, port, secure: port === 465, auth: { user, pass },
  })
  return cachedTransporter
}

/**
 * Resolve user's email from auth.users via service role.
 */
async function resolveUserEmail(
  admin: SupabaseClient,
  userId: string
): Promise<string | null> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId)
    return data?.user?.email ?? null
  } catch {
    return null
  }
}

/**
 * Wraps a plain message in a minimal HTML layout if no html is provided.
 */
function buildDefaultEmailHtml(args: {
  title: string
  message: string
  severity: NotificationSeverity
  appUrl: string
}): string {
  const accent = args.severity === 'critical' || args.severity === 'error'
    ? '#DC2626' : args.severity === 'warning'
    ? '#F59E0B' : '#7C3AED'

  return `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
<tr><td style="padding:24px 28px;border-bottom:1px solid #E5E7EB;">
  <div style="font-size:22px;font-weight:bold;color:${accent};">7esab.com</div>
  <div style="font-size:11px;color:#6B7280;margin-top:2px;">Enterprise Resource Planning</div>
</td></tr>
<tr><td style="padding:28px;color:#111827;font-size:15px;line-height:1.7;">
  <h2 style="margin:0 0 14px;font-size:20px;color:${accent};">${escapeHtml(args.title)}</h2>
  <p style="margin:0 0 18px;color:#374151;">${escapeHtml(args.message)}</p>
  <div style="text-align:center;margin:24px 0 0;">
    <a href="${args.appUrl}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:bold;font-size:15px;">افتح التطبيق</a>
  </div>
</td></tr>
<tr><td style="padding:14px 28px;background:#F9FAFB;border-top:1px solid #E5E7EB;color:#9CA3AF;font-size:11px;text-align:center;">
  7esab.com — هذا البريد آلى، لا ترد عليه مباشرة
</td></tr>
</table>
</td></tr></table>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ─────────────────────────────────────────
// Public utility (also exported for use without dispatcher)
// ─────────────────────────────────────────

/**
 * Check whether a specific channel should deliver this notification
 * for a given user, respecting their preferences. Critical severity
 * always returns true (mandatory delivery).
 *
 * Fails open (returns true) if the preference lookup itself errors,
 * to prevent silent dropping of important notifications.
 */
export async function shouldDeliverChannel(args: {
  userId: string
  companyId: string
  category: NotificationCategory
  channel: NotificationChannel
  severity: NotificationSeverity
}): Promise<boolean> {
  try {
    const admin = getAdminClient()
    const { data, error } = await admin.rpc('should_user_be_notified', {
      p_user_id: args.userId,
      p_company_id: args.companyId,
      p_category: args.category,
      p_channel: args.channel,
      p_severity: args.severity,
    })
    if (error) {
      console.warn('[dispatcher] preference check failed (fail-open):', error.message)
      return true
    }
    return data !== false
  } catch (e) {
    console.warn('[dispatcher] preference check exception (fail-open):', e)
    return true
  }
}

// ─────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────

/**
 * Dispatch a notification across in_app (+ optionally email) channels,
 * respecting user preferences. Critical severity bypasses preferences.
 *
 * Returns per-channel results — never throws. Safe to call from any
 * business flow without aborting on notification failure.
 */
export async function dispatchNotification(args: DispatchArgs): Promise<DispatchResult> {
  const result: DispatchResult = {
    in_app: { sent: false },
    email: { sent: false },
  }

  const admin = getAdminClient()

  // ── 1. IN-APP CHANNEL ──
  try {
    const allowed = await shouldDeliverChannel({
      userId: args.userId,
      companyId: args.companyId,
      category: args.category,
      channel: 'in_app',
      severity: args.severity,
    })
    if (!allowed) {
      result.in_app = { sent: false, skipped: true }
    } else {
      const { error } = await admin.rpc('create_notification', {
        p_company_id: args.companyId,
        p_reference_type: args.referenceType,
        p_reference_id: args.referenceId,
        p_title: args.title,
        p_message: args.message,
        p_created_by: args.userId,
        p_branch_id: null,
        p_cost_center_id: null,
        p_warehouse_id: null,
        p_assigned_to_role: args.assignedToRole || null,
        p_assigned_to_user: args.userId,
        p_priority: args.priority || (args.severity === 'critical' ? 'critical' : 'high'),
        p_event_key: args.eventKey || null,
        p_severity: args.severity,
        p_category: args.category,
      })
      if (error) {
        result.in_app = { sent: false, error: error.message }
        console.error('[dispatcher] in_app failed:', error)
      } else {
        result.in_app = { sent: true }
      }
    }
  } catch (e: any) {
    result.in_app = { sent: false, error: e?.message || 'unknown' }
  }

  // ── 2. EMAIL CHANNEL (only if email content provided) ──
  if (args.email) {
    try {
      const allowed = await shouldDeliverChannel({
        userId: args.userId,
        companyId: args.companyId,
        category: args.category,
        channel: 'email',
        severity: args.severity,
      })
      if (!allowed) {
        result.email = { sent: false, skipped: true }
      } else {
        const transporter = getMailTransporter()
        if (!transporter) {
          result.email = { sent: false, skipped: true, error: 'smtp_not_configured' }
        } else {
          // Resolve recipient
          let toAddress = args.email.to
          if (!toAddress) {
            toAddress = (await resolveUserEmail(admin, args.userId)) || undefined
          }
          if (!toAddress) {
            result.email = { sent: false, error: 'no_recipient_email' }
          } else {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
              (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://7esab.com')
            const html = args.email.html || buildDefaultEmailHtml({
              title: args.title,
              message: args.message,
              severity: args.severity,
              appUrl,
            })
            try {
              await transporter.sendMail({
                from: process.env.SMTP_FROM || '"7esab.com" <noreply@7esab.com>',
                to: toAddress,
                subject: args.email.subject || args.title,
                html,
              })
              result.email = { sent: true }
            } catch (mailErr: any) {
              result.email = { sent: false, error: mailErr?.message || 'send_failed' }
              console.error('[dispatcher] email send failed:', mailErr)
            }
          }
        }
      }
    } catch (e: any) {
      result.email = { sent: false, error: e?.message || 'unknown' }
    }
  }

  return result
}
