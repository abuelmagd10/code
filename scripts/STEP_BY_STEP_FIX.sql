-- =====================================================
-- 🔧 إصلاح خطوة بخطوة مع فحص تفصيلي
-- Step-by-Step Fix with Detailed Checking
-- =====================================================
-- تاريخ الإنشاء: 2025-01-XX
-- الهدف: فحص كل فاتورة على حدة وإنشاء القيد مع تسجيل كامل
-- =====================================================

-- =====================================================
-- 1. فحص الفواتير بدون قيود - مع تفاصيل كاملة
-- =====================================================
SELECT 
  'فحص تفصيلي للفواتير' as step,
  i.id,
  i.invoice_number,
  i.company_id,
  i.invoice_date,
  i.status,
  i.total_amount,
  i.paid_amount,
  i.subtotal,
  i.tax_amount,
  i.shipping,
  -- فحص وجود أي قيود مرتبطة
  (SELECT COUNT(*) FROM journal_entries je WHERE je.reference_id = i.id) as total_related_entries,
  (SELECT STRING_AGG(je.reference_type, ', ') FROM journal_entries je WHERE je.reference_id = i.id) as existing_entry_types,
  -- فحص إذا كان هناك قيد invoice
  (SELECT COUNT(*) FROM journal_entries je 
   WHERE je.reference_id = i.id 
   AND je.reference_type = 'invoice') as has_invoice_entry,
  -- فحص إذا كان هناك قيد invoice_payment
  (SELECT COUNT(*) FROM journal_entries je 
   WHERE je.reference_id = i.id 
   AND je.reference_type = 'invoice_payment') as has_payment_entry
FROM invoices i
WHERE i.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
  AND i.status IN ('sent', 'paid', 'partially_paid')
  AND (i.is_deleted IS NULL OR i.is_deleted = false)
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = i.id 
    AND je.reference_type = 'invoice'
  )
ORDER BY COALESCE(i.invoice_date, DATE(i.created_at));

-- =====================================================
-- 2. محاولة إنشاء قيد لفاتورة واحدة - مع تسجيل كامل
-- =====================================================
DO $$
DECLARE
  v_test_invoice RECORD;
  v_entry_id UUID;
  v_ar_account_id UUID := 'e732fe9d-6845-4cad-a79d-c2b5cae056d0';
  v_revenue_account_id UUID := '441131b6-e7ef-4c9c-9338-3d1b1837a6be';
  v_cash_account_id UUID := 'f66f3019-8c50-41bb-9ace-955cc89a5bf6';
  v_company_id UUID := '9c92a597-8c88-42a7-ad02-bd4a25b755ee';
  v_total DECIMAL(15, 2);
  v_paid DECIMAL(15, 2);
  v_check_count INTEGER;
BEGIN
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '🧪 اختبار إنشاء قيد لفاتورة واحدة';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  
  -- جلب أول فاتورة
  SELECT 
    i.id,
    i.invoice_number,
    COALESCE(i.invoice_date, DATE(i.created_at), CURRENT_DATE) as invoice_date,
    COALESCE(i.total_amount, 0) as total_amount,
    COALESCE(i.paid_amount, 0) as paid_amount
  INTO v_test_invoice
  FROM invoices i
  WHERE i.company_id = v_company_id
    AND i.status IN ('sent', 'paid', 'partially_paid')
    AND (i.is_deleted IS NULL OR i.is_deleted = false)
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je 
      WHERE je.reference_id = i.id 
      AND je.reference_type = 'invoice'
    )
  ORDER BY COALESCE(i.invoice_date, DATE(i.created_at))
  LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE NOTICE '❌ لا توجد فواتير للاختبار';
    RETURN;
  END IF;
  
  RAISE NOTICE '📋 الفاتورة المختارة:';
  RAISE NOTICE '   رقم الفاتورة: %', v_test_invoice.invoice_number;
  RAISE NOTICE '   ID: %', v_test_invoice.id;
  RAISE NOTICE '   التاريخ: %', v_test_invoice.invoice_date;
  RAISE NOTICE '   المبلغ: %', v_test_invoice.total_amount;
  RAISE NOTICE '   المدفوع: %', v_test_invoice.paid_amount;
  
  -- التحقق من عدم وجود قيد
  SELECT COUNT(*) INTO v_check_count
  FROM journal_entries
  WHERE reference_id = v_test_invoice.id
  AND reference_type = 'invoice';
  
  RAISE NOTICE '   القيود الموجودة (invoice): %', v_check_count;
  
  IF v_check_count > 0 THEN
    RAISE NOTICE '   ⚠️ يوجد قيد موجود بالفعل!';
    RETURN;
  END IF;
  
  v_total := v_test_invoice.total_amount;
  v_paid := v_test_invoice.paid_amount;
  
  IF v_total <= 0 THEN
    RAISE NOTICE '   ❌ المبلغ <= 0، لا يمكن المتابعة';
    RETURN;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '🔧 بدء إنشاء القيد...';
  
  -- إنشاء القيد
  BEGIN
    INSERT INTO journal_entries (
      company_id,
      reference_type,
      reference_id,
      entry_date,
      description,
      status
    ) VALUES (
      v_company_id,
      'invoice',
      v_test_invoice.id,
      v_test_invoice.invoice_date,
      'اختبار: ' || v_test_invoice.invoice_number,
      'posted'
    ) RETURNING id INTO v_entry_id;
    
    RAISE NOTICE '   ✅ تم إنشاء القيد: %', v_entry_id;
    
    -- التحقق من القيد
    SELECT COUNT(*) INTO v_check_count
    FROM journal_entries
    WHERE id = v_entry_id;
    
    RAISE NOTICE '   ✅ التحقق: القيد موجود في DB (count: %)', v_check_count;
    
    -- إضافة AR
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES (
      v_entry_id,
      v_ar_account_id,
      v_total,
      0,
      'AR'
    );
    
    RAISE NOTICE '   ✅ تم إضافة AR: % (Debit)', v_total;
    
    -- إضافة Revenue
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES (
      v_entry_id,
      v_revenue_account_id,
      0,
      v_total,
      'Revenue'
    );
    
    RAISE NOTICE '   ✅ تم إضافة Revenue: % (Credit)', v_total;
    
    -- التحقق من السطور
    SELECT COUNT(*) INTO v_check_count
    FROM journal_entry_lines
    WHERE journal_entry_id = v_entry_id;
    
    RAISE NOTICE '   ✅ عدد السطور: %', v_check_count;
    
    -- التحقق من التوازن
    DECLARE
      v_debit DECIMAL(15, 2);
      v_credit DECIMAL(15, 2);
    BEGIN
      SELECT 
        COALESCE(SUM(debit_amount), 0),
        COALESCE(SUM(credit_amount), 0)
      INTO v_debit, v_credit
      FROM journal_entry_lines
      WHERE journal_entry_id = v_entry_id;
      
      RAISE NOTICE '   ✅ التوازن: Debit=%, Credit=%, Diff=%', v_debit, v_credit, ABS(v_debit - v_credit);
    END;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅✅✅ نجح الاختبار!';
    RAISE NOTICE '   القيد: %', v_entry_id;
    RAISE NOTICE '   الفاتورة: %', v_test_invoice.invoice_number;
    
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '';
    RAISE WARNING '❌❌❌ فشل الاختبار!';
    RAISE WARNING '   الخطأ: %', SQLERRM;
    RAISE WARNING '   SQLSTATE: %', SQLSTATE;
    RAISE WARNING '   الفاتورة: %', v_test_invoice.invoice_number;
  END;
  
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

-- =====================================================
-- 3. إنشاء قيود لجميع الفواتير - مع تسجيل تفصيلي
-- =====================================================
DO $$
DECLARE
  v_invoice RECORD;
  v_entry_id UUID;
  v_payment_entry_id UUID;
  v_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_ar_account_id UUID := 'e732fe9d-6845-4cad-a79d-c2b5cae056d0';
  v_revenue_account_id UUID := '441131b6-e7ef-4c9c-9338-3d1b1837a6be';
  v_cash_account_id UUID := 'f66f3019-8c50-41bb-9ace-955cc89a5bf6';
  v_company_id UUID := '9c92a597-8c88-42a7-ad02-bd4a25b755ee';
  v_total DECIMAL(15, 2);
  v_paid DECIMAL(15, 2);
  v_check_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '🔧 بدء الإصلاح لجميع الفواتير';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  
  FOR v_invoice IN 
    SELECT 
      i.id,
      i.invoice_number,
      COALESCE(i.invoice_date, DATE(i.created_at), CURRENT_DATE) as invoice_date,
      COALESCE(i.total_amount, 0) as total_amount,
      COALESCE(i.paid_amount, 0) as paid_amount
    FROM invoices i
    WHERE i.company_id = v_company_id
      AND i.status IN ('sent', 'paid', 'partially_paid')
      AND (i.is_deleted IS NULL OR i.is_deleted = false)
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je 
        WHERE je.reference_id = i.id 
        AND je.reference_type = 'invoice'
      )
    ORDER BY COALESCE(i.invoice_date, DATE(i.created_at))
  LOOP
    BEGIN
      -- التحقق مرة أخرى قبل المعالجة
      SELECT COUNT(*) INTO v_check_count
      FROM journal_entries
      WHERE reference_id = v_invoice.id
      AND reference_type = 'invoice';
      
      IF v_check_count > 0 THEN
        RAISE NOTICE '⚠️ تخطي %: يوجد قيد موجود', v_invoice.invoice_number;
        CONTINUE;
      END IF;
      
      v_total := v_invoice.total_amount;
      v_paid := v_invoice.paid_amount;
      
      IF v_total <= 0 THEN
        RAISE NOTICE '⚠️ تخطي %: المبلغ = 0', v_invoice.invoice_number;
        CONTINUE;
      END IF;
      
      RAISE NOTICE '📋 %: المبلغ=%, المدفوع=%', v_invoice.invoice_number, v_total, v_paid;
      
      -- إنشاء القيد
      INSERT INTO journal_entries (
        company_id,
        reference_type,
        reference_id,
        entry_date,
        description,
        status
      ) VALUES (
        v_company_id,
        'invoice',
        v_invoice.id,
        v_invoice.invoice_date,
        'إصلاح: ' || v_invoice.invoice_number,
        'posted'
      ) RETURNING id INTO v_entry_id;
      
      -- AR
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_entry_id,
        v_ar_account_id,
        v_total,
        0,
        'AR'
      );
      
      -- Revenue
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_entry_id,
        v_revenue_account_id,
        0,
        v_total,
        'Revenue'
      );
      
      v_count := v_count + 1;
      RAISE NOTICE '   ✅ تم إنشاء القيد: %', v_entry_id;
      
      -- قيد الدفع
      IF v_paid > 0 THEN
        INSERT INTO journal_entries (
          company_id,
          reference_type,
          reference_id,
          entry_date,
          description,
          status
        ) VALUES (
          v_company_id,
          'invoice_payment',
          v_invoice.id,
          v_invoice.invoice_date,
          'دفعة: ' || v_invoice.invoice_number,
          'posted'
        ) RETURNING id INTO v_payment_entry_id;
        
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          account_id,
          debit_amount,
          credit_amount,
          description
        ) VALUES (
          v_payment_entry_id,
          v_cash_account_id,
          v_paid,
          0,
          'Cash'
        );
        
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          account_id,
          debit_amount,
          credit_amount,
          description
        ) VALUES (
          v_payment_entry_id,
          v_ar_account_id,
          0,
          v_paid,
          'AR'
        );
        
        RAISE NOTICE '   ✅ تم إنشاء قيد الدفع: %', v_payment_entry_id;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ فشل %: % (SQLSTATE: %)', v_invoice.invoice_number, SQLERRM, SQLSTATE;
      v_error_count := v_error_count + 1;
    END;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '📊 الملخص:';
  RAISE NOTICE '   ✅ تم إصلاح: %', v_count;
  RAISE NOTICE '   ❌ فشل: %', v_error_count;
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

-- =====================================================
-- 4. إصلاح فواتير الشراء
-- =====================================================
DO $$
DECLARE
  v_bill RECORD;
  v_entry_id UUID;
  v_payment_entry_id UUID;
  v_count INTEGER := 0;
  v_skipped INTEGER := 0;
  v_ap_account_id UUID := '540cd482-13f7-4f73-b856-0b3955148f7c';
  v_expense_account_id UUID := '97fce4e0-d209-498a-bcca-af991ac2804c';
  v_cash_account_id UUID := 'f66f3019-8c50-41bb-9ace-955cc89a5bf6';
  v_company_id UUID := '9c92a597-8c88-42a7-ad02-bd4a25b755ee';
  v_total DECIMAL(15, 2);
  v_paid DECIMAL(15, 2);
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔧 بدء إصلاح فواتير الشراء...';
  
  FOR v_bill IN 
    SELECT 
      b.id,
      b.bill_number,
      COALESCE(b.bill_date, DATE(b.created_at), CURRENT_DATE) as bill_date,
      COALESCE(b.total_amount, 0) as total_amount,
      COALESCE(b.paid_amount, 0) as paid_amount
    FROM bills b
    WHERE b.company_id = v_company_id
      AND b.status IN ('sent', 'paid', 'partially_paid', 'received')
      AND (b.is_deleted IS NULL OR b.is_deleted = false)
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je 
        WHERE je.reference_id = b.id 
        AND je.reference_type = 'bill'
      )
  LOOP
    BEGIN
      IF v_bill.paid_amount <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
      
      IF v_bill.total_amount <= 0 THEN
        CONTINUE;
      END IF;
      
      v_total := v_bill.total_amount;
      v_paid := v_bill.paid_amount;
      
      RAISE NOTICE '📋 %: المبلغ=%, المدفوع=%', v_bill.bill_number, v_total, v_paid;
      
      -- إنشاء القيد
      INSERT INTO journal_entries (
        company_id,
        reference_type,
        reference_id,
        entry_date,
        description,
        status
      ) VALUES (
        v_company_id,
        'bill',
        v_bill.id,
        v_bill.bill_date,
        'إصلاح: ' || v_bill.bill_number,
        'posted'
      ) RETURNING id INTO v_entry_id;
      
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_entry_id,
        v_expense_account_id,
        v_total,
        0,
        'Expense'
      );
      
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_entry_id,
        v_ap_account_id,
        0,
        v_total,
        'AP'
      );
      
      v_count := v_count + 1;
      RAISE NOTICE '   ✅ تم إنشاء القيد: %', v_entry_id;
      
      -- قيد الدفع
      INSERT INTO journal_entries (
        company_id,
        reference_type,
        reference_id,
        entry_date,
        description,
        status
      ) VALUES (
        v_company_id,
        'bill_payment',
        v_bill.id,
        v_bill.bill_date,
        'دفعة: ' || v_bill.bill_number,
        'posted'
      ) RETURNING id INTO v_payment_entry_id;
      
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_payment_entry_id,
        v_ap_account_id,
        v_paid,
        0,
        'AP'
      );
      
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_payment_entry_id,
        v_cash_account_id,
        0,
        v_paid,
        'Cash'
      );
      
      RAISE NOTICE '   ✅ تم إنشاء قيد الدفع: %', v_payment_entry_id;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ فشل %: %', v_bill.bill_number, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE '✅ تم إصلاح % فاتورة شراء', v_count;
  IF v_skipped > 0 THEN
    RAISE NOTICE 'ℹ️ تم تخطي % (لم يتم الدفع)', v_skipped;
  END IF;
END $$;

-- =====================================================
-- التحقق النهائي
-- =====================================================
SELECT 
  'النتائج النهائية' as report_section,
  (SELECT COUNT(*) FROM invoices i
   WHERE i.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
   AND i.status IN ('sent', 'paid', 'partially_paid')
   AND (i.is_deleted IS NULL OR i.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type = 'invoice')
  ) as remaining_invoices,
  (SELECT COUNT(*) FROM bills b
   WHERE b.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
   AND b.status IN ('sent', 'paid', 'partially_paid', 'received')
   AND (b.is_deleted IS NULL OR b.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = b.id AND je.reference_type = 'bill')
  ) as remaining_bills;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ اكتمل الإصلاح!';
END $$;

