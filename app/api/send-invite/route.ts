import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, companyId, role } = body || {}
    if (!email) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    const proto = req.headers.get("x-forwarded-proto") || "http"
    const host = req.headers.get("host") || "localhost:3000"
    const base = `${proto}://${host}`
    const defaultLink = `${base}/auth/login`

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey)
    // Validate inviter permission for target company
    if (!companyId) return NextResponse.json({ error: "missing_company" }, { status: 400 })
    try {
      const ssr = await createSSR()
      const { data: { user } } = await ssr.auth.getUser()
      if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      const { data: member } = await admin
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()
      const isAdmin = ["owner","admin"].includes(String(member?.role || ""))
      if (!isAdmin) {
        const { data: comp } = await admin
          .from("companies")
          .select("user_id")
          .eq("id", companyId)
          .maybeSingle()
        if (String(comp?.user_id || "") !== String(user.id)) {
          return NextResponse.json({ error: "forbidden" }, { status: 403 })
        }
      }
    } catch {}

    // Insert invitation tied to companyId/role
    const { data: created, error: invInsErr } = await admin
      .from("company_invitations")
      .insert({ company_id: companyId, email: String(email).toLowerCase(), role: String(role || "viewer") })
      .select("id, accept_token")
      .single()
    if (invInsErr) return NextResponse.json({ error: invInsErr.message || "invite_insert_failed" }, { status: 500 })
    try { await admin.from('audit_logs').insert({ action: 'invite_sent', company_id: companyId, user_id: null, details: { email, role } as any }) } catch {}

    // Send Supabase invite mail
    const { error: invErr } = await (admin as any).auth.admin.inviteUserByEmail(email)
    if (!invErr) {
      const acceptLink = `${base}/invitations/accept?token=${created?.accept_token || ""}`
      return NextResponse.json({ ok: true, type: "invite", link: acceptLink, accept_token: created?.accept_token || null, invite_id: created?.id || null }, { status: 200 })
    }
    const { data: rec, error: recErr } = await (admin as any).auth.admin.generateLink({ type: "recovery", email })
    if (recErr) return NextResponse.json({ error: recErr.message || invErr.message }, { status: 500 })
    const acceptLink = `${base}/invitations/accept?token=${created?.accept_token || ""}`
    return NextResponse.json({ ok: true, type: "recovery", link: rec?.action_link || defaultLink, accept_link: acceptLink, accept_token: created?.accept_token || null, invite_id: created?.id || null }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}