import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")
    const status = String(searchParams.get("status") || "paid")
    const { data: member } = await admin.from("company_members").select("company_id").eq("user_id", user.id).limit(1)
    const companyId = Array.isArray(member) && member[0]?.company_id ? String(member[0].company_id) : ""
    if (!companyId) return NextResponse.json([], { status: 200 })
    let q = admin
      .from('invoices')
      .select('id, invoice_number, customer_id, invoice_date, status, subtotal, tax_amount, total_amount, paid_amount, customers(name)')
      .eq('company_id', companyId)
      .gte('invoice_date', from)
      .lte('invoice_date', to)
      .order('invoice_date', { ascending: true })
    if (status === 'all') q = q.in('status', ['sent','partially_paid','paid'])
    else q = q.eq('status', status)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = (data || []).map((d: any) => ({ id: String(d.id), invoice_number: String(d.invoice_number || ''), customer_id: String(d.customer_id || ''), customer_name: String(((d.customers||{}).name)||''), invoice_date: String(d.invoice_date || ''), status: String(d.status || ''), subtotal: Number(d.subtotal || 0), tax_amount: Number(d.tax_amount || 0), total_amount: Number(d.total_amount || 0), paid_amount: Number(d.paid_amount || 0) }))
    return NextResponse.json(rows, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}
