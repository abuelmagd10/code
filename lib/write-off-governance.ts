/**
 * 🧾 Stock Depreciation Governance Rules
 * منع إهلاك المخزون بدون رصيد فعلي
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface WriteOffItemValidation {
  product_id: string
  product_name?: string
  product_sku?: string
  quantity: number
  warehouse_id: string | null
  branch_id: string | null
  cost_center_id: string | null
}

export interface WriteOffValidationResult {
  isValid: boolean
  errors: Array<{
    product_id: string
    product_name: string
    product_sku?: string
    available_quantity: number
    required_quantity: number
    message: string
  }>
}

/**
 * حساب الرصيد المتاح للمنتج في مخزن معين
 * @param supabase - Supabase client
 * @param companyId - معرف الشركة
 * @param branchId - معرف الفرع
 * @param warehouseId - معرف المخزن
 * @param costCenterId - معرف مركز التكلفة
 * @param productId - معرف المنتج
 * @returns الرصيد المتاح (integer)
 */
export async function getAvailableInventoryQuantity(
  supabase: SupabaseClient,
  companyId: string,
  branchId: string | null,
  warehouseId: string | null,
  costCenterId: string | null,
  productId: string
): Promise<number> {
  try {
    // استخدام RPC function من قاعدة البيانات
    const { data, error } = await supabase.rpc("get_available_inventory_quantity", {
      p_company_id: companyId,
      p_branch_id: branchId,
      p_warehouse_id: warehouseId,
      p_cost_center_id: costCenterId,
      p_product_id: productId,
    })

    if (error) {
      console.error("Error getting available inventory quantity:", error)
      // Fallback: حساب مباشر من inventory_transactions
      return await calculateAvailableQuantityFallback(
        supabase,
        companyId,
        branchId,
        warehouseId,
        costCenterId,
        productId
      )
    }

    return data || 0
  } catch (error) {
    console.error("Error in getAvailableInventoryQuantity:", error)
    return 0
  }
}

/**
 * Fallback: حساب الرصيد مباشرة من inventory_transactions
 */
async function calculateAvailableQuantityFallback(
  supabase: SupabaseClient,
  companyId: string,
  branchId: string | null,
  warehouseId: string | null,
  costCenterId: string | null,
  productId: string
): Promise<number> {
  try {
    let query = supabase
      .from("inventory_transactions")
      .select("quantity_change")
      .eq("company_id", companyId)
      .eq("product_id", productId)
      .or("is_deleted.is.null,is_deleted.eq.false")

    // فلترة حسب branch_id
    if (branchId) {
      query = query.eq("branch_id", branchId)
    }

    // فلترة حسب warehouse_id
    if (warehouseId) {
      query = query.eq("warehouse_id", warehouseId)
    }

    // فلترة حسب cost_center_id
    if (costCenterId) {
      query = query.eq("cost_center_id", costCenterId)
    }

    const { data, error } = await query

    if (error) {
      console.error("Error calculating available quantity:", error)
      return 0
    }

    const totalQuantity = (data || []).reduce(
      (sum: number, tx: any) => sum + Number(tx.quantity_change || 0),
      0
    )

    return Math.max(0, totalQuantity) // لا نرجع قيم سالبة
  } catch (error) {
    console.error("Error in calculateAvailableQuantityFallback:", error)
    return 0
  }
}

/**
 * 🧾 Governance Rule: التحقق من صحة عملية الإهلاك
 * @param supabase - Supabase client
 * @param companyId - معرف الشركة
 * @param items - قائمة العناصر المراد إهلاكها
 * @param warehouseId - معرف المخزن
 * @param branchId - معرف الفرع (اختياري، يتم جلبه من warehouse إذا لم يكن موجوداً)
 * @param costCenterId - معرف مركز التكلفة (اختياري)
 * @returns نتيجة التحقق
 */
export async function validateWriteOffItems(
  supabase: SupabaseClient,
  companyId: string,
  items: WriteOffItemValidation[],
  warehouseId: string | null,
  branchId: string | null = null,
  costCenterId: string | null = null
): Promise<WriteOffValidationResult> {
  const errors: WriteOffValidationResult["errors"] = []

  // إذا لم يكن branchId محدداً و warehouseId موجود، نجلب branch_id من warehouse
  let finalBranchId = branchId
  if (!finalBranchId && warehouseId) {
    const { data: warehouse } = await supabase
      .from("warehouses")
      .select("branch_id")
      .eq("id", warehouseId)
      .single()
    
    if (warehouse?.branch_id) {
      finalBranchId = warehouse.branch_id
    }
  }

  // التحقق من كل عنصر
  for (const item of items) {
    if (!item.product_id || item.quantity <= 0) continue

    // حساب الرصيد المتاح
    const availableQuantity = await getAvailableInventoryQuantity(
      supabase,
      companyId,
      finalBranchId,
      item.warehouse_id || warehouseId,
      item.cost_center_id || costCenterId,
      item.product_id
    )

    // 🧾 Governance Rule: منع الإهلاك إذا الرصيد <= 0 أو < الكمية المطلوبة
    if (availableQuantity <= 0) {
      errors.push({
        product_id: item.product_id,
        product_name: item.product_name || "منتج غير معروف",
        product_sku: item.product_sku,
        available_quantity: 0,
        required_quantity: item.quantity,
        message: `الرصيد المتاح غير كافٍ: الرصيد المتاح = 0، المطلوب = ${item.quantity} (warehouse_id: ${item.warehouse_id || warehouseId || "غير محدد"})`
      })
    } else if (availableQuantity < item.quantity) {
      errors.push({
        product_id: item.product_id,
        product_name: item.product_name || "منتج غير معروف",
        product_sku: item.product_sku,
        available_quantity: availableQuantity,
        required_quantity: item.quantity,
        message: `الرصيد المتاح غير كافٍ: الرصيد المتاح = ${availableQuantity}، المطلوب = ${item.quantity} (warehouse_id: ${item.warehouse_id || warehouseId || "غير محدد"})`
      })
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}
