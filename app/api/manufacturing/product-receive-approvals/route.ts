/**
 * GET /api/manufacturing/product-receive-approvals
 * قائمة طلبات اعتماد استلام المنتج النهائي — لمسؤولي المخزن
 */
import { NextRequest, NextResponse } from "next/server"
import {
  applyProductReceiveApprovalScope,
  getProductReceiveApprovalApiContext,
  handleManufacturingApiError,
} from "@/lib/manufacturing/product-receive-approval-api"

export async function GET(request: NextRequest) {
  try {
    const { admin, companyId, member } = await getProductReceiveApprovalApiContext(request)
    const { searchParams } = new URL(request.url)

    const status = searchParams.get("status") || "pending"
    const warehouseId = searchParams.get("warehouse_id")
    const branchId = searchParams.get("branch_id")

    let query = admin
      .from("manufacturing_product_receive_approvals")
      .select(`
        id,
        status,
        proposed_quantity,
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
          completed_quantity,
          order_uom,
          receipt_warehouse_id,
          issue_warehouse_id,
          branch_id,
          product:products ( id, name, sku )
        ),
        warehouse:warehouses ( id, name ),
        branch:branches ( id, name )
      `)
      .eq("company_id", companyId)
      .order("requested_at", { ascending: false })

    if (status !== "all") {
      const statuses = status.split(",").map((value) => value.trim()).filter(Boolean)
      if (statuses.length === 1) {
        query = query.eq("status", statuses[0])
      } else if (statuses.length > 1) {
        query = query.in("status", statuses)
      }
    }

    query = applyProductReceiveApprovalScope(query, member, { branchId, warehouseId })

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
