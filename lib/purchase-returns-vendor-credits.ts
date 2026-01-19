/**
 * 📌 Purchase Returns Vendor Credits Helper Functions
 * دوال مساعدة لإنشاء إشعارات دائن الموردين (Vendor Credits) تلقائياً عند مرتجعات المشتريات
 * 
 * ⚠️ القواعد الإلزامية ERP-grade:
 * ✅ يتم إنشاء Vendor Credit تلقائياً عند مرتجع فاتورة Paid أو Partially Paid
 * ✅ يتم إنشاء Vendor Credit فقط للـ Credit Return (settlement_method = 'credit')
 * ❌ لا يتم إنشاء Vendor Credit عند مرتجع فاتورة Received أو Draft
 * ❌ لا يتم إنشاء Vendor Credit للـ Cash Refund أو Bank Refund
 * ✅ يجب ربط الإشعار بـ: company_id, branch_id, cost_center_id, warehouse_id, supplier_id, source_purchase_invoice_id, source_purchase_return_id
 * ✅ يتم إنشاء قيد محاسبي عكسي صحيح
 * ✅ الحالة الأولية: open
 * ✅ لا يتم تعديل الفاتورة الأصلية (audit-locked)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface VendorCreditParams {
  companyId: string
  supplierId: string
  billId: string | null
  purchaseReturnId: string
  returnNumber: string
  returnDate: string
  subtotal: number
  taxAmount: number
  totalAmount: number
  branchId: string | null
  costCenterId: string | null
  warehouseId: string | null
  journalEntryId: string | null
  items: VendorCreditItem[]
  currency?: string
  exchangeRate?: number
  exchangeRateId?: string | null
}

export interface VendorCreditItem {
  productId: string | null
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
  discountPercent: number
  lineTotal: number
}

export interface VendorCreditResult {
  success: boolean
  vendorCreditId?: string
  error?: string
}

/**
 * 📌 إنشاء Vendor Credit تلقائياً عند مرتجع مشتريات
 * 
 * ⚠️ مهم: هذه الدالة يجب أن تُستدعى فقط للـ Credit Return (settlement_method = 'credit')
 * لا تُستدعى للـ Cash Refund أو Bank Refund
 * 
 * @param supabase - Supabase client
 * @param params - معلومات المرتجع
 * @returns نتيجة الإنشاء
 */
export async function createVendorCreditForReturn(
  supabase: SupabaseClient,
  params: VendorCreditParams
): Promise<VendorCreditResult> {
  try {
    const {
      companyId,
      supplierId,
      billId,
      purchaseReturnId,
      returnNumber,
      returnDate,
      subtotal,
      taxAmount,
      totalAmount,
      branchId,
      costCenterId,
      warehouseId,
      journalEntryId,
      items,
      currency = 'EGP',
      exchangeRate = 1,
      exchangeRateId = null
    } = params

    // ✅ التحقق من الحوكمة (إلزامي)
    if (!branchId || !costCenterId || !warehouseId) {
      return {
        success: false,
        error: 'الحوكمة مطلوبة: branchId, costCenterId, warehouseId'
      }
    }

    // 1️⃣ التحقق من عدم وجود vendor_credit مسبق لنفس المرتجع
    const { data: existingCredit } = await supabase
      .from('vendor_credits')
      .select('id')
      .eq('source_purchase_return_id', purchaseReturnId)
      .single()

    if (existingCredit) {
      return {
        success: false,
        error: 'Vendor Credit already exists for this purchase return'
      }
    }

    // 2️⃣ إنشاء رقم إشعار دائن
    const creditNumber = `VC-${returnNumber.replace('PRET-', '')}`

    // 3️⃣ إنشاء Vendor Credit
    const { data: vendorCredit, error: vcError } = await supabase
      .from('vendor_credits')
      .insert({
        company_id: companyId,
        supplier_id: supplierId,
        bill_id: billId,
        source_purchase_invoice_id: billId,
        source_purchase_return_id: purchaseReturnId,
        credit_number: creditNumber,
        credit_date: returnDate,
        subtotal: subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        applied_amount: 0,
        status: 'open',
        reference_type: 'purchase_return',
        reference_id: purchaseReturnId,
        journal_entry_id: journalEntryId,
        branch_id: branchId,
        cost_center_id: costCenterId,
        warehouse_id: warehouseId,
        notes: `إشعار دائن تلقائي من مرتجع المشتريات ${returnNumber}`,
        // Multi-currency support
        original_currency: currency,
        original_subtotal: subtotal,
        original_tax_amount: taxAmount,
        original_total_amount: totalAmount,
        exchange_rate_used: exchangeRate,
        exchange_rate_id: exchangeRateId
      })
      .select('id')
      .single()

    if (vcError || !vendorCredit) {
      console.error('Error creating vendor credit:', vcError)
      return {
        success: false,
        error: vcError?.message || 'Failed to create vendor credit'
      }
    }

    // 4️⃣ إنشاء بنود Vendor Credit
    const vendorCreditItems = items.map(item => ({
      vendor_credit_id: vendorCredit.id,
      product_id: item.productId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      tax_rate: item.taxRate,
      discount_percent: item.discountPercent,
      line_total: item.lineTotal
    }))

    const { error: itemsError } = await supabase
      .from('vendor_credit_items')
      .insert(vendorCreditItems)

    if (itemsError) {
      console.error('Error creating vendor credit items:', itemsError)
      // حذف vendor_credit إذا فشل إنشاء البنود
      await supabase.from('vendor_credits').delete().eq('id', vendorCredit.id)
      return {
        success: false,
        error: itemsError.message
      }
    }

    console.log(`✅ Vendor Credit created successfully: ${creditNumber} (ID: ${vendorCredit.id})`)

    return {
      success: true,
      vendorCreditId: vendorCredit.id
    }
  } catch (error: any) {
    console.error('Error in createVendorCreditForReturn:', error)
    return {
      success: false,
      error: error.message || 'Unknown error'
    }
  }
}

