-- =====================================================
-- 🔧 إصلاح تلقائي محسّن للقيود المحاسبية الناقصة
-- Improved Auto-Fix for Missing Journal Entries
-- =====================================================
-- تاريخ الإنشاء: 2025-01-XX
-- الهدف: إصلاح محسّن يتعامل مع جميع الحالات الخاصة
-- =====================================================

-- =====================================================
-- إصلاح البيانات أولاً
-- =====================================================
DO $$
DECLARE
  v_fixed_count INTEGER := 0;
BEGIN
  RAISE NOTICE '🔧 بدء إصلاح البيانات...';
  
  -- إصلاح الفواتير التي total_amount = NULL أو <= 0
  UPDATE invoices
  SET total_amount = GREATEST(
    COALESCE(subtotal, 0) + COALESCE(tax_amount, 0) + COALESCE(shipping, 0) - COALESCE(discount_value, 0),
    0.01
  )
  WHERE status IN ('sent', 'paid', 'partially_paid')
    AND (is_deleted IS NULL OR is_deleted = false)
    AND (total_amount IS NULL OR total_amount <= 0);
  
  GET DIAGNOSTICS v_fixed_count = ROW_COUNT;
  IF v_fixed_count > 0 THEN
    RAISE NOTICE '✅ تم إصلاح % فاتورة (total_amount)', v_fixed_count;
  END IF;
  
  -- إصلاح الفواتير التي invoice_date = NULL
  UPDATE invoices
  SET invoice_date = DATE(created_at)
  WHERE status IN ('sent', 'paid', 'partially_paid')
    AND (is_deleted IS NULL OR is_deleted = false)
    AND invoice_date IS NULL
    AND created_at IS NOT NULL;
  
  GET DIAGNOSTICS v_fixed_count = ROW_COUNT;
  IF v_fixed_count > 0 THEN
    RAISE NOTICE '✅ تم إصلاح % فاتورة (invoice_date)', v_fixed_count;
  END IF;
  
  -- إصلاح فواتير الشراء
  UPDATE bills
  SET total_amount = GREATEST(
    COALESCE(subtotal, 0) + COALESCE(tax_amount, 0),
    0.01
  )
  WHERE status IN ('sent', 'paid', 'partially_paid', 'received')
    AND (is_deleted IS NULL OR is_deleted = false)
    AND (total_amount IS NULL OR total_amount <= 0);
  
  GET DIAGNOSTICS v_fixed_count = ROW_COUNT;
  IF v_fixed_count > 0 THEN
    RAISE NOTICE '✅ تم إصلاح % فاتورة شراء (total_amount)', v_fixed_count;
  END IF;
  
  -- إصلاح فواتير الشراء التي bill_date = NULL
  UPDATE bills
  SET bill_date = DATE(created_at)
  WHERE status IN ('sent', 'paid', 'partially_paid', 'received')
    AND (is_deleted IS NULL OR is_deleted = false)
    AND bill_date IS NULL
    AND created_at IS NOT NULL;
  
  GET DIAGNOSTICS v_fixed_count = ROW_COUNT;
  IF v_fixed_count > 0 THEN
    RAISE NOTICE '✅ تم إصلاح % فاتورة شراء (bill_date)', v_fixed_count;
  END IF;
  
  RAISE NOTICE '✅ اكتمل إصلاح البيانات';
END $$;

-- =====================================================
-- إصلاح الفواتير - نسخة محسّنة
-- =====================================================
DO $$
DECLARE
  v_invoice RECORD;
  v_entry_id UUID;
  v_payment_entry_id UUID;
  v_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_accounts RECORD;
  v_has_ar BOOLEAN := FALSE;
  v_has_revenue BOOLEAN := FALSE;
BEGIN
  RAISE NOTICE '🔧 بدء إصلاح الفواتير بدون قيود محاسبية...';
  
  FOR v_invoice IN 
    SELECT 
      i.id,
      i.company_id,
      i.invoice_number,
      COALESCE(i.invoice_date, DATE(i.created_at)) as invoice_date,
      i.status,
      GREATEST(COALESCE(i.total_amount, 0), 0.01) as total_amount,
      COALESCE(i.subtotal, 0) as subtotal,
      COALESCE(i.tax_amount, 0) as tax_amount,
      COALESCE(i.shipping, 0) as shipping,
      COALESCE(i.discount_value, 0) as discount_value,
      COALESCE(i.paid_amount, 0) as paid_amount
    FROM invoices i
    WHERE i.status IN ('sent', 'paid', 'partially_paid')
      AND (i.is_deleted IS NULL OR i.is_deleted = false)
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je 
        WHERE je.reference_id = i.id 
        AND je.reference_type = 'invoice'
      )
    ORDER BY COALESCE(i.invoice_date, DATE(i.created_at))
  LOOP
    BEGIN
      -- التحقق من الحسابات
      SELECT * INTO v_accounts FROM find_company_accounts(v_invoice.company_id);
      v_has_ar := (v_accounts.ar_account_id IS NOT NULL);
      v_has_revenue := (v_accounts.revenue_account_id IS NOT NULL);
      
      IF NOT v_has_ar THEN
        RAISE WARNING '❌ تخطي الفاتورة %: حساب AR غير موجود', v_invoice.invoice_number;
        v_error_count := v_error_count + 1;
        CONTINUE;
      END IF;
      
      IF NOT v_has_revenue THEN
        RAISE WARNING '❌ تخطي الفاتورة %: حساب Revenue غير موجود', v_invoice.invoice_number;
        v_error_count := v_error_count + 1;
        CONTINUE;
      END IF;
      
      -- إنشاء قيد AR/Revenue
      BEGIN
        v_entry_id := create_invoice_ar_revenue_entry(
          v_invoice.id,
          v_invoice.company_id,
          v_invoice.invoice_date,
          'إصلاح تلقائي: قيد فاتورة ' || v_invoice.invoice_number
        );
        
        v_count := v_count + 1;
        RAISE NOTICE '✅ تم إنشاء قيد AR/Revenue للفاتورة: %', v_invoice.invoice_number;
        
        -- إذا كانت الفاتورة مدفوعة أو مدفوعة جزئياً، إنشاء قيد الدفع
        IF v_invoice.paid_amount > 0 THEN
          BEGIN
            -- التحقق من وجود Cash/Bank
            IF v_accounts.cash_account_id IS NULL AND v_accounts.bank_account_id IS NULL THEN
              RAISE WARNING '⚠️ تخطي قيد الدفع للفاتورة %: لا يوجد حساب Cash/Bank', v_invoice.invoice_number;
            ELSE
              v_payment_entry_id := create_invoice_payment_entry(
                v_invoice.id,
                NULL,
                v_invoice.company_id,
                v_invoice.invoice_date,
                v_invoice.paid_amount,
                'cash',
                'إصلاح تلقائي: قيد دفع فاتورة ' || v_invoice.invoice_number
              );
              
              RAISE NOTICE '✅ تم إنشاء قيد الدفع للفاتورة: %', v_invoice.invoice_number;
            END IF;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '⚠️ فشل إنشاء قيد الدفع للفاتورة %: %', v_invoice.invoice_number, SQLERRM;
          END;
        END IF;
        
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '❌ فشل إنشاء قيد AR/Revenue للفاتورة %: %', v_invoice.invoice_number, SQLERRM;
        v_error_count := v_error_count + 1;
      END;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ خطأ عام في الفاتورة %: %', v_invoice.invoice_number, SQLERRM;
      v_error_count := v_error_count + 1;
    END;
  END LOOP;
  
  RAISE NOTICE '✅ تم إصلاح % فاتورة', v_count;
  IF v_error_count > 0 THEN
    RAISE WARNING '⚠️ فشل إصلاح % فاتورة', v_error_count;
  END IF;
END $$;

-- =====================================================
-- إصلاح فواتير الشراء - نسخة محسّنة
-- =====================================================
DO $$
DECLARE
  v_bill RECORD;
  v_entry_id UUID;
  v_payment_entry_id UUID;
  v_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
  v_accounts RECORD;
  v_has_ap BOOLEAN := FALSE;
  v_has_expense BOOLEAN := FALSE;
BEGIN
  RAISE NOTICE '🔧 بدء إصلاح فواتير الشراء بدون قيود محاسبية...';
  
  FOR v_bill IN 
    SELECT 
      b.id,
      b.company_id,
      b.bill_number,
      COALESCE(b.bill_date, DATE(b.created_at)) as bill_date,
      b.status,
      GREATEST(COALESCE(b.total_amount, 0), 0.01) as total_amount,
      COALESCE(b.subtotal, 0) as subtotal,
      COALESCE(b.tax_amount, 0) as tax_amount,
      COALESCE(b.paid_amount, 0) as paid_amount
    FROM bills b
    WHERE b.status IN ('sent', 'paid', 'partially_paid', 'received')
      AND (b.is_deleted IS NULL OR b.is_deleted = false)
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je 
        WHERE je.reference_id = b.id 
        AND je.reference_type = 'bill'
      )
    ORDER BY COALESCE(b.bill_date, DATE(b.created_at))
  LOOP
    BEGIN
      -- فواتير الشراء تحتاج قيد AP/Expense فقط عند الدفع الأول
      IF v_bill.paid_amount = 0 OR v_bill.paid_amount IS NULL THEN
        RAISE NOTICE 'ℹ️ تخطي فاتورة الشراء %: لم يتم الدفع بعد (paid_amount = 0)', v_bill.bill_number;
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;
      
      -- التحقق من الحسابات
      SELECT * INTO v_accounts FROM find_company_accounts(v_bill.company_id);
      v_has_ap := (v_accounts.ap_account_id IS NOT NULL);
      v_has_expense := (v_accounts.expense_account_id IS NOT NULL);
      
      IF NOT v_has_ap THEN
        RAISE WARNING '❌ تخطي فاتورة الشراء %: حساب AP غير موجود', v_bill.bill_number;
        v_error_count := v_error_count + 1;
        CONTINUE;
      END IF;
      
      IF NOT v_has_expense THEN
        RAISE WARNING '❌ تخطي فاتورة الشراء %: حساب Expense غير موجود', v_bill.bill_number;
        v_error_count := v_error_count + 1;
        CONTINUE;
      END IF;
      
      -- إنشاء قيد AP/Expense
      BEGIN
        v_entry_id := create_bill_ap_expense_entry(
          v_bill.id,
          v_bill.company_id,
          v_bill.bill_date,
          'إصلاح تلقائي: قيد فاتورة شراء ' || v_bill.bill_number
        );
        
        v_count := v_count + 1;
        RAISE NOTICE '✅ تم إنشاء قيد AP/Expense لفاتورة الشراء: %', v_bill.bill_number;
        
        -- إنشاء قيد الدفع
        BEGIN
          -- التحقق من وجود Cash/Bank
          IF v_accounts.cash_account_id IS NULL AND v_accounts.bank_account_id IS NULL THEN
            RAISE WARNING '⚠️ تخطي قيد الدفع لفاتورة الشراء %: لا يوجد حساب Cash/Bank', v_bill.bill_number;
          ELSE
            v_payment_entry_id := create_bill_payment_entry(
              v_bill.id,
              NULL,
              v_bill.company_id,
              v_bill.bill_date,
              v_bill.paid_amount,
              'cash',
              'إصلاح تلقائي: قيد دفع فاتورة شراء ' || v_bill.bill_number
            );
            
            RAISE NOTICE '✅ تم إنشاء قيد الدفع لفاتورة الشراء: %', v_bill.bill_number;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING '⚠️ فشل إنشاء قيد الدفع لفاتورة الشراء %: %', v_bill.bill_number, SQLERRM;
        END;
        
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '❌ فشل إنشاء قيد AP/Expense لفاتورة الشراء %: %', v_bill.bill_number, SQLERRM;
        v_error_count := v_error_count + 1;
      END;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ خطأ عام في فاتورة الشراء %: %', v_bill.bill_number, SQLERRM;
      v_error_count := v_error_count + 1;
    END;
  END LOOP;
  
  RAISE NOTICE '✅ تم إصلاح % فاتورة شراء', v_count;
  IF v_skipped_count > 0 THEN
    RAISE NOTICE 'ℹ️ تم تخطي % فاتورة شراء (لم يتم الدفع)', v_skipped_count;
  END IF;
  IF v_error_count > 0 THEN
    RAISE WARNING '⚠️ فشل إصلاح % فاتورة شراء', v_error_count;
  END IF;
END $$;

-- =====================================================
-- التحقق من النتائج النهائية
-- =====================================================
SELECT 
  'نتائج الإصلاح المحسّن' as report_section,
  (SELECT COUNT(*) FROM invoices i
   WHERE i.status IN ('sent', 'paid', 'partially_paid')
   AND (i.is_deleted IS NULL OR i.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type = 'invoice')
  ) as remaining_invoices_without_entries,
  (SELECT COUNT(*) FROM bills b
   WHERE b.status IN ('sent', 'paid', 'partially_paid', 'received')
   AND (b.is_deleted IS NULL OR b.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = b.id AND je.reference_type = 'bill')
  ) as remaining_bills_without_entries,
  (SELECT COUNT(*) FROM payments p
   WHERE NOT EXISTS (SELECT 1 FROM journal_entries je 
     WHERE (je.reference_id = p.id OR je.reference_id = p.invoice_id OR je.reference_id = p.bill_id)
     AND je.reference_type IN ('customer_payment', 'supplier_payment', 'invoice_payment', 'bill_payment'))
  ) as remaining_payments_without_entries;

-- =====================================================
-- نهاية السكربت
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✅ اكتمل الإصلاح المحسّن!';
  RAISE NOTICE '📊 يُنصح بإعادة تنفيذ المراجعة المحاسبية الشاملة للتحقق من النتائج.';
END $$;

