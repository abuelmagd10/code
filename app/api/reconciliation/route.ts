import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

/**
 * Phase 5: Daily Reconciliation API
 * GET  /api/reconciliation           → جلب آخر نتائج التسوية
 * POST /api/reconciliation           → تشغيل التسوية الآن
 * POST /api/reconciliation?snapshot  → إنشاء Audit Snapshot
 * POST /api/reconciliation?fifo      → تشغيل FIFO Backfill
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) return NextResponse.json({ error: "Company context missing" }, { status: 400 })

    const { data, error } = await supabase.rpc('get_reconciliation_status', {
      p_company_id: companyId
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) return NextResponse.json({ error: "Company context missing" }, { status: 400 })

    const url = new URL(request.url)
    const mode = url.searchParams.get('mode') // 'run','snapshot','fifo','fifo_consume'

    // ── Mode: Run Daily Reconciliation ──
    if (!mode || mode === 'run') {
      const { data, error } = await supabase.rpc('run_daily_reconciliation', {
        p_company_id: companyId
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const results = Array.isArray(data) ? data : []
      const criticalFails = results.filter((r: any) => r.severity === 'critical' && !r.is_ok).length
      const warningFails  = results.filter((r: any) => r.severity === 'warning'  && !r.is_ok).length

      return NextResponse.json({
        success: true,
        is_healthy: criticalFails === 0,
        critical_failures: criticalFails,
        warning_failures: warningFails,
        checks: results,
        run_at: new Date().toISOString()
      })
    }

    // ── Mode: Create Monthly Audit Snapshot ──
    if (mode === 'snapshot') {
      const body = await request.json().catch(() => ({}))
      const snapshotDate = body.snapshot_date || new Date().toISOString().split('T')[0]

      const { data, error } = await supabase.rpc('create_monthly_audit_snapshot', {
        p_company_id:   companyId,
        p_snapshot_date: snapshotDate,
        p_created_by:   user.id
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({ success: true, snapshot_id: data, snapshot_date: snapshotDate })
    }

    // ── Mode: Backfill FIFO lots from bills ──
    if (mode === 'fifo') {
      const { data, error } = await supabase.rpc('backfill_fifo_lots_from_bills', {
        p_company_id: companyId
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const lots = Array.isArray(data) ? data : []
      const created = lots.filter((l: any) => l.status === 'created').length
      const existing = lots.filter((l: any) => l.status === 'already_exists').length

      return NextResponse.json({
        success: true,
        message: `FIFO Backfill: ${created} lots created, ${existing} already existed`,
        lots_created: created,
        lots_existing: existing,
        details: lots
      })
    }

    // ── Mode: Apply FIFO consumption from invoices ──
    if (mode === 'fifo_consume') {
      const { data, error } = await supabase.rpc('apply_fifo_consumption_from_invoices', {
        p_company_id: companyId
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({
        success: true,
        message: 'FIFO consumption applied from existing invoices',
        details: data
      })
    }

    // ── Mode: Apply purchase returns to FIFO ──
    if (mode === 'fifo_returns') {
      const { data, error } = await supabase.rpc('apply_purchase_returns_to_fifo', {
        p_company_id: companyId
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({ success: true, message: 'Purchase returns applied to FIFO', details: data })
    }

    // ── Mode: Full FIFO + Reconciliation sequence ──
    if (mode === 'full_repair') {
      const results: any = {}

      // 1. Backfill FIFO lots
      const { data: lots, error: lotsErr } = await supabase.rpc('backfill_fifo_lots_from_bills', { p_company_id: companyId })
      if (lotsErr) return NextResponse.json({ error: `FIFO lots: ${lotsErr.message}` }, { status: 500 })
      results.fifo_lots = { created: (lots || []).filter((l: any) => l.status === 'created').length }

      // 2. Consume from FIFO for invoices
      const { data: consumed, error: consumeErr } = await supabase.rpc('apply_fifo_consumption_from_invoices', { p_company_id: companyId })
      if (consumeErr) return NextResponse.json({ error: `FIFO consume: ${consumeErr.message}` }, { status: 500 })
      results.fifo_consumed = { items: (consumed || []).length }

      // 3. Purchase returns
      const { data: returns, error: retErr } = await supabase.rpc('apply_purchase_returns_to_fifo', { p_company_id: companyId })
      if (retErr) return NextResponse.json({ error: `FIFO returns: ${retErr.message}` }, { status: 500 })
      results.fifo_returns = { items: (returns || []).length }

      // 4. Run reconciliation
      const { data: recon, error: reconErr } = await supabase.rpc('run_daily_reconciliation', { p_company_id: companyId })
      if (reconErr) return NextResponse.json({ error: `Reconciliation: ${reconErr.message}` }, { status: 500 })
      const reconChecks = Array.isArray(recon) ? recon : []
      results.reconciliation = {
        checks: reconChecks,
        is_healthy: reconChecks.filter((r: any) => r.severity === 'critical' && !r.is_ok).length === 0
      }

      return NextResponse.json({ success: true, results, run_at: new Date().toISOString() })
    }

    return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
