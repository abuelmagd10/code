import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

async function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

export async function GET(req: NextRequest) {
  try {
    const admin = await getAdmin()
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const companyId = String(searchParams.get("companyId") || "")
    let cid = companyId
    if (!cid) {
      const { data: member } = await (admin || ssr).from("company_members").select("company_id").eq("user_id", user.id).limit(1)
      cid = Array.isArray(member) && member[0]?.company_id ? String(member[0].company_id) : ""
    }
    if (!cid) return NextResponse.json([], { status: 200 })
    const client = admin || ssr
    let { data, error } = await client.from("employees").select("*").eq("company_id", cid).order("full_name")
    if (error && ((error as any).code === "PGRST205" || String(error.message || "").toUpperCase().includes("PGRST205"))) {
      const clientHr = (client as any).schema ? (client as any).schema("hr") : client
      const res = await clientHr.from("employees").select("*").eq("company_id", cid).order("full_name")
      data = res.data as any
      error = res.error as any
    }
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
    const { companyId, employee } = body || {}
    if (!companyId || !employee?.full_name) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    const { data: member } = await (admin || ssr).from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle()
    const role = String(member?.role || "")
    if (!['owner','admin','manager'].includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 })
    const client = admin || ssr
    let ins = await client.from("employees").insert({ company_id: companyId, ...employee })
    if (ins.error && ((ins.error as any).code === "PGRST205" || String(ins.error.message || "").toUpperCase().includes("PGRST205"))) {
      const clientHr = (client as any).schema ? (client as any).schema("hr") : client
      ins = await clientHr.from("employees").insert({ company_id: companyId, ...employee })
    }
    const { error } = ins
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    try { await (admin || ssr).from('audit_logs').insert({ action: 'employee_added', company_id: companyId, user_id: user.id, details: { full_name: employee.full_name } }) } catch {}
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await getAdmin()
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const body = await req.json()
    const { companyId, id, update } = body || {}
    if (!companyId || !id || !update) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    const { data: member } = await (admin || ssr).from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle()
    const role = String(member?.role || "")
    if (!['owner','admin','manager'].includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 })
    const client = admin || ssr
    let upd = await client.from("employees").update(update).eq("company_id", companyId).eq("id", id)
    if (upd.error && ((upd.error as any).code === "PGRST205" || String(upd.error.message || "").toUpperCase().includes("PGRST205"))) {
      const clientHr = (client as any).schema ? (client as any).schema("hr") : client
      upd = await clientHr.from("employees").update(update).eq("company_id", companyId).eq("id", id)
    }
    const { error } = upd
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    try { await (admin || ssr).from('audit_logs').insert({ action: 'employee_updated', company_id: companyId, user_id: user.id, details: { id } }) } catch {}
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}