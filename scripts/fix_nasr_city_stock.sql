-- =====================================================
-- 🔧 إصلاح مخزون مدينة نصر لمنتج boom
-- =====================================================

-- 1️⃣ التحقق من المشكلة أولاً
DO $$
DECLARE
  v_company_id UUID;
  v_product_id UUID;
  v_warehouse_id UUID;
  v_product_name TEXT;
  v_warehouse_name TEXT;
  v_calculated_stock NUMERIC := 0;
  v_system_stock INTEGER;
  v_transaction_count INTEGER;
BEGIN
  -- جلب معرف الشركة (أول شركة في النظام)
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  
  -- جلب منتج boom
  SELECT id, name, quantity_on_hand 
  INTO v_product_id, v_product_name, v_system_stock
  FROM products 
  WHERE company_id = v_company_id 
  AND sku = 'suk- 1001'
  LIMIT 1;
  
  -- جلب مخزن مدينة نصر
  SELECT id, name 
  INTO v_warehouse_id, v_warehouse_name
  FROM warehouses 
  WHERE company_id = v_company_id 
  AND name ILIKE '%مدينة نصر%'
  LIMIT 1;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '📦 المنتج: % (ID: %)', v_product_name, v_product_id;
  RAISE NOTICE '🏢 المخزن: % (ID: %)', v_warehouse_name, v_warehouse_id;
  RAISE NOTICE '========================================';
  
  -- حساب الرصيد من الحركات
  SELECT COALESCE(SUM(quantity_change), 0), COUNT(*)
  INTO v_calculated_stock, v_transaction_count
  FROM inventory_transactions
  WHERE company_id = v_company_id
  AND product_id = v_product_id
  AND warehouse_id = v_warehouse_id
  AND (is_deleted IS NULL OR is_deleted = false);
  
  RAISE NOTICE '📊 عدد الحركات: %', v_transaction_count;
  RAISE NOTICE '📊 الرصيد المحسوب: %', v_calculated_stock;
  RAISE NOTICE '📊 الرصيد في النظام: %', v_system_stock;
  RAISE NOTICE '📊 الفرق: %', v_calculated_stock - v_system_stock;
  RAISE NOTICE '========================================';
  
  -- عرض تفاصيل الحركات
  RAISE NOTICE '📋 تفاصيل الحركات:';
  FOR rec IN (
    SELECT 
      transaction_type,
      COUNT(*) as count,
      SUM(quantity_change) as total_change
    FROM inventory_transactions
    WHERE company_id = v_company_id
    AND product_id = v_product_id
    AND warehouse_id = v_warehouse_id
    AND (is_deleted IS NULL OR is_deleted = false)
    GROUP BY transaction_type
    ORDER BY transaction_type
  ) LOOP
    RAISE NOTICE '  - %: % حركة، إجمالي التغيير: %', 
      rec.transaction_type, rec.count, rec.total_change;
  END LOOP;
  
  RAISE NOTICE '========================================';
  
  -- 2️⃣ الإصلاح: مزامنة الرصيد
  IF v_calculated_stock != v_system_stock THEN
    RAISE NOTICE '🔧 جاري الإصلاح...';
    
    UPDATE products
    SET quantity_on_hand = v_calculated_stock
    WHERE id = v_product_id;
    
    RAISE NOTICE '✅ تم تحديث الرصيد من % إلى %', v_system_stock, v_calculated_stock;
  ELSE
    RAISE NOTICE '✅ الرصيد صحيح، لا حاجة للإصلاح';
  END IF;
  
  RAISE NOTICE '========================================';
  
END $$;

-- 3️⃣ التحقق من جميع المنتجات في مخزن مدينة نصر
DO $$
DECLARE
  v_company_id UUID;
  v_warehouse_id UUID;
  v_fixed_count INTEGER := 0;
BEGIN
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  
  SELECT id INTO v_warehouse_id
  FROM warehouses 
  WHERE company_id = v_company_id 
  AND name ILIKE '%مدينة نصر%'
  LIMIT 1;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '🔍 فحص جميع المنتجات في مخزن مدينة نصر...';
  RAISE NOTICE '========================================';
  
  FOR rec IN (
    SELECT 
      p.id,
      p.name,
      p.sku,
      p.quantity_on_hand as system_qty,
      COALESCE(SUM(it.quantity_change), 0) as calculated_qty
    FROM products p
    LEFT JOIN inventory_transactions it ON it.product_id = p.id 
      AND it.warehouse_id = v_warehouse_id
      AND (it.is_deleted IS NULL OR it.is_deleted = false)
    WHERE p.company_id = v_company_id
    GROUP BY p.id, p.name, p.sku, p.quantity_on_hand
    HAVING p.quantity_on_hand != COALESCE(SUM(it.quantity_change), 0)
  ) LOOP
    RAISE NOTICE '❌ %: النظام=%, المحسوب=%, الفرق=%', 
      rec.name, rec.system_qty, rec.calculated_qty, 
      rec.calculated_qty - rec.system_qty;
    v_fixed_count := v_fixed_count + 1;
  END LOOP;
  
  IF v_fixed_count = 0 THEN
    RAISE NOTICE '✅ جميع المنتجات صحيحة';
  ELSE
    RAISE NOTICE '⚠️ وجد % منتج يحتاج إصلاح', v_fixed_count;
  END IF;
  
  RAISE NOTICE '========================================';
END $$;

