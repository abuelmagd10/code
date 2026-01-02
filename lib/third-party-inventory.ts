/**
 * 📦 Third Party Inventory Management
 * بضائع لدى الغير - Goods with Third Party / In-Transit / Consignment
 * 
 * 📌 النمط المحاسبي:
 * - Sent: نقل من المستودع → بضائع لدى الغير (لا قيود محاسبية)
 * - Paid: إزالة من بضائع لدى الغير + COGS + Revenue
 * - Return: إرجاع من بضائع لدى الغير → المستودع
 */

import { SupabaseClient } from "@supabase/supabase-js"

export interface ThirdPartyInventoryItem {
  id?: string
  company_id: string
  shipping_provider_id: string
  product_id: string
  invoice_id: string
  quantity: number
  unit_cost: number
  total_cost: number
  status: 'open' | 'cleared' | 'returned'
  cleared_quantity: number
  returned_quantity: number
  branch_id?: string | null
  cost_center_id?: string | null
  warehouse_id?: string | null
  notes?: string
}

export interface TransferToThirdPartyParams {
  supabase: SupabaseClient
  companyId: string
  invoiceId: string
  shippingProviderId: string
  branchId?: string | null
  costCenterId?: string | null
  warehouseId?: string | null
}

/**
 * نقل البضائع من المستودع إلى بضائع لدى الغير
 * يُستخدم عند تحويل الفاتورة إلى "sent"
 */
export async function transferToThirdParty(params: TransferToThirdPartyParams): Promise<boolean> {
  const { supabase, companyId, invoiceId, shippingProviderId, branchId, costCenterId, warehouseId } = params

  try {
    // التحقق من عدم وجود سجلات سابقة
    const { data: existing } = await supabase
      .from("third_party_inventory")
      .select("id")
      .eq("invoice_id", invoiceId)
      .limit(1)

    if (existing && existing.length > 0) {
      console.log(`⚠️ Third party inventory already exists for invoice ${invoiceId}`)
      return true
    }

    // جلب بنود الفاتورة مع معلومات المنتج
    const { data: invoiceItems, error: itemsError } = await supabase
      .from("invoice_items")
      .select(`
        product_id,
        quantity,
        unit_price,
        products!inner(id, cost_price, item_type, name)
      `)
      .eq("invoice_id", invoiceId)

    if (itemsError) throw itemsError

    // فلترة المنتجات فقط (ليس الخدمات)
    const productItems = (invoiceItems || []).filter(
      (item: any) => item.product_id && item.products?.item_type !== 'service'
    )

    if (productItems.length === 0) {
      console.log(`ℹ️ No products to transfer for invoice ${invoiceId}`)
      return true
    }

    // إنشاء سجلات بضائع لدى الغير
    const thirdPartyRecords = productItems.map((item: any) => ({
      company_id: companyId,
      shipping_provider_id: shippingProviderId,
      product_id: item.product_id,
      invoice_id: invoiceId,
      quantity: Number(item.quantity || 0),
      unit_cost: Number(item.products?.cost_price || 0),
      total_cost: Number(item.quantity || 0) * Number(item.products?.cost_price || 0),
      status: 'open',
      cleared_quantity: 0,
      returned_quantity: 0,
      notes: `فاتورة مبيعات - ${item.products?.name || ''}`
    }))

    const { error: insertError } = await supabase
      .from("third_party_inventory")
      .insert(thirdPartyRecords)

    if (insertError) throw insertError

    // إنشاء حركات المخزون مع معلومات الموقع
    const inventoryMovements = productItems.map((item: any) => ({
      company_id: companyId,
      product_id: item.product_id,
      transaction_type: "sale",
      quantity_change: -Number(item.quantity || 0),
      unit_cost: Number(item.products?.cost_price || 0),
      total_cost: Number(item.quantity || 0) * Number(item.products?.cost_price || 0),
      reference_id: invoiceId,
      notes: `نقل إلى بضائع لدى الغير - شركة الشحن`,
      branch_id: branchId || null,
      cost_center_id: costCenterId || null,
      warehouse_id: warehouseId || null,
      from_location_type: 'warehouse',
      from_location_id: warehouseId || null,
      to_location_type: 'third_party',
      to_location_id: shippingProviderId,
      shipping_provider_id: shippingProviderId
    }))

    console.log("📦 Creating inventory movements for third-party transfer:", {
      invoiceId,
      companyId,
      itemsCount: inventoryMovements.length,
      sampleItem: inventoryMovements[0]
    })

    const { error: movementError } = await supabase
      .from("inventory_transactions")
      .insert(inventoryMovements)

    if (movementError) {
      console.error("❌ Failed creating inventory movements:", movementError)
      console.error("📋 Data that failed:", inventoryMovements)
      throw movementError
    }

    console.log(`✅ Transferred ${productItems.length} products to third party for invoice ${invoiceId}`)
    return true

  } catch (error) {
    console.error("Error transferring to third party:", error)
    return false
  }
}

export interface ClearThirdPartyParams {
  supabase: SupabaseClient
  companyId: string
  invoiceId: string
  paidRatio: number // نسبة المدفوع (0 to 1)
  branchId?: string | null
  costCenterId?: string | null
}

/**
 * تصفية البضائع لدى الغير عند الدفع
 * يُستخدم عند تحويل الفاتورة إلى "paid" أو "partially_paid"
 */
export async function clearThirdPartyInventory(params: ClearThirdPartyParams): Promise<{
  success: boolean
  totalCOGS: number
  clearedItems: Array<{ product_id: string; quantity: number; cost: number }>
}> {
  const { supabase, companyId, invoiceId, paidRatio, branchId, costCenterId } = params

  try {
    // جلب سجلات بضائع لدى الغير لهذه الفاتورة
    const { data: thirdPartyItems, error: fetchError } = await supabase
      .from("third_party_inventory")
      .select("*")
      .eq("invoice_id", invoiceId)
      .eq("status", "open")

    if (fetchError) throw fetchError

    if (!thirdPartyItems || thirdPartyItems.length === 0) {
      console.log(`ℹ️ No open third party inventory for invoice ${invoiceId}`)
      return { success: true, totalCOGS: 0, clearedItems: [] }
    }

    let totalCOGS = 0
    const clearedItems: Array<{ product_id: string; quantity: number; cost: number }> = []

    for (const item of thirdPartyItems) {
      const remainingQty = Number(item.quantity) - Number(item.cleared_quantity) - Number(item.returned_quantity)
      const qtyToClear = Math.min(remainingQty, remainingQty * paidRatio)

      if (qtyToClear <= 0) continue

      const costToClear = qtyToClear * Number(item.unit_cost)
      totalCOGS += costToClear

      clearedItems.push({
        product_id: item.product_id,
        quantity: qtyToClear,
        cost: costToClear
      })

      // تحديث الكمية المصفاة
      const newClearedQty = Number(item.cleared_quantity) + qtyToClear
      const newStatus = newClearedQty >= Number(item.quantity) ? 'cleared' : 'open'

      await supabase
        .from("third_party_inventory")
        .update({
          cleared_quantity: newClearedQty,
          status: newStatus,
          cleared_at: newStatus === 'cleared' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq("id", item.id)
    }

    console.log(`✅ Cleared ${clearedItems.length} items, total COGS: ${totalCOGS}`)
    return { success: true, totalCOGS, clearedItems }

  } catch (error) {
    console.error("Error clearing third party inventory:", error)
    return { success: false, totalCOGS: 0, clearedItems: [] }
  }
}

export interface ReturnFromThirdPartyParams {
  supabase: SupabaseClient
  companyId: string
  invoiceId: string
  productId: string
  quantity: number
  branchId?: string | null
  costCenterId?: string | null
  warehouseId?: string | null
}

/**
 * إرجاع البضائع من بضائع لدى الغير إلى المستودع
 * يُستخدم عند مرتجعات الفواتير المرسلة
 */
export async function returnFromThirdParty(params: ReturnFromThirdPartyParams): Promise<boolean> {
  const { supabase, companyId, invoiceId, productId, quantity, branchId, costCenterId, warehouseId } = params

  try {
    // جلب سجل بضائع لدى الغير
    const { data: thirdPartyItem, error: fetchError } = await supabase
      .from("third_party_inventory")
      .select("*")
      .eq("invoice_id", invoiceId)
      .eq("product_id", productId)
      .single()

    if (fetchError || !thirdPartyItem) {
      console.warn(`⚠️ No third party record found for invoice ${invoiceId}, product ${productId}`)
      return false
    }

    const availableQty = Number(thirdPartyItem.quantity) - Number(thirdPartyItem.cleared_quantity) - Number(thirdPartyItem.returned_quantity)
    const qtyToReturn = Math.min(quantity, availableQty)

    if (qtyToReturn <= 0) {
      console.warn(`⚠️ No available quantity to return for product ${productId}`)
      return false
    }

    // تحديث الكمية المرتجعة
    const newReturnedQty = Number(thirdPartyItem.returned_quantity) + qtyToReturn
    const totalProcessed = Number(thirdPartyItem.cleared_quantity) + newReturnedQty
    const newStatus = totalProcessed >= Number(thirdPartyItem.quantity) ? 'returned' : 'open'

    await supabase
      .from("third_party_inventory")
      .update({
        returned_quantity: newReturnedQty,
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq("id", thirdPartyItem.id)

    // إنشاء حركة مخزون للإرجاع
    await supabase
      .from("inventory_transactions")
      .insert({
        company_id: companyId,
        product_id: productId,
        transaction_type: "sale_return",
        quantity_change: qtyToReturn,
        unit_cost: Number(thirdPartyItem.unit_cost),
        total_cost: qtyToReturn * Number(thirdPartyItem.unit_cost),
        reference_id: invoiceId,
        notes: `إرجاع من بضائع لدى الغير إلى المستودع`,
        branch_id: branchId || null,
        cost_center_id: costCenterId || null,
        warehouse_id: warehouseId || null,
        from_location_type: 'third_party',
        from_location_id: thirdPartyItem.shipping_provider_id,
        to_location_type: 'warehouse',
        to_location_id: warehouseId || null,
        shipping_provider_id: thirdPartyItem.shipping_provider_id
      })

    console.log(`✅ Returned ${qtyToReturn} units of product ${productId} from third party`)
    return true

  } catch (error) {
    console.error("Error returning from third party:", error)
    return false
  }
}

/**
 * الحصول على ملخص بضائع لدى الغير لشركة
 */
export async function getThirdPartyInventorySummary(
  supabase: SupabaseClient,
  companyId: string,
  shippingProviderId?: string
): Promise<{
  totalQuantity: number
  totalValue: number
  byProvider: Array<{ provider_id: string; provider_name: string; quantity: number; value: number }>
  byProduct: Array<{ product_id: string; product_name: string; quantity: number; value: number }>
}> {
  try {
    let query = supabase
      .from("third_party_inventory")
      .select(`
        *,
        shipping_providers!inner(id, provider_name),
        products!inner(id, name, sku)
      `)
      .eq("company_id", companyId)
      .eq("status", "open")

    if (shippingProviderId) {
      query = query.eq("shipping_provider_id", shippingProviderId)
    }

    const { data, error } = await query

    if (error) throw error

    let totalQuantity = 0
    let totalValue = 0
    const byProviderMap = new Map<string, { provider_name: string; quantity: number; value: number }>()
    const byProductMap = new Map<string, { product_name: string; quantity: number; value: number }>()

    for (const item of data || []) {
      const availableQty = Number(item.quantity) - Number(item.cleared_quantity) - Number(item.returned_quantity)
      const value = availableQty * Number(item.unit_cost)

      totalQuantity += availableQty
      totalValue += value

      // تجميع حسب شركة الشحن
      const providerKey = item.shipping_provider_id
      const existing = byProviderMap.get(providerKey) || {
        provider_name: item.shipping_providers?.provider_name || '',
        quantity: 0,
        value: 0
      }
      existing.quantity += availableQty
      existing.value += value
      byProviderMap.set(providerKey, existing)

      // تجميع حسب المنتج
      const productKey = item.product_id
      const existingProduct = byProductMap.get(productKey) || {
        product_name: item.products?.name || '',
        quantity: 0,
        value: 0
      }
      existingProduct.quantity += availableQty
      existingProduct.value += value
      byProductMap.set(productKey, existingProduct)
    }

    return {
      totalQuantity,
      totalValue,
      byProvider: Array.from(byProviderMap.entries()).map(([provider_id, data]) => ({
        provider_id,
        ...data
      })),
      byProduct: Array.from(byProductMap.entries()).map(([product_id, data]) => ({
        product_id,
        ...data
      }))
    }

  } catch (error) {
    console.error("Error getting third party inventory summary:", error)
    return { totalQuantity: 0, totalValue: 0, byProvider: [], byProduct: [] }
  }
}

/**
 * التحقق من وجود شركة شحن للفاتورة
 * يجب أن يكون هناك shipping_provider_id لاستخدام نظام بضائع لدى الغير
 */
export async function validateShippingProvider(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<{ valid: boolean; shippingProviderId: string | null; providerName: string | null }> {
  try {
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select(`
        shipping_provider_id,
        shipping_providers(id, provider_name, third_party_account_id)
      `)
      .eq("id", invoiceId)
      .single()

    if (error || !invoice) {
      return { valid: false, shippingProviderId: null, providerName: null }
    }

    if (!invoice.shipping_provider_id) {
      return { valid: false, shippingProviderId: null, providerName: null }
    }

    return {
      valid: true,
      shippingProviderId: invoice.shipping_provider_id,
      providerName: (invoice.shipping_providers as any)?.provider_name || null
    }

  } catch (error) {
    console.error("Error validating shipping provider:", error)
    return { valid: false, shippingProviderId: null, providerName: null }
  }
}

