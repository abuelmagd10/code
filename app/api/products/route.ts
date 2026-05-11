import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { apiGuard, asyncAuditLog, ErrorHandler, ERPError } from "@/lib/core"
import { resolveProductClassification } from "@/lib/product-type"
import {
  getDefaultProductAccountingAccounts,
  validateProductAccountingSelection,
} from "@/lib/product-accounting"

export async function GET(req: Request) {
  try {
    const { context, errorResponse } = await apiGuard(req, {
      requireAuth: true,
      requireCompany: true,
    })
    if (errorResponse) return errorResponse

    const { companyId } = context!
    const url = new URL(req.url)
    const itemType = url.searchParams.get('item_type')
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 500)
    const search = url.searchParams.get('search') ?? ''

    const supabase = await createClient()

    let query = supabase
      .from('products')
      .select('id, name, item_type, is_active', { count: 'exact' })
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name')
      .limit(limit)

    if (itemType) query = query.eq('item_type', itemType)
    if (search)   query = query.ilike('name', `%${search}%`)

    const { data: products, error, count } = await query
    if (error) throw error

    return NextResponse.json({ success: true, products: products ?? [], total: count ?? 0 })
  } catch (error) {
    return ErrorHandler.handle(error)
  }
}

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

    let classification
    try {
      classification = resolveProductClassification({
        itemType: body.item_type,
        productType: body.product_type,
      })
    } catch (error: any) {
      return ErrorHandler.handle(ErrorHandler.validation(error?.message || "تصنيف المنتج غير صالح"))
    }

    // 1️⃣ Permissions Scope Evaluation
    const isCompanyLevelAdmin = ["owner", "admin", "manager"].includes(member.role)
    const isNormalRole = !isCompanyLevelAdmin

    // 2️⃣ Enforce role constraints
    let finalBranchId = body.branch_id || null
    let finalCostCenterId = body.cost_center_id || null
    let finalWarehouseId = classification.itemType === 'service' ? null : (body.warehouse_id || null)

    if (isNormalRole) {
      finalBranchId = member.branch_id || finalBranchId
      finalCostCenterId = member.cost_center_id || finalCostCenterId
      if (classification.itemType === 'product') {
        finalWarehouseId = member.warehouse_id || finalWarehouseId
      } else {
        finalWarehouseId = null
      }
    }

    const { data: accountingAccounts, error: accountingAccountsError } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type, sub_type, normal_balance, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .in('account_type', ['income', 'expense'])

    if (accountingAccountsError) {
      return ErrorHandler.handle(new ERPError('ERR_SYSTEM', 'تعذر تحميل حسابات الربط المحاسبي', 500, accountingAccountsError.message))
    }

    const accountingDefaults = getDefaultProductAccountingAccounts(
      classification.productType,
      accountingAccounts || [],
      classification.itemType
    )
    const finalIncomeAccountId = body.income_account_id || accountingDefaults.incomeId || null
    const finalExpenseAccountId = body.expense_account_id || accountingDefaults.expenseId || null
    const accountingValidation = validateProductAccountingSelection({
      itemType: classification.itemType,
      productType: classification.productType,
      incomeAccountId: finalIncomeAccountId,
      expenseAccountId: finalExpenseAccountId,
      accounts: accountingAccounts || [],
      lang: 'ar',
    })

    if (!accountingValidation.success) {
      return ErrorHandler.handle(ErrorHandler.validation(accountingValidation.errors.join(' ')))
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
      p_item_type: classification.itemType,
      p_product_type: classification.productType,
      p_income_account_id: finalIncomeAccountId,
      p_expense_account_id: finalExpenseAccountId,
      p_tax_code_id: body.tax_code_id || null,
      p_branch_id: finalBranchId,
      p_warehouse_id: finalWarehouseId,
      p_cost_center_id: finalCostCenterId
    })

    if (rpcError || !rpcResult?.success) {
      console.error("RPC Error:", rpcError)
      // ✅ Pass rpcError directly to ErrorHandler so it can map 23505 → 409, etc.
      if (rpcError) return ErrorHandler.handle(rpcError)
      return ErrorHandler.handle(new ERPError('ERR_SYSTEM', 'فشل في إنشاء المنتج', 500))
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
        item_type: classification.itemType,
        product_type: classification.productType,
        income_account_id: finalIncomeAccountId,
        expense_account_id: finalExpenseAccountId,
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
        item_type: classification.itemType,
        product_type: classification.productType,
        income_account_id: finalIncomeAccountId,
        expense_account_id: finalExpenseAccountId,
        branch_id: finalBranchId,
        warehouse_id: rpcResult.final_warehouse_id,
        cost_center_id: rpcResult.final_cost_center_id
      }
    })

  } catch (error: any) {
    return ErrorHandler.handle(error)
  }
}
