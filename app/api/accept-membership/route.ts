import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    const { email, userId } = await req.json()
    if (!email || !userId) return NextResponse.json({ error: "missing_params" }, { status: 400 })
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey)
    const nowISO = new Date().toISOString()
    const { data: invs } = await admin
      .from('company_invitations')
      .select('id, company_id, role, expires_at, accepted')
      .eq('email', email)
      .eq('accepted', false)
    let chosenCompanyId: string | null = null
    for (const inv of (invs || [])) {
      const exp = String((inv as any)?.expires_at || '')
      if (exp && exp <= nowISO) continue
      const companyId = String((inv as any).company_id || '')
      if (!companyId) continue
      const { data: exists } = await admin
        .from('company_members')
        .select('id')
        .eq('company_id', companyId)
        .eq('user_id', userId)
        .limit(1)
      if (!exists || exists.length === 0) {
        const { error: insErr } = await admin
          .from('company_members')
          .insert({ company_id: companyId, user_id: userId, role: (inv as any).role, email })
        if (insErr) continue
      }
      await admin.from('company_invitations').update({ accepted: true }).eq('id', (inv as any).id)
      chosenCompanyId = chosenCompanyId || companyId
    }
    return NextResponse.json({ ok: true, companyId: chosenCompanyId }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown_error' }, { status: 500 })
  }
}