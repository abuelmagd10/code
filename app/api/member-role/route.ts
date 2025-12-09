import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const companyId: string = body?.companyId
    const userId: string = body?.userId
    const role: string = body?.role
    const oldRole: string = body?.oldRole || ""
    const targetUserEmail: string = body?.targetUserEmail || ""
    const targetUserName: string = body?.targetUserName || ""
    const changedByUserId: string = body?.changedByUserId || ""
    const changedByUserEmail: string = body?.changedByUserEmail || ""

    if (!companyId || !userId || !role) return NextResponse.json({ error: "missing_params" }, { status: 400 })
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    // === إصلاح أمني: التحقق من صلاحية المستخدم الطالب ===
    const cookieStore = await cookies()
    const ssr = createServerComponentClient({ cookies: () => cookieStore })
    const { data: { user: requester } } = await ssr.auth.getUser()

    if (!requester) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const { data: requesterMember } = await admin
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", requester.id)
      .maybeSingle()

    if (!requesterMember || !["owner", "admin"].includes(requesterMember.role)) {
      return NextResponse.json({ error: "ليست لديك صلاحية لتغيير الأدوار" }, { status: 403 })
    }
    // === نهاية الإصلاح الأمني ===

    const { error } = await admin.from("company_members").update({ role }).eq("company_id", companyId).eq("user_id", userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // تسجيل تغيير الصلاحيات في سجل المراجعة
    try {
      await admin.from('audit_logs').insert({
        action: 'PERMISSIONS',
        company_id: companyId,
        user_id: changedByUserId || userId,
        user_email: changedByUserEmail,
        target_table: 'company_members',
        record_id: userId,
        record_identifier: targetUserEmail || targetUserName,
        old_data: { role: oldRole },
        new_data: { role },
        changed_fields: ['role'],
        ip_address: req.headers.get("x-forwarded-for")?.split(",")[0] || null,
        user_agent: req.headers.get("user-agent") || null,
      })
    } catch (logError) {
      console.error("Failed to log role change:", logError)
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown_error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}