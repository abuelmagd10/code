import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  try {
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey)
    const cookieHeader = req.headers.get('cookie') || ''
    const cookieMatch = /active_company_id=([^;]+)/.exec(cookieHeader || '')
    const cookieCid = cookieMatch ? decodeURIComponent(cookieMatch[1]) : ''
    const metaCid = String((user as any)?.user_metadata?.active_company_id || '')

    const { data: memberships } = await admin
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", user.id)
    const memIds = (memberships || []).map((m: any) => String(m.company_id)).filter(Boolean)
    if (memIds.length === 0) return NextResponse.json({ error: "no_membership" }, { status: 404 })

    let cid = ''
    if (cookieCid && memIds.includes(cookieCid)) cid = cookieCid
    else if (metaCid && memIds.includes(metaCid)) cid = metaCid
    if (!cid) {
      const { data: accs } = await admin
        .from("chart_of_accounts")
        .select("id, company_id")
        .in("company_id", memIds)
      const counts = new Map<string, number>()
      for (const r of (accs || [])) {
        const k = String((r as any).company_id)
        counts.set(k, (counts.get(k) || 0) + 1)
      }
      const withAccounts = memIds.find((id) => (counts.get(id) || 0) > 0)
      cid = withAccounts || memIds[0]
    }

    const { data: company } = await admin
      .from("companies")
      .select("*")
      .eq("id", cid)
      .maybeSingle()
    if (!company?.id) return NextResponse.json({ error: "company_not_found" }, { status: 404 })
    const { data: accounts } = await admin
      .from("chart_of_accounts")
      .select("*")
      .eq("company_id", cid)
      .order("account_code")
    return NextResponse.json({ company, accounts: accounts || [] }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}