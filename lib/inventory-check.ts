/**
 * خدمة التحقق من توفر المخزون
 * تستخدم للتحقق من توفر الكمية المطلوبة قبل تنفيذ الفواتير
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface InventoryShortage {
  productId: string
  productName: string
  productSku: string
  required: number
  available: number
  shortage: number
}

export interface InventoryCheckResult {
  success: boolean
  shortages: InventoryShortage[]
}

export interface InvoiceItemToCheck {
  product_id: string | null
  quantity: number
}

/**
 * التحقق من توفر المخزون لقائمة من المنتجات
 * @param supabase - Supabase client
 * @param items - قائمة العناصر للتحقق منها
 * @param excludeInvoiceId - معرف الفاتورة المستثناة (في حالة التعديل)
 * @returns نتيجة التحقق مع قائمة النواقص
 */
export async function checkInventoryAvailability(
  supabase: SupabaseClient,
  items: InvoiceItemToCheck[],
  excludeInvoiceId?: string
): Promise<InventoryCheckResult> {
  try {
    // تجميع الكميات المطلوبة لكل منتج
    const requiredByProduct: Record<string, number> = {}
    for (const item of items) {
      if (!item.product_id) continue
      requiredByProduct[item.product_id] = (requiredByProduct[item.product_id] || 0) + Number(item.quantity || 0)
    }

    const productIds = Object.keys(requiredByProduct)
    if (productIds.length === 0) {
      return { success: true, shortages: [] }
    }

    // جلب بيانات المنتجات مع الكمية المتاحة
    // 📌 ملاحظة: نستخدم فقط الأعمدة الأساسية لتجنب أخطاء الأعمدة غير الموجودة
    const { data: products, error } = await supabase
      .from("products")
      .select("id, name, sku, quantity_on_hand")
      .in("id", productIds)

    if (error) {
      console.error("Error fetching products for inventory check:", error)
      return { success: true, shortages: [] } // في حالة الخطأ، نسمح بالمتابعة
    }

    // إذا كانت هناك فاتورة مستثناة (حالة التعديل)، نحتاج لحساب الكمية المخصومة مسبقاً
    let previouslyDeducted: Record<string, number> = {}
    if (excludeInvoiceId) {
      const { data: existingItems } = await supabase
        .from("invoice_items")
        .select("product_id, quantity")
        .eq("invoice_id", excludeInvoiceId)

      for (const item of existingItems || []) {
        if (item.product_id) {
          previouslyDeducted[item.product_id] = (previouslyDeducted[item.product_id] || 0) + Number(item.quantity || 0)
        }
      }
    }

    const shortages: InventoryShortage[] = []

    for (const product of products || []) {
      // 📌 ملاحظة: نفترض أن جميع المنتجات تتبع المخزون
      // إذا كان هناك نظام لتتبع الخدمات، يتم التحقق منه في مكان آخر
      const required = requiredByProduct[product.id] || 0
      // الكمية المتاحة = الكمية الحالية + الكمية المخصومة مسبقاً (في حالة التعديل)
      const available = Number(product.quantity_on_hand || 0) + (previouslyDeducted[product.id] || 0)

      if (required > available) {
        shortages.push({
          productId: product.id,
          productName: product.name || "منتج غير معروف",
          productSku: product.sku || "",
          required,
          available: Math.max(0, available),
          shortage: required - available
        })
      }
    }

    return { success: shortages.length === 0, shortages }
  } catch (error) {
    console.error("Error checking inventory availability:", error)
    return { success: true, shortages: [] } // في حالة الخطأ، نسمح بالمتابعة
  }
}

/**
 * تنسيق رسالة النواقص للعرض
 * @param shortages - قائمة النواقص
 * @param lang - اللغة (en/ar)
 * @returns رسالة منسقة
 */
export function formatShortageMessage(shortages: InventoryShortage[], lang: 'en' | 'ar' = 'ar'): string {
  if (lang === 'en') {
    return shortages.map(s => 
      `• ${s.productName}${s.productSku ? ` (${s.productSku})` : ''}: Required ${s.required}, Available ${s.available}`
    ).join("\n")
  }
  return shortages.map(s => 
    `• ${s.productName}${s.productSku ? ` (${s.productSku})` : ''}: مطلوب ${s.required}، متوفر ${s.available}`
  ).join("\n")
}

/**
 * الحصول على عنوان ووصف رسالة الخطأ
 */
export function getShortageToastContent(shortages: InventoryShortage[], lang: 'en' | 'ar' = 'ar') {
  const title = lang === 'en' ? "Insufficient Inventory" : "المخزون غير كافٍ"
  const prefix = lang === 'en' 
    ? "Cannot execute invoice. The following products have insufficient stock:"
    : "لا يمكن تنفيذ الفاتورة. المنتجات التالية غير متوفرة بالكمية المطلوبة:"
  const description = `${prefix}\n${formatShortageMessage(shortages, lang)}`
  return { title, description }
}

