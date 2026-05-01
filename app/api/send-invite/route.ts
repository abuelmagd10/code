import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError } from "@/lib/api-error-handler"
import { getSeatStatus, reserveSeat } from "@/lib/billing/seat-service"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, role, token: existingToken, inviteId: existingInviteId, employeeName } = body || {}

    if (!email) return badRequestError("البريد الإلكتروني مطلوب", ["email"])
    if (!existingToken && !employeeName) return badRequestError("اسم الموظف مطلوب", ["employeeName"])

    // ✅ 1. Auth check (unchanged)
    const { user, companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    }

    // ✅ 2. SEAT CHECK — server-side enforcement (new)
    // Only check if this is a new invitation (not resend of existing)
    if (!existingToken) {
      let seatStatus
      try {
        seatStatus = await getSeatStatus(companyId)
      } catch (seatErr: any) {
        console.error("[send-invite] getSeatStatus failed:", seatErr)
        // Fail open only if seat system unavailable — log and continue cautiously
        // In production, you may want to fail closed instead
        seatStatus = null
      }

      if (seatStatus && !seatStatus.can_invite) {
        return apiError(
          402, // Payment Required
          "لا توجد مقاعد متاحة. يرجى إضافة مقعد مدفوع لإرسال دعوة جديدة.",
          "no_seats_available",
          {
            total_paid_seats: seatStatus.total_paid_seats,
            used_seats: seatStatus.used_seats,
            reserved_seats: seatStatus.reserved_seats,
            available_seats: seatStatus.available_seats,
            price_per_seat_egp: seatStatus.price_per_seat_egp,
            upgrade_url: "/settings/billing",
          }
        )
      }

      // ✅ 3. Check for duplicate invitation (same email, same company, still pending)
      const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
      const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

      const { data: existing } = await admin
        .from("company_invitations")
        .select("id, accepted, expires_at, status")
        .eq("company_id", companyId)
        .eq("email", String(email).toLowerCase())
        .eq("accepted", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()

      if (existing && (!existing.status || existing.status === "pending")) {
        return apiError(409, "يوجد بالفعل دعوة معلقة لهذا البريد الإلكتروني", "duplicate_invitation")
      }
    }

    const proto = req.headers.get("x-forwarded-proto") || "http"
    const host = req.headers.get("host") || "localhost:3000"
    const base = `${proto}://${host}`

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return internalError("خطأ في إعدادات الخادم", "Server configuration error")
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    let acceptToken = existingToken
    let inviteId = existingInviteId

    // ✅ 4. Create invitation (unchanged logic)
    if (!acceptToken) {
      const { data: created, error: invInsErr } = await admin
        .from("company_invitations")
        .insert({
          company_id: companyId,
          email: String(email).toLowerCase(),
          role: String(role || "viewer"),
          employee_name: employeeName ? String(employeeName) : null,
          invited_by_user_id: user.id,
          status: "pending",
          seat_reserved: true,
        })
        .select("id, accept_token")
        .single()

      if (invInsErr) {
        return internalError("خطأ في إنشاء الدعوة", invInsErr.message || "invite_insert_failed")
      }

      acceptToken = created?.accept_token
      inviteId = created?.id

      // ✅ 5. Reserve the seat atomically in DB (new)
      if (inviteId) {
        const reserveResult = await reserveSeat(companyId, inviteId)
        if (!reserveResult.success) {
          // Rollback: delete the invitation we just created
          await admin.from("company_invitations").delete().eq("id", inviteId)
          return apiError(
            402,
            "تعذر حجز المقعد. لا توجد مقاعد متاحة.",
            "seat_reservation_failed"
          )
        }
      }
    }

    // Get company name
    let companyName = "7ESAB"
    try {
      const { data: company } = await admin.from("companies").select("name").eq("id", companyId).single()
      if (company?.name) companyName = company.name
    } catch { }

    // Audit log
    try {
      await admin.from("audit_logs").insert({
        action: "invite_sent",
        company_id: companyId,
        user_id: user.id,
        target_table: "company_invitations",
        record_id: inviteId || null,
        new_data: { email, role, seat_reserved: true },
      })
    } catch (logError) {
      console.error("Failed to log invite:", logError)
    }

    const acceptLink = `${base}/invitations/accept?token=${acceptToken || ""}`
    const roleName =
      role === "admin" ? "مدير" :
      role === "owner" ? "مالك" :
      role === "accountant" ? "محاسب" :
      role === "manager" ? "مدير" : "موظف"

    // Send email via Resend (unchanged)
    const resendApiKey = process.env.RESEND_API_KEY
    if (resendApiKey) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || "7ESAB <info@7esab.com>",
            to: [email.toLowerCase().trim()],
            subject: `دعوة للانضمام إلى ${companyName} | You've Been Invited to ${companyName}`,
            html: buildInviteEmail(companyName, roleName, acceptLink),
          }),
        })
        const emailResult = await emailRes.json()
        if (emailRes.ok && emailResult.id) {
          return apiSuccess({
            ok: true,
            type: "resend",
            link: acceptLink,
            accept_token: acceptToken || null,
            invite_id: inviteId || null,
            emailId: emailResult.id,
            message: "تم إرسال الدعوة بنجاح. يرجى التحقق من البريد الإلكتروني (بما في ذلك مجلد Spam)",
          })
        }
      } catch (resendErr: any) {
        console.error("Resend API exception:", resendErr.message)
      }
    }

    // Fallback: return link without sending email
    return apiSuccess({
      ok: true,
      type: "manual",
      link: acceptLink,
      accept_token: acceptToken || null,
      invite_id: inviteId || null,
      warning: "تعذر إرسال الإيميل تلقائياً - يرجى مشاركة الرابط يدوياً",
      manualLink: acceptLink,
    })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء إرسال الدعوة", e?.message || String(e))
  }
}

// ─────────────────────────────────────────
// Email HTML builder (extracted for cleanliness)
// ─────────────────────────────────────────
function buildInviteEmail(companyName: string, roleName: string, acceptLink: string): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>دعوة للانضمام - 7ESAB</title></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f5f7fa;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f7fa;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#10b981;padding:40px 30px;text-align:center;">
          <h1 style="color:#ffffff;font-size:28px;margin:0 0 8px;font-weight:bold;">7ESAB</h1>
          <p style="color:#d1fae5;font-size:14px;margin:0;">نظام إدارة الأعمال المتكامل</p>
        </td></tr>
        <tr><td style="padding:40px 30px;text-align:center;">
          <h2 style="color:#1e293b;font-size:22px;margin:0 0 16px;">🌟 تمت دعوتك للانضمام!</h2>
          <p style="color:#475569;font-size:16px;line-height:1.8;margin:0 0 16px;">
            لقد تمت دعوتك للانضمام إلى شركة <strong style="color:#10b981;">${companyName}</strong> على نظام <strong>7ESAB</strong> بصفة <strong style="color:#6366f1;">${roleName}</strong>.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-radius:12px;margin-bottom:24px;">
            <tr><td style="padding:16px;">
              <p style="color:#166534;font-size:14px;margin:0;text-align:right;">
                <strong>🏢 الشركة:</strong> ${companyName}<br>
                <strong>👤 الدور:</strong> ${roleName}
              </p>
            </td></tr>
          </table>
          <a href="${acceptLink}" style="display:inline-block;background-color:#10b981;color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:50px;font-size:18px;font-weight:bold;">✅ قبول الدعوة</a>
        </td></tr>
        <tr><td style="background-color:#f8fafc;padding:24px 30px;text-align:center;">
          <p style="color:#94a3b8;font-size:13px;margin:0 0 8px;">إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة.</p>
          <p style="color:#cbd5e1;font-size:11px;margin:16px 0 0;">© ${new Date().getFullYear()} 7ESAB. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}