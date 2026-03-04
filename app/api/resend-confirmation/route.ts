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

    let foundUser = userData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (!foundUser) {
      // User might have just been created (called right after signUp) — retry once after a short delay
      await new Promise(resolve => setTimeout(resolve, 1500))
      const { data: retryData, error: retryError } = await admin.auth.admin.listUsers()
      if (retryError) {
        return NextResponse.json({ error: "خطأ في الخادم. يرجى المحاولة لاحقاً." }, { status: 500 })
      }
      foundUser = retryData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
      if (!foundUser) {
        return NextResponse.json({ error: "البريد الإلكتروني غير مسجل في النظام" }, { status: 404 })
      }
    }

    if (foundUser.email_confirmed_at) {
      return NextResponse.json({ error: "البريد الإلكتروني مؤكد مسبقاً! يمكنك تسجيل الدخول.", confirmed: true }, { status: 400 })
    }

    // Generate new confirmation link using magiclink (doesn't require password)
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
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

    // Always use our custom callback URL with token_hash (not Supabase's action_link)
    const tokenHash = linkData?.properties?.hashed_token
    if (!tokenHash) {
      console.error("No token_hash in linkData:", linkData)
      return NextResponse.json({ error: "فشل إنشاء رابط التأكيد" }, { status: 500 })
    }
    const confirmLink = `${base}/auth/callback?token_hash=${tokenHash}&type=signup`
    console.log("Generated confirm link:", confirmLink)

    // Get company name and language from pending_companies table
    let companyName = ""
    let lang: 'ar' | 'en' = 'ar' // Default to Arabic
    try {
      const { data: pendingCompany } = await admin
        .from("pending_companies")
        .select("company_name, language")
        .eq("user_email", email.toLowerCase())
        .single()
      if (pendingCompany?.company_name) {
        companyName = pendingCompany.company_name
      }
      if (pendingCompany?.language === 'en') {
        lang = 'en'
      }
    } catch { }

    // Also check user metadata for language preference
    if (lang === 'ar' && foundUser.user_metadata?.preferred_language === 'en') {
      lang = 'en'
    }

    const logoUrl = `${base}/icons/icon-192x192.png`
    const currentYear = new Date().getFullYear()

    // Translations
    const t = {
      title: lang === 'en' ? 'Activate Your 7ESAB Account' : 'تفعيل حساب 7ESAB',
      subtitle: lang === 'en' ? 'Integrated Business Management System' : 'نظام إدارة الأعمال المتكامل',
      welcome: lang === 'en' ? 'Welcome to 7ESAB!' : 'مرحباً بك في 7ESAB!',
      happyToJoin: lang === 'en' ? 'We are happy to have you join our platform' : 'نحن سعداء بانضمامك إلى منصتنا',
      thankYou: lang === 'en' ? 'Thank you for registering in the integrated business management system' : 'شكراً لتسجيلك في نظام إدارة الأعمال المتكامل',
      activateNow: lang === 'en' ? '✓ Activate Account Now' : '✓ تفعيل الحساب الآن',
      whatCanYouDo: lang === 'en' ? 'What can you do after activation?' : 'ماذا يمكنك أن تفعل بعد التفعيل؟',
      feature1: lang === 'en' ? 'Comprehensive management of all your accounts' : 'إدارة شاملة لجميع عمليات حساباتك',
      feature2: lang === 'en' ? 'Track projects and tasks easily' : 'تتبع المشاريع والمهام بسهولة',
      feature3: lang === 'en' ? 'Accurate and detailed reports and statistics' : 'تقارير وإحصائيات دقيقة ومفصلة',
      feature4: lang === 'en' ? 'High security and advanced protection for your data' : 'أمان عالي وحماية متقدمة لبياناتك',
      ctaAr: lang === 'en' ? 'Activate your account now and start your journey in managing your business professionally' : '⚡ فعّل حسابك الآن وابدأ رحلتك في إدارة أعمالك باحترافية',
      ctaEn: lang === 'en' ? '⚡ Activate your account now and start managing your business professionally' : 'Activate your account now and start managing your business professionally',
      didNotCreate: lang === 'en' ? "Didn't create this account?" : 'لم تقم بإنشاء هذا الحساب؟',
      ignoreEmail: lang === 'en' ? 'You can safely ignore this email' : 'يمكنك تجاهل هذه الرسالة بأمان',
      ignoreEmailAlt: lang === 'en' ? 'إذا لم تقم بإنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة' : "If you didn't create this account, please ignore this email",
    }

    const emailHtml = `<!DOCTYPE html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #667eea;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #667eea; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);">

                    <!-- Header with gradient -->
                    <tr>
                        <td style="background-color: #1e3c72; background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 40px 30px; text-align: center;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center">
                                        <div style="width: 100px; height: 100px; background-color: #ffffff; border-radius: 20px; margin: 0 auto 20px; padding: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);">
                                            <img src="${logoUrl}" alt="7ESAB Logo" width="80" height="80" style="display: block; width: 80px; height: 80px;">
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center">
                                        <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px; font-weight: bold;">7ESAB</h1>
                                        <p style="color: rgba(255, 255, 255, 0.9); font-size: 16px; margin: 0;">${t.subtitle}</p>
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
                                        <h2 style="color: #1e3c72; font-size: 24px; margin: 0 0 15px;">${t.welcome}</h2>
                                        <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 0 0 10px;">${t.happyToJoin}</p>
                                        ${companyName ? `<p style="color: #1e3c72; font-size: 18px; font-weight: bold; margin: 10px 0; background: #f0f4ff; padding: 12px 20px; border-radius: 8px; display: inline-block;">🏢 ${companyName}</p>` : ''}
                                        <p style="color: #888; font-size: 14px; margin: 10px 0 0;">${t.thankYou}</p>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA Button with gradient -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding: 20px 0;">
                                        <a href="${confirmLink}" style="display: inline-block; background-color: #667eea; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 50px; font-size: 18px; font-weight: bold; box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);">${t.activateNow}</a>
                                    </td>
                                </tr>
                            </table>

                            <!-- Features -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 12px; padding: 25px; margin: 25px 0;">
                                <tr>
                                    <td>
                                        <h3 style="color: #1e3c72; font-size: 18px; margin: 0 0 20px; text-align: center;">${t.whatCanYouDo}</h3>
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="padding: 12px; background-color: #ffffff; border-radius: 8px; margin-bottom: 10px;">
                                                    <table role="presentation" cellpadding="0" cellspacing="0">
                                                        <tr>
                                                            <td style="width: 40px; height: 40px; background-color: #667eea; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; text-align: center; vertical-align: middle; font-size: 20px;">📊</td>
                                                            <td style="padding-${lang === 'ar' ? 'right' : 'left'}: 15px; color: #444444; font-size: 14px;">${t.feature1}</td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                            <tr><td style="height: 10px;"></td></tr>
                                            <tr>
                                                <td style="padding: 12px; background-color: #ffffff; border-radius: 8px;">
                                                    <table role="presentation" cellpadding="0" cellspacing="0">
                                                        <tr>
                                                            <td style="width: 40px; height: 40px; background-color: #667eea; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; text-align: center; vertical-align: middle; font-size: 20px;">💼</td>
                                                            <td style="padding-${lang === 'ar' ? 'right' : 'left'}: 15px; color: #444444; font-size: 14px;">${t.feature2}</td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                            <tr><td style="height: 10px;"></td></tr>
                                            <tr>
                                                <td style="padding: 12px; background-color: #ffffff; border-radius: 8px;">
                                                    <table role="presentation" cellpadding="0" cellspacing="0">
                                                        <tr>
                                                            <td style="width: 40px; height: 40px; background-color: #667eea; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; text-align: center; vertical-align: middle; font-size: 20px;">📈</td>
                                                            <td style="padding-${lang === 'ar' ? 'right' : 'left'}: 15px; color: #444444; font-size: 14px;">${t.feature3}</td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                            <tr><td style="height: 10px;"></td></tr>
                                            <tr>
                                                <td style="padding: 12px; background-color: #ffffff; border-radius: 8px;">
                                                    <table role="presentation" cellpadding="0" cellspacing="0">
                                                        <tr>
                                                            <td style="width: 40px; height: 40px; background-color: #667eea; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; text-align: center; vertical-align: middle; font-size: 20px;">🔒</td>
                                                            <td style="padding-${lang === 'ar' ? 'right' : 'left'}: 15px; color: #444444; font-size: 14px;">${t.feature4}</td>
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
                                    <td style="height: 1px; background: linear-gradient(to left, transparent, #dddddd, transparent);"></td>
                                </tr>
                            </table>

                            <!-- CTA Section -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="text-align: center; padding: 20px; background-color: #f0f4ff; border-radius: 12px; margin: 20px 0;">
                                <tr>
                                    <td>
                                        <p style="color: #1e3c72; font-size: 16px; margin: 0; font-weight: 600;">${lang === 'ar' ? t.ctaAr : t.ctaEn}</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 25px 30px; text-align: center; border-top: 1px solid #e9ecef;">
                            <p style="color: #1e3c72; font-weight: 600; font-size: 13px; margin: 0 0 8px;">${t.didNotCreate}</p>
                            <p style="color: #888888; font-size: 13px; margin: 0 0 8px;">${t.ignoreEmail}</p>

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
                                <tr>
                                    <td style="height: 1px; background: linear-gradient(to left, transparent, #dddddd, transparent);"></td>
                                </tr>
                            </table>

                            <p style="color: #1e3c72; font-weight: 600; margin: 0 0 5px;">7ESAB Team</p>
                            <p style="color: #888888; font-size: 12px; margin: 0;">© ${currentYear} 7ESAB. All rights reserved.</p>

                            <!-- Social Links -->
                            <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 20px auto 0;">
                                <tr>
                                    <td style="padding: 0 8px;">
                                        <a href="mailto:info@7esab.com" style="display: inline-block; width: 36px; height: 36px; background-color: #1e3c72; border-radius: 50%; text-align: center; line-height: 36px; color: #ffffff; text-decoration: none; font-size: 16px;">📧</a>
                                    </td>
                                    <td style="padding: 0 8px;">
                                        <a href="https://7esab.com" style="display: inline-block; width: 36px; height: 36px; background-color: #1e3c72; border-radius: 50%; text-align: center; line-height: 36px; color: #ffffff; text-decoration: none; font-size: 16px;">🌐</a>
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

    // Email subject based on language
    const emailSubject = lang === 'en'
      ? "🔐 Activate Your 7ESAB Account"
      : "🔐 تفعيل حسابك في 7ESAB"

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "7ESAB <info@7esab.com>",
        to: [email],
        subject: emailSubject,
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

