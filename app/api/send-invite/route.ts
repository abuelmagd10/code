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
        action: 'invite_sent',
        company_id: companyId,
        user_id: user.id,
        target_table: 'company_invitations',
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
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background-color: #f4f7fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
              <div style="width: 70px; height: 70px; background: rgba(255,255,255,0.2); border-radius: 16px; margin: 0 auto 16px;">
                <span style="font-size: 32px; line-height: 70px;">🎉</span>
              </div>
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">7ESAB</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">نظام إدارة الأعمال المتكامل</p>
            </td>
          </tr>
          <!-- Content Arabic -->
          <tr>
            <td style="padding: 40px 30px 20px;">
              <h2 style="color: #1e293b; margin: 0 0 16px; font-size: 22px; text-align: right;">🌟 تمت دعوتك للانضمام!</h2>
              <p style="color: #475569; font-size: 16px; line-height: 1.8; margin: 0 0 16px; text-align: right;">مرحباً،</p>
              <p style="color: #475569; font-size: 16px; line-height: 1.8; margin: 0 0 16px; text-align: right;">
                لقد تمت دعوتك للانضمام إلى شركة <strong style="color: #10b981;">${companyName}</strong> على نظام <strong>7ESAB</strong> بصفة <strong style="color: #6366f1;">${roleName}</strong>.
              </p>
              <p style="color: #475569; font-size: 16px; line-height: 1.8; margin: 0 0 24px; text-align: right;">
                لقبول الدعوة وإنشاء حسابك، يرجى الضغط على الزر أدناه:
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${acceptLink}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 12px; font-size: 18px; font-weight: 600; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4);">✅ قبول الدعوة</a>
              </div>
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin: 24px 0;">
                <p style="color: #166534; font-size: 14px; margin: 0; text-align: right;">
                  <strong>🏢 الشركة:</strong> ${companyName}<br>
                  <strong>👤 الدور:</strong> ${roleName}
                </p>
              </div>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding: 0 30px;">
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0;">
            </td>
          </tr>
          <!-- Content English -->
          <tr>
            <td style="padding: 20px 30px 40px;" dir="ltr">
              <h2 style="color: #1e293b; margin: 0 0 16px; font-size: 20px; text-align: left;">You've Been Invited!</h2>
              <p style="color: #475569; font-size: 15px; line-height: 1.8; margin: 0 0 16px; text-align: left;">
                You have been invited to join <strong style="color: #10b981;">${companyName}</strong> on <strong>7ESAB</strong> business management system.
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
                © 2024 7ESAB. All rights reserved.
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