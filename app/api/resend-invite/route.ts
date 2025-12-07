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
        from: process.env.EMAIL_FROM || "VitaSlims <info@vitaslims.com>",
        to: [targetEmail],
        subject: "دعوة للانضمام - You have been invited",
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>🎉 تمت دعوتك للانضمام!</h2>
            <p>مرحباً،</p>
            <p>لقد تمت دعوتك للانضمام إلى نظام المحاسبة.</p>
            <p>اضغط على الرابط التالي لقبول الدعوة وإنشاء حسابك:</p>
            <p><a href="${acceptLink}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">قبول الدعوة</a></p>
            <p style="color: #666; font-size: 12px; margin-top: 20px;">أو انسخ هذا الرابط: ${acceptLink}</p>
          </div>
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

