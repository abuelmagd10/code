/**
 * COGS Transactions Engine
 * ========================================
 * المصدر الوحيد للحقيقة لـ COGS
 * يمنع استخدام products.cost_price في التقارير الرسمية
 * FIFO Engine هو الجهة الوحيدة المخولة بتحديد unit_cost
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { enforceGovernance } from './governance-middleware'
import { NextRequest } from 'next/server'

export interface COGSTransactionParams {
  companyId: string
  branchId: string
  costCenterId: string
  warehouseId: string
  productId: string
  sourceType: 'invoice' | 'bill' | 'return' | 'adjustment' | 'depreciation' | 'write_off'
  sourceId: string
  quantity: number
  unitCost: number // من FIFO Engine فقط
  totalCost: number // quantity × unitCost
  transactionDate?: string
  fifoConsumptionId?: string
  createdByUserId?: string
  notes?: string
}

export interface COGSTransactionResult {
  success: boolean
  transactionId?: string
  error?: string
}

/**
 * إنشاء سجل COGS جديد
 * @param supabase - Supabase client
 * @param params - معلومات COGS Transaction
 * @returns نتيجة العملية
 */
export async function createCOGSTransaction(
  supabase: SupabaseClient,
  params: COGSTransactionParams
): Promise<COGSTransactionResult> {
  try {
    // التحقق من الحوكمة (إلزامي)
    if (!params.companyId || !params.branchId || !params.costCenterId || !params.warehouseId) {
      return {
        success: false,
        error: 'الحوكمة مطلوبة: companyId, branchId, costCenterId, warehouseId'
      }
    }

    // التحقق من القيم الإيجابية
    if (params.quantity <= 0 || params.unitCost < 0 || params.totalCost < 0) {
      return {
        success: false,
        error: 'القيم يجب أن تكون إيجابية: quantity > 0, unitCost >= 0, totalCost >= 0'
      }
    }

    // التحقق من تطابق totalCost مع quantity × unitCost (للدقة)
    const expectedTotalCost = Number((params.quantity * params.unitCost).toFixed(2))
    const actualTotalCost = Number(params.totalCost.toFixed(2))

    if (Math.abs(expectedTotalCost - actualTotalCost) > 0.01) {
      return {
        success: false,
        error: `totalCost (${actualTotalCost}) لا يطابق quantity × unitCost (${expectedTotalCost})`
      }
    }

    // إنشاء سجل COGS
    const { data, error } = await supabase
      .from('cogs_transactions')
      .insert({
        company_id: params.companyId,
        branch_id: params.branchId,
        cost_center_id: params.costCenterId,
        warehouse_id: params.warehouseId,
        product_id: params.productId,
        source_type: params.sourceType,
        source_id: params.sourceId,
        quantity: params.quantity,
        unit_cost: params.unitCost,
        total_cost: params.totalCost,
        transaction_date: params.transactionDate || new Date().toISOString().split('T')[0],
        fifo_consumption_id: params.fifoConsumptionId || null,
        created_by_user_id: params.createdByUserId || null,
        notes: params.notes || null
      })
      .select('id')
      .single()

    if (error) {
      console.error('Error creating COGS transaction:', error)
      return {
        success: false,
        error: `خطأ في إنشاء سجل COGS: ${error.message}`
      }
    }

    return {
      success: true,
      transactionId: data.id
    }
  } catch (error: any) {
    console.error('Error in createCOGSTransaction:', error)
    return {
      success: false,
      error: error.message || 'خطأ غير متوقع'
    }
  }
}


/**
 * تحضير بيانات عكس COGS (للاستخدام الذري)
 * @param supabase - Supabase client
 * @param originalTransactionId - معرف السجل الأصلي
 * @param newSourceId - معرف المصدر الجديد (return_id)
 * @returns بيانات السجل الجديد
 */
export async function prepareReverseCOGSTransaction(
  supabase: SupabaseClient,
  originalTransactionId: string,
  newSourceId: string
): Promise<any | null> {
  try {
    // الحصول على السجل الأصلي
    const { data: original, error: fetchError } = await supabase
      .from('cogs_transactions')
      .select('*')
      .eq('id', originalTransactionId)
      .single()

    if (fetchError || !original) {
      console.error('Original COGS transaction not found:', originalTransactionId)
      return null
    }

    // إرجاع كائن البيانات لعكس COGS (نفس البيانات لكن source_type = return)
    // ملاحظة: الكمية والتكلفة موجبة هنا لأننا ننشئ سجل جديد بنوع return
    // وفي التقارير، يتم طرح التكاليف ذات النوع return من الإجمالي
    return {
      company_id: original.company_id,
      branch_id: original.branch_id,
      cost_center_id: original.cost_center_id,
      warehouse_id: original.warehouse_id,
      product_id: original.product_id,
      source_type: 'return',
      source_id: newSourceId,
      quantity: original.quantity,
      unit_cost: original.unit_cost, // نفس التكلفة الأصلية (FIFO)
      total_cost: original.total_cost, // نفس التكلفة الأصلية
      transaction_date: new Date().toISOString().split('T')[0],
      notes: `عكس COGS من ${original.source_type} ${original.source_id}`
    }
  } catch (error: any) {
    console.error('Error in prepareReverseCOGSTransaction:', error)
    return null
  }
}


/**
 * حساب إجمالي COGS مع الحوكمة
 * @param supabase - Supabase client
 * @param params - معايير الحوكمة
 * @returns إجمالي COGS
 */
export async function calculateCOGSTotal(
  supabase: SupabaseClient,
  params: {
    companyId: string
    fromDate?: string
    toDate?: string
    branchId?: string
    costCenterId?: string
    warehouseId?: string
    sourceType?: string
    sourceIds?: string[] // تصفية بمعرفات المصادر (الفواتير) المحددة فقط
  }
): Promise<number> {
  try {
    let query = supabase
      .from('cogs_transactions')
      .select('total_cost')
      .eq('company_id', params.companyId)

    if (params.fromDate) {
      query = query.gte('transaction_date', params.fromDate)
    }
    if (params.toDate) {
      query = query.lte('transaction_date', params.toDate)
    }
    if (params.branchId) {
      query = query.eq('branch_id', params.branchId)
    }
    if (params.costCenterId) {
      query = query.eq('cost_center_id', params.costCenterId)
    }
    if (params.warehouseId) {
      query = query.eq('warehouse_id', params.warehouseId)
    }
    if (params.sourceType) {
      query = query.eq('source_type', params.sourceType)
    }
    // ✅ فلترة بمعرفات الفواتير النشطة فقط لتجنب حساب COGS لفواتير محذوفة أو غير موجودة
    if (params.sourceIds && params.sourceIds.length > 0) {
      query = query.in('source_id', params.sourceIds)
    } else if (params.sourceIds && params.sourceIds.length === 0) {
      return 0
    }

    const { data, error } = await query

    if (error) {
      console.error('Error calculating COGS total:', error)
      return 0
    }

    return (data || []).reduce((sum, item) => sum + Number(item.total_cost || 0), 0)
  } catch (error: any) {
    console.error('Error in calculateCOGSTotal:', error)
    return 0
  }
}

/**
 * الحصول على COGS لفاتورة معينة
 * @param supabase - Supabase client
 * @param invoiceId - معرف الفاتورة
 * @returns قائمة COGS transactions
 */
export async function getCOGSByInvoice(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('cogs_transactions')
      .select('*')
      .eq('source_type', 'invoice')
      .eq('source_id', invoiceId)
      .order('transaction_date', { ascending: true })

    if (error) {
      console.error('Error fetching COGS by invoice:', error)
      return []
    }

    return data || []
  } catch (error: any) {
    console.error('Error in getCOGSByInvoice:', error)
    return []
  }
}

/**
 * الحصول على COGS لفاتورة شراء معينة
 * @param supabase - Supabase client
 * @param billId - معرف فاتورة الشراء
 * @returns قائمة COGS transactions
 */
export async function getCOGSByBill(
  supabase: SupabaseClient,
  billId: string
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('cogs_transactions')
      .select('*')
      .eq('source_type', 'bill')
      .eq('source_id', billId)
      .order('transaction_date', { ascending: true })

    if (error) {
      console.error('Error fetching COGS by bill:', error)
      return []
    }

    return data || []
  } catch (error: any) {
    console.error('Error in getCOGSByBill:', error)
    return []
  }
}

/**
 * التحقق من صحة البيانات (Validation)
 * مقارنة مجموع المخزون مع مجموع COGS + المرتجعات
 * @param supabase - Supabase client
 * @param companyId - معرف الشركة
 * @param warehouseId - معرف المخزن (اختياري)
 * @returns نتيجة التحقق
 */
export async function validateCOGSIntegrity(
  supabase: SupabaseClient,
  companyId: string,
  warehouseId?: string
): Promise<{
  isValid: boolean
  inventoryTotal: number
  cogsTotal: number
  returnsTotal: number
  difference: number
  error?: string
}> {
  try {
    // حساب إجمالي المخزون من inventory_transactions
    let inventoryQuery = supabase
      .from('inventory_transactions')
      .select('quantity_change')
      .eq('company_id', companyId)

    if (warehouseId) {
      inventoryQuery = inventoryQuery.eq('warehouse_id', warehouseId)
    }

    const { data: inventoryData } = await inventoryQuery
    const inventoryTotal = (inventoryData || []).reduce(
      (sum, tx) => sum + Number(tx.quantity_change || 0),
      0
    )

    // حساب إجمالي COGS
    const cogsTotal = await calculateCOGSTotal(supabase, {
      companyId,
      warehouseId,
      sourceType: 'invoice'
    })

    // حساب إجمالي المرتجعات
    const returnsTotal = await calculateCOGSTotal(supabase, {
      companyId,
      warehouseId,
      sourceType: 'return'
    })

    // حساب الفرق
    const difference = inventoryTotal + returnsTotal - cogsTotal

    // التحقق من التطابق (مع التسامح صغير للأخطاء الحسابية)
    const tolerance = 0.01
    const isValid = Math.abs(difference) <= tolerance

    return {
      isValid,
      inventoryTotal,
      cogsTotal,
      returnsTotal,
      difference
    }
  } catch (error: any) {
    console.error('Error in validateCOGSIntegrity:', error)
    return {
      isValid: false,
      inventoryTotal: 0,
      cogsTotal: 0,
      returnsTotal: 0,
      difference: 0,
      error: error.message
    }
  }
}
