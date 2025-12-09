import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const companyId = url.searchParams.get("companyId")
    if (!companyId) return NextResponse.json({ error: "missing_companyId" }, { status: 400 })
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!supabaseUrl || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(supabaseUrl, serviceKey, { global: { headers: { apikey: serviceKey } } })

    // === إصلاح أمني: التحقق من عضوية المستخدم في الشركة ===
    const ssr = await createSSR()
    const { data: { user: requester } } = await ssr.auth.getUser()

    if (!requester) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const { data: membership } = await admin
      .from("company_members")
      .select("id, role")
      .eq("company_id", companyId)
      .eq("user_id", requester.id)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: "لست عضواً في هذه الشركة" }, { status: 403 })
    }
    // === نهاية الإصلاح الأمني ===

    const { data: mems, error } = await admin
      .from("company_members")
      .select("id, user_id, role, email, created_at")
      .eq("company_id", companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const list = (mems || []) as any[]

    // جلب ملفات المستخدمين (username, display_name)
    const userIds = list.map((m) => m.user_id)
    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("user_id, username, display_name")
        .in("user_id", userIds)

      // دمج بيانات الملف مع الأعضاء
      for (const member of list) {
        const profile = (profiles || []).find((p: any) => p.user_id === member.user_id)
        if (profile) {
          member.username = profile.username
          member.display_name = profile.display_name
        }
      }
    }

    const fillIds = list.filter((m) => !m.email).map((m) => m.user_id)
    if (fillIds.length > 0) {
      for (const uid of fillIds) {
        try {
          const { data: user } = await (admin as any).auth.admin.getUserById(uid)
          const mail = user?.user?.email || null
          const idx = list.findIndex((x) => x.user_id === uid)
          if (idx >= 0) list[idx].email = mail
        } catch {}
      }
    }
    return NextResponse.json({ members: list }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}