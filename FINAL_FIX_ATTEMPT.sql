-- =====================================================
-- 🔧 محاولة إصلاح نهائية - طريقة بسيطة جداً
-- Final Fix Attempt - Very Simple Approach
-- =====================================================
-- تاريخ الإنشاء: 2025-01-XX
-- الهدف: إصلاح مباشر وبسيط جداً بدون تعقيدات
-- =====================================================

-- =====================================================
-- إصلاح الفواتير - طريقة بسيطة جداً
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
  v_revenue DECIMAL(15, 2);
  v_paid DECIMAL(15, 2);
BEGIN
  RAISE NOTICE '🔧 بدء الإصلاح النهائي للفواتير...';
  
  FOR v_invoice IN 
    SELECT 
      i.id,
      i.invoice_number,
      COALESCE(i.invoice_date, DATE(i.created_at), CURRENT_DATE) as invoice_date,
      GREATEST(COALESCE(i.total_amount, 0), 0.01) as total_amount,
      COALESCE(i.subtotal, 0) + COALESCE(i.shipping, 0) as revenue_amount,
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
      v_total := v_invoice.total_amount;
      v_revenue := v_invoice.revenue_amount;
      v_paid := v_invoice.paid_amount;
      
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
        'إصلاح نهائي: ' || v_invoice.invoice_number,
        'posted'
      ) RETURNING id INTO v_entry_id;
      
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
      
      -- Revenue (Credit) - نستخدم total_amount كـ revenue إذا لم يكن هناك تفاصيل
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
        v_total, -- بسيط: Revenue = Total
        'Revenue'
      );
      
      v_count := v_count + 1;
      RAISE NOTICE '✅ %: تم إنشاء القيد', v_invoice.invoice_number;
      
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
        
        RAISE NOTICE '✅ %: تم إنشاء قيد الدفع', v_invoice.invoice_number;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ %: %', v_invoice.invoice_number, SQLERRM;
      v_error_count := v_error_count + 1;
    END;
  END LOOP;
  
  RAISE NOTICE '✅ تم إصلاح % فاتورة', v_count;
  IF v_error_count > 0 THEN
    RAISE WARNING '⚠️ فشل % فاتورة', v_error_count;
  END IF;
END $$;

-- =====================================================
-- إصلاح فواتير الشراء - طريقة بسيطة جداً
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
  RAISE NOTICE '🔧 بدء الإصلاح النهائي لفواتير الشراء...';
  
  FOR v_bill IN 
    SELECT 
      b.id,
      b.bill_number,
      COALESCE(b.bill_date, DATE(b.created_at), CURRENT_DATE) as bill_date,
      GREATEST(COALESCE(b.total_amount, 0), 0.01) as total_amount,
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
    ORDER BY COALESCE(b.bill_date, DATE(b.created_at))
  LOOP
    BEGIN
      -- تخطي إذا لم يتم الدفع
      IF v_bill.paid_amount = 0 OR v_bill.paid_amount IS NULL THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
      
      v_total := v_bill.total_amount;
      v_paid := v_bill.paid_amount;
      
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
        'إصلاح نهائي: ' || v_bill.bill_number,
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
      RAISE NOTICE '✅ %: تم إنشاء القيد', v_bill.bill_number;
      
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
      
      RAISE NOTICE '✅ %: تم إنشاء قيد الدفع', v_bill.bill_number;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ %: %', v_bill.bill_number, SQLERRM;
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
  RAISE NOTICE '✅ اكتمل الإصلاح النهائي!';
END $$;

