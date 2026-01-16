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
/**
 * ✅ حساب الرصيد المتاح للمنتج في مخزن معين
 * الحل الجذري: استخدام quantity_on_hand مباشرة إذا لم توجد transactions
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
    // ✅ الخطوة 1: محاولة استخدام RPC function أولاً
    console.log(`[getAvailableInventoryQuantity] Calling RPC with: companyId=${companyId}, branchId=${branchId}, warehouseId=${warehouseId}, productId=${productId}`)
    const { data, error } = await supabase.rpc("get_available_inventory_quantity", {
      p_company_id: companyId,
      p_branch_id: branchId,
      p_warehouse_id: warehouseId,
      p_cost_center_id: costCenterId,
      p_product_id: productId,
    })
    console.log(`[getAvailableInventoryQuantity] RPC response: data=${data}, error=${error?.message || 'none'}`)

    // ✅ الخطوة 2: إذا نجحت الـ RPC function، استخدم النتيجة
    if (!error && data !== null && data !== undefined) {
      const rpcResult = Math.max(0, Number(data))
      console.log(`[getAvailableInventoryQuantity] RPC returned: ${rpcResult}`)
      
      // ✅ الحل الجذري: إذا كانت النتيجة 0، استخدم fallback للتحقق من quantity_on_hand
      // لأن الـ RPC function قد تُرجع 0 حتى لو كان هناك quantity_on_hand (إذا لم تكن محدثة)
      if (rpcResult === 0) {
        console.log(`[getAvailableInventoryQuantity] RPC returned 0, checking fallback for quantity_on_hand`)
        const fallbackResult = await calculateAvailableQuantityFallback(
          supabase,
          companyId,
          branchId,
          warehouseId,
          costCenterId,
          productId
        )
        console.log(`[getAvailableInventoryQuantity] Fallback returned: ${fallbackResult}`)
        // ✅ استخدم fallback إذا كان > 0، وإلا استخدم 0 من RPC
        return fallbackResult > 0 ? fallbackResult : 0
      }
      
      return rpcResult
    }

    // ✅ الخطوة 3: في حالة فشل الـ RPC function، استخدم fallback مباشرة
    if (error) {
      console.warn(`[getAvailableInventoryQuantity] RPC error: ${error.message}, using fallback`)
      if (error.code === "42883" || error.code === "P0001" || error.message?.includes("does not exist") || error.message?.includes("404")) {
        console.warn("RPC function 'get_available_inventory_quantity' not found, using fallback calculation. Please run the SQL script: scripts/042_write_off_governance_validation.sql")
      }
    } else {
      console.warn(`[getAvailableInventoryQuantity] RPC returned null/undefined, using fallback`)
    }

    // ✅ Fallback: حساب مباشر من inventory_transactions و quantity_on_hand
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
  } catch (error: any) {
    console.error("[getAvailableInventoryQuantity] Error:", error)
    // ✅ Fallback في حالة exceptions
    try {
      return await calculateAvailableQuantityFallback(
        supabase,
        companyId,
        branchId,
        warehouseId,
        costCenterId,
        productId
      )
    } catch (fallbackError) {
      console.error("[getAvailableInventoryQuantity] Error in fallback calculation:", fallbackError)
      return 0
    }
  }
}

/**
 * ✅ Fallback: حساب الرصيد مباشرة من inventory_transactions و quantity_on_hand
 * الحل الجذري: استخدام quantity_on_hand مباشرة إذا لم توجد transactions
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
    // ✅ الخطوة 1: جلب branch_id من warehouse إذا لم يكن محدداً
    let finalBranchId = branchId
    if (!finalBranchId && warehouseId) {
      const { data: warehouse } = await supabase
        .from("warehouses")
        .select("branch_id")
        .eq("id", warehouseId)
        .eq("company_id", companyId)
        .single()
      
      if (warehouse?.branch_id) {
        finalBranchId = warehouse.branch_id
        console.log(`[calculateAvailableQuantityFallback] Retrieved branch_id ${finalBranchId} from warehouse ${warehouseId}`)
      }
    }

    // ✅ الخطوة 2: البحث في inventory_transactions بالمعايير الكاملة
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
    if (finalBranchId) {
      query = query.eq("branch_id", finalBranchId)
    }
    if (costCenterId) {
      query = query.eq("cost_center_id", costCenterId)
    }

    const { data, error } = await query

    if (error) {
      console.error("[calculateAvailableQuantityFallback] Error calculating available quantity:", error)
      // في حالة الخطأ، نستخدم quantity_on_hand مباشرة
    } else if (data && data.length > 0) {
      // ✅ إذا وجدت transactions، احسب المجموع
      const totalQuantity = data.reduce(
        (sum: number, tx: any) => sum + Number(tx.quantity_change || 0),
        0
      )
      const result = Math.max(0, totalQuantity)
      console.log(`[calculateAvailableQuantityFallback] Found ${data.length} transactions, calculated quantity: ${result}`)
      return result
    }

    // ✅ الخطوة 3: إذا لم توجد transactions، استخدم quantity_on_hand مباشرة
    // هذا هو الحل الجذري: المنتجات التي لم يتم تسجيل حركات مخزون لها يمكن إهلاكها بناءً على quantity_on_hand
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("quantity_on_hand")
      .eq("id", productId)
      .eq("company_id", companyId)
      .single()

    if (!productError && product) {
      const qty = Math.max(0, Number(product.quantity_on_hand || 0))
      console.log(`[calculateAvailableQuantityFallback] No transactions found, using quantity_on_hand from product: ${qty}`)
      return qty
    }

    console.log(`[calculateAvailableQuantityFallback] No product found or error: ${productError?.message || 'unknown'}`)
    return 0
  } catch (error) {
    console.error("[calculateAvailableQuantityFallback] Error in fallback calculation:", error)
    // في حالة الخطأ، نحاول جلب quantity_on_hand مباشرة
    try {
      const { data: product } = await supabase
        .from("products")
        .select("quantity_on_hand")
        .eq("id", productId)
        .eq("company_id", companyId)
        .single()
      
      if (product) {
        return Math.max(0, Number(product.quantity_on_hand || 0))
      }
    } catch (e) {
      console.error("[calculateAvailableQuantityFallback] Error fetching product:", e)
    }
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
