import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const { userIds, companyId } = await req.json()
    if (!Array.isArray(userIds) || userIds.length === 0) return NextResponse.json({ map: {} }, { status: 200 })
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    // === إصلاح أمني: التحقق من المصادقة والعضوية ===
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    // التحقق من أن المستخدم عضو في شركة (إذا تم تمرير companyId)
    if (companyId) {
      const { data: membership } = await admin
        .from("company_members")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (!membership) {
        return NextResponse.json({ error: "لست عضواً في هذه الشركة" }, { status: 403 })
      }
    }
    // === نهاية الإصلاح الأمني ===

    const map: Record<string, string> = {}
    const names: Record<string, string> = {}

    // v3.74.512 — أسماء العرض: اسم الموظف المرتبط بالحساب أولاً
    // (جدول الموظفين عبر user_id)، ثم اسم الحساب من بياناته الوصفية،
    // والإيميل يبقى fallback فى الواجهة.
    if (companyId) {
      try {
        const { data: emps } = await admin
          .from("employees")
          .select("user_id, full_name")
          .eq("company_id", companyId)
          .in("user_id", userIds)
        for (const e of (emps || []) as any[]) {
          if (e.user_id && e.full_name) names[e.user_id] = e.full_name
        }
      } catch {}
    }

    for (const id of userIds) {
      try {
        const { data: user } = await (admin as any).auth.admin.getUserById(id)
        if (user?.user?.email) map[id] = user.user.email
        const metaName = user?.user?.user_metadata?.full_name || user?.user?.user_metadata?.name
        if (!names[id] && metaName) names[id] = String(metaName)
      } catch {}
    }
    return NextResponse.json({ map, names }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}