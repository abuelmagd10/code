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

    // Get company name from pending_companies table
    let companyName = ""
    try {
      const { data: pendingCompany } = await admin
        .from("pending_companies")
        .select("company_name")
        .eq("user_email", email.toLowerCase())
        .single()
      if (pendingCompany?.company_name) {
        companyName = pendingCompany.company_name
      }
    } catch {}

    const logoUrl = `${base}/icons/icon-192x192.png`
    const currentYear = new Date().getFullYear()

    const emailHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تفعيل حساب 7ESAB</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f7fa; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);">

                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 40px 30px; text-align: center;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center">
                                        <div style="width: 100px; height: 100px; background: #ffffff; border-radius: 20px; margin: 0 auto 20px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); padding: 10px;">
                                            <img src="${logoUrl}" alt="7ESAB Logo" width="80" height="80" style="display: block; width: 80px; height: 80px; object-fit: contain;">
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center">
                                        <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px; font-weight: bold;">7ESAB</h1>
                                        <p style="color: rgba(255, 255, 255, 0.9); font-size: 16px; margin: 0;">نظام إدارة الأعمال المتكامل</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <!-- Welcome Section -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="text-align: center; margin-bottom: 30px;">
                                <tr>
                                    <td align="center">
                                        <span style="font-size: 48px; display: block; margin-bottom: 15px;">🎉</span>
                                        <h2 style="color: #1e3c72; font-size: 24px; margin: 0 0 15px;">مرحباً بك في 7ESAB!</h2>
                                        <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 0 0 10px;">نحن سعداء بانضمامك إلى منصتنا</p>
                                        ${companyName ? `<p style="color: #1e3c72; font-size: 18px; font-weight: bold; margin: 10px 0; background: #f0f4ff; padding: 12px 20px; border-radius: 8px; display: inline-block;">🏢 ${companyName}</p>` : ''}
                                        <p style="color: #888; font-size: 14px; margin: 10px 0 0;">شكراً لتسجيلك في نظام إدارة الأعمال المتكامل</p>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA Button -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding: 20px 0;">
                                        <a href="${confirmLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 50px; font-size: 18px; font-weight: bold; box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);">✓ تفعيل الحساب الآن</a>
                                    </td>
                                </tr>
                            </table>

                            <!-- Features -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f8f9fa; border-radius: 12px; padding: 25px; margin: 25px 0;">
                                <tr>
                                    <td>
                                        <h3 style="color: #1e3c72; font-size: 18px; margin: 0 0 20px; text-align: center;">ماذا يمكنك أن تفعل بعد التفعيل؟</h3>
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="padding: 12px; background: white; border-radius: 8px; margin-bottom: 10px;">
                                                    <table role="presentation" cellpadding="0" cellspacing="0">
                                                        <tr>
                                                            <td style="width: 40px; height: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; text-align: center; vertical-align: middle; font-size: 20px;">📊</td>
                                                            <td style="padding-right: 15px; color: #444; font-size: 14px;">إدارة شاملة لجميع عمليات حساباتك</td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                            <tr><td style="height: 10px;"></td></tr>
                                            <tr>
                                                <td style="padding: 12px; background: white; border-radius: 8px;">
                                                    <table role="presentation" cellpadding="0" cellspacing="0">
                                                        <tr>
                                                            <td style="width: 40px; height: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; text-align: center; vertical-align: middle; font-size: 20px;">💼</td>
                                                            <td style="padding-right: 15px; color: #444; font-size: 14px;">تتبع المشاريع والمهام بسهولة</td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                            <tr><td style="height: 10px;"></td></tr>
                                            <tr>
                                                <td style="padding: 12px; background: white; border-radius: 8px;">
                                                    <table role="presentation" cellpadding="0" cellspacing="0">
                                                        <tr>
                                                            <td style="width: 40px; height: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; text-align: center; vertical-align: middle; font-size: 20px;">📈</td>
                                                            <td style="padding-right: 15px; color: #444; font-size: 14px;">تقارير وإحصائيات دقيقة ومفصلة</td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                            <tr><td style="height: 10px;"></td></tr>
                                            <tr>
                                                <td style="padding: 12px; background: white; border-radius: 8px;">
                                                    <table role="presentation" cellpadding="0" cellspacing="0">
                                                        <tr>
                                                            <td style="width: 40px; height: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; text-align: center; vertical-align: middle; font-size: 20px;">🔒</td>
                                                            <td style="padding-right: 15px; color: #444; font-size: 14px;">أمان عالي وحماية متقدمة لبياناتك</td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- Divider -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="height: 1px; background: linear-gradient(to left, transparent, #ddd, transparent);"></td>
                                </tr>
                            </table>

                            <!-- Bilingual Section -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="text-align: center; padding: 20px; background: #f0f4ff; border-radius: 12px; margin: 20px 0;">
                                <tr>
                                    <td>
                                        <p style="color: #1e3c72; font-size: 16px; margin: 0 0 10px; font-weight: 600;">⚡ فعّل حسابك الآن وابدأ رحلتك في إدارة أعمالك باحترافية</p>
                                        <p style="color: #666; font-size: 14px; margin: 0; direction: ltr;">Activate your account now and start managing your business professionally</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background: #f8f9fa; padding: 25px 30px; text-align: center; border-top: 1px solid #e9ecef;">
                            <p style="color: #1e3c72; font-weight: 600; font-size: 13px; margin: 0 0 8px;">لم تقم بإنشاء هذا الحساب؟</p>
                            <p style="color: #888; font-size: 13px; margin: 0 0 8px;">يمكنك تجاهل هذه الرسالة بأمان</p>
                            <p style="color: #aaa; font-size: 12px; margin: 15px 0 0;" dir="ltr">If you didn't create this account, please ignore this email</p>

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="height: 1px; background: linear-gradient(to left, transparent, #ddd, transparent); margin: 20px 0;"></td>
                                </tr>
                            </table>

                            <p style="color: #1e3c72; font-weight: 600; margin: 20px 0 5px;">7ESAB Team</p>
                            <p style="color: #888; font-size: 12px; margin: 0;">© ${currentYear} 7ESAB. All rights reserved.</p>

                            <!-- Social Links -->
                            <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 20px auto 0;">
                                <tr>
                                    <td style="padding: 0 8px;">
                                        <a href="mailto:support@7esab.com" style="display: inline-block; width: 36px; height: 36px; background: #1e3c72; border-radius: 50%; text-align: center; line-height: 36px; color: white; text-decoration: none; font-size: 16px;">📧</a>
                                    </td>
                                    <td style="padding: 0 8px;">
                                        <a href="https://7esab.com" style="display: inline-block; width: 36px; height: 36px; background: #1e3c72; border-radius: 50%; text-align: center; line-height: 36px; color: white; text-decoration: none; font-size: 16px;">🌐</a>
                                    </td>
                                </tr>
                            </table>
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

