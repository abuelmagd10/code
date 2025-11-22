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
    const { companyId, runId, entryId, amount, paymentAccountId, description } = body || {}
    if (!companyId || !runId || !entryId || (!amount && !paymentAccountId && typeof description === 'undefined')) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    const { data: member } = await (admin || ssr).from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle()
    const role = String(member?.role || "")
    if (!['owner','admin','manager','accountant'].includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 })
    const client = admin || ssr

    const { data: rec } = await client.from('bank_reconciliation_lines').select('id').eq('journal_entry_line_id', entryId).limit(1)
    if (Array.isArray(rec) && rec.length > 0) return NextResponse.json({ error: 'reconciled' }, { status: 409 })

    if (description) {
      const updEntry = await client.from('journal_entries').update({ description }).eq('company_id', companyId).eq('id', entryId)
      if (updEntry.error) return NextResponse.json({ error: updEntry.error.message }, { status: 500 })
    }

    if (paymentAccountId || typeof amount !== 'undefined') {
      const { data: lines } = await client.from('journal_entry_lines').select('id, account_id, debit_amount, credit_amount').eq('journal_entry_id', entryId)
      const debitLine = (lines||[]).find((l:any)=> Number(l.debit_amount||0)>0)
      const creditLine = (lines||[]).find((l:any)=> Number(l.credit_amount||0)>0)
      if (!debitLine || !creditLine) return NextResponse.json({ error: 'lines_not_found' }, { status: 404 })
      const amt = typeof amount !== 'undefined' ? Number(amount||0) : Number(creditLine.credit_amount||0)
      const updDebit = await client.from('journal_entry_lines').update({ debit_amount: amt }).eq('id', debitLine.id)
      if (updDebit.error) return NextResponse.json({ error: updDebit.error.message }, { status: 500 })
      const updCredit = await client.from('journal_entry_lines').update({ credit_amount: amt, account_id: paymentAccountId || creditLine.account_id }).eq('id', creditLine.id)
      if (updCredit.error) return NextResponse.json({ error: updCredit.error.message }, { status: 500 })
    }

    try { await (admin || ssr).from('audit_logs').insert({ action: 'payroll_payment_updated', company_id: companyId, user_id: user.id, details: { runId, entryId } }) } catch {}
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
    const { companyId, entryId } = body || {}
    if (!companyId || !entryId) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    const { data: member } = await (admin || ssr).from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle()
    const role = String(member?.role || "")
    if (!['owner','admin','manager','accountant'].includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 })
    const client = admin || ssr

    const { data: rec } = await client.from('bank_reconciliation_lines').select('id').eq('journal_entry_line_id', entryId).limit(1)
    if (Array.isArray(rec) && rec.length > 0) return NextResponse.json({ error: 'reconciled' }, { status: 409 })

    const delLines = await client.from('journal_entry_lines').delete().eq('journal_entry_id', entryId)
    if (delLines.error) return NextResponse.json({ error: delLines.error.message }, { status: 500 })
    const delEntry = await client.from('journal_entries').delete().eq('company_id', companyId).eq('id', entryId)
    if (delEntry.error) return NextResponse.json({ error: delEntry.error.message }, { status: 500 })
    try { await (admin || ssr).from('audit_logs').insert({ action: 'payroll_payment_deleted', company_id: companyId, user_id: user.id, details: { entryId } }) } catch {}
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown_error' }, { status: 500 })
  }
}