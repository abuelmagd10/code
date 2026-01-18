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
    let query = supabase
      .from("inventory_transactions")
      .select("product_id, quantity_change")
      .eq("product_id", item.product_id)
      .or("is_deleted.is.null,is_deleted.eq.false")

    // Apply context filters if provided
    // 📌 جميع الفلاتر إجبارية عند وجود السياق لضمان الفحص على المستوى الصحيح
    if (context) {
      query = query.eq("company_id", context.company_id)
      
      // تطبيق فلاتر الفرع والمخزن ومركز التكلفة إذا كانت موجودة
      // هذه الفلاتر ضرورية لضمان الفحص على المستوى الصحيح
      if (context.branch_id) {
        query = query.eq("branch_id", context.branch_id)
      }
      
      if (context.warehouse_id) {
        query = query.eq("warehouse_id", context.warehouse_id)
      }
      
      if (context.cost_center_id) {
        query = query.eq("cost_center_id", context.cost_center_id)
      }
    }

    // Exclude inventory from a specific invoice if provided
    if (excludeInvoiceId) {
      // Exclude transactions related to this invoice (include null or different reference_id)
      query = query.or(`reference_id.neq.${excludeInvoiceId},reference_id.is.null`)
    }

    const { data: transactions, error } = await query

    if (error) {
      console.error(`Error checking inventory for product ${item.product_id}:`, error)
      continue
    }

    // Calculate total available quantity by summing quantity_change
    // quantity_change is positive for additions (purchase, transfer_in, etc.)
    // and negative for subtractions (sale, transfer_out, etc.)
    const totalAvailable = (transactions || []).reduce((sum, tx) => {
      return sum + (parseFloat(String(tx.quantity_change)) || 0)
    }, 0)

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

  const productNames = shortages
    .map((s) => s.product_name || s.product_id)
    .slice(0, 3)
    .join(", ")

  const moreCount = shortages.length > 3 ? ` +${shortages.length - 3}` : ""

  return {
    title: lang === "en" ? "Insufficient Inventory" : "المخزون غير كافٍ",
    description:
      lang === "en"
        ? `Shortage in: ${productNames}${moreCount}`
        : `نقص في: ${productNames}${moreCount}`,
  }
}
