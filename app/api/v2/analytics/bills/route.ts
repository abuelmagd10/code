/**
 * ⚡ API v2 Analytics — Bills Summary
 * Source: mv_bills_summary (Materialized View — refreshed every 5 min)
 *
 * GET /api/v2/analytics/bills
 * Query: dateFrom, dateTo, branchId, groupBy=day|month
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     summary: { total_bills, total_amount, paid_amount, outstanding_amount },
 *     byStatus: { [status]: { count, amount } },
 *     timeSeries: [{ day, total_bills, total_amount, paid_amount, outstanding_amount }]
 *   },
 *   meta: { refreshedFrom: 'materialized_view', dateRange, ... }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceGovernance } from '@/lib/governance-middleware'

export async function GET(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''
    const branchId = searchParams.get('branchId') || ''

    const role = governance.role?.trim().toLowerCase().replace(/\s+/g, '_') || ''
    const isPrivileged = ['owner', 'admin', 'general_manager', 'gm', 'superadmin', 'super_admin'].includes(role)

    // ─── Query المجمّعة من mv_bills_summary ──────────────────────
    let query = supabase
      .from('mv_bills_summary')
      .select('day, status, total_bills, total_amount, paid_amount, outstanding_amount')
      .eq('company_id', governance.companyId)

    // Governance: فلترة الفرع
    if (isPrivileged && branchId) {
      query = query.eq('branch_id', branchId)
    } else if (!isPrivileged && governance.branchIds.length > 0) {
      query = query.in('branch_id', governance.branchIds)
    }

    // Date range filter
    if (dateFrom) query = query.gte('day', dateFrom)
    if (dateTo) query = query.lte('day', dateTo)

    query = query.order('day', { ascending: false })

    const { data: rows, error } = await query

    if (error) {
      console.error('[Analytics /bills] Query error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    // ─── Aggregate in API layer (rows are already pre-aggregated) ──
    const summary = {
      total_bills: 0,
      total_amount: 0,
      paid_amount: 0,
      outstanding_amount: 0,
    }

    const byStatus: Record<string, { count: number; amount: number }> = {}
    const timeSeriesMap: Record<string, { day: string; total_bills: number; total_amount: number; paid_amount: number; outstanding_amount: number }> = {}

    for (const row of rows || []) {
      summary.total_bills += Number(row.total_bills || 0)
      summary.total_amount += Number(row.total_amount || 0)
      summary.paid_amount += Number(row.paid_amount || 0)
      summary.outstanding_amount += Number(row.outstanding_amount || 0)

      // By status aggregation
      if (!byStatus[row.status]) byStatus[row.status] = { count: 0, amount: 0 }
      byStatus[row.status].count += Number(row.total_bills || 0)
      byStatus[row.status].amount += Number(row.total_amount || 0)

      // Time series (already grouped by day)
      const dayKey = row.day as string
      if (!timeSeriesMap[dayKey]) {
        timeSeriesMap[dayKey] = { day: dayKey, total_bills: 0, total_amount: 0, paid_amount: 0, outstanding_amount: 0 }
      }
      timeSeriesMap[dayKey].total_bills += Number(row.total_bills || 0)
      timeSeriesMap[dayKey].total_amount += Number(row.total_amount || 0)
      timeSeriesMap[dayKey].paid_amount += Number(row.paid_amount || 0)
      timeSeriesMap[dayKey].outstanding_amount += Number(row.outstanding_amount || 0)
    }

    const timeSeries = Object.values(timeSeriesMap).sort((a, b) => a.day.localeCompare(b.day))

    return NextResponse.json({
      success: true,
      data: { summary, byStatus, timeSeries },
      meta: {
        refreshedFrom: 'materialized_view',
        viewName: 'mv_bills_summary',
        dateRange: { from: dateFrom, to: dateTo },
        role,
        isPrivileged,
      }
    })

  } catch (error: any) {
    console.error('[Analytics /bills] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.message?.includes('Unauthorized') ? 401 : 500 }
    )
  }
}
