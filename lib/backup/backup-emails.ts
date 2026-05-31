/**
 * Backup failure email — v3.63.3 (B5)
 *
 * Sent by /api/cron/backup-daily when a company's nightly backup fails.
 * Reuses the same nodemailer/SMTP transport that powers renewal emails.
 *
 * Design notes:
 * - Only failures are emailed. Success would be too noisy (every day, every
 *   tenant) and the owner can see successes in /settings/backup.
 * - The email links straight to /settings/backup so the owner can act.
 * - If SMTP is not configured, we log and return { sent: false, skipped: true }
 *   so the cron keeps going.
 */
import nodemailer from "nodemailer"

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://7esab.com")
const BACKUP_URL = `${APP_URL}/settings/backup`

interface MailResult {
  sent: boolean
  skipped?: boolean
  error?: string
}

let cachedTransporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (cachedTransporter) return cachedTransporter
  const host = process.env.SMTP_HOST
  const port = parseInt(process.env.SMTP_PORT || "587", 10)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) return null
  cachedTransporter = nodemailer.createTransport({
    host, port, secure: port === 465, auth: { user, pass },
  })
  return cachedTransporter
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
}

export async function sendBackupFailureNotice(opts: {
  to: string
  companyName: string
  errorMessage: string
  runAt: string
}): Promise<MailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn("[backup-emails] SMTP not configured — skipping failure email to", opts.to)
    return { sent: false, skipped: true }
  }

  const safeCompany = escapeHtml(opts.companyName)
  const safeError = escapeHtml(opts.errorMessage.slice(0, 500))
  const safeRunAt = escapeHtml(opts.runAt)

  const html = `<!doctype html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>فشل النسخة الاحتياطية اليومية</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F3F4F6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <tr>
          <td style="padding:24px 28px;border-bottom:1px solid #E5E7EB;">
            <div style="font-size:22px;font-weight:bold;color:#DC2626;">⚠️ تنبيه نسخ احتياطى</div>
            <div style="font-size:11px;color:#6B7280;margin-top:2px;">7esab.com — Enterprise Resource Planning</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;color:#111827;font-size:15px;line-height:1.7;">
            <p style="margin:0 0 14px;">السلام عليكم،</p>
            <p style="margin:0 0 14px;">
              لم تَنجح النسخة الاحتياطية اليومية لشركة <strong>${safeCompany}</strong>.
              هذا يَعنى أن بيانات اليوم لم تُحفظ تلقائياً.
            </p>
            <div style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:10px;padding:14px;margin:18px 0;">
              <div style="font-weight:bold;color:#991B1B;margin-bottom:6px;">تفاصيل الخطأ</div>
              <div style="font-family:Menlo,Consolas,monospace;font-size:13px;color:#7F1D1D;word-break:break-word;">${safeError}</div>
              <div style="font-size:12px;color:#9CA3AF;margin-top:8px;">وقت المحاولة: ${safeRunAt}</div>
            </div>
            <p style="margin:0 0 14px;"><strong>ماذا تَفعل الآن؟</strong></p>
            <ol style="margin:0 0 14px;padding-inline-start:20px;color:#374151;">
              <li>افتح صفحة النسخ الاحتياطية وضغط <strong>"تصدير الآن"</strong> يدوياً لحماية بيانات اليوم.</li>
              <li>تَأكد من تَوفُّر مساحة كافية فى الـ Supabase Storage (يُتاح فحصها فى لوحة Supabase).</li>
              <li>إذا تَكرَّر الفشل، راسلنا على <a href="mailto:info@7esab.com" style="color:#DC2626;">info@7esab.com</a> مع نسخة من رسالة الخطأ.</li>
            </ol>
            <div style="text-align:center;margin:24px 0 8px;">
              <a href="${BACKUP_URL}" style="display:inline-block;background:#DC2626;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:bold;font-size:15px;">فتح صفحة النسخ الاحتياطية</a>
            </div>
            <p style="margin:18px 0 0;font-size:13px;color:#6B7280;">
              المحاولة التالية ستَتم تلقائياً غداً فى الـ 5 صباحاً. إن نجحت، لن نُرسل تذكيراً.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 28px;background:#F9FAFB;border-top:1px solid #E5E7EB;color:#9CA3AF;font-size:12px;text-align:center;">
            7esab.com • <a href="mailto:info@7esab.com" style="color:#9CA3AF;">info@7esab.com</a><br/>
            <span style="font-size:11px;">هذا البريد آلى — لا ترد عليه مباشرة.</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"7esab.com" <noreply@7esab.com>',
      to: opts.to,
      subject: `⚠️ فشل النسخة الاحتياطية اليومية — ${opts.companyName}`,
      html,
      text: `فشلت النسخة الاحتياطية اليومية لشركة ${opts.companyName}.\n\nالخطأ: ${opts.errorMessage}\nالوقت: ${opts.runAt}\n\nيُرجى فتح ${BACKUP_URL} وعمل نسخة يدوية اليوم.\n\n— 7esab.com`,
    })
    return { sent: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[backup-emails] sendMail failed:", msg)
    return { sent: false, error: msg }
  }
}
