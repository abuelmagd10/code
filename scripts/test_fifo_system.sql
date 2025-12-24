-- =============================================
-- FIFO System Test Script
-- =============================================
-- اختبارات شاملة للتحقق من صحة نظام FIFO
-- =============================================

-- 🧪 Test 1: التحقق من وجود الجداول والدوال
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '🧪 Test 1: Checking Tables and Functions';
  RAISE NOTICE '========================================';
  
  -- التحقق من الجداول
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fifo_cost_lots') THEN
    RAISE NOTICE '✅ Table fifo_cost_lots exists';
  ELSE
    RAISE EXCEPTION '❌ Table fifo_cost_lots not found';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fifo_lot_consumptions') THEN
    RAISE NOTICE '✅ Table fifo_lot_consumptions exists';
  ELSE
    RAISE EXCEPTION '❌ Table fifo_lot_consumptions not found';
  END IF;
  
  -- التحقق من الدوال
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'consume_fifo_lots') THEN
    RAISE NOTICE '✅ Function consume_fifo_lots exists';
  ELSE
    RAISE EXCEPTION '❌ Function consume_fifo_lots not found';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reverse_fifo_consumption') THEN
    RAISE NOTICE '✅ Function reverse_fifo_consumption exists';
  ELSE
    RAISE EXCEPTION '❌ Function reverse_fifo_consumption not found';
  END IF;
  
  RAISE NOTICE '========================================';
END $$;

-- 🧪 Test 2: اختبار FIFO Calculation
DO $$
DECLARE
  v_test_product_id UUID;
  v_test_company_id UUID;
  v_lot1_id UUID;
  v_lot2_id UUID;
  v_cogs NUMERIC;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '🧪 Test 2: FIFO Calculation Logic';
  RAISE NOTICE '========================================';
  
  -- الحصول على شركة ومنتج للاختبار
  SELECT id INTO v_test_company_id FROM companies LIMIT 1;
  SELECT id INTO v_test_product_id FROM products WHERE item_type = 'product' LIMIT 1;
  
  IF v_test_company_id IS NULL OR v_test_product_id IS NULL THEN
    RAISE NOTICE '⚠️  No test data available (company or product not found)';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Test Company ID: %', v_test_company_id;
  RAISE NOTICE 'Test Product ID: %', v_test_product_id;
  
  -- إنشاء دفعتين اختباريتين
  INSERT INTO fifo_cost_lots (
    company_id, product_id, lot_date, lot_type, 
    original_quantity, remaining_quantity, unit_cost, notes
  ) VALUES (
    v_test_company_id, v_test_product_id, '2024-01-01', 'purchase',
    10, 10, 100, 'Test Lot 1'
  ) RETURNING id INTO v_lot1_id;
  
  INSERT INTO fifo_cost_lots (
    company_id, product_id, lot_date, lot_type,
    original_quantity, remaining_quantity, unit_cost, notes
  ) VALUES (
    v_test_company_id, v_test_product_id, '2024-01-15', 'purchase',
    5, 5, 120, 'Test Lot 2'
  ) RETURNING id INTO v_lot2_id;
  
  RAISE NOTICE '✅ Created test lots:';
  RAISE NOTICE '   Lot 1: 10 units @ 100 = 1000';
  RAISE NOTICE '   Lot 2: 5 units @ 120 = 600';
  
  -- اختبار استهلاك 12 وحدة (يجب أن يستهلك كل Lot 1 + 2 من Lot 2)
  SELECT consume_fifo_lots(
    v_test_company_id,
    v_test_product_id,
    12,
    'sale',
    'test_invoice',
    gen_random_uuid(),
    CURRENT_DATE
  ) INTO v_cogs;
  
  RAISE NOTICE '✅ Consumed 12 units';
  RAISE NOTICE '   Expected COGS: (10 × 100) + (2 × 120) = 1240';
  RAISE NOTICE '   Actual COGS: %', v_cogs;
  
  IF v_cogs = 1240 THEN
    RAISE NOTICE '✅ FIFO calculation is CORRECT!';
  ELSE
    RAISE WARNING '❌ FIFO calculation is INCORRECT! Expected 1240, got %', v_cogs;
  END IF;
  
  -- التحقق من remaining_quantity
  DECLARE
    v_remaining1 NUMERIC;
    v_remaining2 NUMERIC;
  BEGIN
    SELECT remaining_quantity INTO v_remaining1 FROM fifo_cost_lots WHERE id = v_lot1_id;
    SELECT remaining_quantity INTO v_remaining2 FROM fifo_cost_lots WHERE id = v_lot2_id;
    
    RAISE NOTICE '   Lot 1 remaining: % (expected: 0)', v_remaining1;
    RAISE NOTICE '   Lot 2 remaining: % (expected: 3)', v_remaining2;
    
    IF v_remaining1 = 0 AND v_remaining2 = 3 THEN
      RAISE NOTICE '✅ Remaining quantities are CORRECT!';
    ELSE
      RAISE WARNING '❌ Remaining quantities are INCORRECT!';
    END IF;
  END;
  
  -- تنظيف بيانات الاختبار
  DELETE FROM fifo_lot_consumptions WHERE lot_id IN (v_lot1_id, v_lot2_id);
  DELETE FROM fifo_cost_lots WHERE id IN (v_lot1_id, v_lot2_id);
  
  RAISE NOTICE '✅ Test data cleaned up';
  RAISE NOTICE '========================================';
END $$;

-- 🧪 Test 3: عرض إحصائيات FIFO الحالية
DO $$
DECLARE
  v_total_lots INTEGER;
  v_total_consumptions INTEGER;
  v_total_value NUMERIC;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '🧪 Test 3: Current FIFO Statistics';
  RAISE NOTICE '========================================';
  
  SELECT COUNT(*) INTO v_total_lots FROM fifo_cost_lots;
  RAISE NOTICE 'Total FIFO Lots: %', v_total_lots;
  
  SELECT COUNT(*) INTO v_total_consumptions FROM fifo_lot_consumptions;
  RAISE NOTICE 'Total Consumptions: %', v_total_consumptions;
  
  SELECT COALESCE(SUM(remaining_quantity * unit_cost), 0) INTO v_total_value
  FROM fifo_cost_lots;
  RAISE NOTICE 'Total Inventory Value: %', v_total_value;
  
  RAISE NOTICE '========================================';
END $$;

-- 🧪 Test 4: عرض أمثلة من البيانات
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '🧪 Test 4: Sample Data';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'See query results below for latest FIFO lots and consumptions';
  RAISE NOTICE '========================================';
END $$;

-- عرض أحدث 5 دفعات
SELECT
  'Latest FIFO Lots' AS category,
  p.name AS product_name,
  fcl.lot_date,
  fcl.lot_type,
  fcl.remaining_quantity,
  fcl.unit_cost,
  (fcl.remaining_quantity * fcl.unit_cost) AS value
FROM fifo_cost_lots fcl
JOIN products p ON p.id = fcl.product_id
WHERE fcl.remaining_quantity > 0
ORDER BY fcl.created_at DESC
LIMIT 5;

-- عرض أحدث 5 استهلاكات (إن وجدت)
SELECT
  'Latest Consumptions' AS category,
  p.name AS product_name,
  flc.consumption_date,
  flc.quantity_consumed,
  flc.unit_cost,
  flc.total_cost
FROM fifo_lot_consumptions flc
JOIN products p ON p.id = flc.product_id
ORDER BY flc.created_at DESC
LIMIT 5;

-- 🧪 Test 5: التحقق من التكامل
DO $$
DECLARE
  v_products_with_inventory INTEGER;
  v_products_with_lots INTEGER;
  v_mismatch INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '🧪 Test 5: Data Integrity Check';
  RAISE NOTICE '========================================';
  
  -- عدد المنتجات التي لها مخزون
  SELECT COUNT(*) INTO v_products_with_inventory
  FROM products
  WHERE item_type = 'product' AND quantity_on_hand > 0;
  
  -- عدد المنتجات التي لها دفعات FIFO
  SELECT COUNT(DISTINCT product_id) INTO v_products_with_lots
  FROM fifo_cost_lots
  WHERE remaining_quantity > 0;
  
  RAISE NOTICE 'Products with inventory: %', v_products_with_inventory;
  RAISE NOTICE 'Products with FIFO lots: %', v_products_with_lots;
  
  -- المنتجات التي لها مخزون ولكن بدون دفعات
  SELECT COUNT(*) INTO v_mismatch
  FROM products p
  WHERE p.item_type = 'product'
    AND p.quantity_on_hand > 0
    AND NOT EXISTS (
      SELECT 1 FROM fifo_cost_lots fcl
      WHERE fcl.product_id = p.id AND fcl.remaining_quantity > 0
    );
  
  IF v_mismatch > 0 THEN
    RAISE WARNING '⚠️  % products have inventory but no FIFO lots', v_mismatch;
  ELSE
    RAISE NOTICE '✅ All products with inventory have FIFO lots';
  END IF;
  
  RAISE NOTICE '========================================';
END $$;

-- النهاية
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '🎉 All Tests Completed!';
  RAISE NOTICE '========================================';
END $$;

