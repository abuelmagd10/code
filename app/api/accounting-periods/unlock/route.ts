import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

// POST: فتح فترة محاسبية (للمالك فقط)
export async function POST(req: NextRequest) {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    }

    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const companyId = await getActiveCompanyId(ssr)
    if (!companyId) {
      return NextResponse.json({ error: "لم يتم العثور على الشركة" }, { status: 404 })
    }

    // التحقق من الصلاحيات (المالك فقط)
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
    const { data: member } = await admin
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .single()

    if (!member || member.role !== 'owner') {
      return NextResponse.json({ error: "غير مصرح - المالك فقط" }, { status: 403 })
    }

    const body = await req.json()
    const { period_id } = body

    if (!period_id) {
      return NextResponse.json({ error: "معرف الفترة مطلوب" }, { status: 400 })
    }

    // استدعاء دالة فتح الفترة
    const { data, error } = await admin.rpc('unlock_accounting_period', {
      p_period_id: period_id,
      p_user_id: user.id
    })

    if (error) {
      console.error("Error unlocking accounting period:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error("Error:", err)
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 })
  }
}
