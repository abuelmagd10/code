/**
 * Purchase Return FIFO Reversal Engine
 * ========================================
 * محرك عكس FIFO و COGS عند مرتجعات المشتريات
 * 
 * ✅ ERP-grade: يضمن:
 * - عكس FIFO lots بنفس التكلفة الأصلية
 * - إنشاء COGS reversal transactions
 * - احترام الحوكمة (branch/warehouse/cost_center)
 * - منع استخدام products.cost_price
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { getCOGSByBill, createCOGSTransaction } from './cogs-transactions'

export interface PurchaseReturnItem {
  productId: string
  quantity: number
  billItemId?: string
}

export interface FIFOReversalResult {
  success: boolean
  reversedLots: number
  reversedCOGSTransactions: string[]
  totalReversedCost: number
  error?: string
}

/**
 * عكس استهلاك FIFO lots عند مرتجع مشتريات
 * @param supabase - Supabase client
 * @param billId - معرف فاتورة الشراء
 * @param returnItems - قائمة الأصناف المرتجعة
 * @returns نتيجة العكس
 */
export async function reverseFIFOConsumptionForPurchaseReturn(
  supabase: SupabaseClient,
  billId: string,
  returnItems: PurchaseReturnItem[]
): Promise<FIFOReversalResult> {
  try {
    // 1. الحصول على استهلاكات FIFO الأصلية للفاتورة
    const { data: consumptions, error: consumptionsError } = await supabase
      .from('fifo_lot_consumptions')
      .select(`
        *,
        fifo_cost_lots (
          id,
          product_id,
          remaining_quantity,
          unit_cost,
          lot_date
        )
      `)
      .eq('reference_type', 'bill')
      .eq('reference_id', billId)
      .order('created_at', { ascending: true })

    if (consumptionsError) {
      return {
        success: false,
        reversedLots: 0,
        reversedCOGSTransactions: [],
        totalReversedCost: 0,
        error: `خطأ في جلب استهلاكات FIFO: ${consumptionsError.message}`
      }
    }

    if (!consumptions || consumptions.length === 0) {
      // لا توجد استهلاكات FIFO - قد تكون الفاتورة لم تُسجل COGS بعد
      console.warn(`No FIFO consumptions found for bill ${billId}`)
      return {
        success: true,
        reversedLots: 0,
        reversedCOGSTransactions: [],
        totalReversedCost: 0
      }
    }

    // 2. حساب الكميات الأصلية لكل منتج من الفاتورة
    const { data: billItems } = await supabase
      .from('bill_items')
      .select('id, product_id, quantity')
      .eq('bill_id', billId)

    const originalQuantities: Record<string, number> = {}
    billItems?.forEach(item => {
      if (item.product_id) {
        originalQuantities[item.product_id] = 
          (originalQuantities[item.product_id] || 0) + Number(item.quantity || 0)
      }
    })

    // 3. عكس استهلاكات FIFO لكل منتج مرتجع
    let totalReversedCost = 0
    let reversedLots = 0
    const reversedCOGSTransactions: string[] = []

    for (const returnItem of returnItems) {
      const productId = returnItem.productId
      const returnQuantity = returnItem.quantity
      const originalQuantity = originalQuantities[productId] || 0

      if (originalQuantity === 0) {
        console.warn(`No original quantity found for product ${productId} in bill ${billId}`)
        continue
      }

      // حساب نسبة المرتجع
      const returnRatio = returnQuantity / originalQuantity

      // الحصول على استهلاكات هذا المنتج
      const productConsumptions = consumptions.filter(
        c => c.fifo_cost_lots?.product_id === productId
      )

      // عكس كل استهلاك بنسبة المرتجع
      for (const consumption of productConsumptions) {
        const lot = consumption.fifo_cost_lots
        if (!lot) continue

        const returnQty = Number(consumption.quantity_consumed) * returnRatio

        if (returnQty <= 0) continue

        // إرجاع الكمية للدفعة
        const newRemaining = Number(lot.remaining_quantity) + returnQty

        const { error: updateError } = await supabase
          .from('fifo_cost_lots')
          .update({
            remaining_quantity: newRemaining,
            updated_at: new Date().toISOString()
          })
          .eq('id', lot.id)

        if (updateError) {
          console.error(`Error updating FIFO lot ${lot.id}:`, updateError)
          continue
        }

        reversedLots++
        const reversedCost = returnQty * Number(lot.unit_cost)
        totalReversedCost += reversedCost

        // تحديث أو حذف سجل الاستهلاك
        if (returnQty >= Number(consumption.quantity_consumed)) {
          // حذف كامل الاستهلاك
          await supabase
            .from('fifo_lot_consumptions')
            .delete()
            .eq('id', consumption.id)
        } else {
          // تحديث جزئي
          const newConsumed = Number(consumption.quantity_consumed) - returnQty
          await supabase
            .from('fifo_lot_consumptions')
            .update({
              quantity_consumed: newConsumed,
              updated_at: new Date().toISOString()
            })
            .eq('id', consumption.id)
        }
      }
    }

    return {
      success: true,
      reversedLots,
      reversedCOGSTransactions,
      totalReversedCost
    }
  } catch (error: any) {
    console.error('Error in reverseFIFOConsumptionForPurchaseReturn:', error)
    return {
      success: false,
      reversedLots: 0,
      reversedCOGSTransactions: [],
      totalReversedCost: 0,
      error: error.message || 'خطأ غير متوقع'
    }
  }
}

/**
 * عكس COGS transactions عند مرتجع مشتريات
 * @param supabase - Supabase client
 * @param billId - معرف فاتورة الشراء
 * @param purchaseReturnId - معرف مرتجع المشتريات
 * @param returnItems - قائمة الأصناف المرتجعة
 * @param governance - معلومات الحوكمة
 * @returns نتيجة العكس
 */
export async function reverseCOGSTransactionsForPurchaseReturn(
  supabase: SupabaseClient,
  billId: string,
  purchaseReturnId: string,
  returnItems: PurchaseReturnItem[],
  governance: {
    companyId: string
    branchId: string
    costCenterId: string
    warehouseId: string
  }
): Promise<FIFOReversalResult> {
  try {
    // التحقق من الحوكمة
    if (!governance.branchId || !governance.costCenterId || !governance.warehouseId) {
      return {
        success: false,
        reversedLots: 0,
        reversedCOGSTransactions: [],
        totalReversedCost: 0,
        error: 'الحوكمة مطلوبة: branchId, costCenterId, warehouseId'
      }
    }

    // 1. الحصول على COGS transactions الأصلية
    const originalCOGSTransactions = await getCOGSByBill(supabase, billId)

    if (originalCOGSTransactions.length === 0) {
      // لا توجد COGS transactions - قد تكون الفاتورة لم تُسجل COGS بعد
      console.warn(`No COGS transactions found for bill ${billId}`)
      return {
        success: true,
        reversedLots: 0,
        reversedCOGSTransactions: [],
        totalReversedCost: 0
      }
    }

    // 2. حساب الكميات الأصلية لكل منتج
    const { data: billItems } = await supabase
      .from('bill_items')
      .select('id, product_id, quantity')
      .eq('bill_id', billId)

    const originalQuantities: Record<string, number> = {}
    billItems?.forEach(item => {
      if (item.product_id) {
        originalQuantities[item.product_id] = 
          (originalQuantities[item.product_id] || 0) + Number(item.quantity || 0)
      }
    })

    // 3. عكس COGS transactions لكل منتج مرتجع
    let totalReversedCost = 0
    const reversedCOGSTransactions: string[] = []

    for (const returnItem of returnItems) {
      const productId = returnItem.productId
      const returnQuantity = returnItem.quantity
      const originalQuantity = originalQuantities[productId] || 0

      if (originalQuantity === 0) {
        console.warn(`No original quantity found for product ${productId} in bill ${billId}`)
        continue
      }

      // حساب نسبة المرتجع
      const returnRatio = returnQuantity / originalQuantity

      // الحصول على COGS transactions لهذا المنتج
      const productCOGS = originalCOGSTransactions.filter(
        tx => tx.product_id === productId
      )

      // عكس كل COGS transaction بنسبة المرتجع
      for (const cogsTx of productCOGS) {
        const returnQty = Number(cogsTx.quantity) * returnRatio
        const returnUnitCost = Number(cogsTx.unit_cost) // نفس التكلفة الأصلية
        const returnTotalCost = returnQty * returnUnitCost

        if (returnQty <= 0) continue

        // إنشاء COGS reversal transaction
        const reversalResult = await createCOGSTransaction(supabase, {
          companyId: governance.companyId,
          branchId: governance.branchId,
          costCenterId: governance.costCenterId,
          warehouseId: governance.warehouseId,
          productId: productId,
          sourceType: 'return',
          sourceId: purchaseReturnId,
          quantity: returnQty,
          unitCost: returnUnitCost, // نفس التكلفة الأصلية (FIFO)
          totalCost: returnTotalCost,
          transactionDate: new Date().toISOString().split('T')[0],
          notes: `عكس COGS من فاتورة شراء ${billId} - مرتجع ${purchaseReturnId}`
        })

        if (reversalResult.success && reversalResult.transactionId) {
          reversedCOGSTransactions.push(reversalResult.transactionId)
          totalReversedCost += returnTotalCost
        } else {
          console.error(`Failed to create COGS reversal for product ${productId}:`, reversalResult.error)
        }
      }
    }

    return {
      success: true,
      reversedLots: 0, // لا نحسب lots هنا، فقط COGS
      reversedCOGSTransactions,
      totalReversedCost
    }
  } catch (error: any) {
    console.error('Error in reverseCOGSTransactionsForPurchaseReturn:', error)
    return {
      success: false,
      reversedLots: 0,
      reversedCOGSTransactions: [],
      totalReversedCost: 0,
      error: error.message || 'خطأ غير متوقع'
    }
  }
}

/**
 * معالجة كاملة لعكس FIFO و COGS عند مرتجع مشتريات
 * @param supabase - Supabase client
 * @param params - معاملات المرتجع
 * @returns نتيجة المعالجة
 */
export async function processPurchaseReturnFIFOReversal(
  supabase: SupabaseClient,
  params: {
    billId: string
    purchaseReturnId: string
    returnItems: PurchaseReturnItem[]
    companyId: string
    branchId: string
    costCenterId: string
    warehouseId: string
  }
): Promise<FIFOReversalResult> {
  try {
    // 1. عكس FIFO lots
    const fifoResult = await reverseFIFOConsumptionForPurchaseReturn(
      supabase,
      params.billId,
      params.returnItems
    )

    if (!fifoResult.success) {
      return fifoResult
    }

    // 2. عكس COGS transactions
    const cogsResult = await reverseCOGSTransactionsForPurchaseReturn(
      supabase,
      params.billId,
      params.purchaseReturnId,
      params.returnItems,
      {
        companyId: params.companyId,
        branchId: params.branchId,
        costCenterId: params.costCenterId,
        warehouseId: params.warehouseId
      }
    )

    if (!cogsResult.success) {
      return cogsResult
    }

    // 3. دمج النتائج
    return {
      success: true,
      reversedLots: fifoResult.reversedLots,
      reversedCOGSTransactions: cogsResult.reversedCOGSTransactions,
      totalReversedCost: cogsResult.totalReversedCost
    }
  } catch (error: any) {
    console.error('Error in processPurchaseReturnFIFOReversal:', error)
    return {
      success: false,
      reversedLots: 0,
      reversedCOGSTransactions: [],
      totalReversedCost: 0,
      error: error.message || 'خطأ غير متوقع'
    }
  }
}
