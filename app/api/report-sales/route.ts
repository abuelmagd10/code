import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey)
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")
    const { data: member } = await admin.from("company_members").select("company_id").eq("user_id", user.id).limit(1)
    const companyId = Array.isArray(member) && member[0]?.company_id ? String(member[0].company_id) : ""
    if (!companyId) return NextResponse.json([], { status: 200 })
    const { data } = await admin
      .from("invoices")
      .select("total_amount, invoice_date, status, customers(name)")
      .eq("company_id", companyId)
      .eq("status", "paid")
      .gte("invoice_date", from)
      .lte("invoice_date", to)
    const grouped: Record<string, { total: number; count: number }> = {}
    for (const inv of (data || [])) {
      const name = String(((inv as any).customers || {}).name || "Unknown")
      const prev = grouped[name] || { total: 0, count: 0 }
      grouped[name] = { total: prev.total + Number((inv as any).total_amount || 0), count: prev.count + 1 }
    }
    const result = Object.entries(grouped).map(([customer_name, v]) => ({ customer_name, total_sales: v.total, invoice_count: v.count }))
    return NextResponse.json(result, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}