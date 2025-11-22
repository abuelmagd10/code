import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey)

    const { searchParams } = new URL(req.url)
    const companyId = String(searchParams.get("companyId") || "")
    const asOf = String(searchParams.get("asOf") || "9999-12-31")
    if (!companyId) return NextResponse.json({ error: "invalid_company" }, { status: 400 })

    const { data, error } = await admin
      .from("journal_entry_lines")
      .select("debit_amount, credit_amount, journal_entries!inner(id, entry_date, company_id)")
      .eq("journal_entries.company_id", companyId)
      .lte("journal_entries.entry_date", asOf)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const byEntry: Record<string, { debit: number; credit: number; entry_date: string }> = {}
    ;(data || []).forEach((line: any) => {
      const debit = Number(line.debit_amount || 0)
      const credit = Number(line.credit_amount || 0)
      const entryId = String(line.journal_entries?.id || "")
      const entryDate = String(line.journal_entries?.entry_date || asOf)
      if (entryId) {
        const prev = byEntry[entryId] || { debit: 0, credit: 0, entry_date: entryDate }
        byEntry[entryId] = { debit: prev.debit + debit, credit: prev.credit + credit, entry_date: entryDate }
      }
    })
    const unbalanced = Object.entries(byEntry)
      .map(([id, v]) => ({ id, entry_date: v.entry_date, debit: v.debit, credit: v.credit, difference: v.debit - v.credit }))
      .filter((s) => Math.abs(s.difference) >= 0.01)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
    return NextResponse.json(unbalanced, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}