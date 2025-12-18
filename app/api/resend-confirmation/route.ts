import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    // Parse request body
    let body: any = {}
    try {
      body = await req.json()
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr)
      return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 })
    }

    const { email } = body || {}

    if (!email) {
      return NextResponse.json({ error: "البريد الإلكتروني مطلوب" }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "صيغة البريد الإلكتروني غير صحيحة" }, { status: 400 })
    }

    const proto = req.headers.get("x-forwarded-proto") || "http"
    const host = req.headers.get("host") || "localhost:3000"
    const base = `${proto}://${host}`

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      console.error("Missing Supabase config:", { url: !!url, serviceKey: !!serviceKey })
      return NextResponse.json({ error: "خطأ في تكوين الخادم. يرجى التواصل مع الدعم." }, { status: 500 })
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Check if user exists and is not confirmed
    const { data: userData, error: userError } = await admin.auth.admin.listUsers()

    if (userError) {
      console.error("List users error:", userError)
      return NextResponse.json({ error: "خطأ في الخادم. يرجى المحاولة لاحقاً." }, { status: 500 })
    }

    const user = userData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (!user) {
      return NextResponse.json({ error: "البريد الإلكتروني غير مسجل في النظام" }, { status: 404 })
    }

    if (user.email_confirmed_at) {
      return NextResponse.json({ error: "البريد الإلكتروني مؤكد مسبقاً! يمكنك تسجيل الدخول.", confirmed: true }, { status: 400 })
    }

    // Generate new confirmation link
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "signup",
      email: email,
      options: {
        redirectTo: `${base}/auth/callback?type=signup`
      }
    })

    if (linkError) {
      console.error("Generate link error:", linkError)
      return NextResponse.json({ error: "فشل إنشاء رابط التأكيد. يرجى المحاولة لاحقاً." }, { status: 500 })
    }

    // Send via Resend API
    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.error("Missing RESEND_API_KEY")
      return NextResponse.json({ error: "خدمة البريد غير مكونة. يرجى التواصل مع الدعم." }, { status: 500 })
    }

    const confirmLink = linkData?.properties?.action_link || `${base}/auth/callback?token_hash=${linkData?.properties?.hashed_token}&type=signup`

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "7ESAB <info@7esab.com>",
        to: [email],
        subject: "تأكيد حسابك في 7ESAB | Confirm Your 7ESAB Account",
        html: `
<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background-color: #f4f7fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden;">
        <tr><td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 40px 30px; text-align: center;">
          <div style="width: 70px; height: 70px; background: rgba(255,255,255,0.2); border-radius: 16px; margin: 0 auto 16px;"><span style="font-size: 32px; line-height: 70px;">🏢</span></div>
          <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">7ESAB</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">نظام إدارة الأعمال المتكامل</p>
        </td></tr>
        <tr><td style="padding: 40px 30px 20px;">
          <h2 style="color: #1e293b; margin: 0 0 16px; font-size: 22px; text-align: right;">🎉 مرحباً بك!</h2>
          <p style="color: #475569; font-size: 16px; line-height: 1.8; margin: 0 0 16px; text-align: right;">شكراً لتسجيلك في <strong style="color: #6366f1;">7ESAB</strong> - نظام إدارة الأعمال المتكامل.</p>
          <p style="color: #475569; font-size: 16px; line-height: 1.8; margin: 0 0 24px; text-align: right;">لتفعيل حسابك والبدء في استخدام النظام، يرجى الضغط على الزر أدناه:</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${confirmLink}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 12px; font-size: 18px; font-weight: 600; box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);">✅ تفعيل الحساب</a>
          </div>
        </td></tr>
        <tr><td style="padding: 0 30px;"><hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0;"></td></tr>
        <tr><td style="padding: 20px 30px 40px;" dir="ltr">
          <h2 style="color: #1e293b; margin: 0 0 16px; font-size: 20px; text-align: left;">Welcome to 7ESAB!</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.8; margin: 0; text-align: left;">Click the button above to activate your account and start using the system.</p>
        </td></tr>
        <tr><td style="background-color: #f8fafc; padding: 24px 30px; text-align: center;">
          <p style="color: #94a3b8; font-size: 13px; margin: 0 0 8px;">إذا لم تقم بإنشاء هذا الحساب، يرجى تجاهل هذه الرسالة.</p>
          <p style="color: #cbd5e1; font-size: 11px; margin: 16px 0 0;">© 2024 7ESAB. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
        `,
      }),
    })

    // Parse Resend response
    let emailResult: any = {}
    try {
      emailResult = await emailRes.json()
    } catch (parseErr) {
      console.error("Failed to parse Resend response:", parseErr)
    }

    if (!emailRes.ok) {
      console.error("Resend error:", emailResult, "Status:", emailRes.status)
      const errorMsg = emailResult?.message || emailResult?.error || "فشل إرسال البريد"
      return NextResponse.json({ error: errorMsg }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: "تم إرسال رابط التأكيد بنجاح! تحقق من بريدك الإلكتروني." })
  } catch (e: any) {
    console.error("Resend confirmation error:", e?.message, e?.stack)
    // Return more specific error message
    const errorMsg = e?.message?.includes("fetch")
      ? "خطأ في الاتصال بخدمة البريد. يرجى المحاولة لاحقاً."
      : (e?.message || "حدث خطأ غير متوقع")
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}

