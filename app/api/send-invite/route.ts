import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, inviteId, companyId, role } = body || {}
    if (!email || !inviteId) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    const proto = req.headers.get("x-forwarded-proto") || "http"
    const host = req.headers.get("host") || "localhost:3000"
    const base = `${proto}://${host}`
    const link = `${base}/invitations/accept?inv_id=${inviteId}`
    const smtpHost = process.env.SMTP_HOST
    const smtpPort = Number(process.env.SMTP_PORT || "587")
    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASS
    const mailFrom = process.env.MAIL_FROM || smtpUser || "noreply@example.com"
    if (!smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json({ link, warning: "smtp_not_configured" }, { status: 200 })
    }
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    })
    const subject = "دعوة الانضمام إلى الشركة"
    const text = `تمت دعوتك للانضمام إلى الشركة.
الدور: ${role || ""}
رابط القبول: ${link}
يرجى تسجيل الدخول بنفس البريد لقبول الدعوة.`
    const html = `<p>تمت دعوتك للانضمام إلى الشركة.</p><p>الدور: ${role || ""}</p><p><a href="${link}">رابط القبول</a></p><p>يرجى تسجيل الدخول بنفس البريد لقبول الدعوة.</p>`
    await transporter.sendMail({ from: mailFrom, to: email, subject, text, html })
    return NextResponse.json({ ok: true, link }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}