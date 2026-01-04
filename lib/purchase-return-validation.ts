/**
 * 🔍 Purchase Return Validation
 * التحقق من صحة مرتجعات الشراء
 * 
 * يتحقق من:
 * 1. كفاية رصيد المخزن قبل إرجاع البضاعة للمورد
 * 2. ربط المرتجع بنفس الفرع والمخزن الأصلي
 */

import { SupabaseClient } from "@supabase/supabase-js"

export type ProductStockCheck = {
  product_id: string
  product_name: string
  requested_quantity: number
  available_quantity: number
  is_sufficient: boolean
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
    // جلب جميع حركات المخزون لهذا المنتج في هذا المخزن
    const { data: transactions, error } = await supabase
      .from("inventory_transactions")
      .select("quantity_change, is_deleted")
      .eq("company_id", companyId)
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
 * التحقق من كفاية رصيد المخزن لمرتجع شراء
 * @param supabase - Supabase client
 * @param items - قائمة المنتجات المراد إرجاعها
 * @param warehouseId - معرف المخزن
 * @param companyId - معرف الشركة
 * @returns نتيجة التحقق مع قائمة النواقص
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

    // التحقق من كل منتج
    for (const item of items) {
      if (!item.product_id || item.quantity <= 0) continue

      // جلب بيانات المنتج للتحقق من نوعه
      const { data: product } = await supabase
        .from("products")
        .select("id, name, item_type")
        .eq("id", item.product_id)
        .single()

      // تخطي الخدمات (لا تحتاج رصيد مخزون)
      if (product?.item_type === "service") continue

      // حساب الرصيد المتاح
      const availableStock = await getProductStockInWarehouse(
        supabase,
        item.product_id,
        warehouseId,
        companyId
      )

      // التحقق من الكفاية
      if (availableStock < item.quantity) {
        shortages.push({
          product_id: item.product_id,
          product_name: item.product_name || product?.name || "غير معروف",
          requested_quantity: item.quantity,
          available_quantity: availableStock,
          is_sufficient: false
        })
      }
    }

    return {
      success: shortages.length === 0,
      shortages
    }
  } catch (error: any) {
    console.error("Error validating purchase return stock:", error)
    return {
      success: false,
      shortages: [],
      error: error.message || "حدث خطأ أثناء التحقق من المخزون"
    }
  }
}

/**
 * تنسيق رسالة خطأ نقص المخزون
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
    const lines = shortages.map(s => 
      `• ${s.product_name}: Available ${s.available_quantity}, Required ${s.requested_quantity}`
    )
    return `Insufficient stock:\n${lines.join('\n')}`
  }

  const lines = shortages.map(s => 
    `• ${s.product_name}: المتاح ${s.available_quantity}، المطلوب ${s.requested_quantity}`
  )
  return `رصيد المخزن غير كافٍ:\n${lines.join('\n')}`
}

