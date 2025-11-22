import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdmin()
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const body = await req.json()
    const { companyId, year, month, adjustments } = body || {}
    if (!companyId || !year || !month) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    const { data: member } = await (admin || ssr).from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle()
    const role = String(member?.role || "")
    if (!['owner','admin','manager','accountant'].includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 })
    const client = admin || ssr

    const useHr = String(process.env.SUPABASE_USE_HR_SCHEMA || '').toLowerCase() === 'true'
    let { data: runExisting, error: runSelErr } = await client.from('payroll_runs').select('id').eq('company_id', companyId).eq('period_year', year).eq('period_month', month).maybeSingle()
    if (useHr && runSelErr && ((runSelErr as any).code === 'PGRST205' || String(runSelErr.message || '').toUpperCase().includes('PGRST205'))) {
      const clientHr = (client as any).schema ? (client as any).schema('hr') : client
      const res = await clientHr.from('payroll_runs').select('id').eq('company_id', companyId).eq('period_year', year).eq('period_month', month).maybeSingle()
      runExisting = res.data as any
      runSelErr = res.error as any
    }
    let runId = runExisting?.id
    if (!runId) {
      let insRun = await client.from('payroll_runs').insert({ company_id: companyId, period_year: year, period_month: month, approved_by: null }).select('id').single()
      if (useHr && insRun.error && ((insRun.error as any).code === 'PGRST205' || String(insRun.error.message || '').toUpperCase().includes('PGRST205'))) {
        const clientHr = (client as any).schema ? (client as any).schema('hr') : client
        insRun = await clientHr.from('payroll_runs').insert({ company_id: companyId, period_year: year, period_month: month, approved_by: null }).select('id').single()
      }
      if (insRun.error) return NextResponse.json({ error: insRun.error.message }, { status: 500 })
      runId = (insRun.data as any)?.id
    }

    let { data: emps, error: empErr } = await client.from('employees').select('id, base_salary').eq('company_id', companyId)
    if (useHr && empErr && ((empErr as any).code === 'PGRST205' || String(empErr.message || '').toUpperCase().includes('PGRST205'))) {
      const clientHr = (client as any).schema ? (client as any).schema('hr') : client
      const res = await clientHr.from('employees').select('id, base_salary').eq('company_id', companyId)
      emps = res.data as any
      empErr = res.error as any
    }
    let { data: att, error: attErr } = await client
      .from('attendance_records')
      .select('employee_id, status, day_date')
      .eq('company_id', companyId)
      .gte('day_date', `${year}-${String(month).padStart(2,'0')}-01`)
      .lte('day_date', `${year}-${String(month).padStart(2,'0')}-31`)
    if (useHr && attErr && ((attErr as any).code === 'PGRST205' || String(attErr.message || '').toUpperCase().includes('PGRST205'))) {
      const clientHr = (client as any).schema ? (client as any).schema('hr') : client
      const res = await clientHr
        .from('attendance_records')
        .select('employee_id, status, day_date')
        .eq('company_id', companyId)
        .gte('day_date', `${year}-${String(month).padStart(2,'0')}-01`)
        .lte('day_date', `${year}-${String(month).padStart(2,'0')}-31`)
      att = res.data as any
      attErr = res.error as any
    }

    const adjByEmp: Record<string, { allowances: number; deductions: number; bonuses: number; advances: number; insurance: number }> = {}
    for (const a of (Array.isArray(adjustments) ? adjustments : [])) {
      const k = String((a as any).employee_id)
      const prev = adjByEmp[k] || { allowances: 0, deductions: 0, bonuses: 0, advances: 0, insurance: 0 }
      adjByEmp[k] = {
        allowances: prev.allowances + Number((a as any).allowances || 0),
        deductions: prev.deductions + Number((a as any).deductions || 0),
        bonuses: prev.bonuses + Number((a as any).bonuses || 0),
        advances: prev.advances + Number((a as any).advances || 0),
        insurance: prev.insurance + Number((a as any).insurance || 0),
      }
    }

    const absencesByEmp: Record<string, number> = {}
    for (const r of (att || [])) {
      const st = String((r as any).status || '').toLowerCase()
      if (st === 'absent') {
        const k = String((r as any).employee_id)
        absencesByEmp[k] = (absencesByEmp[k] || 0) + 1
      }
    }

    const rows: any[] = []
    for (const e of (emps || [])) {
      const id = String((e as any).id)
      const base = Number((e as any).base_salary || 0)
      const adj = adjByEmp[id] || { allowances: 0, deductions: 0, bonuses: 0, advances: 0, insurance: 0 }
      const absDays = absencesByEmp[id] || 0
      const daily = base / 30
      const absenceDeduction = daily * absDays
      const totalDeductions = Number(adj.deductions || 0) + Number(adj.advances || 0) + Number(adj.insurance || 0) + Number(absenceDeduction || 0)
      const net = base + Number(adj.allowances || 0) + Number(adj.bonuses || 0) - totalDeductions
      rows.push({ company_id: companyId, payroll_run_id: runId, employee_id: id, base_salary: base, allowances: adj.allowances || 0, deductions: totalDeductions, bonuses: adj.bonuses || 0, advances: adj.advances || 0, insurance: adj.insurance || 0, net_salary: net, breakdown: { absences: absDays, daily_rate: daily } })
    }

    if (rows.length > 0) {
      let del = await client.from('payslips').delete().eq('company_id', companyId).eq('payroll_run_id', runId)
      if (useHr && del.error && ((del.error as any).code === 'PGRST205' || String(del.error.message || '').toUpperCase().includes('PGRST205'))) {
        const clientHr = (client as any).schema ? (client as any).schema('hr') : client
        del = await clientHr.from('payslips').delete().eq('company_id', companyId).eq('payroll_run_id', runId)
      }
      if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 })
      let ins = await client.from('payslips').insert(rows)
      if (useHr && ins.error && ((ins.error as any).code === 'PGRST205' || String(ins.error.message || '').toUpperCase().includes('PGRST205'))) {
        const clientHr = (client as any).schema ? (client as any).schema('hr') : client
        ins = await clientHr.from('payslips').insert(rows)
      }
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 })
    }
    try { await (admin || ssr).from('audit_logs').insert({ action: 'payroll_run', company_id: companyId, user_id: user.id, details: { year, month, count: rows.length } }) } catch {}
    return NextResponse.json({ ok: true, run_id: runId, count: rows.length }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown_error' }, { status: 500 })
  }
}