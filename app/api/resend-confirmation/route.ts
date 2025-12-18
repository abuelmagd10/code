import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Allow GET for health check
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "resend-confirmation" })
}

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

    const emailHtml = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تأكيد حسابك في 7ESAB</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f4f8; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f4f8; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); overflow: hidden; max-width: 100%;">

          <!-- Header with Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #0ea5e9 100%); padding: 50px 40px; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="width: 80px; height: 80px; background: rgba(255,255,255,0.15); border-radius: 20px; margin: 0 auto 20px; display: inline-block; line-height: 80px;">
                      <span style="font-size: 40px;">📊</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <h1 style="color: #ffffff; margin: 0; font-size: 36px; font-weight: 800; letter-spacing: -1px; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">7ESAB</h1>
                    <p style="color: rgba(255,255,255,0.95); margin: 12px 0 0; font-size: 16px; font-weight: 500;">نظام إدارة الأعمال المتكامل</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Arabic Content -->
          <tr>
            <td style="padding: 50px 40px 30px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h2 style="color: #1e293b; margin: 0 0 20px; font-size: 26px; font-weight: 700; text-align: right;">
                      مرحباً بك في 7ESAB! 🎉
                    </h2>
                    <p style="color: #475569; font-size: 16px; line-height: 1.9; margin: 0 0 16px; text-align: right;">
                      شكراً لانضمامك إلى <strong style="color: #1e3a8a;">7ESAB</strong> - منصة إدارة الأعمال الاحترافية.
                    </p>
                    <p style="color: #475569; font-size: 16px; line-height: 1.9; margin: 0 0 30px; text-align: right;">
                      لتفعيل حسابك والبدء في استخدام جميع مميزات النظام، يرجى الضغط على الزر أدناه:
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 10px 0 30px;">
                    <a href="${confirmLink}" style="display: inline-block; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: #ffffff; text-decoration: none; padding: 18px 50px; border-radius: 12px; font-size: 18px; font-weight: 700; box-shadow: 0 8px 25px rgba(30, 58, 138, 0.35); transition: all 0.3s ease;">
                      تفعيل الحساب ←
                    </a>
                  </td>
                </tr>
                <tr>
                  <td>
                    <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 12px; padding: 20px; border-right: 4px solid #3b82f6;">
                      <p style="color: #0369a1; font-size: 14px; margin: 0; text-align: right; line-height: 1.7;">
                        💡 <strong>نصيحة:</strong> إذا لم يعمل الزر، يمكنك نسخ الرابط التالي ولصقه في متصفحك:
                      </p>
                      <p style="color: #0284c7; font-size: 12px; margin: 10px 0 0; word-break: break-all; direction: ltr; text-align: left; background: #ffffff; padding: 10px; border-radius: 6px;">
                        ${confirmLink}
                      </p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <hr style="border: none; border-top: 2px solid #e2e8f0; margin: 0;">
            </td>
          </tr>

          <!-- English Content -->
          <tr>
            <td style="padding: 30px 40px 40px;" dir="ltr">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h2 style="color: #64748b; margin: 0 0 16px; font-size: 20px; font-weight: 600; text-align: left;">
                      Welcome to 7ESAB! 🚀
                    </h2>
                    <p style="color: #94a3b8; font-size: 14px; line-height: 1.8; margin: 0; text-align: left;">
                      Thank you for joining 7ESAB - your professional business management platform. Click the button above to activate your account and unlock all features.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 30px 40px; text-align: center;">
              <p style="color: rgba(255,255,255,0.7); font-size: 13px; margin: 0 0 8px; line-height: 1.6;">
                إذا لم تقم بإنشاء هذا الحساب، يرجى تجاهل هذه الرسالة.
              </p>
              <p style="color: rgba(255,255,255,0.5); font-size: 12px; margin: 0;" dir="ltr">
                If you didn't create this account, please ignore this email.
              </p>
              <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                <p style="color: rgba(255,255,255,0.4); font-size: 11px; margin: 0;">
                  © ${new Date().getFullYear()} 7ESAB. All rights reserved.
                </p>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "7ESAB <info@7esab.com>",
        to: [email],
        subject: "🔐 تفعيل حسابك في 7ESAB | Activate Your Account",
        html: emailHtml,
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

