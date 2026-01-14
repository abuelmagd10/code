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
  branchId: string,
  warehouseId: string,
  costCenterId: string,
  productId: string
): Promise<number> {
  try {
    // استخدام RPC function من قاعدة البيانات (إذا كانت موجودة)
    const { data, error } = await supabase.rpc("get_available_inventory_quantity", {
      p_company_id: companyId,
      p_branch_id: branchId,
      p_warehouse_id: warehouseId,
      p_cost_center_id: costCenterId,
      p_product_id: productId,
    })

    // إذا كانت الدالة غير موجودة (404) أو حدث خطأ، استخدم fallback
    if (error) {
      // 404 أو 42883 يعني أن الدالة غير موجودة
      if (error.code === "42883" || error.code === "P0001" || error.message?.includes("does not exist") || error.message?.includes("404")) {
        console.warn("RPC function 'get_available_inventory_quantity' not found, using fallback calculation. Please run the SQL script: scripts/042_write_off_governance_validation.sql")
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
      console.error("Error getting available inventory quantity:", error)
      // Fallback في حالة أخطاء أخرى
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
  } catch (error: any) {
    console.error("Error in getAvailableInventoryQuantity:", error)
    // Fallback في حالة exceptions
    if (error?.code === "42883" || error?.message?.includes("does not exist") || error?.message?.includes("404")) {
      return await calculateAvailableQuantityFallback(
        supabase,
        companyId,
        branchId,
        warehouseId,
        costCenterId,
        productId
      )
    }
    return 0
  }
}

/**
 * Fallback: حساب الرصيد مباشرة من inventory_transactions
 */
async function calculateAvailableQuantityFallback(
  supabase: SupabaseClient,
  companyId: string,
  branchId: string,
  warehouseId: string,
  costCenterId: string,
  productId: string
): Promise<number> {
  try {
    const query = supabase
      .from("inventory_transactions")
      .select("quantity_change")
      .eq("company_id", companyId)
      .eq("branch_id", branchId)
      .eq("warehouse_id", warehouseId)
      .eq("cost_center_id", costCenterId)
      .eq("product_id", productId)
      .or("is_deleted.is.null,is_deleted.eq.false")

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
  warehouseId: string,
  branchId: string,
  costCenterId: string
): Promise<WriteOffValidationResult> {
  const errors: WriteOffValidationResult["errors"] = []

  // التحقق من كل عنصر
  for (const item of items) {
    if (!item.product_id || item.quantity <= 0) continue

    // حساب الرصيد المتاح
    const availableQuantity = await getAvailableInventoryQuantity(
      supabase,
      companyId,
      branchId,
      warehouseId,
      costCenterId,
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
