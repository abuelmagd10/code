import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, inviteId } = body || {}
    if (!email && !inviteId) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    
    const proto = req.headers.get("x-forwarded-proto") || "http"
    const host = req.headers.get("host") || "localhost:3000"
    const base = `${proto}://${host}`

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    // Find the invitation
    let invitation: any = null
    if (inviteId) {
      const { data } = await admin.from("company_invitations").select("*").eq("id", inviteId).single()
      invitation = data
    } else if (email) {
      const { data } = await admin.from("company_invitations")
        .select("*")
        .eq("email", email.toLowerCase())
        .eq("accepted", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .single()
      invitation = data
    }

    if (!invitation) return NextResponse.json({ error: "invitation_not_found" }, { status: 404 })
    if (invitation.accepted) return NextResponse.json({ error: "invitation_already_accepted" }, { status: 400 })

    // Get company name
    let companyName = "7ESAB"
    try {
      const { data: company } = await admin.from("companies").select("name").eq("id", invitation.company_id).single()
      if (company?.name) companyName = company.name
    } catch {}

    // Verify permission
    try {
      const ssr = await createSSR()
      const { data: { user } } = await ssr.auth.getUser()
      if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      const { data: member } = await admin
        .from("company_members")
        .select("role")
        .eq("company_id", invitation.company_id)
        .eq("user_id", user.id)
        .maybeSingle()
      const isAdmin = ["owner","admin"].includes(String(member?.role || ""))
      if (!isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 })
    } catch {}

    const acceptLink = `${base}/invitations/accept?token=${invitation.accept_token}`
    const targetEmail = invitation.email
    const roleName = invitation.role === "admin" ? "مدير" : invitation.role === "owner" ? "مالك" : invitation.role === "accountant" ? "محاسب" : invitation.role === "manager" ? "مدير" : "موظف"

    // Send via Resend API
    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) return NextResponse.json({ error: "resend_not_configured" }, { status: 500 })

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "7ESAB <info@7esab.com>",
        to: [targetEmail],
        subject: `دعوة للانضمام إلى ${companyName} | You've Been Invited to ${companyName}`,
        html: `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>دعوة للانضمام - 7ESAB</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f7fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: #10b981; padding: 40px 30px; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="width: 80px; height: 80px; background-color: #ffffff; border-radius: 16px; margin: 0 auto 16px; line-height: 80px;">
                      <span style="font-size: 40px;">🎉</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px; font-weight: bold;">7ESAB</h1>
                    <p style="color: #d1fae5; font-size: 14px; margin: 0;">نظام إدارة الأعمال المتكامل</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content Arabic -->
          <tr>
            <td style="padding: 40px 30px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="text-align: center; margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 16px;">🌟 تمت دعوتك للانضمام!</h2>
                    <p style="color: #475569; font-size: 16px; line-height: 1.8; margin: 0 0 16px;">مرحباً،</p>
                    <p style="color: #475569; font-size: 16px; line-height: 1.8; margin: 0 0 16px;">
                      لقد تمت دعوتك للانضمام إلى شركة <strong style="color: #10b981;">${companyName}</strong> على نظام <strong>7ESAB</strong> بصفة <strong style="color: #6366f1;">${roleName}</strong>.
                    </p>
                  </td>
                </tr>
              </table>
              <!-- Info Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="color: #166534; font-size: 14px; margin: 0; text-align: right;">
                      <strong>🏢 الشركة:</strong> ${companyName}<br>
                      <strong>👤 الدور:</strong> ${roleName}
                    </p>
                  </td>
                </tr>
              </table>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${acceptLink}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 50px; font-size: 18px; font-weight: bold;">✅ قبول الدعوة</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding: 0 30px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-top: 1px solid #e2e8f0;"></td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content English -->
          <tr>
            <td style="padding: 20px 30px 40px;" dir="ltr">
              <h2 style="color: #1e293b; margin: 0 0 16px; font-size: 20px; text-align: left;">You've Been Invited!</h2>
              <p style="color: #475569; font-size: 15px; line-height: 1.8; margin: 0 0 16px; text-align: left;">
                You have been invited to join <strong style="color: #10b981;">${companyName}</strong> on <strong>7ESAB</strong> business management system as <strong style="color: #6366f1;">${roleName}</strong>.
              </p>
              <p style="color: #475569; font-size: 15px; line-height: 1.8; margin: 0; text-align: left;">
                Click the button above to accept the invitation and create your account.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 30px; text-align: center;">
              <p style="color: #94a3b8; font-size: 13px; margin: 0 0 8px;">
                إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة.
              </p>
              <p style="color: #94a3b8; font-size: 12px; margin: 0;" dir="ltr">
                If you weren't expecting this invitation, you can ignore this email.
              </p>
              <p style="color: #cbd5e1; font-size: 11px; margin: 16px 0 0;">
                © ${new Date().getFullYear()} 7ESAB. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      }),
    })

    const emailResult = await emailRes.json()
    if (!emailRes.ok) {
      return NextResponse.json({ error: emailResult?.message || "email_send_failed" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, email_id: emailResult?.id, link: acceptLink }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

