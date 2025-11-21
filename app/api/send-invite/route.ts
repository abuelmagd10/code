import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email } = body || {}
    if (!email) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    const proto = req.headers.get("x-forwarded-proto") || "http"
    const host = req.headers.get("host") || "localhost:3000"
    const base = `${proto}://${host}`
    const link = `${base}/auth/login`

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey)
    const { error: invErr } = await (admin as any).auth.admin.inviteUserByEmail(email)
    if (!invErr) {
      return NextResponse.json({ ok: true, type: "invite", link }, { status: 200 })
    }
    const { data: rec, error: recErr } = await (admin as any).auth.admin.generateLink({ type: "recovery", email })
    if (recErr) return NextResponse.json({ error: recErr.message || invErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, type: "recovery", link: rec?.action_link || link }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}