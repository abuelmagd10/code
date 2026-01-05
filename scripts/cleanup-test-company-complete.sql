-- =============================================
-- CLEANUP TEST COMPANY DATA - COMPLETE CLEANUP
-- تنظيف كامل وشامل لبيانات شركة الاختبار "تست"
-- يشمل: الفواتير، القيود، المخزون، المرتجعات، المدفوعات
-- =============================================

-- 1. العثور على ID شركة "تست"
DO $$
DECLARE
  test_company_id UUID;
  deleted_count INTEGER;
BEGIN
  SELECT id INTO test_company_id
  FROM companies
  WHERE name = 'تست' OR name ILIKE '%تست%'
  LIMIT 1;
  
  IF test_company_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على شركة "تست"';
  END IF;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'بدء تنظيف شركة "تست" - ID: %', test_company_id;
  RAISE NOTICE '========================================';
  
  -- 2. تعطيل Triggers مؤقتاً
  RAISE NOTICE 'تعطيل Triggers...';
  ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;
  
  -- 3. حذف سطور القيود المحاسبية (جميع القيود المرتبطة بالفواتير)
  RAISE NOTICE 'حذف سطور القيود المحاسبية...';
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
  RAISE NOTICE 'تم حذف % سطر من القيود', deleted_count;
  
  -- 4. حذف القيود المحاسبية المرتبطة بالفواتير
  RAISE NOTICE 'حذف القيود المحاسبية...';
  DELETE FROM journal_entries
  WHERE company_id = test_company_id
    AND reference_type IN (
      'invoice', 'invoice_payment', 'invoice_reversal', 'credit_note',
      'bill', 'bill_payment', 'bill_reversal', 'vendor_credit',
      'sales_return', 'purchase_return'
    );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % قيد محاسبي', deleted_count;
  
  -- 5. إعادة تفعيل Trigger
  RAISE NOTICE 'إعادة تفعيل Trigger...';
  ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;
  
  -- 6. حذف المدفوعات
  RAISE NOTICE 'حذف المدفوعات...';
  DELETE FROM payments
  WHERE company_id = test_company_id
    AND (invoice_id IN (SELECT id FROM invoices WHERE company_id = test_company_id)
      OR bill_id IN (SELECT id FROM bills WHERE company_id = test_company_id));
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % دفعة', deleted_count;
  
  -- 7. حذف جميع حركات المخزون (شامل - ليس فقط المرتبطة بالفواتير)
  RAISE NOTICE 'حذف جميع حركات المخزون...';
  DELETE FROM inventory_transactions
  WHERE company_id = test_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % حركة مخزون', deleted_count;
  
  -- 8. حذف المرتجعات
  RAISE NOTICE 'حذف المرتجعات...';
  DELETE FROM sales_returns WHERE company_id = test_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % مرتجع مبيعات', deleted_count;
  
  DELETE FROM purchase_returns WHERE company_id = test_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % مرتجع شراء', deleted_count;
  
  DELETE FROM vendor_credits WHERE company_id = test_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % إشعار دائن', deleted_count;
  
  -- 9. حذف سطور الفواتير
  RAISE NOTICE 'حذف سطور الفواتير...';
  DELETE FROM invoice_items
  WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = test_company_id);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % سطر فاتورة بيع', deleted_count;
  
  DELETE FROM bill_items
  WHERE bill_id IN (SELECT id FROM bills WHERE company_id = test_company_id);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % سطر فاتورة شراء', deleted_count;
  
  -- 10. حذف الفواتير (جميع الحالات: Draft, Sent, Paid)
  RAISE NOTICE 'حذف فواتير البيع...';
  DELETE FROM invoices WHERE company_id = test_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % فاتورة بيع', deleted_count;
  
  RAISE NOTICE 'حذف فواتير الشراء...';
  DELETE FROM bills WHERE company_id = test_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % فاتورة شراء', deleted_count;
  
  -- 11. حذف أوامر البيع والشراء
  RAISE NOTICE 'حذف أوامر البيع...';
  DELETE FROM sales_order_items
  WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE company_id = test_company_id);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % سطر أمر بيع', deleted_count;
  
  DELETE FROM sales_orders WHERE company_id = test_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % أمر بيع', deleted_count;
  
  RAISE NOTICE 'حذف أوامر الشراء...';
  DELETE FROM purchase_order_items
  WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE company_id = test_company_id);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % سطر أمر شراء', deleted_count;
  
  DELETE FROM purchase_orders WHERE company_id = test_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % أمر شراء', deleted_count;
  
  -- 12. إعادة تعيين المخزون إلى صفر لجميع المنتجات
  RAISE NOTICE 'إعادة تعيين المخزون إلى صفر...';
  UPDATE products
  SET quantity_on_hand = 0
  WHERE company_id = test_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم تحديث % منتج (المخزون = 0)', deleted_count;
  
  -- 13. حذف أي بيانات مخزون إضافية (إذا كانت موجودة)
  -- حذف إهلاكات المخزون (Inventory Write-offs)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_write_offs') THEN
    RAISE NOTICE 'حذف إهلاكات المخزون...';
    DELETE FROM inventory_write_off_items
    WHERE write_off_id IN (
      SELECT id FROM inventory_write_offs WHERE company_id = test_company_id
    );
    DELETE FROM inventory_write_offs WHERE company_id = test_company_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'تم حذف % إهلاك مخزون', deleted_count;
  END IF;
  
  -- حذف مخزون المستودعات (إذا كان موجوداً)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouse_stock') THEN
    RAISE NOTICE 'حذف مخزون المستودعات...';
    DELETE FROM warehouse_stock
    WHERE company_id = test_company_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'تم حذف % سجل مخزون مستودع', deleted_count;
  END IF;
  
  -- حذف حركات المستودعات (إذا كانت موجودة)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouse_transactions') THEN
    RAISE NOTICE 'حذف حركات المستودعات...';
    DELETE FROM warehouse_transactions
    WHERE company_id = test_company_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'تم حذف % حركة مستودع', deleted_count;
  END IF;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'تم الانتهاء من تنظيف شركة "تست" بنجاح';
  RAISE NOTICE '========================================';
  
END $$;

-- 14. التحقق من النتيجة النهائية
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
  'Journal Entries (Invoice/Bill related)' as category,
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
WHERE company_id = (SELECT id FROM companies WHERE name = 'تست' OR name ILIKE '%تست%' LIMIT 1)
UNION ALL
SELECT 
  'Inventory Transactions' as category,
  COUNT(*) as remaining_count
FROM inventory_transactions
WHERE company_id = (SELECT id FROM companies WHERE name = 'تست' OR name ILIKE '%تست%' LIMIT 1)
UNION ALL
SELECT 
  'Products with Stock > 0' as category,
  COUNT(*) as remaining_count
FROM products
WHERE company_id = (SELECT id FROM companies WHERE name = 'تست' OR name ILIKE '%تست%' LIMIT 1)
  AND quantity_on_hand > 0;

