/**
 * ⚡ API v2 Analytics — Inventory Snapshot
 * Source: mv_inventory_snapshot (Materialized View — refreshed every 2 min)
 *
 * GET /api/v2/analytics/inventory
 * Query: branchId, warehouseId, costCenterId
 *
 * Response:
 * {
 *   data: {
 *     summary: { total_products, total_quantity, retail_value, low_stock_count, out_of_stock_count },
 *     alerts: { low_stock: [...], out_of_stock: [...] }
 *   }
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
    const branchId = searchParams.get('branchId') || ''
    const warehouseId = searchParams.get('warehouseId') || ''
    const costCenterId = searchParams.get('costCenterId') || ''

    const role = governance.role?.trim().toLowerCase().replace(/\s+/g, '_') || ''
    const isPrivileged = ['owner', 'admin', 'general_manager', 'gm', 'superadmin', 'super_admin'].includes(role)

    let query = supabase
      .from('mv_inventory_snapshot')
      .select('product_id, current_qty, retail_value, stock_status, reorder_level')
      .eq('company_id', governance.companyId)

    // Governance filter
    if (isPrivileged) {
      if (branchId) query = query.eq('branch_id', branchId)
      if (warehouseId) query = query.eq('warehouse_id', warehouseId)
    } else {
      if (governance.branchIds.length > 0) query = query.in('branch_id', governance.branchIds)
      if (warehouseId) query = query.eq('warehouse_id', warehouseId)
      else if (governance.warehouseIds.length > 0) query = query.in('warehouse_id', governance.warehouseIds)
    }

    if (costCenterId) query = query.eq('cost_center_id', costCenterId)

    const { data: rows, error } = await query

    if (error) {
      console.error('[Analytics /inventory] Query error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Aggregate snapshot
    const summary = {
      total_products: 0,
      total_quantity: 0,
      retail_value: 0,
      low_stock_count: 0,
      out_of_stock_count: 0,
    }
    const alerts = {
      low_stock: [] as string[],
      out_of_stock: [] as string[],
    }

    for (const row of rows || []) {
      summary.total_products++
      summary.total_quantity += Math.max(0, Number(row.current_qty || 0))
      summary.retail_value += Number(row.retail_value || 0)

      if (row.stock_status === 'out_of_stock') {
        summary.out_of_stock_count++
        alerts.out_of_stock.push(row.product_id as string)
      } else if (row.stock_status === 'low_stock') {
        summary.low_stock_count++
        alerts.low_stock.push(row.product_id as string)
      }
    }

    return NextResponse.json({
      success: true,
      data: { summary, alerts },
      meta: {
        refreshedFrom: 'materialized_view',
        viewName: 'mv_inventory_snapshot',
        role,
        isPrivileged,
      }
    })

  } catch (error: any) {
    console.error('[Analytics /inventory] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.message?.includes('Unauthorized') ? 401 : 500 }
    )
  }
}
