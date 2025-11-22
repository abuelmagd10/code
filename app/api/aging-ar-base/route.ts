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
    const endDate = String(searchParams.get("endDate") || new Date().toISOString().slice(0,10))

    const { data: member } = await admin.from("company_members").select("company_id").eq("user_id", user.id).limit(1)
    const companyId = Array.isArray(member) && member[0]?.company_id ? String(member[0].company_id) : ""
    if (!companyId) return NextResponse.json({ invoices: [], customers: {}, paidMap: {} }, { status: 200 })

    const { data: invs } = await admin
      .from("invoices")
      .select("id, customer_id, due_date, total_amount")
      .eq("company_id", companyId)
      .in("status", ["sent", "partially_paid"]) 

    const customerIds = Array.from(new Set((invs || []).map((i: any) => i.customer_id).filter(Boolean)))
    let customers: Record<string, { id: string; name: string }> = {}
    if (customerIds.length) {
      const { data: custs } = await admin
        .from("customers")
        .select("id, name")
        .eq("company_id", companyId)
        .in("id", customerIds)
      for (const c of (custs || [])) { customers[String((c as any).id)] = { id: String((c as any).id), name: String((c as any).name || '') } }
    }

    const { data: pays } = await admin
      .from("payments")
      .select("invoice_id, amount, payment_date")
      .eq("company_id", companyId)
      .lte("payment_date", endDate)
    const paidMap: Record<string, number> = {}
    for (const p of (pays || [])) {
      const invId = String((p as any).invoice_id || '')
      if (!invId) continue
      paidMap[invId] = (paidMap[invId] || 0) + Number((p as any).amount || 0)
    }

    return NextResponse.json({ invoices: invs || [], customers, paidMap }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}