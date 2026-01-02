import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const { action, companyId, userId, details } = await req.json()
    if (!action) return NextResponse.json({ error: "missing_action" }, { status: 400 })

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

    const logEntry = {
      action,
      company_id: companyId || null,
      user_id: userId || null,
      user_email: userEmail,
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

    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) {
      // لا نعيد خطأ، audit log اختياري
      return NextResponse.json({ ok: true, warning: "no_user" }, { status: 200 })
    }

    logEntry.user_id = userId || user.id
    const { error } = await ssr.from('audit_logs').insert(logEntry)
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