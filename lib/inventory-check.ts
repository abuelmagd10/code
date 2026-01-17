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

/**
 * Check inventory availability for items
 */
export async function checkInventoryAvailability(
  supabase: SupabaseClient,
  items: InventoryItem[],
  excludeInvoiceId?: string
): Promise<InventoryCheckResult> {
  const shortages: Shortage[] = []

  for (const item of items) {
    // Get current inventory for this product
    let query = supabase
      .from("inventory")
      .select("product_id, quantity, products(name)")
      .eq("product_id", item.product_id)

    // Exclude inventory from a specific invoice if provided
    if (excludeInvoiceId) {
      // This would need to be adjusted based on your inventory structure
      // For now, we'll just check total inventory
    }

    const { data: inventoryData, error } = await query

    if (error) {
      console.error(`Error checking inventory for product ${item.product_id}:`, error)
      continue
    }

    // Calculate total available quantity
    const totalAvailable = inventoryData?.reduce((sum, inv) => {
      return sum + (parseFloat(String(inv.quantity)) || 0)
    }, 0) || 0

    const requested = parseFloat(String(item.quantity)) || 0

    if (totalAvailable < requested) {
      shortages.push({
        product_id: item.product_id,
        product_name: inventoryData?.[0]?.products?.[0]?.name || "Unknown",
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
