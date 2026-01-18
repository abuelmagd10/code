/**
 * Inventory Check Utilities
 * 
 * Functions to check inventory availability and generate shortage messages
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface InventoryItem {
  product_id: string
  quantity: number
}

export interface Shortage {
  product_id: string
  product_name?: string
  requested: number
  available: number
  shortage: number
}

export interface InventoryCheckResult {
  success: boolean
  shortages: Shortage[]
}

export interface InventoryCheckContext {
  company_id: string
  branch_id?: string | null
  warehouse_id?: string | null
  cost_center_id?: string | null
}

/**
 * Check inventory availability for items
 * Calculates inventory from inventory_transactions by summing quantity_change
 */
export async function checkInventoryAvailability(
  supabase: SupabaseClient,
  items: InventoryItem[],
  excludeInvoiceId?: string,
  context?: InventoryCheckContext
): Promise<InventoryCheckResult> {
  const shortages: Shortage[] = []

  // Get product names for better error messages
  const productIds = items.map(item => item.product_id)
  const { data: products } = await supabase
    .from("products")
    .select("id, name")
    .in("id", productIds)

  const productMap = new Map((products || []).map((p: any) => [p.id, p.name]))

  for (const item of items) {
    // Build query to get inventory transactions for this product
    // 📌 ملاحظة مهمة: لحركات transfer_in و transfer_out، يجب أن نأخذها بغض النظر عن cost_center_id
    // لأن المخزون المحول قد يكون في cost_center_id مختلف لكن في نفس الفرع والمخزن
    // الحل: نأخذ جميع الحركات في نفس المخزن والفرع، ثم نفلتر في JavaScript
    let query = supabase
      .from("inventory_transactions")
      .select("product_id, quantity_change, transaction_type, cost_center_id")
      .eq("product_id", item.product_id)
      .or("is_deleted.is.null,is_deleted.eq.false")

    // Apply context filters if provided
    // 📌 جميع الفلاتر إجبارية عند وجود السياق لضمان الفحص على المستوى الصحيح
    if (context) {
      query = query.eq("company_id", context.company_id)
      
      // تطبيق فلاتر الفرع والمخزن (إجبارية)
      if (context.branch_id) {
        query = query.eq("branch_id", context.branch_id)
      }
      
      if (context.warehouse_id) {
        query = query.eq("warehouse_id", context.warehouse_id)
      }
      
      // ⚠️ لا نطبق فلتر cost_center_id هنا - سنفلتر في JavaScript
      // لأن حركات transfer_in و transfer_out قد تكون من cost_center_id مختلف
    }

    // Exclude inventory from a specific invoice if provided
    if (excludeInvoiceId) {
      // Exclude transactions related to this invoice (include null or different reference_id)
      query = query.or(`reference_id.neq.${excludeInvoiceId},reference_id.is.null`)
    }

    const { data: allTransactions, error } = await query

    if (error) {
      console.error(`Error checking inventory for product ${item.product_id}:`, error)
      continue
    }

    // 🔐 فلترة في JavaScript: نأخذ جميع الحركات في نفس cost_center_id المحدد
    // + جميع حركات transfer_in و transfer_out (لأنها قد تكون في cost_center_id مختلف لكن في نفس الفرع والمخزن)
    const filteredTransactions = (allTransactions || []).filter((t: any) => {
      if (!context || !context.cost_center_id) {
        // إذا لم يكن هناك cost_center_id في السياق، نأخذ جميع الحركات
        return true
      }
      
      const txCostCenterId = String(t.cost_center_id || '')
      const txType = String(t.transaction_type || '')
      const targetCostCenterId = String(context.cost_center_id)
      
      // نأخذ الحركات في نفس cost_center_id
      if (txCostCenterId === targetCostCenterId) return true
      
      // نأخذ حركات transfer_in و transfer_out بغض النظر عن cost_center_id (لكن في نفس الفرع والمخزن)
      if (txType === 'transfer_in' || txType === 'transfer_out') return true
      
      return false
    })

    // Calculate total available quantity by summing quantity_change
    // quantity_change is positive for additions (purchase, transfer_in, etc.)
    // and negative for subtractions (sale, transfer_out, etc.)
    const totalAvailable = filteredTransactions.reduce((sum, tx) => {
      return sum + (parseFloat(String(tx.quantity_change)) || 0)
    }, 0)

    // Debug logging (يمكن إزالته لاحقاً)
    if (totalAvailable < 0 || totalAvailable !== totalAvailable) {
      console.log(`[Inventory Check] Product ${item.product_id}:`, {
        totalTransactions: allTransactions?.length || 0,
        filteredTransactions: filteredTransactions.length,
        totalAvailable,
        context: context ? {
          company_id: context.company_id,
          branch_id: context.branch_id,
          warehouse_id: context.warehouse_id,
          cost_center_id: context.cost_center_id
        } : null
      })
    }

    const requested = parseFloat(String(item.quantity)) || 0

    if (totalAvailable < requested) {
      shortages.push({
        product_id: item.product_id,
        product_name: productMap.get(item.product_id) || "Unknown",
        requested,
        available: totalAvailable,
        shortage: requested - totalAvailable,
      })
    }
  }

  return {
    success: shortages.length === 0,
    shortages,
  }
}

/**
 * Get toast content for inventory shortages
 * Returns detailed information about what products are short and by how much
 */
export function getShortageToastContent(
  shortages: Shortage[],
  lang: "ar" | "en" = "ar"
): { title: string; description: string } {
  if (shortages.length === 0) {
    return {
      title: lang === "en" ? "Success" : "نجح",
      description: lang === "en" ? "Inventory available" : "المخزون متاح",
    }
  }

  // إنشاء رسالة مفصلة توضح الكميات المطلوبة والمتاحة والناقصة
  const shortageDetails = shortages
    .slice(0, 3) // عرض أول 3 منتجات فقط لتجنب رسالة طويلة جداً
    .map((s) => {
      const productName = s.product_name || s.product_id
      if (lang === "en") {
        return `${productName}: Need ${s.requested}, Available ${s.available}, Short ${s.shortage}`
      } else {
        return `${productName}: مطلوب ${s.requested}، متوفر ${s.available}، ناقص ${s.shortage}`
      }
    })
    .join("\n")

  const moreCount = shortages.length > 3 
    ? (lang === "en" ? `\n+${shortages.length - 3} more products` : `\n+${shortages.length - 3} منتجات أخرى`)
    : ""

  return {
    title: lang === "en" ? "Insufficient Inventory" : "المخزون غير كافٍ",
    description: shortageDetails + moreCount,
  }
}
