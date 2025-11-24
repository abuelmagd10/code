import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    const { searchParams } = new URL(req.url)
    const idsParam = String(searchParams.get("ids") || "")
    const ids = idsParam.split(",").map(s => s.trim()).filter(Boolean)
    if (ids.length === 0) return NextResponse.json([], { status: 200 })

    const { data, error } = await admin
      .from("journal_entry_lines")
      .select("journal_entry_id, debit_amount, credit_amount, chart_of_accounts!inner(sub_type)")
      .in("journal_entry_id", ids)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const sumDebit: Record<string, number> = {}
    const sumCredit: Record<string, number> = {}
    const netCash: Record<string, number> = {}
    for (const l of data || []) {
      const eid = String((l as any).journal_entry_id)
      const d = Number((l as any).debit_amount || 0)
      const c = Number((l as any).credit_amount || 0)
      sumDebit[eid] = (sumDebit[eid] || 0) + d
      sumCredit[eid] = (sumCredit[eid] || 0) + c
      const st = String(((l as any).chart_of_accounts || {}).sub_type || '').toLowerCase()
      if (st === 'cash' || st === 'bank') {
        netCash[eid] = (netCash[eid] || 0) + (d - c)
      }
    }
    const allIds = Array.from(new Set([...(data || []).map((l: any) => String(l.journal_entry_id))]))
    const result = allIds.map((eid) => {
      const cashDelta = Number(netCash[eid] || 0)
      if (cashDelta !== 0) return { journal_entry_id: eid, amount: cashDelta, basis: 'cash' }
      const debit = Number(sumDebit[eid] || 0)
      const credit = Number(sumCredit[eid] || 0)
      const unsigned = Math.max(debit, credit)
      return { journal_entry_id: eid, amount: unsigned, basis: 'unsigned' }
    })
    return NextResponse.json(result, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}
