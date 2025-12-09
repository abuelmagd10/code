import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const userId: string = body?.userId
    const password: string = body?.password
    const companyId: string = body?.companyId
    if (!userId || !password) return NextResponse.json({ error: "missing_params" }, { status: 400 })
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

    // السماح للمستخدم بتغيير كلمة مروره فقط، أو للمدير/المالك بتغيير كلمات مرور الآخرين
    if (requester.id !== userId) {
      // التحقق من أن الطالب owner أو admin في نفس الشركة
      if (!companyId) {
        return NextResponse.json({ error: "companyId مطلوب لتغيير كلمة مرور مستخدم آخر" }, { status: 400 })
      }

      const { data: requesterMember } = await admin
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", requester.id)
        .maybeSingle()

      const { data: targetMember } = await admin
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle()

      if (!requesterMember || !["owner", "admin"].includes(requesterMember.role)) {
        return NextResponse.json({ error: "ليست لديك صلاحية لتغيير كلمة مرور هذا المستخدم" }, { status: 403 })
      }

      if (!targetMember) {
        return NextResponse.json({ error: "المستخدم المستهدف ليس عضواً في الشركة" }, { status: 403 })
      }
    }
    // === نهاية الإصلاح الأمني ===

    const { error } = await (admin as any).auth.admin.updateUserById(userId, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}