/**
 * 📌 Purchase Returns Vendor Credits Helper Functions
 * دوال مساعدة لإنشاء إشعارات دائن الموردين (Vendor Credits) تلقائياً عند مرتجعات المشتريات
 * 
 * ⚠️ القواعد الإلزامية ERP-grade:
 * ✅ يتم إنشاء Vendor Credit تلقائياً عند مرتجع فاتورة Paid أو Partially Paid
 * ✅ يتم إنشاء Vendor Credit فقط للـ Credit Return (settlement_method = 'credit')
 * ❌ لا يتم إنشاء Vendor Credit عند مرتجع فاتورة Received أو Draft
 * ❌ لا يتم إنشاء Vendor Credit للـ Cash Refund أو Bank Refund
 * ✅ يجب ربط الإشعار بـ: company_id, branch_id, cost_center_id, supplier_id, source_purchase_invoice_id, source_purchase_return_id
 *    (v3.74.865 — حُذف `warehouse_id` من هذه القائمة: لا عمود بهذا الاسم فى
 *     `vendor_credits`، وكانت العلامة ✅ تصف ربطاً لم يقم قط. والمخزن يُستدل
 *     عليه من المرتجع المصدر.)
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

    // 3️⃣ إنشاء Vendor Credit ببنوده — **نداءٌ واحد**
    //
    // v3.74.880 — كان الرأس يُدرَج أولاً، وعند فشل البنود يُحذف الرأس.
    // **وذلك الحذف لم يكن ممكناً أصلاً**: الإشعار يُنشأ بحالة `open`،
    // و`prevent_vendor_credit_deletion` لا يسمح بالحذف إلا لـ`draft`
    // أو `cancelled`. أُثبت على الإنتاج (ومُلغى):
    //
    //     rollback DELETE (status=open) : REFUSED
    //       -> Cannot delete Vendor Credit … (open).
    //     orphan header left behind : 1  (journal entry already posted)
    //
    // فمسار التراجُع كان **يقينىَّ الفشل**، ويترك بالضبط ما حذّر منه
    // تعليقه: رأسٌ بمبلغٍ لا يُفسّره سطر، وقيدٌ مُرحَّل خلفه.
    //
    // ⇒ **تراجُعٌ يدوىٌّ لا يُختبر ليس تراجُعاً، بل رجاء.** والمعاملة
    //   الواحدة تتراجع بنفسها، ولا تحتاج إذناً من مُشغِّلٍ آخر.
    const vendorCreditItems = items.map(item => ({
      product_id: item.productId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      tax_rate: item.taxRate,
      discount_percent: item.discountPercent,
      line_total: item.lineTotal
    }))

    const { data: newCreditId, error: vcError } = await supabase
      .rpc('create_vendor_credit_with_items', {
        p_credit: {
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
          // v3.74.865 — `warehouse_id` عمودٌ **لا وجود له** فى `vendor_credits`،
          // فكان الإدراج يفشل كاملاً. والتعليق فى رأس هذا الملف يُدرج المخزن
          // ضمن ما «يجب ربط الإشعار به» بعلامة ✅ — **وهو ربطٌ لم يقم قط**.
          // والمخزن مستخلَصٌ من المرتجع المصدر عبر `source_purchase_return_id`.
          //
          // ⚠️ **تصحيحٌ فى v3.74.868:** قلتُ فى ٨٦٥ إن هذه الدالة «بلا مستدعٍ
          // فلم يظهر العطب تشغيلياً». **وهذا خطأ.** بحثى عن المستدعين قصرتُه
          // على `--include=*.ts` والمستدعيان صفحتان `.tsx`:
          //     app/bills/page.tsx  ·  app/bills/[id]/page.tsx
          // ⇒ فالمسار **حىٌّ**، والعطب كان يقع فعلاً: صفر إشعار دائن فى
          //   الإنتاج رغم وجود مرتجعات مشتريات. **بحثُ وصولٍ يستثنى `.tsx`
          //   يَصِف الحىَّ ميتاً** — وهو خطأٌ يُهوِّن من أثر العطب لا يُضخّمه،
          //   وهو أسوأ اتجاهٍ للخطأ.
          notes: `إشعار دائن تلقائي من مرتجع المشتريات ${returnNumber}`,
          // Multi-currency support
          original_currency: currency,
          original_subtotal: subtotal,
          original_tax_amount: taxAmount,
          original_total_amount: totalAmount,
          exchange_rate_used: exchangeRate,
          exchange_rate_id: exchangeRateId
        },
        p_items: vendorCreditItems
      })

    if (vcError || !newCreditId) {
      console.error('Error creating vendor credit:', vcError)
      return {
        success: false,
        error: vcError?.message || 'Failed to create vendor credit'
      }
    }

    const vendorCredit = { id: newCreditId as string }

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

