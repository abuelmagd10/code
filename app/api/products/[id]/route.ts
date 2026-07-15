import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { apiGuard, asyncAuditLog, ErrorHandler, ERPError } from "@/lib/core"
import { resolveProductClassification } from "@/lib/product-type"
import {
  getDefaultProductAccountingAccounts,
  validateProductAccountingSelection,
} from "@/lib/product-accounting"

// PUT - Update existing product
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const { context, errorResponse } = await apiGuard(req, {
      requireAuth: true,
      requireCompany: true,
      resource: "products",
      action: "write"
    })

    if (errorResponse) return errorResponse

    const { user, companyId, member } = context!
    if (!id) {
      return ErrorHandler.handle(ErrorHandler.validation('معرف المنتج مطلوب'))
    }

    const body = await req.json()
    const supabase = await createClient()

    const { data: existingProduct, error: existingError } = await supabase
      .from("products")
      .select("id, sku, item_type, product_type, income_account_id, expense_account_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (existingError) {
      return ErrorHandler.handle(new ERPError('ERR_SYSTEM', 'تعذر تحميل المنتج الحالي', 500, existingError.message))
    }

    if (!existingProduct) {
      return ErrorHandler.handle(ErrorHandler.validation('المنتج غير موجود أو لا تملك الصلاحية لتعديله'))
    }

    let classification
    try {
      classification = resolveProductClassification({
        itemType: body.item_type ?? existingProduct.item_type,
        productType: body.product_type,
        existingProductType: existingProduct.product_type,
      })
    } catch (error: any) {
      return ErrorHandler.handle(ErrorHandler.validation(error?.message || "تصنيف المنتج غير صالح"))
    }

    // 1️⃣ Permissions Scope Evaluation
    // (Actual permission 'products:write' was already checked above by apiGuard)
    // Here we define the scope for company-wide assignment vs restricted branch assignment
    const isCompanyLevelAdmin = ["owner", "admin", "manager"].includes(member.role)
    const isNormalRole = !isCompanyLevelAdmin

    // 🔐 فرض القيود على الأدوار العادية
    let finalBranchId = body.branch_id || null
    let finalCostCenterId = body.cost_center_id || null
    let finalWarehouseId = classification.itemType === 'service' ? null : (body.warehouse_id || null)

    if (isNormalRole) {
      // 🔐 للأدوار العادية: لا يمكنهم اختيار فرع غير فرعهم
      finalBranchId = member.branch_id || finalBranchId

      // 🔐 بالنسبة للمستودع: 
      if (classification.itemType === 'product') {
        finalWarehouseId = member.warehouse_id || finalWarehouseId
      } else {
        finalWarehouseId = null
      }

      // 🔐 بالنسبة لمركز التكلفة:
      finalCostCenterId = member.cost_center_id || finalCostCenterId
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
    // v3.74.654 — multi-company safety + normal-role authority (see POST route).
    // Only trust an account id that belongs to THIS company's active accounts; a
    // multi-company user may submit an id from another company. Normal roles always
    // get the server-resolved default (auto accounting, unchangeable).
    const validAccountIds = new Set((accountingAccounts || []).map((a: any) => a.id))
    const requestedIncomeRaw =
      body.income_account_id !== undefined ? (body.income_account_id || null) : (existingProduct.income_account_id || null)
    const requestedExpenseRaw =
      body.expense_account_id !== undefined ? (body.expense_account_id || null) : (existingProduct.expense_account_id || null)
    const requestedIncomeAccountId  = (!isNormalRole && requestedIncomeRaw  && validAccountIds.has(requestedIncomeRaw))  ? requestedIncomeRaw  : null
    const requestedExpenseAccountId = (!isNormalRole && requestedExpenseRaw && validAccountIds.has(requestedExpenseRaw)) ? requestedExpenseRaw : null
    const finalIncomeAccountId = requestedIncomeAccountId || accountingDefaults.incomeId || null
    const finalExpenseAccountId = requestedExpenseAccountId || accountingDefaults.expenseId || null
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

    // Prepare data with enforced values
    const productData = {
      ...body,
      income_account_id: finalIncomeAccountId,
      expense_account_id: finalExpenseAccountId,
      branch_id: finalBranchId,
      cost_center_id: finalCostCenterId,
      warehouse_id: finalWarehouseId,
      item_type: classification.itemType,
      product_type: classification.productType,
      // For services, ensure warehouse_id is null
      ...(classification.itemType === 'service' && { warehouse_id: null }),
      // v3.74.580: مدة الصلاحية (يوم) — أعداد صحيحة موجبة فقط، وإلا null (للخدمات دائماً null)
      ...(body.shelf_life_days !== undefined && {
        shelf_life_days:
          classification.itemType === 'service'
            ? null
            : (Number.isFinite(Number(body.shelf_life_days)) && Number(body.shelf_life_days) > 0
              ? Math.round(Number(body.shelf_life_days))
              : null),
      }),
      // v3.74.586: عدد العبوات فى الكرتونة — أعداد صحيحة موجبة فقط، وإلا null (للخدمات دائماً null)
      ...(body.units_per_carton !== undefined && {
        units_per_carton:
          classification.itemType === 'service'
            ? null
            : (Number.isFinite(Number(body.units_per_carton)) && Number(body.units_per_carton) > 0
              ? Math.round(Number(body.units_per_carton))
              : null),
      }),
    }

    const { data, error: dbError } = await supabase
      .from("products")
      .update(productData)
      .eq("id", id)
      .eq("company_id", companyId)
      .select()
      .single()

    if (dbError) {
      console.error("Error updating product:", dbError)
      return ErrorHandler.handle(new ERPError('ERR_SYSTEM', 'خطأ في تحديث المنتج', 500, dbError.message))
    }

    // 5️⃣ Async Audit Logging (Fire and Forget)
    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email,
      action: 'UPDATE',
      table: 'products',
      recordId: data.id,
      recordIdentifier: data.sku,
      newData: {
        name: data.name,
        unit_price: data.unit_price,
        branch_id: data.branch_id,
        item_type: data.item_type,
        product_type: data.product_type,
        income_account_id: data.income_account_id,
        expense_account_id: data.expense_account_id
      },
      reason: 'Updated product/service details'
    })

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    return ErrorHandler.handle(error)
  }
}
