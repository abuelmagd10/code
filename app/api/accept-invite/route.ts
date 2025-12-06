import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()
    if (!token || !password) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    const { data: invRows, error: invErr } = await admin
      .from("company_invitations")
      .select("id, company_id, email, role, expires_at, accepted")
      .eq("accept_token", token)
      .limit(1)
    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })
    const inv = invRows?.[0]
    if (!inv) return NextResponse.json({ error: "invite_not_found" }, { status: 404 })
    if (inv.accepted) return NextResponse.json({ error: "invite_already_accepted" }, { status: 400 })
    if (new Date(inv.expires_at) < new Date()) return NextResponse.json({ error: "invite_expired" }, { status: 400 })

    // Try to find or create user
    let userId = ""
    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = listed?.users?.find((u: any) => u?.email?.toLowerCase() === String(inv.email).toLowerCase())
    if (!existing) {
      const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({ email: inv.email, password, email_confirm: true })
      if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })
      userId = createdUser.user?.id || ""
    } else {
      userId = existing.id
      await admin.auth.admin.updateUserById(userId, { password })
    }
    if (!userId) return NextResponse.json({ error: "user_create_failed" }, { status: 500 })

    // Insert membership
    const { error: memErr } = await admin
      .from("company_members")
      .insert({ company_id: inv.company_id, user_id: userId, role: inv.role, email: inv.email })
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

    // Mark invite accepted
    await admin.from("company_invitations").update({ accepted: true }).eq("id", inv.id)

    // Return company_id so client can set active_company_id
    return NextResponse.json({ ok: true, email: inv.email, company_id: inv.company_id }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}