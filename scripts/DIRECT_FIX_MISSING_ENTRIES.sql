-- =====================================================
-- 🔧 إصلاح مباشر للقيود المحاسبية الناقصة
-- Direct Fix for Missing Journal Entries
-- =====================================================
-- تاريخ الإنشاء: 2025-01-XX
-- الهدف: إصلاح مباشر بدون استخدام Functions معقدة
-- =====================================================

-- =====================================================
-- إصلاح الفواتير - طريقة مباشرة
-- =====================================================
DO $$
DECLARE
  v_invoice RECORD;
  v_entry_id UUID;
  v_payment_entry_id UUID;
  v_count INTEGER := 0;
  v_error_count INTEGER := 0;
  -- الحسابات للشركة VitaSlims
  v_ar_account_id UUID := 'e732fe9d-6845-4cad-a79d-c2b5cae056d0';
  v_revenue_account_id UUID := '441131b6-e7ef-4c9c-9338-3d1b1837a6be';
  v_cash_account_id UUID := 'f66f3019-8c50-41bb-9ace-955cc89a5bf6';
  v_bank_account_id UUID := '0baff307-e007-490a-a3ec-a96974ad0bf1';
  v_company_id UUID := '9c92a597-8c88-42a7-ad02-bd4a25b755ee';
  v_subtotal DECIMAL(15, 2);
  v_tax DECIMAL(15, 2);
  v_shipping DECIMAL(15, 2);
  v_total DECIMAL(15, 2);
  v_paid DECIMAL(15, 2);
  v_revenue_total DECIMAL(15, 2);
BEGIN
  RAISE NOTICE '🔧 بدء الإصلاح المباشر للفواتير...';
  
  FOR v_invoice IN 
    SELECT 
      i.id,
      i.invoice_number,
      COALESCE(i.invoice_date, DATE(i.created_at), CURRENT_DATE) as invoice_date,
      i.status,
      COALESCE(i.subtotal, 0) as subtotal,
      COALESCE(i.tax_amount, 0) as tax_amount,
      COALESCE(i.shipping, 0) as shipping,
      COALESCE(i.discount_value, 0) as discount_value,
      GREATEST(COALESCE(i.total_amount, 
        COALESCE(i.subtotal, 0) + COALESCE(i.tax_amount, 0) + COALESCE(i.shipping, 0) - COALESCE(i.discount_value, 0)
      ), 0.01) as total_amount,
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
      v_subtotal := v_invoice.subtotal;
      v_tax := v_invoice.tax_amount;
      v_shipping := v_invoice.shipping;
      v_total := v_invoice.total_amount;
      v_paid := v_invoice.paid_amount;
      v_revenue_total := v_subtotal + v_shipping; -- Revenue = subtotal + shipping
      
      -- إنشاء قيد AR/Revenue
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
        'إصلاح مباشر: قيد فاتورة ' || v_invoice.invoice_number,
        'posted'
      ) RETURNING id INTO v_entry_id;
      
      -- سطور القيد
      -- 1. AR (Debit)
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
        'الذمم المدينة'
      );
      
      -- 2. Revenue (Credit)
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
        v_revenue_total,
        'إيرادات المبيعات'
      );
      
      -- 3. VAT (Credit) - إن وجد
      IF v_tax > 0 THEN
        -- البحث عن حساب VAT
        DECLARE
          v_vat_account_id UUID;
        BEGIN
          SELECT id INTO v_vat_account_id
          FROM chart_of_accounts
          WHERE company_id = v_company_id
            AND (account_name ILIKE '%vat%' OR account_name ILIKE '%ضريبة%' OR account_name ILIKE '%tax%')
            AND account_type = 'liability'
            AND is_active = true
          LIMIT 1;
          
          IF v_vat_account_id IS NOT NULL THEN
            INSERT INTO journal_entry_lines (
              journal_entry_id,
              account_id,
              debit_amount,
              credit_amount,
              description
            ) VALUES (
              v_entry_id,
              v_vat_account_id,
              0,
              v_tax,
              'ضريبة القيمة المضافة'
            );
          ELSE
            -- إذا لم يوجد حساب VAT، نضيفه إلى Revenue
            UPDATE journal_entry_lines
            SET credit_amount = credit_amount + v_tax
            WHERE journal_entry_id = v_entry_id
            AND account_id = v_revenue_account_id;
          END IF;
        END;
      END IF;
      
      -- التحقق من التوازن
      DECLARE
        v_total_debit DECIMAL(15, 2);
        v_total_credit DECIMAL(15, 2);
        v_diff DECIMAL(15, 2);
      BEGIN
        SELECT 
          COALESCE(SUM(debit_amount), 0),
          COALESCE(SUM(credit_amount), 0)
        INTO v_total_debit, v_total_credit
        FROM journal_entry_lines
        WHERE journal_entry_id = v_entry_id;
        
        v_diff := ABS(v_total_debit - v_total_credit);
        
        IF v_diff > 0.01 THEN
          -- تصحيح التوازن
          IF v_total_debit > v_total_credit THEN
            UPDATE journal_entry_lines
            SET credit_amount = credit_amount + v_diff
            WHERE journal_entry_id = v_entry_id
            AND account_id = v_revenue_account_id
            AND id = (
              SELECT id FROM journal_entry_lines
              WHERE journal_entry_id = v_entry_id
              AND account_id = v_revenue_account_id
              LIMIT 1
            );
          ELSE
            UPDATE journal_entry_lines
            SET debit_amount = debit_amount + v_diff
            WHERE journal_entry_id = v_entry_id
            AND account_id = v_ar_account_id
            AND id = (
              SELECT id FROM journal_entry_lines
              WHERE journal_entry_id = v_entry_id
              AND account_id = v_ar_account_id
              LIMIT 1
            );
          END IF;
        END IF;
      END;
      
      v_count := v_count + 1;
      RAISE NOTICE '✅ تم إنشاء قيد AR/Revenue للفاتورة: %', v_invoice.invoice_number;
      
      -- إنشاء قيد الدفع إذا كانت مدفوعة
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
          'إصلاح مباشر: قيد دفع فاتورة ' || v_invoice.invoice_number,
          'posted'
        ) RETURNING id INTO v_payment_entry_id;
        
        -- Cash/Bank (Debit)
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          account_id,
          debit_amount,
          credit_amount,
          description
        ) VALUES (
          v_payment_entry_id,
          v_cash_account_id, -- استخدام Cash كافتراضي
          v_paid,
          0,
          'النقد'
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
          'الذمم المدينة'
        );
        
        RAISE NOTICE '✅ تم إنشاء قيد الدفع للفاتورة: %', v_invoice.invoice_number;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ فشل إصلاح الفاتورة %: %', v_invoice.invoice_number, SQLERRM;
      v_error_count := v_error_count + 1;
    END;
  END LOOP;
  
  RAISE NOTICE '✅ تم إصلاح % فاتورة', v_count;
  IF v_error_count > 0 THEN
    RAISE WARNING '⚠️ فشل إصلاح % فاتورة', v_error_count;
  END IF;
END $$;

-- =====================================================
-- إصلاح فواتير الشراء - طريقة مباشرة
-- =====================================================
DO $$
DECLARE
  v_bill RECORD;
  v_entry_id UUID;
  v_payment_entry_id UUID;
  v_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
  -- الحسابات للشركة VitaSlims
  v_ap_account_id UUID := '540cd482-13f7-4f73-b856-0b3955148f7c';
  v_expense_account_id UUID := '97fce4e0-d209-498a-bcca-af991ac2804c';
  v_cash_account_id UUID := 'f66f3019-8c50-41bb-9ace-955cc89a5bf6';
  v_bank_account_id UUID := '0baff307-e007-490a-a3ec-a96974ad0bf1';
  v_company_id UUID := '9c92a597-8c88-42a7-ad02-bd4a25b755ee';
  v_subtotal DECIMAL(15, 2);
  v_tax DECIMAL(15, 2);
  v_total DECIMAL(15, 2);
  v_paid DECIMAL(15, 2);
BEGIN
  RAISE NOTICE '🔧 بدء الإصلاح المباشر لفواتير الشراء...';
  
  FOR v_bill IN 
    SELECT 
      b.id,
      b.bill_number,
      COALESCE(b.bill_date, DATE(b.created_at), CURRENT_DATE) as bill_date,
      b.status,
      COALESCE(b.subtotal, 0) as subtotal,
      COALESCE(b.tax_amount, 0) as tax_amount,
      GREATEST(COALESCE(b.total_amount, 
        COALESCE(b.subtotal, 0) + COALESCE(b.tax_amount, 0)
      ), 0.01) as total_amount,
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
      -- فواتير الشراء تحتاج قيد فقط عند الدفع
      IF v_bill.paid_amount = 0 OR v_bill.paid_amount IS NULL THEN
        RAISE NOTICE 'ℹ️ تخطي فاتورة الشراء %: لم يتم الدفع بعد', v_bill.bill_number;
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;
      
      v_subtotal := v_bill.subtotal;
      v_tax := v_bill.tax_amount;
      v_total := v_bill.total_amount;
      v_paid := v_bill.paid_amount;
      
      -- إنشاء قيد AP/Expense
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
        'إصلاح مباشر: قيد فاتورة شراء ' || v_bill.bill_number,
        'posted'
      ) RETURNING id INTO v_entry_id;
      
      -- سطور القيد
      -- 1. Expense (Debit)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_entry_id,
        v_expense_account_id,
        v_subtotal + v_tax, -- Expense = subtotal + tax
        0,
        'المصروفات/التكاليف'
      );
      
      -- 2. AP (Credit)
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
        'الذمم الدائنة'
      );
      
      -- التحقق من التوازن
      DECLARE
        v_total_debit DECIMAL(15, 2);
        v_total_credit DECIMAL(15, 2);
        v_diff DECIMAL(15, 2);
      BEGIN
        SELECT 
          COALESCE(SUM(debit_amount), 0),
          COALESCE(SUM(credit_amount), 0)
        INTO v_total_debit, v_total_credit
        FROM journal_entry_lines
        WHERE journal_entry_id = v_entry_id;
        
        v_diff := ABS(v_total_debit - v_total_credit);
        
        IF v_diff > 0.01 THEN
          -- تصحيح التوازن
          IF v_total_debit > v_total_credit THEN
            UPDATE journal_entry_lines
            SET credit_amount = credit_amount + v_diff
            WHERE journal_entry_id = v_entry_id
            AND account_id = v_ap_account_id
            AND id = (
              SELECT id FROM journal_entry_lines
              WHERE journal_entry_id = v_entry_id
              AND account_id = v_ap_account_id
              LIMIT 1
            );
          ELSE
            UPDATE journal_entry_lines
            SET debit_amount = debit_amount + v_diff
            WHERE journal_entry_id = v_entry_id
            AND account_id = v_expense_account_id
            AND id = (
              SELECT id FROM journal_entry_lines
              WHERE journal_entry_id = v_entry_id
              AND account_id = v_expense_account_id
              LIMIT 1
            );
          END IF;
        END IF;
      END;
      
      v_count := v_count + 1;
      RAISE NOTICE '✅ تم إنشاء قيد AP/Expense لفاتورة الشراء: %', v_bill.bill_number;
      
      -- إنشاء قيد الدفع
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
        'إصلاح مباشر: قيد دفع فاتورة شراء ' || v_bill.bill_number,
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
        'الذمم الدائنة'
      );
      
      -- Cash/Bank (Credit)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_payment_entry_id,
        v_cash_account_id, -- استخدام Cash كافتراضي
        0,
        v_paid,
        'النقد'
      );
      
      RAISE NOTICE '✅ تم إنشاء قيد الدفع لفاتورة الشراء: %', v_bill.bill_number;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ فشل إصلاح فاتورة الشراء %: %', v_bill.bill_number, SQLERRM;
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
  'نتائج الإصلاح المباشر' as report_section,
  (SELECT COUNT(*) FROM invoices i
   WHERE i.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
   AND i.status IN ('sent', 'paid', 'partially_paid')
   AND (i.is_deleted IS NULL OR i.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type = 'invoice')
  ) as remaining_invoices_without_entries,
  (SELECT COUNT(*) FROM bills b
   WHERE b.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
   AND b.status IN ('sent', 'paid', 'partially_paid', 'received')
   AND (b.is_deleted IS NULL OR b.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = b.id AND je.reference_type = 'bill')
  ) as remaining_bills_without_entries,
  (SELECT COUNT(*) FROM payments p
   WHERE p.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
   AND NOT EXISTS (SELECT 1 FROM journal_entries je 
     WHERE (je.reference_id = p.id OR je.reference_id = p.invoice_id OR je.reference_id = p.bill_id)
     AND je.reference_type IN ('customer_payment', 'supplier_payment', 'invoice_payment', 'bill_payment'))
  ) as remaining_payments_without_entries;

-- =====================================================
-- نهاية السكربت
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✅ اكتمل الإصلاح المباشر!';
  RAISE NOTICE '📊 يُنصح بإعادة تنفيذ المراجعة المحاسبية الشاملة للتحقق من النتائج.';
END $$;

