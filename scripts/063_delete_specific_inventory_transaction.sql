-- ============================================================
-- حذف حركة مخزون محددة
-- ============================================================
-- المنتج: kimo
-- SKU: suk- 1002
-- النوع: شراء (purchase)
-- الكمية: +90
-- التاريخ: 27 يناير 2026
-- الشركة: تست
-- المخزن: مصر الجديدة
-- ============================================================

DO $$
DECLARE
  v_company_id UUID;
  v_product_id UUID;
  v_warehouse_id UUID;
  v_transaction_id UUID;
  v_deleted_count INTEGER;
BEGIN
  -- 1. العثور على شركة "تست"
  SELECT id INTO v_company_id
  FROM companies
  WHERE name = 'تست' OR name ILIKE '%تست%'
  LIMIT 1;
  
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على شركة "تست"';
  END IF;
  
  RAISE NOTICE '✅ تم العثور على شركة "تست" - ID: %', v_company_id;
  
  -- 2. العثور على المنتج من SKU
  SELECT id INTO v_product_id
  FROM products
  WHERE company_id = v_company_id
    AND (sku = 'suk- 1002' OR sku = 'suk-1002' OR sku ILIKE '%suk-1002%')
  LIMIT 1;
  
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على منتج بـ SKU: suk- 1002';
  END IF;
  
  RAISE NOTICE '✅ تم العثور على المنتج - ID: %', v_product_id;
  
  -- 3. العثور على المخزن "مصر الجديدة"
  SELECT id INTO v_warehouse_id
  FROM warehouses
  WHERE company_id = v_company_id
    AND (name = 'مصر الجديدة' OR name ILIKE '%مصر الجديدة%')
  LIMIT 1;
  
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على مخزن "مصر الجديدة"';
  END IF;
  
  RAISE NOTICE '✅ تم العثور على المخزن "مصر الجديدة" - ID: %', v_warehouse_id;
  
  -- 4. البحث عن حركة المخزون المحددة
  SELECT id INTO v_transaction_id
  FROM inventory_transactions
  WHERE company_id = v_company_id
    AND product_id = v_product_id
    AND warehouse_id = v_warehouse_id
    AND transaction_type = 'purchase'
    AND quantity_change = 90
    AND created_at >= '2026-01-27'::timestamp
    AND created_at < '2026-01-28'::timestamp
    AND (notes LIKE '%BILL-0003%' OR notes LIKE '%اعتماد استلام%' OR notes LIKE '%فاتورة مشتريات%')
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_transaction_id IS NULL THEN
    RAISE NOTICE '⚠️  لم يتم العثور على حركة مخزون مطابقة - البحث بدون قيود التاريخ والملاحظات...';
    
    -- البحث بدون قيود التاريخ والملاحظات
    SELECT id INTO v_transaction_id
    FROM inventory_transactions
    WHERE company_id = v_company_id
      AND product_id = v_product_id
      AND warehouse_id = v_warehouse_id
      AND transaction_type = 'purchase'
      AND quantity_change = 90
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;
  
  IF v_transaction_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على حركة مخزون مطابقة للمعايير المحددة';
  END IF;
  
  RAISE NOTICE '✅ تم العثور على حركة المخزون - ID: %', v_transaction_id;
  
  -- 5. حذف حركة المخزون
  DELETE FROM inventory_transactions
  WHERE id = v_transaction_id;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  IF v_deleted_count > 0 THEN
    RAISE NOTICE '✅ تم حذف حركة المخزون بنجاح';
    RAISE NOTICE '⚠️  ملاحظة: تم حذف الحركة، لكن quantity_on_hand في products قد يحتاج تحديث يدوي';
  ELSE
    RAISE EXCEPTION 'فشل في حذف حركة المخزون';
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'خطأ في حذف حركة المخزون: %', SQLERRM;
END $$;

-- ============================================================
-- التحقق من النتائج
-- ============================================================
SELECT 
  it.id,
  it.transaction_type,
  it.quantity_change,
  it.created_at,
  it.notes,
  p.name as product_name,
  p.sku,
  w.name as warehouse_name
FROM inventory_transactions it
JOIN products p ON it.product_id = p.id
LEFT JOIN warehouses w ON it.warehouse_id = w.id
WHERE p.sku ILIKE '%suk-1002%'
  AND it.transaction_type = 'purchase'
  AND it.quantity_change = 90
ORDER BY it.created_at DESC
LIMIT 5;
