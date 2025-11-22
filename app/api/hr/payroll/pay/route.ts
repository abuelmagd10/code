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
    const { companyId, year, month, paymentAccountId } = body || {}
    if (!companyId || !year || !month || !paymentAccountId) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    const { data: member } = await (admin || ssr).from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle()
    const role = String(member?.role || "")
    if (!['owner','admin','manager','accountant'].includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 })

    const client = admin || ssr

    const useHr = String(process.env.SUPABASE_USE_HR_SCHEMA || '').toLowerCase() === 'true'
    let { data: run, error: runErr } = await client.from('payroll_runs').select('id').eq('company_id', companyId).eq('period_year', year).eq('period_month', month).maybeSingle()
    if (useHr && runErr && ((runErr as any).code === 'PGRST205' || String(runErr.message || '').toUpperCase().includes('PGRST205'))) {
      const clientHr = (client as any).schema ? (client as any).schema('hr') : client
      const res = await clientHr.from('payroll_runs').select('id').eq('company_id', companyId).eq('period_year', year).eq('period_month', month).maybeSingle()
      run = res.data as any
      runErr = res.error as any
    }
    if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 })
    if (!run?.id) return NextResponse.json({ error: 'run_not_found' }, { status: 404 })

    let { data: slips, error: slipsErr } = await client.from('payslips').select('net_salary').eq('company_id', companyId).eq('payroll_run_id', run.id)
    if (useHr && slipsErr && ((slipsErr as any).code === 'PGRST205' || String(slipsErr.message || '').toUpperCase().includes('PGRST205'))) {
      const clientHr = (client as any).schema ? (client as any).schema('hr') : client
      const res = await clientHr.from('payslips').select('net_salary').eq('company_id', companyId).eq('payroll_run_id', run.id)
      slips = res.data as any
      slipsErr = res.error as any
    }
    if (slipsErr) return NextResponse.json({ error: slipsErr.message }, { status: 500 })
    const total = (slips || []).reduce((s: number, r: any) => s + Number(r.net_salary || 0), 0)
    if (total <= 0) return NextResponse.json({ error: 'no_payslips' }, { status: 400 })

    const { data: payAcc } = await client.from('chart_of_accounts').select('id, account_type, sub_type').eq('company_id', companyId).eq('id', paymentAccountId).maybeSingle()
    if (!payAcc?.id) return NextResponse.json({ error: 'payment_account_not_found' }, { status: 404 })
    if (!['asset'].includes(String(payAcc.account_type || ''))) return NextResponse.json({ error: 'invalid_payment_account_type' }, { status: 400 })

    const { data: expAcc } = await client.from('chart_of_accounts').select('id').eq('company_id', companyId).eq('account_code', '6110').maybeSingle()
    if (!expAcc?.id) return NextResponse.json({ error: 'expense_account_missing_6110' }, { status: 400 })

    const today = new Date().toISOString().slice(0,10)
    const { data: entry, error: entryErr } = await client.from('journal_entries').insert({ company_id: companyId, entry_date: today, description: `صرف مرتبات ${year}-${String(month).padStart(2,'0')}`, reference_type: 'payroll_payment', reference_id: run.id }).select().maybeSingle()
    if (entryErr) return NextResponse.json({ error: entryErr.message }, { status: 500 })

    const lines = [
      { journal_entry_id: entry?.id, account_id: expAcc.id, debit_amount: total, credit_amount: 0, description: '6110 مرتبات موظفين' },
      { journal_entry_id: entry?.id, account_id: paymentAccountId, debit_amount: 0, credit_amount: total, description: 'صرف من الحساب' },
    ]
    const { error: linesErr } = await client.from('journal_entry_lines').insert(lines)
    if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 })

    try { await (admin || ssr).from('audit_logs').insert({ action: 'payroll_paid', company_id: companyId, user_id: user.id, details: { year, month, total, entry_id: entry?.id } }) } catch {}
    return NextResponse.json({ ok: true, total, entry_id: entry?.id }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown_error' }, { status: 500 })
  }
}