-- =====================================================
-- 🔧 إصلاح بسيط ومباشر - بدون تعقيدات
-- Simple Direct Fix - No Complications
-- =====================================================
-- تاريخ الإنشاء: 2025-01-XX
-- الهدف: إصلاح مباشر للفواتير الـ 18 المتبقية
-- =====================================================

-- =====================================================
-- إصلاح الفواتير - طريقة مباشرة جداً
-- =====================================================
DO $$
DECLARE
  v_invoice RECORD;
  v_entry_id UUID;
  v_payment_entry_id UUID;
  v_count INTEGER := 0;
  v_ar_account_id UUID := 'e732fe9d-6845-4cad-a79d-c2b5cae056d0';
  v_revenue_account_id UUID := '441131b6-e7ef-4c9c-9338-3d1b1837a6be';
  v_cash_account_id UUID := 'f66f3019-8c50-41bb-9ace-955cc89a5bf6';
  v_company_id UUID := '9c92a597-8c88-42a7-ad02-bd4a25b755ee';
  v_total DECIMAL(15, 2);
  v_paid DECIMAL(15, 2);
BEGIN
  RAISE NOTICE '🔧 بدء الإصلاح البسيط للفواتير...';
  
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
  LOOP
    BEGIN
      -- تخطي إذا كان المبلغ صفر
      IF v_invoice.total_amount <= 0 THEN
        RAISE NOTICE '⚠️ تخطي %: المبلغ = 0', v_invoice.invoice_number;
        CONTINUE;
      END IF;
      
      v_total := v_invoice.total_amount;
      v_paid := v_invoice.paid_amount;
      
      RAISE NOTICE '📋 معالجة: % - المبلغ: %', v_invoice.invoice_number, v_total;
      
      -- إنشاء القيد الرئيسي
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
      
      RAISE NOTICE '   ✅ تم إنشاء القيد: %', v_entry_id;
      
      -- AR (Debit)
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
      
      -- Revenue (Credit)
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
      RAISE NOTICE '   ✅ تم إضافة السطور - AR: %, Revenue: %', v_total, v_total;
      
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
        
        -- Cash (Debit)
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
        
        -- AR (Credit)
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
      
      RAISE NOTICE '✅ اكتمل: %', v_invoice.invoice_number;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ فشل %: % (SQLSTATE: %)', v_invoice.invoice_number, SQLERRM, SQLSTATE;
    END;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ تم إصلاح % فاتورة', v_count;
END $$;

-- =====================================================
-- إصلاح فواتير الشراء
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
  RAISE NOTICE '🔧 بدء الإصلاح البسيط لفواتير الشراء...';
  
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
      -- تخطي إذا لم يتم الدفع
      IF v_bill.paid_amount <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
      
      IF v_bill.total_amount <= 0 THEN
        RAISE NOTICE '⚠️ تخطي %: المبلغ = 0', v_bill.bill_number;
        CONTINUE;
      END IF;
      
      v_total := v_bill.total_amount;
      v_paid := v_bill.paid_amount;
      
      RAISE NOTICE '📋 معالجة: % - المبلغ: %', v_bill.bill_number, v_total;
      
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
      
      -- Expense (Debit)
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
      
      -- AP (Credit)
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
      
      -- AP (Debit)
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
      
      -- Cash (Credit)
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
      RAISE NOTICE '✅ اكتمل: %', v_bill.bill_number;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ فشل %: % (SQLSTATE: %)', v_bill.bill_number, SQLERRM, SQLSTATE;
    END;
  END LOOP;
  
  RAISE NOTICE '';
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
  ) as remaining_bills,
  (SELECT COUNT(*) FROM payments p
   WHERE p.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
   AND NOT EXISTS (SELECT 1 FROM journal_entries je 
     WHERE (je.reference_id = p.id OR je.reference_id = p.invoice_id OR je.reference_id = p.bill_id)
     AND je.reference_type IN ('customer_payment', 'supplier_payment', 'invoice_payment', 'bill_payment'))
  ) as remaining_payments;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ اكتمل الإصلاح البسيط!';
  RAISE NOTICE '📊 راجع النتائج أعلاه';
END $$;

