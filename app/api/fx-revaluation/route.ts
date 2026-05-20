/**
 * FX Period-End Revaluation API
 *
 * POST /api/fx-revaluation
 *   Body: {
 *     periodEndDate: 'YYYY-MM-DD',
 *     closingRates?: { 'USD': 31.5, 'EUR': 34.2 },
 *     dryRun?: boolean
 *   }
 *
 * Permissions: requires owner/admin/general_manager role on the active company.
 *
 * Behavior:
 *   - dryRun=true → calculates the FX impact and returns details without
 *     creating any journal entry. Use this to preview the impact.
 *   - dryRun=false → calculates AND creates a journal entry (is_approved=false,
 *     requires a separate approval step).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revaluePeriodEndFXBalances } from '@/lib/currency-service'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Active company
    const { getActiveCompanyId } = await import('@/lib/company')
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 })
    }

    // Permission check — owner / admin / general manager only
    const { data: member } = await supabase
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .maybeSingle()
    const role = String(member?.role || '').toLowerCase()
    const allowed = ['owner', 'admin', 'general_manager', 'gm', 'super_admin']
    if (!allowed.includes(role)) {
      return NextResponse.json(
        { error: 'Forbidden: requires owner/admin/general_manager role' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const periodEndDate = String(body.periodEndDate || '').trim()
    if (!periodEndDate || !/^\d{4}-\d{2}-\d{2}$/.test(periodEndDate)) {
      return NextResponse.json(
        { error: 'periodEndDate must be YYYY-MM-DD' },
        { status: 400 }
      )
    }

    const closingRates: Record<string, number> | undefined =
      body.closingRates && typeof body.closingRates === 'object'
        ? Object.fromEntries(
            Object.entries(body.closingRates)
              .map(([k, v]) => [String(k).toUpperCase(), Number(v)])
              .filter(([, v]) => Number(v) > 0)
          )
        : undefined

    const dryRun = !!body.dryRun

    const result = await revaluePeriodEndFXBalances(supabase, {
      companyId,
      periodEndDate,
      closingRates,
      userId: user.id,
      dryRun,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Revaluation failed', result },
        { status: 400 }
      )
    }

    // result already includes success: true at this point (checked above)
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('FX revaluation API error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
