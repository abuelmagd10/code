/**
 * Subscription Renewal Emails - 7ESAB ERP v3.32.0
 *
 * Lightweight email helpers built on nodemailer for the lifecycle cron.
 * All templates are Arabic/RTL, with a clear CTA button linking to
 * /settings/billing for the customer to renew.
 *
 * Env vars expected:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * (optional)
 *   NEXT_PUBLIC_APP_URL  — used for the CTA link
 *
 * If SMTP env vars are missing the helpers log a warning and return
 * `{ sent: false, skipped: true }` — they never throw, so the cron job
 * still proceeds with the DB transitions even on email outage.
 */

import nodemailer from 'nodemailer'

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://7esab.com')

const BILLING_URL = `${APP_URL}/settings/billing`

interface MailResult {
  sent: boolean
  skipped?: boolean
  error?: string
}

let cachedTransporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (cachedTransporter) return cachedTransporter

  const host = process.env.SMTP_HOST
  const port = parseInt(process.env.SMTP_PORT || '587', 10)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    return null
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  return cachedTransporter
}

async function sendMail(
  to: string,
  subject: string,
  html: string
): Promise<MailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn('[renewal-emails] SMTP not configured — skipping email to', to)
    return { sent: false, skipped: true }
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"7esab.com" <noreply@7esab.com>',
      to,
      subject,
      html,
    })
    return { sent: true }
  } catch (err: any) {
    console.error('[renewal-emails] sendMail failed:', err)
    return { sent: false, error: err?.message || 'send_failed' }
  }
}

// ─────────────────────────────────────────
// Shared HTML wrapper
// ─────────────────────────────────────────

function emailLayout(opts: {
  title: string
  preheader: string
  bodyHtml: string
  ctaText?: string
  ctaUrl?: string
  accentColor?: string
}): string {
  const accent = opts.accentColor || '#7C3AED'  // violet
  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
  <div style="display:none;font-size:1px;color:#F3F4F6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${opts.preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F3F4F6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <tr>
            <td style="padding:24px 28px;border-bottom:1px solid #E5E7EB;">
              <div style="font-size:22px;font-weight:bold;color:${accent};">7esab.com</div>
              <div style="font-size:11px;color:#6B7280;margin-top:2px;">Enterprise Resource Planning</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;color:#111827;font-size:15px;line-height:1.7;">
              ${opts.bodyHtml}
              ${opts.ctaText && opts.ctaUrl ? `
                <div style="text-align:center;margin:28px 0 8px;">
                  <a href="${opts.ctaUrl}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:bold;font-size:15px;">${opts.ctaText}</a>
                </div>
              ` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background:#F9FAFB;border-top:1px solid #E5E7EB;color:#9CA3AF;font-size:12px;text-align:center;">
              7esab.com • <a href="mailto:info@7esab.com" style="color:#9CA3AF;">info@7esab.com</a><br/>
              <span style="font-size:11px;">هذا البريد آلى — لا ترد عليه مباشرة.</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─────────────────────────────────────────
// Reminder: subscription expires soon (2 days before period_end)
// ─────────────────────────────────────────

export async function sendRenewalReminder(args: {
  to: string
  companyName: string
  periodEnd: Date
  seats: number
}): Promise<MailResult> {
  const dateStr = args.periodEnd.toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const body = `
    <h2 style="margin:0 0 14px;font-size:20px;color:#111827;">تذكير: اشتراكك ينتهى قريباً 🔔</h2>
    <p>أهلاً <strong>${escapeHtml(args.companyName)}</strong>،</p>
    <p>اشتراكك الحالى (<strong>${args.seats}</strong> مقعد) ينتهى فى <strong>${dateStr}</strong>.</p>
    <p>لضمان استمرار الخدمة بدون انقطاع، يرجى تجديد الاشتراك قبل تاريخ الانتهاء.</p>
    <div style="background:#FEF3C7;border-right:4px solid #F59E0B;padding:12px 14px;border-radius:8px;margin:16px 0;font-size:13px;color:#92400E;">
      💡 <strong>ما يحدث لو لم تُجدِّد؟</strong><br/>
      بعد تاريخ الانتهاء سنُعطيك مهلة 3 أيام، ثم يُوقَف الحساب تلقائياً حتى الدفع.
    </div>
  `
  return sendMail(
    args.to,
    'تذكير: اشتراك 7esab.com ينتهى قريباً',
    emailLayout({
      title: 'تذكير تجديد الاشتراك',
      preheader: `اشتراكك ينتهى فى ${dateStr}`,
      bodyHtml: body,
      ctaText: 'جدّد الاشتراك الآن',
      ctaUrl: BILLING_URL,
    })
  )
}

// ─────────────────────────────────────────
// Past Due: subscription expired, grace period started
// ─────────────────────────────────────────

export async function sendPastDueNotice(args: {
  to: string
  companyName: string
  graceEndsAt: Date
}): Promise<MailResult> {
  const graceStr = args.graceEndsAt.toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const body = `
    <h2 style="margin:0 0 14px;font-size:20px;color:#B91C1C;">انتهى اشتراكك ⚠️</h2>
    <p>أهلاً <strong>${escapeHtml(args.companyName)}</strong>،</p>
    <p>انتهت فترة اشتراكك ولم نتلقَّ الدفعة الجديدة بعد.</p>
    <p>أنت الآن فى <strong>فترة سماح</strong> حتى <strong>${graceStr}</strong>. الحساب لا يزال يعمل بشكل كامل خلال هذه الفترة.</p>
    <div style="background:#FEE2E2;border-right:4px solid #DC2626;padding:12px 14px;border-radius:8px;margin:16px 0;font-size:13px;color:#991B1B;">
      🚨 <strong>تنبيه:</strong><br/>
      لو لم يتم الدفع قبل ${graceStr}، سيتم إيقاف الحساب تلقائياً ولن يتمكن المستخدمون من تسجيل الدخول.
    </div>
  `
  return sendMail(
    args.to,
    '⚠️ اشتراك 7esab.com انتهى — فترة سماح 3 أيام',
    emailLayout({
      title: 'انتهاء الاشتراك',
      preheader: `فترة السماح حتى ${graceStr}`,
      bodyHtml: body,
      ctaText: 'ادفع الآن لتجنب الإيقاف',
      ctaUrl: BILLING_URL,
      accentColor: '#DC2626',
    })
  )
}

// ─────────────────────────────────────────
// Suspension: grace period exceeded
// ─────────────────────────────────────────

export async function sendSuspensionNotice(args: {
  to: string
  companyName: string
}): Promise<MailResult> {
  const body = `
    <h2 style="margin:0 0 14px;font-size:20px;color:#1F2937;">تم إيقاف حسابك مؤقتاً</h2>
    <p>أهلاً <strong>${escapeHtml(args.companyName)}</strong>،</p>
    <p>بعد انتهاء فترة السماح بدون تجديد الاشتراك، تم إيقاف الحساب مؤقتاً.</p>
    <ul style="padding-right:18px;color:#4B5563;">
      <li>المستخدمون لا يستطيعون تسجيل الدخول حالياً</li>
      <li>بياناتك آمنة 100% ولم يتم حذف أى شىء</li>
      <li>عند الدفع، يُعاد تفعيل الحساب فوراً</li>
    </ul>
  `
  return sendMail(
    args.to,
    'تم إيقاف حساب 7esab.com — جدّد الآن لاستعادة الوصول',
    emailLayout({
      title: 'إيقاف الحساب',
      preheader: 'بياناتك آمنة — جدّد للاستعادة الفورية',
      bodyHtml: body,
      ctaText: 'استعد الوصول الآن',
      ctaUrl: BILLING_URL,
      accentColor: '#1F2937',
    })
  )
}

// ─────────────────────────────────────────
// Welcome back: reactivated after payment
// ─────────────────────────────────────────

export async function sendReactivationNotice(args: {
  to: string
  companyName: string
  newPeriodEnd: Date
}): Promise<MailResult> {
  const dateStr = args.newPeriodEnd.toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const body = `
    <h2 style="margin:0 0 14px;font-size:20px;color:#047857;">أهلاً بك مرة أخرى! 🎉</h2>
    <p>أهلاً <strong>${escapeHtml(args.companyName)}</strong>،</p>
    <p>تم استلام الدفعة وتفعيل الحساب بنجاح. اشتراكك ساري الآن حتى <strong>${dateStr}</strong>.</p>
    <p>جميع المستخدمين يمكنهم العودة للعمل فوراً.</p>
  `
  return sendMail(
    args.to,
    '🎉 تم تفعيل اشتراك 7esab.com — أهلاً بك مرة أخرى',
    emailLayout({
      title: 'إعادة تفعيل الحساب',
      preheader: `الاشتراك ساري حتى ${dateStr}`,
      bodyHtml: body,
      ctaText: 'افتح لوحة التحكم',
      ctaUrl: `${APP_URL}/dashboard`,
      accentColor: '#047857',
    })
  )
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
