-- =============================================
-- CLEANUP TEST COMPANY DATA - WITH TRIGGER DISABLE
-- تنظيف كامل لبيانات شركة الاختبار "تست"
-- =============================================

-- 1. العثور على ID شركة "تست"
DO $$
DECLARE
  test_company_id UUID;
BEGIN
  SELECT id INTO test_company_id
  FROM companies
  WHERE name = 'تست' OR name ILIKE '%تست%'
  LIMIT 1;
  
  IF test_company_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على شركة "تست"';
  END IF;
  
  RAISE NOTICE 'تم العثور على شركة "تست" - ID: %', test_company_id;
  
  -- 2. تعطيل Trigger مؤقتاً
  RAISE NOTICE 'تعطيل Trigger...';
  ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;
  
  -- 3. حذف سطور القيود المحاسبية
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
  
  -- 4. حذف القيود المحاسبية
  DELETE FROM journal_entries
  WHERE company_id = test_company_id
    AND reference_type IN (
      'invoice', 'invoice_payment', 'invoice_reversal', 'credit_note',
      'bill', 'bill_payment', 'bill_reversal', 'vendor_credit',
      'sales_return', 'purchase_return'
    );
  
  -- 5. إعادة تفعيل Trigger
  RAISE NOTICE 'إعادة تفعيل Trigger...';
  ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;
  
  -- 6. حذف المدفوعات
  DELETE FROM payments
  WHERE company_id = test_company_id
    AND (invoice_id IN (SELECT id FROM invoices WHERE company_id = test_company_id)
      OR bill_id IN (SELECT id FROM bills WHERE company_id = test_company_id));
  
  -- 7. حذف حركات المخزون
  DELETE FROM inventory_transactions
  WHERE company_id = test_company_id
    AND (reference_id IN (SELECT id FROM invoices WHERE company_id = test_company_id)
      OR reference_id IN (SELECT id FROM bills WHERE company_id = test_company_id)
      OR reference_id IN (SELECT id FROM sales_returns WHERE company_id = test_company_id)
      OR reference_id IN (SELECT id FROM purchase_returns WHERE company_id = test_company_id));
  
  -- 8. حذف المرتجعات
  DELETE FROM sales_returns WHERE company_id = test_company_id;
  DELETE FROM purchase_returns WHERE company_id = test_company_id;
  DELETE FROM vendor_credits WHERE company_id = test_company_id;
  
  -- 9. حذف سطور الفواتير
  DELETE FROM invoice_items
  WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = test_company_id);
  
  DELETE FROM bill_items
  WHERE bill_id IN (SELECT id FROM bills WHERE company_id = test_company_id);
  
  -- 10. حذف الفواتير
  DELETE FROM invoices WHERE company_id = test_company_id;
  DELETE FROM bills WHERE company_id = test_company_id;
  
  -- 11. حذف أوامر البيع والشراء
  DELETE FROM sales_order_items
  WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE company_id = test_company_id);
  
  DELETE FROM sales_orders WHERE company_id = test_company_id;
  
  DELETE FROM purchase_order_items
  WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE company_id = test_company_id);
  
  DELETE FROM purchase_orders WHERE company_id = test_company_id;
  
  -- 12. تحديث المخزون
  UPDATE products p
  SET quantity_on_hand = COALESCE((
    SELECT SUM(quantity_change)
    FROM inventory_transactions it
    WHERE it.product_id = p.id
      AND it.company_id = test_company_id
  ), 0)
  WHERE p.company_id = test_company_id;
  
  RAISE NOTICE 'تم الانتهاء من تنظيف بيانات شركة "تست"';
  
END $$;

-- 13. التحقق من النتيجة
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
  'Journal Entries' as category,
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

