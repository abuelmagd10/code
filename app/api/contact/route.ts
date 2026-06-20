/**
 * POST /api/contact
 *
 * Public contact form endpoint. Sends inquiry to SUPPORT_EMAIL via SMTP
 * (same Resend transport used for renewal emails).
 *
 * Hardening:
 *   - Strict input validation (name 2-80, email valid, subject 3-120, message 10-2000)
 *   - Rate limit: 5 submissions per IP per hour (in-memory; fine for low-volume)
 *   - Honeypot field "website" — if filled, silently succeed (bot detection)
 *   - Captures origin + user-agent in the email body for forensics
 *
 * Env vars:
 *   SUPPORT_EMAIL  — destination (defaults to info@7esab.com)
 *   SMTP_HOST/USER/PASS/PORT/FROM — already configured for renewal emails
 */
import { NextResponse } from "next/server"
import nodemailer from "nodemailer"

// v3.74.238 — the previous default "info@7esab.com" looks right on the
// branding side but the 7esab.com domain only has outbound SMTP wired up
// through Resend; there's no MX record pointing at a real mailbox, so
// every inquiry was being accepted by Resend and then black-holed at the
// destination. Default now points at the live Gmail inbox the owner
// actually reads. The env var still wins when set, so production can
// override this without a code change once a real info@ inbox exists.
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "7esab.erb@gmail.com"
const FROM = process.env.SMTP_FROM || "7esab.com <noreply@7esab.com>"

// ─── Rate limit: in-memory bucket ─────────────────────────────
const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const RATE_LIMIT = 5
const ipBuckets = new Map<string, { count: number; resetAt: number }>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const bucket = ipBuckets.get(ip)
  if (!bucket || bucket.resetAt < now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  if (bucket.count >= RATE_LIMIT) return true
  bucket.count++
  return false
}

// ─── Validation ───────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(body: Record<string, unknown>): { ok: true; data: ValidContact } | { ok: false; error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const email = typeof body.email === "string" ? body.email.trim() : ""
  const subject = typeof body.subject === "string" ? body.subject.trim() : ""
  const message = typeof body.message === "string" ? body.message.trim() : ""

  if (name.length < 2 || name.length > 80) return { ok: false, error: "الاسم يجب أن يكون بين 2 و 80 حرفاً" }
  if (!EMAIL_RE.test(email) || email.length > 200) return { ok: false, error: "البريد الإلكترونى غير صالح" }
  if (subject.length < 3 || subject.length > 120) return { ok: false, error: "الموضوع يجب أن يكون بين 3 و 120 حرفاً" }
  if (message.length < 10 || message.length > 2000) return { ok: false, error: "الرسالة يجب أن تكون بين 10 و 2000 حرف" }

  return { ok: true, data: { name, email, subject, message } }
}

interface ValidContact {
  name: string
  email: string
  subject: string
  message: string
}

// ─── SMTP ─────────────────────────────────────────────────────
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

// ─── Handler ──────────────────────────────────────────────────
export async function POST(request: Request) {
  // Get IP (Vercel sets x-forwarded-for)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
             request.headers.get("x-real-ip") || "unknown"

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "تجاوزت الحد الأقصى للرسائل. يرجى المحاولة بعد ساعة." },
      { status: 429 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 })
  }

  // Honeypot — bots usually fill all visible fields including hidden ones
  if (typeof body.website === "string" && body.website.length > 0) {
    // Silently succeed; the bot thinks it worked.
    return NextResponse.json({ ok: true })
  }

  const result = validate(body)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  const { name, email, subject, message } = result.data

  const transporter = getTransporter()
  if (!transporter) {
    console.error("[contact] SMTP not configured")
    return NextResponse.json(
      { error: "خدمة البريد غير مُتاحة حالياً. حاول لاحقاً أو راسلنا مباشرة على " + SUPPORT_EMAIL },
      { status: 503 }
    )
  }

  const userAgent = request.headers.get("user-agent") || "unknown"
  const referer = request.headers.get("referer") || "unknown"
  const timestamp = new Date().toISOString()

  // ─── Email to support ───
  const html = `
    <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1e40af;">رسالة جديدة من نموذج الاتصال</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; background: #f1f5f9; font-weight: bold;">الاسم</td><td style="padding: 8px;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding: 8px; background: #f1f5f9; font-weight: bold;">البريد</td><td style="padding: 8px;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        <tr><td style="padding: 8px; background: #f1f5f9; font-weight: bold;">الموضوع</td><td style="padding: 8px;">${escapeHtml(subject)}</td></tr>
      </table>
      <h3 style="color: #475569;">الرسالة</h3>
      <div style="background: #f8fafc; padding: 16px; border-right: 4px solid #2563eb; white-space: pre-wrap;">${escapeHtml(message)}</div>
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e2e8f0;" />
      <p style="font-size: 12px; color: #64748b;">
        <strong>IP:</strong> ${escapeHtml(ip)}<br/>
        <strong>User-Agent:</strong> ${escapeHtml(userAgent)}<br/>
        <strong>Referer:</strong> ${escapeHtml(referer)}<br/>
        <strong>الوقت:</strong> ${escapeHtml(timestamp)}
      </p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: FROM,
      to: SUPPORT_EMAIL,
      replyTo: email,
      subject: `[تواصل] ${subject}`,
      html,
      text: `الاسم: ${name}\nالبريد: ${email}\nالموضوع: ${subject}\n\n${message}\n\n---\nIP: ${ip}\nالوقت: ${timestamp}`,
    })
  } catch (err) {
    console.error("[contact] sendMail to support failed:", err)
    return NextResponse.json(
      { error: "تعذَّر إرسال الرسالة. حاول لاحقاً." },
      { status: 500 }
    )
  }

  // ─── Auto-reply to user (best-effort; do not fail if it errors) ───
  try {
    const autoReplyHtml = `
      <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1e40af;">شكراً لتواصلك مع 7esab.com</h2>
        <p>عزيزى/عزيزتى <strong>${escapeHtml(name)}</strong>،</p>
        <p>وصلتنا رسالتك وسنرد عليك خلال يوم عمل واحد على هذا البريد.</p>
        <div style="background: #f8fafc; padding: 16px; border-right: 4px solid #2563eb; margin: 16px 0;">
          <strong>موضوع رسالتك:</strong><br/>
          ${escapeHtml(subject)}
        </div>
        <p style="color: #64748b; font-size: 14px;">إذا كان الأمر عاجلاً، يمكنك مراسلتنا مباشرة على <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
        <p style="color: #64748b; font-size: 14px;">إذا كان الأمر عاجلاً، يمكنك مراسلتنا مباشرة على <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #e2e8f0;" />
        <p style="font-size: 12px; color: #94a3b8;">7esab.com — Enterprise Resource Planning</p>
      </div>
    `
    await transporter.sendMail({
      from: FROM,
      to: email,
      subject: `وصلتنا رسالتك — ${subject}`,
      html: autoReplyHtml,
      text: `وصلتنا رسالتك بعنوان "${subject}". سنرد خلال يوم عمل.\n\n— 7esab.com`,
    })
  } catch (err) {
    console.warn("[contact] auto-reply failed (non-fatal):", err)
  }

  return NextResponse.json({ ok: true })
}
