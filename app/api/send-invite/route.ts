import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError, forbiddenError } from "@/lib/api-error-handler"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // Support both modes: with existing token/inviteId OR create new invitation
    const { email, role, token: existingToken, inviteId: existingInviteId } = body || {}
    
    if (!email) {
      return badRequestError("البريد الإلكتروني مطلوب", ["email"])
    }

    // === تحصين أمني: استخدام requireOwnerOrAdmin ===
    const { user, companyId, member, error } = await requireOwnerOrAdmin(req)

    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    }
    // === نهاية التحصين الأمني ===

    const proto = req.headers.get("x-forwarded-proto") || "http"
    const host = req.headers.get("host") || "localhost:3000"
    const base = `${proto}://${host}`

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return internalError("خطأ في إعدادات الخادم", "Server configuration error")
    }
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    let acceptToken = existingToken
    let inviteId = existingInviteId

    // If no existing token provided, create new invitation
    if (!acceptToken) {
      const { data: created, error: invInsErr } = await admin
        .from("company_invitations")
        .insert({ company_id: companyId, email: String(email).toLowerCase(), role: String(role || "viewer") })
        .select("id, accept_token")
        .single()
      if (invInsErr) {
        return internalError("خطأ في إنشاء الدعوة", invInsErr.message || "invite_insert_failed")
      }
      acceptToken = created?.accept_token
      inviteId = created?.id
    }

    // Get company name
    let companyName = "7ESAB"
    try {
      const { data: company } = await admin.from("companies").select("name").eq("id", companyId).single()
      if (company?.name) companyName = company.name
    } catch {}

    try {
      await admin.from('audit_logs').insert({
        action: 'INSERT',
        target_table: 'company_invitations',
        company_id: companyId,
        user_id: user.id,
        record_id: inviteId || null,
        new_data: { email, role }
      })
    } catch (logError) {
      console.error("Failed to log invite:", logError)
    }

    const acceptLink = `${base}/invitations/accept?token=${acceptToken || ""}`
    const roleName = role === "admin" ? "مدير" : role === "owner" ? "مالك" : role === "accountant" ? "محاسب" : role === "manager" ? "مدير" : "موظف"

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
            from: process.env.EMAIL_FROM || "7ESAB <info@7esab.com>",
            to: [email],
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
        if (emailRes.ok) {
          return apiSuccess({ ok: true, type: "resend", link: acceptLink, accept_token: acceptToken || null, invite_id: inviteId || null })
        }
        console.error("Resend error:", emailResult)
      } catch (resendErr) {
        console.error("Resend API error:", resendErr)
      }
    }

    // Fallback: return link without sending email
    return apiSuccess({ ok: true, type: "manual", link: acceptLink, accept_token: acceptToken || null, invite_id: inviteId || null, warning: "تعذر إرسال الإيميل - يرجى مشاركة الرابط يدوياً" })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء إرسال الدعوة", e?.message || String(e))
  }
}