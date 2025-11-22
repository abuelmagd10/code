import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const { action, companyId, userId, details } = await req.json()
    if (!action) return NextResponse.json({ error: "missing_action" }, { status: 400 })
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (url && serviceKey) {
      const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
      const { error } = await admin.from('audit_logs').insert({ action, company_id: companyId || null, user_id: userId || null, details: details || null })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true }, { status: 200 })
    }
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const { error } = await ssr.from('audit_logs').insert({ action, company_id: companyId || null, user_id: userId || user.id, details: details || null })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown_error' }, { status: 500 })
  }
}