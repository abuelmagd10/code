/**
 * FIFO Cost Engine (Zoho Books Compatible)
 * ========================================
 * محرك حساب COGS باستخدام FIFO (First In First Out)
 * مطابق لنظام Zoho Books في تتبع دفعات الشراء
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface FIFOLot {
  id: string
  product_id: string
  lot_date: string
  lot_type: string
  original_quantity: number
  remaining_quantity: number
  unit_cost: number
  reference_type?: string
  reference_id?: string
}

export interface FIFOConsumption {
  lot_id: string
  quantity_consumed: number
  unit_cost: number
  total_cost: number
  lot_date: string
}

export interface FIFOCOGSResult {
  total_cogs: number
  lots_used: FIFOConsumption[]
  insufficient_stock: boolean
  missing_quantity: number
}

/**
 * حساب COGS باستخدام FIFO
 * @param supabase - Supabase client
 * @param productId - معرف المنتج
 * @param quantity - الكمية المطلوبة
 * @returns نتيجة حساب COGS مع تفاصيل الدفعات المستخدمة
 */
export async function calculateFIFOCOGS(
  supabase: SupabaseClient,
  productId: string,
  quantity: number
): Promise<FIFOCOGSResult> {
  // الحصول على الدفعات المتاحة بترتيب FIFO
  const { data: lots, error } = await supabase
    .from('fifo_cost_lots')
    .select('*')
    .eq('product_id', productId)
    .gt('remaining_quantity', 0)
    .order('lot_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Error fetching FIFO lots: ${error.message}`)
  }

  if (!lots || lots.length === 0) {
    return {
      total_cogs: 0,
      lots_used: [],
      insufficient_stock: true,
      missing_quantity: quantity
    }
  }

  let remainingQty = quantity
  let totalCOGS = 0
  const lotsUsed: FIFOConsumption[] = []

  for (const lot of lots) {
    if (remainingQty <= 0) break

    const qtyFromLot = Math.min(lot.remaining_quantity, remainingQty)
    const costFromLot = qtyFromLot * lot.unit_cost

    totalCOGS += costFromLot
    lotsUsed.push({
      lot_id: lot.id,
      quantity_consumed: qtyFromLot,
      unit_cost: lot.unit_cost,
      total_cost: costFromLot,
      lot_date: lot.lot_date
    })

    remainingQty -= qtyFromLot
  }

  return {
    total_cogs: totalCOGS,
    lots_used: lotsUsed,
    insufficient_stock: remainingQty > 0,
    missing_quantity: remainingQty
  }
}

/**
 * استهلاك دفعات FIFO عند البيع
 * @param supabase - Supabase client
 * @param params - معلومات الاستهلاك
 * @returns إجمالي COGS
 */
export async function consumeFIFOLots(
  supabase: SupabaseClient,
  params: {
    companyId: string
    productId: string
    quantity: number
    consumptionType: 'sale' | 'write_off' | 'adjustment_out'
    referenceType: string
    referenceId: string
    consumptionDate?: string
  }
): Promise<number> {
  const { data, error } = await supabase.rpc('consume_fifo_lots', {
    p_company_id: params.companyId,
    p_product_id: params.productId,
    p_quantity: params.quantity,
    p_consumption_type: params.consumptionType,
    p_reference_type: params.referenceType,
    p_reference_id: params.referenceId,
    p_consumption_date: params.consumptionDate || new Date().toISOString().split('T')[0]
  })

  if (error) {
    throw new Error(`Error consuming FIFO lots: ${error.message}`)
  }

  return Number(data || 0)
}

/**
 * عكس استهلاك دفعات FIFO (عند المرتجعات)
 * @param supabase - Supabase client
 * @param referenceType - نوع المرجع
 * @param referenceId - معرف المرجع
 */
export async function reverseFIFOConsumption(
  supabase: SupabaseClient,
  referenceType: string,
  referenceId: string
): Promise<void> {
  const { error } = await supabase.rpc('reverse_fifo_consumption', {
    p_reference_type: referenceType,
    p_reference_id: referenceId
  })

  if (error) {
    throw new Error(`Error reversing FIFO consumption: ${error.message}`)
  }
}

/**
 * إنشاء دفعة FIFO جديدة (عند الشراء أو Opening Stock)
 * @param supabase - Supabase client
 * @param params - معلومات الدفعة
 */
export async function createFIFOLot(
  supabase: SupabaseClient,
  params: {
    companyId: string
    productId: string
    lotDate: string
    lotType: 'opening_stock' | 'purchase' | 'adjustment'
    referenceType?: string
    referenceId?: string
    quantity: number
    unitCost: number
    notes?: string
    branchId?: string
    warehouseId?: string
  }
): Promise<string> {
  const { data, error } = await supabase
    .from('fifo_cost_lots')
    .insert({
      company_id: params.companyId,
      product_id: params.productId,
      lot_date: params.lotDate,
      lot_type: params.lotType,
      reference_type: params.referenceType,
      reference_id: params.referenceId,
      original_quantity: params.quantity,
      remaining_quantity: params.quantity,
      unit_cost: params.unitCost,
      notes: params.notes,
      branch_id: params.branchId,
      warehouse_id: params.warehouseId
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Error creating FIFO lot: ${error.message}`)
  }

  return data.id
}

/**
 * الحصول على ملخص دفعات FIFO لمنتج
 * @param supabase - Supabase client
 * @param productId - معرف المنتج
 */
export async function getFIFOLotsSummary(
  supabase: SupabaseClient,
  productId: string
): Promise<{
  totalLots: number
  totalRemainingQty: number
  totalRemainingValue: number
  weightedAvgCost: number
  oldestLotDate: string | null
  newestLotDate: string | null
}> {
  const { data, error } = await supabase
    .from('v_fifo_lots_summary')
    .select('*')
    .eq('product_id', productId)
    .single()

  if (error) {
    throw new Error(`Error fetching FIFO summary: ${error.message}`)
  }

  return {
    totalLots: data.total_lots || 0,
    totalRemainingQty: data.total_remaining_qty || 0,
    totalRemainingValue: data.total_remaining_value || 0,
    weightedAvgCost: data.weighted_avg_cost || 0,
    oldestLotDate: data.oldest_lot_date,
    newestLotDate: data.newest_lot_date
  }
}

/**
 * الحصول على تفاصيل استهلاك FIFO لفاتورة
 * @param supabase - Supabase client
 * @param invoiceId - معرف الفاتورة
 */
export async function getFIFOConsumptionByInvoice(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<FIFOConsumption[]> {
  const { data, error } = await supabase
    .from('fifo_lot_consumptions')
    .select(`
      lot_id,
      quantity_consumed,
      unit_cost,
      total_cost,
      fifo_cost_lots!inner(lot_date)
    `)
    .eq('reference_type', 'invoice')
    .eq('reference_id', invoiceId)

  if (error) {
    throw new Error(`Error fetching FIFO consumption: ${error.message}`)
  }

  return (data || []).map((item: any) => ({
    lot_id: item.lot_id,
    quantity_consumed: item.quantity_consumed,
    unit_cost: item.unit_cost,
    total_cost: item.total_cost,
    lot_date: item.fifo_cost_lots.lot_date
  }))
}

/**
 * ترحيل المشتريات الموجودة إلى نظام FIFO
 * @param supabase - Supabase client
 */
export async function migratePurchasesToFIFO(
  supabase: SupabaseClient
): Promise<{
  productsMigrated: number
  lotsCreated: number
  totalValue: number
}> {
  const { data, error } = await supabase.rpc('migrate_existing_purchases_to_fifo')

  if (error) {
    throw new Error(`Error migrating to FIFO: ${error.message}`)
  }

  const result = data[0] || { products_migrated: 0, lots_created: 0, total_value: 0 }

  return {
    productsMigrated: result.products_migrated,
    lotsCreated: result.lots_created,
    totalValue: result.total_value
  }
}

/**
 * إنشاء دفعات Opening Stock لجميع المنتجات
 * @param supabase - Supabase client
 * @param companyId - معرف الشركة
 */
export async function createOpeningStockLots(
  supabase: SupabaseClient,
  companyId: string
): Promise<number> {
  const { data, error } = await supabase.rpc('create_opening_stock_fifo_lots', {
    p_company_id: companyId
  })

  if (error) {
    throw new Error(`Error creating opening stock lots: ${error.message}`)
  }

  return Number(data || 0)
}

