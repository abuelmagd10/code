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