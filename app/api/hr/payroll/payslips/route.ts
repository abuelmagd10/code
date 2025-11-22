import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await getAdmin()
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const body = await req.json()
    const { companyId, runId, employeeId, update } = body || {}
    if (!companyId || !runId || !employeeId || !update) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    const { data: member } = await (admin || ssr).from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle()
    const role = String(member?.role || "")
    if (!['owner','admin','manager','accountant'].includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 })
    const client = admin || ssr

    const { data: pays } = await client.from('journal_entries').select('id').eq('company_id', companyId).eq('reference_type', 'payroll_payment').eq('reference_id', runId)
    if (Array.isArray(pays) && pays.length > 0) return NextResponse.json({ error: 'payment_exists' }, { status: 409 })

    const safe: Record<string, any> = {}
    if (typeof update.base_salary !== 'undefined') safe.base_salary = Number(update.base_salary || 0)
    if (typeof update.allowances !== 'undefined') safe.allowances = Number(update.allowances || 0)
    if (typeof update.deductions !== 'undefined') safe.deductions = Number(update.deductions || 0)
    if (typeof update.bonuses !== 'undefined') safe.bonuses = Number(update.bonuses || 0)
    if (typeof update.advances !== 'undefined') safe.advances = Number(update.advances || 0)
    if (typeof update.insurance !== 'undefined') safe.insurance = Number(update.insurance || 0)
    const net = Number(safe.base_salary ?? 0) + Number(safe.allowances ?? 0) + Number(safe.bonuses ?? 0) - (Number(safe.deductions ?? 0) + Number(safe.advances ?? 0) + Number(safe.insurance ?? 0))
    safe.net_salary = net

    const upd = await client.from('payslips').update(safe).eq('company_id', companyId).eq('payroll_run_id', runId).eq('employee_id', employeeId)
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 })
    try { await (admin || ssr).from('audit_logs').insert({ action: 'payslip_updated', company_id: companyId, user_id: user.id, details: { runId, employeeId } }) } catch {}
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown_error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await getAdmin()
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const body = await req.json()
    const { companyId, runId, employeeId } = body || {}
    if (!companyId || !runId || !employeeId) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    const { data: member } = await (admin || ssr).from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle()
    const role = String(member?.role || "")
    if (!['owner','admin','manager','accountant'].includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 })
    const client = admin || ssr

    const { data: pays } = await client.from('journal_entries').select('id').eq('company_id', companyId).eq('reference_type', 'payroll_payment').eq('reference_id', runId)
    if (Array.isArray(pays) && pays.length > 0) return NextResponse.json({ error: 'payment_exists' }, { status: 409 })

    const del = await client.from('payslips').delete().eq('company_id', companyId).eq('payroll_run_id', runId).eq('employee_id', employeeId)
    if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 })
    try { await (admin || ssr).from('audit_logs').insert({ action: 'payslip_deleted', company_id: companyId, user_id: user.id, details: { runId, employeeId } }) } catch {}
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown_error' }, { status: 500 })
  }
}