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
    // استخدام RPC function من قاعدة البيانات (إذا كانت موجودة)
    console.log(`[getAvailableInventoryQuantity] Calling RPC with: companyId=${companyId}, branchId=${branchId}, warehouseId=${warehouseId}, productId=${productId}`)
    const { data, error } = await supabase.rpc("get_available_inventory_quantity", {
      p_company_id: companyId,
      p_branch_id: branchId,
      p_warehouse_id: warehouseId,
      p_cost_center_id: costCenterId,
      p_product_id: productId,
    })
    console.log(`[getAvailableInventoryQuantity] RPC response: data=${data}, error=${error?.message || 'none'}`)

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

    // إذا كانت النتيجة null أو undefined، استخدم fallback
    if (data === null || data === undefined) {
      console.log(`[getAvailableInventoryQuantity] RPC returned ${data}, using fallback calculation for product ${productId}, warehouse ${warehouseId}, branch ${branchId}`)
      const fallbackResult = await calculateAvailableQuantityFallback(
        supabase,
        companyId,
        branchId,
        warehouseId,
        costCenterId,
        productId
      )
      console.log(`[getAvailableInventoryQuantity] Fallback calculation returned: ${fallbackResult}`)
      return fallbackResult
    }

    // إذا كانت النتيجة 0، استخدم fallback للتحقق من quantity_on_hand
    // لأن الـ RPC function قد ترجع 0 إذا لم توجد transactions، حتى لو كان هناك quantity_on_hand
    if (data === 0) {
      console.log(`[getAvailableInventoryQuantity] RPC returned 0, checking fallback for product ${productId}, warehouse ${warehouseId}, branch ${branchId}`)
      const fallbackResult = await calculateAvailableQuantityFallback(
        supabase,
        companyId,
        branchId,
        warehouseId,
        costCenterId,
        productId
      )
      console.log(`[getAvailableInventoryQuantity] Fallback calculation returned: ${fallbackResult}`)
      // إذا كان fallback > 0، استخدمه. وإلا، استخدم 0 من RPC
      return fallbackResult > 0 ? fallbackResult : 0
    }

    console.log(`[getAvailableInventoryQuantity] RPC returned: ${data}`)
    return data
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
 * يحاول أولاً البحث بالمعايير الكاملة، وإذا لم يجد نتائج يحاول بمعايير أقل صرامة
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
    // المحاولة 1: البحث بالمعايير الكاملة
    let query = supabase
      .from("inventory_transactions")
      .select("quantity_change")
      .eq("company_id", companyId)
      .eq("product_id", productId)
      .or("is_deleted.is.null,is_deleted.eq.false")

    // إضافة الفلاتر الاختيارية فقط إذا كانت موجودة
    if (warehouseId) {
      query = query.eq("warehouse_id", warehouseId)
    }
    if (branchId) {
      query = query.eq("branch_id", branchId)
    }
    if (costCenterId) {
      query = query.eq("cost_center_id", costCenterId)
    }

    const { data, error } = await query

    if (error) {
      console.error("Error calculating available quantity:", error)
      return 0
    }

    // إذا وجدت transactions، احسب المجموع
    if (data && data.length > 0) {
      const totalQuantity = data.reduce(
        (sum: number, tx: any) => sum + Number(tx.quantity_change || 0),
        0
      )
      return Math.max(0, totalQuantity)
    }

    // المحاولة 2: البحث بـ warehouse_id فقط (بدون branch_id و cost_center_id)
    if (warehouseId && (branchId || costCenterId)) {
      const { data: data2, error: error2 } = await supabase
        .from("inventory_transactions")
        .select("quantity_change")
        .eq("company_id", companyId)
        .eq("product_id", productId)
        .eq("warehouse_id", warehouseId)
        .or("is_deleted.is.null,is_deleted.eq.false")

      if (!error2 && data2 && data2.length > 0) {
        const totalQuantity = data2.reduce(
          (sum: number, tx: any) => sum + Number(tx.quantity_change || 0),
          0
        )
        return Math.max(0, totalQuantity)
      }
    }

    // المحاولة 3: البحث بـ company_id و product_id فقط
    const { data: data3, error: error3 } = await supabase
      .from("inventory_transactions")
      .select("quantity_change")
      .eq("company_id", companyId)
      .eq("product_id", productId)
      .or("is_deleted.is.null,is_deleted.eq.false")

    if (!error3 && data3 && data3.length > 0) {
      const totalQuantity = data3.reduce(
        (sum: number, tx: any) => sum + Number(tx.quantity_change || 0),
        0
      )
      return Math.max(0, totalQuantity)
    }

    // لا توجد transactions - استخدم quantity_on_hand من المنتج كـ fallback
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("quantity_on_hand")
      .eq("id", productId)
      .eq("company_id", companyId)
      .single()

    if (!productError && product) {
      const qty = Math.max(0, Number(product.quantity_on_hand || 0))
      console.log(`[calculateAvailableQuantityFallback] Using quantity_on_hand from product: ${qty}`)
      return qty
    }

    console.log(`[calculateAvailableQuantityFallback] No product found or error: ${productError?.message || 'unknown'}`)
    return 0
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
  branchId: string | null,
  costCenterId: string | null
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
        available_quantity: availableQuantity,
        required_quantity: item.quantity,
        message: `الرصيد المتاح غير كافٍ: الرصيد المتاح = ${availableQuantity}، المطلوب = ${item.quantity} (warehouse_id: ${item.warehouse_id || warehouseId || "غير محدد"})`
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
