-- =============================================
-- CLEANUP TEST COMPANY DATA
-- تنظيف كامل لبيانات شركة الاختبار "تست"
-- =============================================
-- 
-- تحذير: هذا السكربت يحذف جميع البيانات المتعلقة بشركة "تست"
-- استخدمه فقط للشركة التجريبية
--
-- =============================================

-- 1. العثور على ID شركة "تست"
DO $$
DECLARE
  test_company_id UUID;
  deleted_count INTEGER;
BEGIN
  -- البحث عن شركة "تست"
  SELECT id INTO test_company_id
  FROM companies
  WHERE name = 'تست' OR name ILIKE '%تست%'
  LIMIT 1;
  
  IF test_company_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على شركة "تست"';
  END IF;
  
  RAISE NOTICE 'تم العثور على شركة "تست" - ID: %', test_company_id;
  
  -- =============================================
  -- 2. حذف القيود المحاسبية المرتبطة بالفواتير
  -- =============================================
  RAISE NOTICE 'حذف القيود المحاسبية...';
  
  -- حذف سطور القيود أولاً
  DELETE FROM journal_entry_lines
  WHERE journal_entry_id IN (
    SELECT je.id
    FROM journal_entries je
    WHERE je.company_id = test_company_id
      AND je.reference_type IN (
        'invoice', 'invoice_payment', 'invoice_reversal', 'credit_note',
        'bill', 'bill_payment', 'bill_reversal', 'vendor_credit',
        'sales_return', 'purchase_return'
      )
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % سطر قيد', deleted_count;
  
  -- حذف القيود المحاسبية
  DELETE FROM journal_entries
  WHERE company_id = test_company_id
    AND reference_type IN (
      'invoice', 'invoice_payment', 'invoice_reversal', 'credit_note',
      'bill', 'bill_payment', 'bill_reversal', 'vendor_credit',
      'sales_return', 'purchase_return'
    );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % قيد محاسبي', deleted_count;
  
  -- =============================================
  -- 3. حذف المدفوعات (Payments)
  -- =============================================
  RAISE NOTICE 'حذف المدفوعات...';
  
  DELETE FROM payments
  WHERE company_id = test_company_id
    AND (invoice_id IN (SELECT id FROM invoices WHERE company_id = test_company_id)
      OR bill_id IN (SELECT id FROM bills WHERE company_id = test_company_id));
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % دفعة', deleted_count;
  
  -- =============================================
  -- 4. حذف حركات المخزون المرتبطة بالفواتير
  -- =============================================
  RAISE NOTICE 'حذف حركات المخزون...';
  
  DELETE FROM inventory_transactions
  WHERE company_id = test_company_id
    AND (reference_id IN (SELECT id FROM invoices WHERE company_id = test_company_id)
      OR reference_id IN (SELECT id FROM bills WHERE company_id = test_company_id)
      OR reference_id IN (SELECT id FROM sales_returns WHERE company_id = test_company_id)
      OR reference_id IN (SELECT id FROM purchase_returns WHERE company_id = test_company_id));
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % حركة مخزون', deleted_count;
  
  -- =============================================
  -- 5. حذف المرتجعات
  -- =============================================
  RAISE NOTICE 'حذف المرتجعات...';
  
  -- مرتجعات المبيعات
  DELETE FROM sales_returns
  WHERE company_id = test_company_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % مرتجع مبيعات', deleted_count;
  
  -- مرتجعات المشتريات
  DELETE FROM purchase_returns
  WHERE company_id = test_company_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % مرتجع مشتريات', deleted_count;
  
  -- Vendor Credits
  DELETE FROM vendor_credits
  WHERE company_id = test_company_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % vendor credit', deleted_count;
  
  -- =============================================
  -- 6. حذف فواتير البيع (Invoices)
  -- =============================================
  RAISE NOTICE 'حذف فواتير البيع...';
  
  -- حذف سطور الفواتير أولاً
  DELETE FROM invoice_items
  WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = test_company_id);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % سطر فاتورة', deleted_count;
  
  -- حذف الفواتير
  DELETE FROM invoices
  WHERE company_id = test_company_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % فاتورة بيع', deleted_count;
  
  -- =============================================
  -- 7. حذف فواتير الشراء (Bills)
  -- =============================================
  RAISE NOTICE 'حذف فواتير الشراء...';
  
  -- حذف سطور الفواتير أولاً
  DELETE FROM bill_items
  WHERE bill_id IN (SELECT id FROM bills WHERE company_id = test_company_id);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % سطر فاتورة شراء', deleted_count;
  
  -- حذف الفواتير
  DELETE FROM bills
  WHERE company_id = test_company_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % فاتورة شراء', deleted_count;
  
  -- =============================================
  -- 8. حذف أوامر البيع والشراء (Orders)
  -- =============================================
  RAISE NOTICE 'حذف أوامر البيع والشراء...';
  
  -- حذف سطور أوامر البيع
  DELETE FROM sales_order_items
  WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE company_id = test_company_id);
  
  DELETE FROM sales_orders
  WHERE company_id = test_company_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % أمر بيع', deleted_count;
  
  -- حذف سطور أوامر الشراء
  DELETE FROM purchase_order_items
  WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE company_id = test_company_id);
  
  DELETE FROM purchase_orders
  WHERE company_id = test_company_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % أمر شراء', deleted_count;
  
  -- =============================================
  -- 9. تحديث المخزون (إعادة حساب الكميات)
  -- =============================================
  RAISE NOTICE 'تحديث المخزون...';
  
  -- إعادة حساب كميات المخزون بناءً على حركات المخزون المتبقية
  UPDATE products p
  SET quantity_on_hand = COALESCE((
    SELECT SUM(quantity_change)
    FROM inventory_transactions it
    WHERE it.product_id = p.id
      AND it.company_id = test_company_id
  ), 0)
  WHERE p.company_id = test_company_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم تحديث % منتج', deleted_count;
  
  -- =============================================
  -- 10. حذف أي قيود محاسبية متبقية (يدوية)
  -- =============================================
  RAISE NOTICE 'حذف القيود المحاسبية اليدوية...';
  
  DELETE FROM journal_entry_lines
  WHERE journal_entry_id IN (
    SELECT id FROM journal_entries
    WHERE company_id = test_company_id
      AND reference_type NOT IN (
        'invoice', 'invoice_payment', 'invoice_reversal', 'credit_note',
        'bill', 'bill_payment', 'bill_reversal', 'vendor_credit',
        'sales_return', 'purchase_return'
      )
      AND (reference_type IS NULL OR reference_type = 'manual_entry')
  );
  
  DELETE FROM journal_entries
  WHERE company_id = test_company_id
    AND reference_type NOT IN (
      'invoice', 'invoice_payment', 'invoice_reversal', 'credit_note',
      'bill', 'bill_payment', 'bill_reversal', 'vendor_credit',
      'sales_return', 'purchase_return'
    )
    AND (reference_type IS NULL OR reference_type = 'manual_entry');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % قيد يدوي', deleted_count;
  
  -- =============================================
  -- 11. التحقق من النتيجة
  -- =============================================
  RAISE NOTICE 'التحقق من النتيجة...';
  
  -- التحقق من عدم وجود فواتير
  SELECT COUNT(*) INTO deleted_count
  FROM invoices
  WHERE company_id = test_company_id;
  
  IF deleted_count > 0 THEN
    RAISE WARNING 'لا يزال يوجد % فاتورة بيع', deleted_count;
  ELSE
    RAISE NOTICE 'لا توجد فواتير بيع متبقية';
  END IF;
  
  -- التحقق من عدم وجود فواتير شراء
  SELECT COUNT(*) INTO deleted_count
  FROM bills
  WHERE company_id = test_company_id;
  
  IF deleted_count > 0 THEN
    RAISE WARNING 'لا يزال يوجد % فاتورة شراء', deleted_count;
  ELSE
    RAISE NOTICE 'لا توجد فواتير شراء متبقية';
  END IF;
  
  -- التحقق من عدم وجود قيود محاسبية مرتبطة
  SELECT COUNT(*) INTO deleted_count
  FROM journal_entries
  WHERE company_id = test_company_id
    AND reference_type IN (
      'invoice', 'invoice_payment', 'invoice_reversal', 'credit_note',
      'bill', 'bill_payment', 'bill_reversal', 'vendor_credit',
      'sales_return', 'purchase_return'
    );
  
  IF deleted_count > 0 THEN
    RAISE WARNING 'لا يزال يوجد % قيد محاسبي مرتبط', deleted_count;
  ELSE
    RAISE NOTICE 'لا توجد قيود محاسبية مرتبطة متبقية';
  END IF;
  
  RAISE NOTICE 'تم الانتهاء من تنظيف بيانات شركة "تست"';
  
END $$;

-- =============================================
-- 12. ملخص نهائي
-- =============================================
SELECT 
  'Invoices' as category,
  COUNT(*) as remaining_count
FROM invoices
WHERE company_id = (SELECT id FROM companies WHERE name = 'تست' OR name ILIKE '%تست%' LIMIT 1)
UNION ALL
SELECT 
  'Bills' as category,
  COUNT(*) as remaining_count
FROM bills
WHERE company_id = (SELECT id FROM companies WHERE name = 'تست' OR name ILIKE '%تست%' LIMIT 1)
UNION ALL
SELECT 
  'Journal Entries (Related)' as category,
  COUNT(*) as remaining_count
FROM journal_entries
WHERE company_id = (SELECT id FROM companies WHERE name = 'تست' OR name ILIKE '%تست%' LIMIT 1)
  AND reference_type IN (
    'invoice', 'invoice_payment', 'invoice_reversal', 'credit_note',
    'bill', 'bill_payment', 'bill_reversal', 'vendor_credit',
    'sales_return', 'purchase_return'
  )
UNION ALL
SELECT 
  'Sales Returns' as category,
  COUNT(*) as remaining_count
FROM sales_returns
WHERE company_id = (SELECT id FROM companies WHERE name = 'تست' OR name ILIKE '%تست%' LIMIT 1)
UNION ALL
SELECT 
  'Purchase Returns' as category,
  COUNT(*) as remaining_count
FROM purchase_returns
WHERE company_id = (SELECT id FROM companies WHERE name = 'تست' OR name ILIKE '%تست%' LIMIT 1);

-- النتيجة المتوقعة: جميع الأرقام يجب أن تكون 0

-- =============================================
-- نهاية السكربت
-- =============================================

