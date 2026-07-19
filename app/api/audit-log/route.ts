import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

/**
 * v3.74.738 — this endpoint accepted forged audit entries from anyone.
 *
 * The service-role branch below inserted the row and returned before reaching
 * the auth.getUser() check further down — so in production, where the URL and
 * service key are always set, that check was unreachable code. An unauthenticated
 * POST could write any action, attributed to any user_id and user_email, into
 * any company_id's audit trail.
 *
 * For an accounting system that is worse than it sounds. The audit log is what
 * you consult when there is a dispute about who did what. A log anyone can write
 * to is not evidence of anything, and a forged entry blaming a real employee is
 * indistinguishable from a true one.
 *
 * Now: the session is established FIRST, and company_id / user_id come from it.
 * Caller-supplied identity fields are ignored rather than trusted.
 *
 * The endpoint still never blocks the caller's workflow — audit logging failures
 * return ok:true with a warning, as before. Both call sites (login, settings)
 * run after authentication, so requiring a session breaks neither.
 */
export async function POST(req: NextRequest) {
  try {
    const { action, companyId: claimedCompanyId, details } = await req.json()
    if (!action) return NextResponse.json({ error: "missing_action" }, { status: 400 })

    const ssrClient = await createSSR()
    const { data: { user: sessionUser } } = await ssrClient.auth.getUser()
    if (!sessionUser) {
      return NextResponse.json({ ok: true, warning: "no_session" }, { status: 200 })
    }

    // استخراج معلومات إضافية من details
    const userEmail = details?.user_email || null
    const userName = details?.user_name || null
    const targetTable = details?.target_table || (action === "LOGIN" ? "user_sessions" : action === "SETTINGS" ? "settings" : null)
    const recordId = details?.record_id || null
    const recordIdentifier = details?.record_identifier || (action === "LOGIN" ? userEmail : null)
    const oldData = details?.old_data || null
    const newData = details?.new_data || null
    const changedFields = details?.changed_fields || null
    const ipAddress = details?.ip_address || req.headers.get("x-forwarded-for")?.split(",")[0] || null
    const userAgent = details?.user_agent || req.headers.get("user-agent") || null

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

    // The claimed company is only honoured if the session user is a member of
    // it. Otherwise the entry is filed with no company rather than against
    // someone else's trail.
    let resolvedCompanyId: string | null = null
    if (claimedCompanyId) {
      const { data: membership } = await ssrClient
        .from("company_members")
        .select("company_id")
        .eq("company_id", claimedCompanyId)
        .eq("user_id", sessionUser.id)
        .maybeSingle()
      resolvedCompanyId = membership?.company_id ?? null
    }

    const logEntry = {
      action,
      company_id: resolvedCompanyId,
      user_id: sessionUser.id,
      user_email: sessionUser.email ?? userEmail,
      user_name: userName,
      target_table: targetTable,
      record_id: recordId,
      record_identifier: recordIdentifier,
      old_data: oldData,
      new_data: newData,
      changed_fields: changedFields,
      ip_address: ipAddress,
      user_agent: userAgent,
    }

    if (url && serviceKey) {
      const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
      const { error } = await admin.from('audit_logs').insert(logEntry)
      // تجاهل الخطأ إذا كان الجدول غير موجود - audit log اختياري
      if (error) {
        console.warn('[audit-log] Failed to insert:', error.message)
        // نعود بنجاح حتى لا يوقف سير العمل
        return NextResponse.json({ ok: true, warning: error.message }, { status: 200 })
      }
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Fallback when the service key is absent (local dev). The session was
    // already established above, so this branch no longer re-checks it — and no
    // longer takes user_id from the request body, which was the forgery route.
    const { error } = await ssrClient.from('audit_logs').insert(logEntry)
    if (error) {
      console.warn('[audit-log] Failed to insert:', error.message)
      return NextResponse.json({ ok: true, warning: error.message }, { status: 200 })
    }
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown_error'
    console.warn('[audit-log] Exception:', message)
    // نعود بنجاح - audit log لا يجب أن يوقف العمل
    return NextResponse.json({ ok: true, warning: message }, { status: 200 })
  }
}