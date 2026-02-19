/**
 * 🔍 Purchase Return Validation
 * التحقق من صحة مرتجعات الشراء
 *
 * يتحقق من:
 * 1. كفاية رصيد المخزن قبل إرجاع البضاعة للمورد
 * 2. ربط المرتجع بنفس الفرع والمخزن الأصلي
 *
 * ملاحظة هامة: التحقق يتم على مخزن الفاتورة الأصلي فقط.
 * إذا تم تحويل كميات من هذا المخزن إلى مخازن أخرى،
 * يجب إعادة تحويلها للمخزن الأصلي قبل المرتجع.
 */

import { SupabaseClient } from "@supabase/supabase-js"

export type ProductStockCheck = {
  product_id: string
  product_name: string
  requested_quantity: number
  available_quantity: number
  is_sufficient: boolean
  stock_in_other_warehouses?: number
}

export type StockValidationResult = {
  success: boolean
  shortages: ProductStockCheck[]
  error?: string
}

/**
 * حساب رصيد منتج في مخزن معين
 * @param supabase - Supabase client
 * @param productId - معرف المنتج
 * @param warehouseId - معرف المخزن
 * @param companyId - معرف الشركة
 * @returns الرصيد المتاح
 */
export async function getProductStockInWarehouse(
  supabase: SupabaseClient,
  productId: string,
  warehouseId: string,
  companyId: string
): Promise<number> {
  try {
    const { data: wh } = await supabase
      .from("warehouses")
      .select("branch_id")
      .eq("company_id", companyId)
      .eq("id", warehouseId)
      .single()

    const branchId = String(wh?.branch_id || "")
    if (!branchId) return 0

    const { data: branchDefaults } = await supabase
      .from("branches")
      .select("default_cost_center_id")
      .eq("company_id", companyId)
      .eq("id", branchId)
      .single()

    const costCenterId = String(branchDefaults?.default_cost_center_id || "")
    if (!costCenterId) return 0

    // جلب جميع حركات المخزون لهذا المنتج في هذا المخزن
    const { data: transactions, error } = await supabase
      .from("inventory_transactions")
      .select("quantity_change, is_deleted")
      .eq("company_id", companyId)
      .eq("branch_id", branchId)
      .eq("cost_center_id", costCenterId)
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)

    if (error) {
      console.error("Error fetching inventory transactions:", error)
      return 0
    }

    // حساب الرصيد (quantity_change موجب للشراء، سالب للبيع)
    const stock = (transactions || [])
      .filter((t: any) => !t.is_deleted)
      .reduce((sum: number, t: any) => sum + Number(t.quantity_change || 0), 0)

    return Math.max(0, stock) // لا نسمح برصيد سالب
  } catch (error) {
    console.error("Error calculating product stock:", error)
    return 0
  }
}

/**
 * حساب رصيد منتج في كل مخازن الشركة (باستثناء مخزن معين)
 * يُستخدم لإظهار رسالة مفيدة للمستخدم عند نقص المخزون
 */
async function getProductStockInOtherWarehouses(
  supabase: SupabaseClient,
  productId: string,
  excludeWarehouseId: string,
  companyId: string
): Promise<number> {
  try {
    const { data: transactions } = await supabase
      .from("inventory_transactions")
      .select("quantity_change, is_deleted")
      .eq("company_id", companyId)
      .eq("product_id", productId)
      .neq("warehouse_id", excludeWarehouseId)

    return Math.max(0, (transactions || [])
      .filter((t: any) => !t.is_deleted)
      .reduce((sum: number, t: any) => sum + Number(t.quantity_change || 0), 0))
  } catch {
    return 0
  }
}

/**
 * التحقق من كفاية رصيد المخزن لمرتجع شراء
 *
 * ⚠️ مهم: التحقق يتم على مخزن الفاتورة الأصلي فقط.
 * إذا تم تحويل كميات إلى مخازن أخرى، يجب إعادتها أولاً.
 *
 * @param supabase - Supabase client
 * @param items - قائمة المنتجات المراد إرجاعها
 * @param warehouseId - معرف مخزن الفاتورة
 * @param companyId - معرف الشركة
 * @returns نتيجة التحقق مع قائمة النواقص ومعلومات المخازن الأخرى
 */
export async function validatePurchaseReturnStock(
  supabase: SupabaseClient,
  items: Array<{
    product_id: string | null
    product_name: string
    quantity: number
  }>,
  warehouseId: string,
  companyId: string
): Promise<StockValidationResult> {
  try {
    const shortages: ProductStockCheck[] = []

    for (const item of items) {
      if (!item.product_id || item.quantity <= 0) continue

      const { data: product } = await supabase
        .from("products")
        .select("id, name, item_type")
        .eq("id", item.product_id)
        .single()

      if (product?.item_type === "service") continue

      const availableStock = await getProductStockInWarehouse(
        supabase,
        item.product_id,
        warehouseId,
        companyId
      )

      if (availableStock < item.quantity) {
        // فحص المخازن الأخرى لإعطاء رسالة أوضح
        const stockInOtherWarehouses = await getProductStockInOtherWarehouses(
          supabase,
          item.product_id,
          warehouseId,
          companyId
        )

        shortages.push({
          product_id: item.product_id,
          product_name: item.product_name || product?.name || "غير معروف",
          requested_quantity: item.quantity,
          available_quantity: availableStock,
          is_sufficient: false,
          stock_in_other_warehouses: stockInOtherWarehouses,
        })
      }
    }

    return {
      success: shortages.length === 0,
      shortages,
    }
  } catch (error: any) {
    console.error("Error validating purchase return stock:", error)
    return {
      success: false,
      shortages: [],
      error: error.message || "حدث خطأ أثناء التحقق من المخزون",
    }
  }
}

/**
 * تنسيق رسالة خطأ نقص المخزون
 * تُظهر الرصيد المتاح، والمطلوب، وإن وُجد رصيد في مخازن أخرى
 * تقترح على المستخدم إما تحويل البضاعة أو تقليل الكمية
 *
 * @param shortages - قائمة النواقص
 * @param lang - اللغة
 * @returns رسالة الخطأ المنسقة
 */
export function formatStockShortageMessage(
  shortages: ProductStockCheck[],
  lang: 'ar' | 'en' = 'ar'
): string {
  if (shortages.length === 0) return ""

  if (lang === 'en') {
    const lines = shortages.map(s => {
      let line = `• ${s.product_name}: Available in bill warehouse ${s.available_quantity}, Required ${s.requested_quantity}`
      if ((s.stock_in_other_warehouses ?? 0) > 0) {
        line += ` (${s.stock_in_other_warehouses} units found in other warehouses — transfer back first)`
      }
      return line
    })
    return `Insufficient stock in bill's warehouse:\n${lines.join('\n')}\n\nTo fix: either reduce the return quantity or transfer stock back to the original warehouse first.`
  }

  const lines = shortages.map(s => {
    let line = `• ${s.product_name}: المتاح في مخزن الفاتورة ${s.available_quantity}، المطلوب ${s.requested_quantity}`
    if ((s.stock_in_other_warehouses ?? 0) > 0) {
      line += `\n  ⚠️ يوجد ${s.stock_in_other_warehouses} وحدة في مخازن فروع أخرى — قم بتحويلها للمخزن الأصلي أولاً`
    }
    return line
  })
  return `رصيد مخزن الفاتورة غير كافٍ للمرتجع:\n${lines.join('\n')}\n\n💡 الحل: قلّل كمية المرتجع للكمية المتاحة، أو أنشئ حركة تحويل مخزني من الفرع الآخر أولاً.`
}
