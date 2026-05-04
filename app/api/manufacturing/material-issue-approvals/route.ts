/**
 * GET /api/manufacturing/material-issue-approvals
 * قائمة طلبات اعتماد صرف المواد — لمسؤولي المخزن
 * يدعم فلترة بالحالة والمستودع والفرع
 */
import { NextRequest, NextResponse } from "next/server"
import {
  getManufacturingApiContext,
  handleManufacturingApiError,
} from "@/lib/manufacturing/production-order-api"

export async function GET(request: NextRequest) {
  try {
    const { supabase, companyId } = await getManufacturingApiContext(request, "read")
    const { searchParams } = new URL(request.url)

    const status = searchParams.get("status") || "pending"
    const warehouseId = searchParams.get("warehouse_id")
    const branchId = searchParams.get("branch_id")

    let query = supabase
      .from("manufacturing_material_issue_approvals")
      .select(`
        id,
        status,
        requested_at,
        approved_at,
        rejected_at,
        rejection_reason,
        notes,
        warehouse_id,
        branch_id,
        requested_by,
        approved_by,
        rejected_by,
        production_order:manufacturing_production_orders (
          id,
          order_no,
          status,
          planned_quantity,
          order_uom,
          issue_warehouse_id,
          branch_id,
          product:products ( id, name, name_en, sku )
        ),
        warehouse:warehouses ( id, name ),
        branch:branches ( id, name )
      `)
      .eq("company_id", companyId)
      .order("requested_at", { ascending: false })

    if (status !== "all") {
      query = query.eq("status", status)
    }
    if (warehouseId) {
      query = query.eq("warehouse_id", warehouseId)
    }
    if (branchId) {
      query = query.eq("branch_id", branchId)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: data || [],
      meta: { total: (data || []).length },
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
