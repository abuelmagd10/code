import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

async function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey) : null
}

export async function GET(req: NextRequest) {
  try {
    const admin = await getAdmin()
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const companyId = String(searchParams.get("companyId") || "")
    const employeeId = String(searchParams.get("employeeId") || "")
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")
    let cid = companyId
    if (!cid) {
      const { data: member } = await (admin || ssr).from("company_members").select("company_id").eq("user_id", user.id).limit(1)
      cid = Array.isArray(member) && member[0]?.company_id ? String(member[0].company_id) : ""
    }
    if (!cid) return NextResponse.json([], { status: 200 })
    const client = admin || ssr
    let q = client.from("attendance_records").select("*").eq("company_id", cid).gte("day_date", from).lte("day_date", to)
    if (employeeId) q = q.eq("employee_id", employeeId)
    const { data, error } = await q.order("day_date")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [], { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdmin()
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const body = await req.json()
    const { companyId, employeeId, dayDate, status } = body || {}
    if (!companyId || !employeeId || !dayDate || !status) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    const { data: member } = await (admin || ssr).from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle()
    const role = String(member?.role || "")
    if (!['owner','admin','manager','accountant'].includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 })
    const client = admin || ssr
    const { error } = await client.from("attendance_records").upsert({ company_id: companyId, employee_id: employeeId, day_date: dayDate, status }, { onConflict: "company_id,employee_id,day_date" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    try { await (admin || ssr).from('audit_logs').insert({ action: 'attendance_recorded', company_id: companyId, user_id: user.id, details: { employeeId, dayDate, status } }) } catch {}
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}