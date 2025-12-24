-- =====================================================
-- 🧪 سكربت اختبار Functions الإصلاح
-- Test Script for Fix Functions
-- =====================================================
-- تاريخ الإنشاء: 2025-01-XX
-- الهدف: اختبار Functions الإصلاح على فاتورة واحدة لمعرفة السبب
-- =====================================================

-- =====================================================
-- 1. اختبار Function find_company_accounts
-- =====================================================
SELECT 
  'اختبار find_company_accounts' as test_name,
  fa.*
FROM find_company_accounts('9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID) fa;

-- =====================================================
-- 2. جلب أول فاتورة بدون قيد للاختبار
-- =====================================================
SELECT 
  'فاتورة للاختبار' as test_name,
  i.id,
  i.company_id,
  i.invoice_number,
  i.invoice_date,
  i.status,
  i.subtotal,
  i.tax_amount,
  i.shipping,
  i.discount_value,
  i.total_amount,
  i.paid_amount,
  -- التحقق من البيانات
  CASE 
    WHEN i.total_amount IS NULL THEN '❌ total_amount NULL'
    WHEN i.total_amount <= 0 THEN '❌ total_amount <= 0'
    WHEN i.invoice_date IS NULL THEN '❌ invoice_date NULL'
    ELSE '✅ البيانات صحيحة'
  END as data_check
FROM invoices i
WHERE i.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
  AND i.status IN ('sent', 'paid', 'partially_paid')
  AND (i.is_deleted IS NULL OR i.is_deleted = false)
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = i.id 
    AND je.reference_type = 'invoice'
  )
ORDER BY i.invoice_date
LIMIT 1;

-- =====================================================
-- 3. محاولة إنشاء قيد يدوياً لفاتورة واحدة (للاختبار)
-- =====================================================
DO $$
DECLARE
  v_test_invoice_id UUID;
  v_test_invoice RECORD;
  v_entry_id UUID;
  v_accounts RECORD;
BEGIN
  -- جلب أول فاتورة للاختبار
  SELECT i.id, i.company_id, i.invoice_number, i.invoice_date, i.subtotal, i.tax_amount, i.shipping, i.total_amount
  INTO v_test_invoice
  FROM invoices i
  WHERE i.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
    AND i.status IN ('sent', 'paid', 'partially_paid')
    AND (i.is_deleted IS NULL OR i.is_deleted = false)
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je 
      WHERE je.reference_id = i.id 
      AND je.reference_type = 'invoice'
    )
  ORDER BY i.invoice_date
  LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE NOTICE '❌ لا توجد فواتير للاختبار';
    RETURN;
  END IF;
  
  RAISE NOTICE '🧪 اختبار الفاتورة: %', v_test_invoice.invoice_number;
  RAISE NOTICE '   المبلغ الإجمالي: %', v_test_invoice.total_amount;
  RAISE NOTICE '   التاريخ: %', v_test_invoice.invoice_date;
  
  -- إيجاد الحسابات
  SELECT * INTO v_accounts FROM find_company_accounts(v_test_invoice.company_id);
  
  RAISE NOTICE '   AR Account: %', v_accounts.ar_account_id;
  RAISE NOTICE '   Revenue Account: %', v_accounts.revenue_account_id;
  
  IF v_accounts.ar_account_id IS NULL THEN
    RAISE NOTICE '❌ حساب AR غير موجود';
    RETURN;
  END IF;
  
  IF v_accounts.revenue_account_id IS NULL THEN
    RAISE NOTICE '❌ حساب Revenue غير موجود';
    RETURN;
  END IF;
  
  -- محاولة إنشاء القيد
  BEGIN
    v_entry_id := create_invoice_ar_revenue_entry(
      v_test_invoice.id,
      v_test_invoice.company_id,
      v_test_invoice.invoice_date,
      'اختبار: قيد فاتورة ' || v_test_invoice.invoice_number
    );
    
    RAISE NOTICE '✅ نجح إنشاء القيد! ID: %', v_entry_id;
    
    -- التحقق من القيد
    DECLARE
      v_entry_check RECORD;
      v_lines_count INTEGER;
      v_total_debit DECIMAL(15, 2);
      v_total_credit DECIMAL(15, 2);
    BEGIN
      SELECT je.id, je.reference_id, je.reference_type, je.entry_date
      INTO v_entry_check
      FROM journal_entries je
      WHERE je.id = v_entry_id;
      
      SELECT COUNT(*), 
             COALESCE(SUM(debit_amount), 0),
             COALESCE(SUM(credit_amount), 0)
      INTO v_lines_count, v_total_debit, v_total_credit
      FROM journal_entry_lines
      WHERE journal_entry_id = v_entry_id;
      
      RAISE NOTICE '   القيد: %', v_entry_check.id;
      RAISE NOTICE '   عدد السطور: %', v_lines_count;
      RAISE NOTICE '   إجمالي المدين: %', v_total_debit;
      RAISE NOTICE '   إجمالي الدائن: %', v_total_credit;
      RAISE NOTICE '   الفرق: %', ABS(v_total_debit - v_total_credit);
      
      IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
        RAISE WARNING '⚠️ القيد غير متوازن!';
      ELSE
        RAISE NOTICE '✅ القيد متوازن';
      END IF;
    END;
    
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ فشل إنشاء القيد: %', SQLERRM;
    RAISE NOTICE '   SQLSTATE: %', SQLSTATE;
  END;
  
END $$;

-- =====================================================
-- 4. فحص فواتير الشراء للاختبار
-- =====================================================
SELECT 
  'فاتورة شراء للاختبار' as test_name,
  b.id,
  b.company_id,
  b.bill_number,
  b.bill_date,
  b.status,
  b.subtotal,
  b.tax_amount,
  b.total_amount,
  b.paid_amount,
  -- التحقق من البيانات
  CASE 
    WHEN b.total_amount IS NULL THEN '❌ total_amount NULL'
    WHEN b.total_amount <= 0 THEN '❌ total_amount <= 0'
    WHEN b.bill_date IS NULL THEN '❌ bill_date NULL'
    WHEN b.paid_amount = 0 OR b.paid_amount IS NULL THEN '⚠️ لم يتم الدفع (لا يحتاج قيد)'
    ELSE '✅ البيانات صحيحة'
  END as data_check
FROM bills b
WHERE b.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
  AND b.status IN ('sent', 'paid', 'partially_paid', 'received')
  AND (b.is_deleted IS NULL OR b.is_deleted = false)
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = b.id 
    AND je.reference_type = 'bill'
  )
ORDER BY b.bill_date
LIMIT 1;

-- =====================================================
-- 5. ملخص المشاكل المحتملة
-- =====================================================
SELECT 
  'ملخص المشاكل' as summary_section,
  (SELECT COUNT(*) FROM invoices i
   WHERE i.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
   AND i.status IN ('sent', 'paid', 'partially_paid')
   AND (i.is_deleted IS NULL OR i.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type = 'invoice')
   AND (i.total_amount IS NULL OR i.total_amount <= 0)
  ) as invoices_with_invalid_amount,
  (SELECT COUNT(*) FROM invoices i
   WHERE i.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
   AND i.status IN ('sent', 'paid', 'partially_paid')
   AND (i.is_deleted IS NULL OR i.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type = 'invoice')
   AND i.invoice_date IS NULL
  ) as invoices_with_null_date,
  (SELECT COUNT(*) FROM bills b
   WHERE b.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
   AND b.status IN ('sent', 'paid', 'partially_paid', 'received')
   AND (b.is_deleted IS NULL OR b.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = b.id AND je.reference_type = 'bill')
   AND (b.paid_amount = 0 OR b.paid_amount IS NULL)
  ) as bills_without_payment;

-- =====================================================
-- نهاية السكربت
-- =====================================================

