import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    const { email, userId } = await req.json()
    if (!email || !userId) return NextResponse.json({ error: "missing_params" }, { status: 400 })
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
    const nowISO = new Date().toISOString()
    const { data: invs } = await admin
      .from('company_invitations')
      .select('id, company_id, role, expires_at, accepted, created_at')
      .eq('email', email)
      .order('created_at', { ascending: false })
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
      try { await admin.from('audit_logs').insert({ action: 'invite_accepted', target_table: 'company_invitations', company_id: companyId, user_id: userId, new_data: { email, role: (inv as any).role } }) } catch {}
      chosenCompanyId = chosenCompanyId || companyId
    }
    try {
      if (chosenCompanyId) {
        await (admin as any).auth.admin.updateUserById(userId, { user_metadata: { active_company_id: chosenCompanyId } })
        try { await admin.from('audit_logs').insert({ action: 'active_company_set', target_table: 'users', company_id: chosenCompanyId, user_id: userId, new_data: { active_company_id: chosenCompanyId } }) } catch {}
      }
    } catch {}
    return NextResponse.json({ ok: true, companyId: chosenCompanyId }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown_error' }, { status: 500 })
  }
}