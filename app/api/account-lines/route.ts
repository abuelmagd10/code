import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey)

    const { searchParams } = new URL(req.url)
    const accountId = String(searchParams.get("accountId") || "")
    let companyId = String(searchParams.get("companyId") || "")
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")
    const limit = Number(searchParams.get("limit") || 50)
    if (!accountId) return NextResponse.json({ error: "invalid_account" }, { status: 400 })

    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    if (!companyId) {
      const { data: member } = await admin.from("company_members").select("company_id").eq("user_id", user.id).limit(1)
      companyId = Array.isArray(member) && member[0]?.company_id ? String(member[0].company_id) : ""
    } else {
      const { data: member } = await admin.from("company_members").select("company_id").eq("user_id", user.id).eq("company_id", companyId).limit(1)
      if (!Array.isArray(member) || !member[0]?.company_id) return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
    if (!companyId) return NextResponse.json({ error: "no_membership" }, { status: 404 })

    const { data, error } = await admin
      .from("journal_entry_lines")
      .select("id, debit_amount, credit_amount, description, journal_entries!inner(entry_date, description, company_id)")
      .eq("account_id", accountId)
      .eq("journal_entries.company_id", companyId)
      .gte("journal_entries.entry_date", from)
      .lte("journal_entries.entry_date", to)
      .order("id", { ascending: false })
      .limit(limit)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [], { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}