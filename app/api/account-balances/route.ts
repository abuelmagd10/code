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
    let companyId = String(searchParams.get("companyId") || "")
    const asOf = String(searchParams.get("asOf") || "9999-12-31")

    if (!companyId) {
      const ssr = await createSSR()
      const { data: { user } } = await ssr.auth.getUser()
      if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      const { data: member } = await admin.from("company_members").select("company_id").eq("user_id", user.id).limit(1)
      companyId = Array.isArray(member) && member[0]?.company_id ? String(member[0].company_id) : ""
      if (!companyId) return NextResponse.json({ error: "no_membership" }, { status: 404 })
    }

    const { data, error } = await admin
      .from("journal_entry_lines")
      .select("account_id, debit_amount, credit_amount, journal_entries!inner(company_id, entry_date)")
      .eq("journal_entries.company_id", companyId)
      .lte("journal_entries.entry_date", asOf)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const sums: Record<string, number> = {}
    for (const row of data || []) {
      const aid = (row as any).account_id as string
      const debit = Number((row as any).debit_amount || 0)
      const credit = Number((row as any).credit_amount || 0)
      sums[aid] = (sums[aid] || 0) + (debit - credit)
    }
    const result = Object.entries(sums).map(([account_id, balance]) => ({ account_id, balance }))
    return NextResponse.json(result, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}