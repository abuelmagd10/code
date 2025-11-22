import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey)

    const { searchParams } = new URL(req.url)
    const idsParam = String(searchParams.get("ids") || "")
    const ids = idsParam.split(",").map(s => s.trim()).filter(Boolean)
    if (ids.length === 0) return NextResponse.json([], { status: 200 })

    const { data, error } = await admin
      .from("journal_entry_lines")
      .select("journal_entry_id, debit_amount, credit_amount, chart_of_accounts!inner(sub_type)")
      .in("journal_entry_id", ids)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const agg: Record<string, number> = {}
    for (const l of data || []) {
      const st = String(((l as any).chart_of_accounts || {}).sub_type || '').toLowerCase()
      if (st !== 'cash' && st !== 'bank') continue
      const eid = String((l as any).journal_entry_id)
      const amt = Number((l as any).debit_amount || 0) - Number((l as any).credit_amount || 0)
      agg[eid] = Number(agg[eid] || 0) + amt
    }
    const result = Object.entries(agg).map(([journal_entry_id, amount]) => ({ journal_entry_id, amount }))
    return NextResponse.json(result, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}