import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/fx-revaluation-reminder
 *
 * v3.74.298 — Once-a-day cron that, on the last calendar day of each
 * month, asks every company: "do you have open foreign-currency
 * invoices or bills for this month, and did you NOT yet run the period-
 * end FX revaluation?" If both are true, drop an in-app notification
 * on the owner so the books don't close on stale FX values.
 *
 * Why a cron and not a "check on demand": the owner is the one who
 * notices the stale balance sheet, but by then it's already wrong. A
 * background reminder is cheap and accurate.
 *
 * Why ONLY on the last day of the month: an idle reminder every day
 * trains users to dismiss it. We want the message to mean "now is the
 * moment".
 *
 * Auth: Bearer ${CRON_SECRET} (Vercel cron uses this).
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron/fx-revaluation-reminder] CRON_SECRET not set')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Only do work on the last day of the month ───────────────────────────
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const isLastDayOfMonth = today.getMonth() !== tomorrow.getMonth()
  if (!isLastDayOfMonth) {
    return NextResponse.json({
      skipped: true,
      reason: 'not_last_day_of_month',
      date: today.toISOString().slice(0, 10),
    })
  }

  const supabase = createServiceClient()

  // First and last day of the current calendar month, in ISO YYYY-MM-DD
  const periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString().slice(0, 10)
  const periodEnd = today.toISOString().slice(0, 10)

  // ── Walk every company ─────────────────────────────────────────────────
  const { data: companies, error: companiesErr } = await supabase
    .from('companies')
    .select('id, name, base_currency, user_id')

  if (companiesErr) {
    console.error('[cron/fx-revaluation-reminder] companies fetch error:', companiesErr)
    return NextResponse.json({ error: companiesErr.message }, { status: 500 })
  }

  let processed = 0
  let notified = 0
  let skippedNoFx = 0
  let skippedAlreadyReval = 0
  let skippedDup = 0

  for (const company of (companies || [])) {
    processed++
    const baseCur = String(company.base_currency || 'EGP').toUpperCase()

    // Open FC invoices: not in base currency, total > paid
    const { data: openInvs } = await supabase
      .from('invoices')
      .select('id, total_amount, paid_amount, original_currency')
      .eq('company_id', company.id)
      .lte('invoice_date', periodEnd)
      .neq('original_currency', baseCur)
      .limit(500)

    const openInvoicesCount = (openInvs || [])
      .filter((r: any) => Number(r.total_amount || 0) > Number(r.paid_amount || 0))
      .length

    // Open FC bills: same logic
    const { data: openBills } = await supabase
      .from('bills')
      .select('id, total_amount, paid_amount, original_currency')
      .eq('company_id', company.id)
      .lte('bill_date', periodEnd)
      .neq('original_currency', baseCur)
      .limit(500)

    const openBillsCount = (openBills || [])
      .filter((r: any) => Number(r.total_amount || 0) > Number(r.paid_amount || 0))
      .length

    const totalOpenFx = openInvoicesCount + openBillsCount
    if (totalOpenFx === 0) {
      skippedNoFx++
      continue
    }

    // Was a revaluation already booked for this period?
    const { count: revalCount } = await supabase
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('reference_type', 'fx_period_end_revaluation')
      .gte('entry_date', periodStart)
      .lte('entry_date', periodEnd)

    if ((revalCount ?? 0) > 0) {
      skippedAlreadyReval++
      continue
    }

    // Don't spam — if we already created a reminder this month, skip.
    const eventKey = `fx_reval_reminder:${company.id}:${periodEnd}`
    const { count: dupCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('event_key', eventKey)

    if ((dupCount ?? 0) > 0) {
      skippedDup++
      continue
    }

    // Drop the reminder.
    await supabase.from('notifications').insert({
      company_id: company.id,
      title: 'إعادة تقييم العملات الأجنبية',
      message:
        `عندك ${totalOpenFx} مستند مفتوح بعملات أجنبية (${openInvoicesCount} فاتورة عميل، ${openBillsCount} فاتورة مشتريات). ` +
        `قبل ما تقفل شهر ${periodEnd.slice(0, 7)}، شغّل إعادة التقييم من الإعدادات → إعادة تقييم العملات.`,
      priority: 'high',
      status: 'unread',
      severity: 'warning',
      category: 'accounting',
      channel: 'in_app',
      event_key: eventKey,
      assigned_to_role: 'owner',
      assigned_to_user: company.user_id,
      reference_type: 'fx_period_end_revaluation',
    })
    notified++
  }

  return NextResponse.json({
    processed,
    notified,
    skippedNoFx,
    skippedAlreadyReval,
    skippedDup,
    periodStart,
    periodEnd,
  })
}
