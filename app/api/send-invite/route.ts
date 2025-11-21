import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import nodemailer from "nodemailer"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, token, companyId, role } = body || {}
    if (!email || !token || !companyId || !role) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    const proto = req.headers.get("x-forwarded-proto") || "http"
    const host = req.headers.get("host") || "localhost:3000"
    const base = `${proto}://${host}`
    const link = `${base}/invitations/accept?token=${token}`

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey)
    // Create or update user with temp password and force change flag
    const { data: listed } = await (admin as any).auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = listed?.users?.find((u: any) => u?.email?.toLowerCase() === String(email).toLowerCase())
    const tempPass = "123456"
    let userId = existing?.id || ""
    if (!existing) {
      const { data: createdUser, error: createErr } = await (admin as any).auth.admin.createUser({ email, password: tempPass, email_confirm: true, user_metadata: { must_change_password: true } })
      if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })
      userId = createdUser.user?.id || ""
    } else {
      await (admin as any).auth.admin.updateUserById(userId, { password: tempPass, user_metadata: { must_change_password: true } })
    }

    // Insert membership for company with requested role
    const { error: memErr } = await admin
      .from("company_members")
      .upsert({ company_id: companyId, user_id: userId, role }, { onConflict: "company_id,user_id" })
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

    // Prefer custom email if SMTP configured, else fallback to Supabase invite
    const smtpHost = process.env.SMTP_HOST
    const smtpPort = Number(process.env.SMTP_PORT || "587")
    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASS
    const mailFrom = process.env.MAIL_FROM || smtpUser || "noreply@example.com"
    if (smtpHost && smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpPort === 465, auth: { user: smtpUser, pass: smtpPass } })
      const subject = "تفاصيل الدعوة إلى التطبيق"
      const text = `تمت دعوتك للانضمام إلى التطبيق.\nاسم المستخدم: ${email}\nكلمة المرور المؤقتة: ${tempPass}\nرابط الدخول: ${base}/auth/login\nبعد الدخول ستُطلب منك تغيير كلمة المرور.`
      const html = `<p>تمت دعوتك للانضمام إلى التطبيق.</p><p>اسم المستخدم: <b>${email}</b></p><p>كلمة المرور المؤقتة: <b>${tempPass}</b></p><p>رابط الدخول: <a href="${base}/auth/login">${base}/auth/login</a></p><p>بعد الدخول ستُطلب منك تغيير كلمة المرور.</p>`
      await transporter.sendMail({ from: mailFrom, to: email, subject, text, html })
    } else {
      const { error: invErr } = await (admin as any).auth.admin.inviteUserByEmail(email)
      if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, link }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}