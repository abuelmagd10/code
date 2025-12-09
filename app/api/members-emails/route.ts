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
    for (const id of userIds) {
      try {
        const { data: user } = await (admin as any).auth.admin.getUserById(id)
        if (user?.user?.email) map[id] = user.user.email
      } catch {}
    }
    return NextResponse.json({ map }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}