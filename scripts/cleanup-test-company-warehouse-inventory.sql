-- =============================================
-- CLEANUP TEST COMPANY - WAREHOUSE & INVENTORY COMPLETE
-- تنظيف كامل لبيانات المخزون على مستوى المستودعات والفروع ومراكز التكلفة
-- لشركة الاختبار "تست"
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
  RAISE NOTICE 'بدء تنظيف مخزون المستودعات لشركة "تست" - ID: %', test_company_id;
  RAISE NOTICE '========================================';
  
  -- 2. تعطيل Triggers مؤقتاً
  RAISE NOTICE 'تعطيل Triggers...';
  ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;
  
  -- 3. حذف جميع حركات المخزون (شامل - جميع المستودعات والفروع)
  RAISE NOTICE 'حذف جميع حركات المخزون...';
  DELETE FROM inventory_transactions
  WHERE company_id = test_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم حذف % حركة مخزون', deleted_count;
  
  -- 4. حذف مخزون المنتجات في المستودعات (product_inventory)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_inventory') THEN
    RAISE NOTICE 'حذف مخزون المنتجات في المستودعات...';
    DELETE FROM product_inventory
    WHERE product_id IN (
      SELECT id FROM products WHERE company_id = test_company_id
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'تم حذف % سجل مخزون منتج في مستودع', deleted_count;
  END IF;
  
  -- 5. حذف مخزون المستودعات (warehouse_stock)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouse_stock') THEN
    RAISE NOTICE 'حذف مخزون المستودعات...';
    DELETE FROM warehouse_stock
    WHERE company_id = test_company_id
       OR warehouse_id IN (
         SELECT id FROM warehouses WHERE company_id = test_company_id
       );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'تم حذف % سجل مخزون مستودع', deleted_count;
  END IF;
  
  -- 6. حذف حركات المستودعات (warehouse_transactions)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouse_transactions') THEN
    RAISE NOTICE 'حذف حركات المستودعات...';
    DELETE FROM warehouse_transactions
    WHERE company_id = test_company_id
       OR warehouse_id IN (
         SELECT id FROM warehouses WHERE company_id = test_company_id
       );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'تم حذف % حركة مستودع', deleted_count;
  END IF;
  
  -- 7. حذف إهلاكات المخزون (Inventory Write-offs)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_write_offs') THEN
    RAISE NOTICE 'حذف إهلاكات المخزون...';
    DELETE FROM inventory_write_off_items
    WHERE write_off_id IN (
      SELECT id FROM inventory_write_offs WHERE company_id = test_company_id
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'تم حذف % عنصر إهلاك', deleted_count;
    
    DELETE FROM inventory_write_offs WHERE company_id = test_company_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'تم حذف % إهلاك مخزون', deleted_count;
  END IF;
  
  -- 8. إعادة تعيين المخزون إلى صفر لجميع المنتجات (على مستوى الشركة)
  RAISE NOTICE 'إعادة تعيين المخزون إلى صفر لجميع المنتجات...';
  UPDATE products
  SET quantity_on_hand = 0
  WHERE company_id = test_company_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'تم تحديث % منتج (المخزون = 0)', deleted_count;
  
  -- 9. إعادة تفعيل Trigger
  RAISE NOTICE 'إعادة تفعيل Trigger...';
  ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'تم الانتهاء من تنظيف مخزون المستودعات';
  RAISE NOTICE '========================================';
  
END $$;

-- 10. التحقق من النتيجة النهائية - المخزون
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
  AND quantity_on_hand > 0
UNION ALL
SELECT 
  'Products with Stock < 0' as category,
  COUNT(*) as remaining_count
FROM products
WHERE company_id = (SELECT id FROM companies WHERE name = 'تست' OR name ILIKE '%تست%' LIMIT 1)
  AND quantity_on_hand < 0
UNION ALL
SELECT 
  'Product Inventory (warehouse level)' as category,
  COUNT(*) as remaining_count
FROM product_inventory
WHERE product_id IN (
  SELECT id FROM products WHERE company_id = (SELECT id FROM companies WHERE name = 'تست' OR name ILIKE '%تست%' LIMIT 1)
)
UNION ALL
SELECT 
  'Warehouse Stock' as category,
  COUNT(*) as remaining_count
FROM warehouse_stock
WHERE company_id = (SELECT id FROM companies WHERE name = 'تست' OR name ILIKE '%تست%' LIMIT 1)
   OR warehouse_id IN (
     SELECT id FROM warehouses WHERE company_id = (SELECT id FROM companies WHERE name = 'تست' OR name ILIKE '%تست%' LIMIT 1)
   )
UNION ALL
SELECT 
  'Inventory Write-offs' as category,
  COUNT(*) as remaining_count
FROM inventory_write_offs
WHERE company_id = (SELECT id FROM companies WHERE name = 'تست' OR name ILIKE '%تست%' LIMIT 1);

-- 11. عرض المخزون المتبقي لكل مستودع (إذا كان موجوداً)
DO $$
DECLARE
  test_company_id UUID;
BEGIN
  SELECT id INTO test_company_id
  FROM companies
  WHERE name = 'تست' OR name ILIKE '%تست%'
  LIMIT 1;
  
  IF test_company_id IS NOT NULL THEN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ملخص المخزون المتبقي لكل مستودع:';
    RAISE NOTICE '========================================';
    
    -- عرض المخزون من inventory_transactions
    FOR rec IN 
      SELECT 
        w.name as warehouse_name,
        w.code as warehouse_code,
        p.name as product_name,
        p.sku,
        SUM(it.quantity_change) as total_stock
      FROM warehouses w
      CROSS JOIN products p
      LEFT JOIN inventory_transactions it ON it.warehouse_id = w.id AND it.product_id = p.id
      WHERE w.company_id = test_company_id
        AND p.company_id = test_company_id
      GROUP BY w.id, w.name, w.code, p.id, p.name, p.sku
      HAVING SUM(it.quantity_change) != 0 OR SUM(it.quantity_change) IS NULL
      ORDER BY w.name, p.name
    LOOP
      RAISE NOTICE 'المستودع: %, المنتج: % (%), المخزون: %', 
        rec.warehouse_name, rec.product_name, rec.sku, COALESCE(rec.total_stock, 0);
    END LOOP;
  END IF;
END $$;

