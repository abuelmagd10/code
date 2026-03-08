import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { apiGuard, asyncAuditLog, ErrorHandler, ERPError } from "@/lib/core"

export async function POST(req: Request) {
  try {
    const { context, errorResponse } = await apiGuard(req, {
      requireAuth: true,
      requireCompany: true,
      resource: "products",
      action: "write"
    })

    if (errorResponse) return errorResponse

    const { user, companyId, member } = context!
    const body = await req.json()
    const supabase = await createClient()

    // 1️⃣ Permissions Scope Evaluation
    const isCompanyLevelAdmin = ["owner", "admin", "manager"].includes(member.role)
    const isNormalRole = !isCompanyLevelAdmin

    // 2️⃣ Enforce role constraints
    let finalBranchId = body.branch_id || null
    let finalCostCenterId = body.cost_center_id || null
    let finalWarehouseId = body.item_type === 'service' ? null : (body.warehouse_id || null)

    if (isNormalRole) {
      finalBranchId = member.branch_id || finalBranchId
      finalCostCenterId = member.cost_center_id || finalCostCenterId
      if (body.item_type === 'product') {
        finalWarehouseId = member.warehouse_id || finalWarehouseId
      } else {
        finalWarehouseId = null
      }
    }

    // 3️⃣ Call Atomic RPC (handles defaults and constraints at the DB layer)
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_product_atomic', {
      p_company_id: companyId,
      p_sku: body.sku,
      p_name: body.name,
      p_description: body.description || null,
      p_unit_price: body.unit_price || 0,
      p_cost_price: body.cost_price || 0,
      p_unit: body.unit || 'piece',
      p_quantity_on_hand: body.quantity_on_hand || 0,
      p_reorder_level: body.reorder_level || 0,
      p_item_type: body.item_type || 'product',
      p_income_account_id: body.income_account_id || null,
      p_expense_account_id: body.expense_account_id || null,
      p_tax_code_id: body.tax_code_id || null,
      p_branch_id: finalBranchId,
      p_warehouse_id: finalWarehouseId,
      p_cost_center_id: finalCostCenterId
    })

    if (rpcError || !rpcResult?.success) {
      console.error("RPC Error:", rpcError)
      return ErrorHandler.handle(new ERPError('ERR_SYSTEM', 'فشل في إنشاء المنتج', 500, rpcError?.message || 'Unknown RPC error'))
    }

    // 4️⃣ Async Audit Logging (Fire and Forget)
    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email,
      action: 'CREATE',
      table: 'products',
      recordId: rpcResult.product_id,
      recordIdentifier: body.sku,
      newData: {
        name: body.name,
        item_type: body.item_type,
        branch_id: finalBranchId,
        warehouse_id: rpcResult.final_warehouse_id,
        cost_center_id: rpcResult.final_cost_center_id
      },
      reason: 'Created product via atomic RPC'
    })

    return NextResponse.json({
      success: true,
      data: {
        id: rpcResult.product_id,
        ...body,
        branch_id: finalBranchId,
        warehouse_id: rpcResult.final_warehouse_id,
        cost_center_id: rpcResult.final_cost_center_id
      }
    })

  } catch (error: any) {
    return ErrorHandler.handle(error)
  }
}
