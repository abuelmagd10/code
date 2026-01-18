/**
 * Third Party Inventory Management
 * 
 * Functions to manage inventory transferred to third-party shipping providers
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface TransferToThirdPartyParams {
  supabase: SupabaseClient
  companyId: string
  invoiceId: string
  shippingProviderId: string
  branchId: string | null
  costCenterId: string | null
  warehouseId: string | null
}

export interface ShippingProviderValidation {
  valid: boolean
  shippingProviderId: string | null
  providerName?: string
  error?: string
}

export interface ClearThirdPartyInventoryParams {
  supabase: SupabaseClient
  companyId: string
  invoiceId: string
  paidRatio: number
  branchId: string | null
  costCenterId: string | null
}

export interface ClearThirdPartyInventoryResult {
  success: boolean
  totalCOGS: number
  clearedQuantity?: number
  error?: string
}

/**
 * Validate that an invoice has a shipping provider
 */
export async function validateShippingProvider(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<ShippingProviderValidation> {
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("id, shipping_provider_id, shipping_providers(provider_name)")
    .eq("id", invoiceId)
    .single()

  if (error) {
    return {
      valid: false,
      shippingProviderId: null,
      error: error.message,
    }
  }

  if (!invoice?.shipping_provider_id) {
    return {
      valid: false,
      shippingProviderId: null,
      error: "No shipping provider assigned to this invoice",
    }
  }

  return {
    valid: true,
    shippingProviderId: invoice.shipping_provider_id,
    providerName: (invoice.shipping_providers as any)?.provider_name || "Unknown",
  }
}

/**
 * Transfer inventory to third-party (shipping provider)
 */
export async function transferToThirdParty(
  params: TransferToThirdPartyParams
): Promise<boolean> {
  const {
    supabase,
    companyId,
    invoiceId,
    shippingProviderId,
    branchId,
    costCenterId,
    warehouseId,
  } = params

  try {
    // Get invoice items
    const { data: invoiceItems, error: itemsError } = await supabase
      .from("invoice_items")
      .select("product_id, quantity, unit_price, products(cost_price, item_type)")
      .eq("invoice_id", invoiceId)

    if (itemsError) {
      console.error("Error fetching invoice items:", itemsError)
      return false
    }

    if (!invoiceItems || invoiceItems.length === 0) {
      console.log("No items found in invoice")
      return true // No items to transfer
    }

    // Filter out services (only transfer products)
    const productItems = invoiceItems.filter((item: any) => {
      const product = item.products
      return product && product.item_type !== "service"
    })

    if (productItems.length === 0) {
      console.log("No product items to transfer")
      return true
    }

    // Check if third-party inventory already exists for this invoice
    const { data: existing } = await supabase
      .from("third_party_inventory")
      .select("id")
      .eq("invoice_id", invoiceId)
      .limit(1)

    if (existing && existing.length > 0) {
      console.log("Third-party inventory already exists for this invoice")
      return true // Already transferred
    }

    // Create third-party inventory records
    const thirdPartyRecords = productItems.map((item: any) => ({
      company_id: companyId,
      invoice_id: invoiceId,
      product_id: item.product_id,
      quantity: parseFloat(String(item.quantity)) || 0,
      unit_cost: parseFloat(String(item.products?.cost_price || item.unit_price * 0.7)) || 0,
      shipping_provider_id: shippingProviderId,
      status: "open",
      cleared_quantity: 0,
      returned_quantity: 0,
      branch_id: branchId,
      cost_center_id: costCenterId,
      warehouse_id: warehouseId,
      notes: "Transferred from invoice",
    }))

    const { error: insertError } = await supabase
      .from("third_party_inventory")
      .insert(thirdPartyRecords)

    if (insertError) {
      console.error("Error creating third-party inventory:", insertError)
      return false
    }

    // Create inventory transactions (stock out from warehouse)
    const transactions = productItems.map((item: any) => ({
      company_id: companyId,
      product_id: item.product_id,
      warehouse_id: warehouseId,
      transaction_type: "sale",
      quantity_change: -parseFloat(String(item.quantity)) || 0,
      reference_type: "invoice",
      reference_id: invoiceId,
      from_location_type: "warehouse",
      from_location_id: warehouseId,
      to_location_type: "third_party",
      to_location_id: shippingProviderId,
      shipping_provider_id: shippingProviderId,
      branch_id: branchId,
      cost_center_id: costCenterId,
      notes: `Transferred to third-party shipping provider`,
    }))

    const { error: txError } = await supabase
      .from("inventory_transactions")
      .insert(transactions)

    if (txError) {
      console.error("Error creating inventory transactions:", txError)
      // Don't fail completely - third-party inventory was created
    }

    return true
  } catch (error: any) {
    console.error("Error in transferToThirdParty:", error)
    return false
  }
}

/**
 * Clear third-party inventory when invoice is paid
 * Uses FIFO Engine to calculate COGS and creates cogs_transactions
 */
export async function clearThirdPartyInventory(
  params: ClearThirdPartyInventoryParams
): Promise<ClearThirdPartyInventoryResult> {
  const {
    supabase,
    companyId,
    invoiceId,
    paidRatio,
    branchId,
    costCenterId,
  } = params

  try {
    // Get invoice and third-party inventory
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, invoice_date, warehouse_id")
      .eq("id", invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return {
        success: false,
        totalCOGS: 0,
        error: "Invoice not found",
      }
    }

    // Get third-party inventory for this invoice
    const { data: thirdPartyInventory, error: fetchError } = await supabase
      .from("third_party_inventory")
      .select("id, product_id, quantity, unit_cost, cleared_quantity, status, warehouse_id")
      .eq("company_id", companyId)
      .eq("invoice_id", invoiceId)
      .neq("status", "cleared")

    if (fetchError) {
      console.error("Error fetching third-party inventory:", fetchError)
      return {
        success: false,
        totalCOGS: 0,
        error: fetchError.message,
      }
    }

    if (!thirdPartyInventory || thirdPartyInventory.length === 0) {
      // No third-party inventory to clear
      return {
        success: true,
        totalCOGS: 0,
        clearedQuantity: 0,
      }
    }

    // ✅ ERP Professional: استخدام FIFO Engine + COGS Transactions
    const { consumeFIFOLotsWithCOGS } = await import("./fifo-engine")
    const { data: { user } } = await supabase.auth.getUser()

    let totalCOGS = 0
    let totalClearedQuantity = 0
    const warehouseId = invoice.warehouse_id || thirdPartyInventory[0]?.warehouse_id || null

    // التحقق من الحوكمة (إلزامي لـ COGS)
    if (!branchId || !costCenterId || !warehouseId) {
      console.error("❌ COGS requires governance: branch_id, cost_center_id, warehouse_id must be set")
      // Fallback: استخدام الطريقة القديمة بدون COGS transactions
      for (const item of thirdPartyInventory) {
        const quantityToClear = parseFloat(String(item.quantity || 0)) * paidRatio
        const itemCOGS = quantityToClear * parseFloat(String(item.unit_cost || 0))
        totalCOGS += itemCOGS
        totalClearedQuantity += quantityToClear
      }
      return {
        success: true,
        totalCOGS,
        clearedQuantity: totalClearedQuantity,
      }
    }

    // ✅ استخدام FIFO Engine + COGS Transactions لكل منتج
    for (const item of thirdPartyInventory) {
      const remainingToClear = parseFloat(String(item.quantity || 0)) - parseFloat(String(item.cleared_quantity || 0))
      const quantityToClear = remainingToClear * paidRatio

      if (quantityToClear > 0) {
        // ✅ استخدام FIFO Engine لإنشاء COGS Transactions
        const fifoResult = await consumeFIFOLotsWithCOGS(supabase, {
          companyId,
          branchId,
          costCenterId,
          warehouseId,
          productId: item.product_id,
          quantity: quantityToClear,
          sourceType: 'invoice',
          sourceId: invoiceId,
          transactionDate: invoice.invoice_date || new Date().toISOString().split('T')[0],
          createdByUserId: user?.id
        })

        if (fifoResult.success) {
          totalCOGS += fifoResult.totalCOGS
          totalClearedQuantity += quantityToClear
          console.log(`✅ COGS created for third-party product ${item.product_id}: ${fifoResult.cogsTransactionIds.length} transactions, total COGS: ${fifoResult.totalCOGS}`)
        } else {
          console.error(`❌ Failed to create COGS for third-party product ${item.product_id}:`, fifoResult.error)
        }

        // Update third-party inventory record
        const currentClearedQuantity = parseFloat(String(item.cleared_quantity || 0))
        const newClearedQuantity = currentClearedQuantity + quantityToClear
        const remainingQuantity = parseFloat(String(item.quantity || 0)) - newClearedQuantity

        let newStatus = item.status
        if (remainingQuantity <= 0) {
          newStatus = "cleared"
        } else if (newClearedQuantity > 0) {
          newStatus = "partial"
        }

        await supabase
          .from("third_party_inventory")
          .update({
            cleared_quantity: newClearedQuantity,
            status: newStatus,
            cleared_at: newStatus === "cleared" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id)
      }
    }

    return {
      success: true,
      totalCOGS,
      clearedQuantity: totalClearedQuantity,
    }
  } catch (error: any) {
    console.error("Error in clearThirdPartyInventory:", error)
    return {
      success: false,
      totalCOGS: 0,
      error: error.message || "Unknown error",
    }
  }
}
