import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, companyId, role } = body || {}
    if (!email) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    const proto = req.headers.get("x-forwarded-proto") || "http"
    const host = req.headers.get("host") || "localhost:3000"
    const base = `${proto}://${host}`
    const defaultLink = `${base}/auth/login`

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
    // Validate inviter permission for target company
    if (!companyId) return NextResponse.json({ error: "missing_company" }, { status: 400 })
    try {
      const ssr = await createSSR()
      const { data: { user } } = await ssr.auth.getUser()
      if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      const { data: member } = await admin
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()
      const isAdmin = ["owner","admin"].includes(String(member?.role || ""))
      if (!isAdmin) {
        const { data: comp } = await admin
          .from("companies")
          .select("user_id")
          .eq("id", companyId)
          .maybeSingle()
        if (String(comp?.user_id || "") !== String(user.id)) {
          return NextResponse.json({ error: "forbidden" }, { status: 403 })
        }
      }
    } catch {}

    // Insert invitation tied to companyId/role
    const { data: created, error: invInsErr } = await admin
      .from("company_invitations")
      .insert({ company_id: companyId, email: String(email).toLowerCase(), role: String(role || "viewer") })
      .select("id, accept_token")
      .single()
    if (invInsErr) return NextResponse.json({ error: invInsErr.message || "invite_insert_failed" }, { status: 500 })
    try {
      await admin.from('audit_logs').insert({
        action: 'invite_sent',
        company_id: companyId,
        user_id: null,
        target_table: 'company_invitations',
        record_id: created?.id || null,
        new_data: { email, role }
      })
    } catch {}

    const acceptLink = `${base}/invitations/accept?token=${created?.accept_token || ""}`

    // Send via Resend API directly (bypass Supabase SMTP issues)
    const resendApiKey = process.env.RESEND_API_KEY
    if (resendApiKey) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || "VitaSlims <info@vitaslims.com>",
            to: [email],
            subject: "دعوة للانضمام - You have been invited",
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>🎉 تمت دعوتك للانضمام!</h2>
                <p>مرحباً،</p>
                <p>لقد تمت دعوتك للانضمام إلى نظام المحاسبة.</p>
                <p>اضغط على الرابط التالي لقبول الدعوة وإنشاء حسابك:</p>
                <p><a href="${acceptLink}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">قبول الدعوة</a></p>
                <p style="color: #666; font-size: 12px; margin-top: 20px;">أو انسخ هذا الرابط: ${acceptLink}</p>
                <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
                <p dir="ltr" style="text-align: left;">
                  <strong>You have been invited!</strong><br>
                  Click the button above or copy the link to accept your invitation.
                </p>
              </div>
            `,
          }),
        })
        const emailResult = await emailRes.json()
        if (emailRes.ok) {
          return NextResponse.json({ ok: true, type: "resend", link: acceptLink, accept_token: created?.accept_token || null, invite_id: created?.id || null }, { status: 200 })
        }
        console.error("Resend error:", emailResult)
      } catch (resendErr) {
        console.error("Resend API error:", resendErr)
      }
    }

    // Fallback: return link without sending email
    return NextResponse.json({ ok: true, type: "manual", link: acceptLink, accept_token: created?.accept_token || null, invite_id: created?.id || null, warning: "تعذر إرسال الإيميل - يرجى مشاركة الرابط يدوياً" }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}