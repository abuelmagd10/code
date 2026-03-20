/**
 * ⚡ API v2 Analytics — Purchase Orders Summary
 * Source: mv_purchase_orders_summary (Materialized View — refreshed every 10 min)
 *
 * GET /api/v2/analytics/purchase-orders
 * Query: dateFrom, dateTo, branchId, status
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
    const statusFilter = searchParams.get('status') || ''

    const role = governance.role?.trim().toLowerCase().replace(/\s+/g, '_') || ''
    const isPrivileged = ['owner', 'admin', 'general_manager', 'gm', 'superadmin', 'super_admin'].includes(role)

    let query = supabase
      .from('mv_purchase_orders_summary')
      .select('day, status, total_orders, total_amount, approved_amount, pending_amount')
      .eq('company_id', governance.companyId)

    if (isPrivileged && branchId) {
      query = query.eq('branch_id', branchId)
    } else if (!isPrivileged && governance.branchIds.length > 0) {
      query = query.in('branch_id', governance.branchIds)
    }

    if (statusFilter) query = query.eq('status', statusFilter)
    if (dateFrom) query = query.gte('day', dateFrom)
    if (dateTo) query = query.lte('day', dateTo)

    query = query.order('day', { ascending: false })

    const { data: rows, error } = await query

    if (error) {
      console.error('[Analytics /purchase-orders] Query error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const summary = {
      total_orders: 0,
      total_amount: 0,
      approved_amount: 0,
      pending_amount: 0,
    }
    const byStatus: Record<string, { count: number; amount: number }> = {}
    const timeSeriesMap: Record<string, { day: string; total_orders: number; total_amount: number }> = {}

    for (const row of rows || []) {
      summary.total_orders += Number(row.total_orders || 0)
      summary.total_amount += Number(row.total_amount || 0)
      summary.approved_amount += Number(row.approved_amount || 0)
      summary.pending_amount += Number(row.pending_amount || 0)

      if (!byStatus[row.status]) byStatus[row.status] = { count: 0, amount: 0 }
      byStatus[row.status].count += Number(row.total_orders || 0)
      byStatus[row.status].amount += Number(row.total_amount || 0)

      const dayKey = row.day as string
      if (!timeSeriesMap[dayKey]) timeSeriesMap[dayKey] = { day: dayKey, total_orders: 0, total_amount: 0 }
      timeSeriesMap[dayKey].total_orders += Number(row.total_orders || 0)
      timeSeriesMap[dayKey].total_amount += Number(row.total_amount || 0)
    }

    const timeSeries = Object.values(timeSeriesMap).sort((a, b) => a.day.localeCompare(b.day))

    return NextResponse.json({
      success: true,
      data: { summary, byStatus, timeSeries },
      meta: {
        refreshedFrom: 'materialized_view',
        viewName: 'mv_purchase_orders_summary',
        dateRange: { from: dateFrom, to: dateTo },
        role,
        isPrivileged,
      }
    })

  } catch (error: any) {
    console.error('[Analytics /purchase-orders] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.message?.includes('Unauthorized') ? 401 : 500 }
    )
  }
}
