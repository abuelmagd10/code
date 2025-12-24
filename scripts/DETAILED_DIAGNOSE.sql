-- =====================================================
-- 🔍 تشخيص تفصيلي للفواتير التي لم يتم إصلاحها
-- Detailed Diagnosis for Unfixed Invoices
-- =====================================================
-- تاريخ الإنشاء: 2025-01-XX
-- الهدف: معرفة السبب الدقيق لعدم إصلاح الفواتير
-- =====================================================

-- =====================================================
-- 1. تفاصيل الفواتير بدون قيود
-- =====================================================
SELECT 
  'تفاصيل الفواتير' as diagnostic_section,
  i.id,
  i.invoice_number,
  i.company_id,
  i.invoice_date,
  i.status,
  i.subtotal,
  i.tax_amount,
  i.shipping,
  i.discount_value,
  i.total_amount,
  i.paid_amount,
  i.created_at,
  -- التحقق من البيانات
  CASE 
    WHEN i.total_amount IS NULL THEN '❌ total_amount NULL'
    WHEN i.total_amount <= 0 THEN '❌ total_amount <= 0'
    WHEN i.invoice_date IS NULL THEN '❌ invoice_date NULL'
    WHEN i.subtotal IS NULL THEN '❌ subtotal NULL'
    ELSE '✅ البيانات صحيحة'
  END as data_status,
  -- التحقق من وجود قيود
  (SELECT COUNT(*) FROM journal_entries je 
   WHERE je.reference_id = i.id 
   AND je.reference_type = 'invoice') as existing_invoice_entries,
  (SELECT COUNT(*) FROM journal_entries je 
   WHERE je.reference_id = i.id 
   AND je.reference_type = 'invoice_payment') as existing_payment_entries,
  (SELECT COUNT(*) FROM journal_entries je 
   WHERE je.reference_id = i.id) as total_entries
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
-- 2. محاولة إنشاء قيد يدوياً لفاتورة واحدة (للاختبار)
-- =====================================================
DO $$
DECLARE
  v_test_invoice RECORD;
  v_entry_id UUID;
  v_ar_account_id UUID := 'e732fe9d-6845-4cad-a79d-c2b5cae056d0';
  v_revenue_account_id UUID := '441131b6-e7ef-4c9c-9338-3d1b1837a6be';
  v_company_id UUID := '9c92a597-8c88-42a7-ad02-bd4a25b755ee';
  v_subtotal DECIMAL(15, 2);
  v_tax DECIMAL(15, 2);
  v_shipping DECIMAL(15, 2);
  v_total DECIMAL(15, 2);
  v_revenue_total DECIMAL(15, 2);
BEGIN
  RAISE NOTICE '🧪 اختبار إنشاء قيد لفاتورة واحدة...';
  
  -- جلب أول فاتورة للاختبار
  SELECT 
    i.id,
    i.invoice_number,
    COALESCE(i.invoice_date, DATE(i.created_at), CURRENT_DATE) as invoice_date,
    COALESCE(i.subtotal, 0) as subtotal,
    COALESCE(i.tax_amount, 0) as tax_amount,
    COALESCE(i.shipping, 0) as shipping,
    GREATEST(COALESCE(i.total_amount, 
      COALESCE(i.subtotal, 0) + COALESCE(i.tax_amount, 0) + COALESCE(i.shipping, 0)
    ), 0.01) as total_amount
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
  
  RAISE NOTICE '📋 الفاتورة المختارة: %', v_test_invoice.invoice_number;
  RAISE NOTICE '   ID: %', v_test_invoice.id;
  RAISE NOTICE '   التاريخ: %', v_test_invoice.invoice_date;
  RAISE NOTICE '   المبلغ الإجمالي: %', v_test_invoice.total_amount;
  RAISE NOTICE '   Subtotal: %', v_test_invoice.subtotal;
  RAISE NOTICE '   Tax: %', v_test_invoice.tax_amount;
  RAISE NOTICE '   Shipping: %', v_test_invoice.shipping;
  
  v_subtotal := v_test_invoice.subtotal;
  v_tax := v_test_invoice.tax_amount;
  v_shipping := v_test_invoice.shipping;
  v_total := v_test_invoice.total_amount;
  v_revenue_total := v_subtotal + v_shipping;
  
  RAISE NOTICE '💰 الحسابات:';
  RAISE NOTICE '   AR: %', v_ar_account_id;
  RAISE NOTICE '   Revenue: %', v_revenue_account_id;
  RAISE NOTICE '   Revenue Total: %', v_revenue_total;
  RAISE NOTICE '   Total: %', v_total;
  
  -- محاولة إنشاء القيد
  BEGIN
    RAISE NOTICE '🔧 محاولة إنشاء القيد...';
    
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
      'اختبار: قيد فاتورة ' || v_test_invoice.invoice_number,
      'posted'
    ) RETURNING id INTO v_entry_id;
    
    RAISE NOTICE '✅ تم إنشاء القيد: %', v_entry_id;
    
    -- سطور القيد
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
    
    RAISE NOTICE '✅ تم إضافة سطر AR: % (Debit)', v_total;
    
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
    
    RAISE NOTICE '✅ تم إضافة سطر Revenue: % (Credit)', v_revenue_total;
    
    -- إضافة VAT إن وجد
    IF v_tax > 0 THEN
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
          
          RAISE NOTICE '✅ تم إضافة سطر VAT: % (Credit)', v_tax;
        ELSE
          -- إضافة إلى Revenue
          UPDATE journal_entry_lines
          SET credit_amount = credit_amount + v_tax
          WHERE journal_entry_id = v_entry_id
          AND account_id = v_revenue_account_id;
          
          RAISE NOTICE '⚠️ لا يوجد حساب VAT، تم إضافة الضريبة إلى Revenue';
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
      
      RAISE NOTICE '📊 التوازن:';
      RAISE NOTICE '   المدين: %', v_total_debit;
      RAISE NOTICE '   الدائن: %', v_total_credit;
      RAISE NOTICE '   الفرق: %', v_diff;
      
      IF v_diff > 0.01 THEN
        RAISE WARNING '⚠️ القيد غير متوازن! الفرق: %', v_diff;
        
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
        
        RAISE NOTICE '✅ تم تصحيح التوازن';
      ELSE
        RAISE NOTICE '✅ القيد متوازن';
      END IF;
    END;
    
    RAISE NOTICE '✅ نجح الاختبار! تم إنشاء القيد بنجاح';
    
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ فشل الاختبار: %', SQLERRM;
    RAISE NOTICE '   SQLSTATE: %', SQLSTATE;
    RAISE NOTICE '   الخطأ في: %', SQLERRM;
  END;
  
END $$;

-- =====================================================
-- 3. فحص القيود الموجودة للفواتير
-- =====================================================
SELECT 
  'القيود الموجودة' as diagnostic_section,
  je.id as entry_id,
  je.reference_type,
  je.reference_id,
  je.entry_date,
  je.description,
  je.status,
  i.invoice_number,
  COUNT(jel.id) as lines_count,
  COALESCE(SUM(jel.debit_amount), 0) as total_debit,
  COALESCE(SUM(jel.credit_amount), 0) as total_credit,
  ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) as difference
FROM journal_entries je
LEFT JOIN invoices i ON i.id = je.reference_id
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
  AND je.reference_type IN ('invoice', 'invoice_payment')
  AND je.reference_id IN (
    SELECT id FROM invoices
    WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
    AND status IN ('sent', 'paid', 'partially_paid')
    AND (is_deleted IS NULL OR is_deleted = false)
  )
GROUP BY je.id, je.reference_type, je.reference_id, je.entry_date, je.description, je.status, i.invoice_number
ORDER BY je.entry_date DESC
LIMIT 20;

-- =====================================================
-- 4. مقارنة: الفواتير التي لها قيود vs التي لا تملك
-- =====================================================
SELECT 
  'مقارنة الفواتير' as diagnostic_section,
  'فواتير بدون قيود' as category,
  COUNT(*) as count,
  SUM(COALESCE(total_amount, 0)) as total_amount_sum,
  AVG(COALESCE(total_amount, 0)) as avg_amount
FROM invoices
WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
  AND status IN ('sent', 'paid', 'partially_paid')
  AND (is_deleted IS NULL OR is_deleted = false)
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = invoices.id 
    AND je.reference_type = 'invoice'
  )
UNION ALL
SELECT 
  'مقارنة الفواتير' as diagnostic_section,
  'فواتير لها قيود' as category,
  COUNT(*) as count,
  SUM(COALESCE(total_amount, 0)) as total_amount_sum,
  AVG(COALESCE(total_amount, 0)) as avg_amount
FROM invoices
WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
  AND status IN ('sent', 'paid', 'partially_paid')
  AND (is_deleted IS NULL OR is_deleted = false)
  AND EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = invoices.id 
    AND je.reference_type = 'invoice'
  );

-- =====================================================
-- نهاية السكربت
-- =====================================================

