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
    // v3.74.333 — optional branch filter for "scope products to a service's
    // branch" use cases. Returns rows where branch_id = X OR branch_id IS NULL
    // (NULL = company-level product, available to all branches).
    const branchId = url.searchParams.get('branch_id')

    const supabase = await createClient()

    let query = supabase
      .from('products')
      .select('id, name, sku, unit_price, cost_price, item_type, branch_id, income_account_id, expense_account_id, is_active', { count: 'exact' })
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name')
      .limit(limit)

    if (itemType) query = query.eq('item_type', itemType)
    if (search)   query = query.ilike('name', `%${search}%`)
    if (branchId) {
      // PostgREST OR syntax — branch-bound + shared (NULL) products
      query = query.or(`branch_id.is.null,branch_id.eq.${branchId}`)
    }

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
    // v3.74.654 — multi-company safety + normal-role authority.
    // A user who belongs to several companies (same email) may have a client-side
    // accounts list from another company, so body.income_account_id can be an id
    // that doesn't exist in THIS company's chart of accounts → "income required".
    // Fix: only trust a client account id when it actually belongs to this
    // company's active accounts; otherwise the server resolves the correct default.
    // Normal (branch-scoped) roles always get the server-resolved accounts
    // (accounting linkage is auto-assigned and unchangeable for them).
    const validAccountIds = new Set((accountingAccounts || []).map((a: any) => a.id))
    const trustedIncomeId  = (!isNormalRole && body.income_account_id  && validAccountIds.has(body.income_account_id))  ? body.income_account_id  : null
    const trustedExpenseId = (!isNormalRole && body.expense_account_id && validAccountIds.has(body.expense_account_id)) ? body.expense_account_id : null
    const finalIncomeAccountId = trustedIncomeId || accountingDefaults.incomeId || null
    const finalExpenseAccountId = trustedExpenseId || accountingDefaults.expenseId || null
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

    // v3.74.496: حفظ صور الصنف (بحد أقصى 3) — الـ RPC لا يستقبلها، لذا نحدثها بعد الإنشاء
    if (Array.isArray(body.image_urls)) {
      const imageUrls = body.image_urls
        .filter((u: unknown): u is string => typeof u === 'string' && u.length > 0)
        .slice(0, 3)
      const { error: imgErr } = await supabase
        .from('products')
        .update({ image_urls: imageUrls })
        .eq('id', rpcResult.product_id)
        .eq('company_id', companyId)
      if (imgErr) console.error('Failed to save product images:', imgErr)
    }

    // v3.74.580: حفظ مدة الصلاحية (يوم) — الـ RPC لا يستقبلها، لذا نحدثها بعد الإنشاء
    // (أعداد صحيحة موجبة فقط، وإلا تبقى null — منها يُحسب expiry_date لكل دفعة FIFO تلقائياً)
    {
      const shelfRaw = Number(body.shelf_life_days)
      const shelfLifeDays = Number.isFinite(shelfRaw) && shelfRaw > 0 ? Math.round(shelfRaw) : null
      if (shelfLifeDays !== null) {
        const { error: shelfErr } = await supabase
          .from('products')
          .update({ shelf_life_days: shelfLifeDays })
          .eq('id', rpcResult.product_id)
          .eq('company_id', companyId)
        if (shelfErr) console.error('Failed to save shelf life days:', shelfErr)
      }
    }

    // v3.74.586: حفظ عدد العبوات فى الكرتونة — الـ RPC لا يستقبلها، لذا نحدثها بعد الإنشاء
    // (أعداد صحيحة موجبة فقط، وإلا تبقى null — تُستخدم لعرض الكميات بالكراتين عند الاستلام والتقارير)
    {
      const cartonRaw = Number(body.units_per_carton)
      const unitsPerCarton = Number.isFinite(cartonRaw) && cartonRaw > 0 ? Math.round(cartonRaw) : null
      if (unitsPerCarton !== null) {
        const { error: cartonErr } = await supabase
          .from('products')
          .update({ units_per_carton: unitsPerCarton })
          .eq('id', rpcResult.product_id)
          .eq('company_id', companyId)
        if (cartonErr) console.error('Failed to save units per carton:', cartonErr)
      }
    }

    // v3.74.635 — "requires withdrawal approval" flag (RPC doesn't take it).
    // Products only; when true, using it as an attached/consumed item in a
    // booking needs the branch warehouse manager to approve its release.
    if (classification.itemType !== 'service' && body.requires_withdrawal_approval === true) {
      const { error: wErr } = await supabase
        .from('products')
        .update({ requires_withdrawal_approval: true })
        .eq('id', rpcResult.product_id)
        .eq('company_id', companyId)
      if (wErr) console.error('Failed to save requires_withdrawal_approval:', wErr)
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
