-- =============================================
-- FIFO Migration Runner Script
-- =============================================
-- هذا الـ Script ينفذ جميع خطوات الترحيل بالترتيب
-- =============================================

-- 🔹 الخطوة 1: التحقق من البيئة
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '🚀 FIFO Migration Started';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Database: %', current_database();
  RAISE NOTICE 'User: %', current_user;
  RAISE NOTICE 'Timestamp: %', NOW();
  RAISE NOTICE '========================================';
END $$;

-- 🔹 الخطوة 2: التحقق من وجود الجداول المطلوبة
DO $$
DECLARE
  v_tables_exist BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name IN ('fifo_cost_lots', 'fifo_lot_consumptions')
  ) INTO v_tables_exist;
  
  IF NOT v_tables_exist THEN
    RAISE EXCEPTION '❌ FIFO tables not found! Please run 320_fifo_cost_lots_system.sql first.';
  END IF;
  
  RAISE NOTICE '✅ FIFO tables exist';
END $$;

-- 🔹 الخطوة 3: عرض إحصائيات قبل الترحيل
DO $$
DECLARE
  v_products_count INTEGER;
  v_bills_count INTEGER;
  v_existing_lots INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📊 Pre-Migration Statistics:';
  RAISE NOTICE '========================================';
  
  SELECT COUNT(*) INTO v_products_count FROM products WHERE item_type = 'product';
  RAISE NOTICE 'Total Products: %', v_products_count;
  
  SELECT COUNT(*) INTO v_bills_count FROM bills WHERE status IN ('paid', 'partially_paid');
  RAISE NOTICE 'Total Bills (paid): %', v_bills_count;
  
  SELECT COUNT(*) INTO v_existing_lots FROM fifo_cost_lots;
  RAISE NOTICE 'Existing FIFO Lots: %', v_existing_lots;
  
  RAISE NOTICE '========================================';
END $$;

-- 🔹 الخطوة 4: ترحيل المشتريات الموجودة
DO $$
DECLARE
  v_result RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔄 Step 1: Migrating Existing Purchases...';
  RAISE NOTICE '========================================';
  
  SELECT * INTO v_result FROM migrate_existing_purchases_to_fifo();
  
  RAISE NOTICE '✅ Migration Complete:';
  RAISE NOTICE '   - Products Migrated: %', v_result.products_migrated;
  RAISE NOTICE '   - Lots Created: %', v_result.lots_created;
  RAISE NOTICE '   - Total Value: %', v_result.total_value;
  RAISE NOTICE '========================================';
END $$;

-- 🔹 الخطوة 5: إنشاء دفعات للمخزون الافتتاحي
DO $$
DECLARE
  v_company_id UUID;
  v_lots_created INTEGER;
  v_total_value NUMERIC := 0;
  v_products_processed INTEGER := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔄 Step 2: Creating Opening Stock Lots...';
  RAISE NOTICE '========================================';

  -- جلب جميع الشركات وإنشاء دفعات لكل شركة
  FOR v_company_id IN
    SELECT DISTINCT id FROM companies
  LOOP
    SELECT create_opening_stock_fifo_lots(v_company_id) INTO v_lots_created;

    IF v_lots_created > 0 THEN
      v_products_processed := v_products_processed + v_lots_created;

      -- حساب القيمة الإجمالية للدفعات المنشأة
      SELECT COALESCE(SUM(remaining_quantity * unit_cost), 0) INTO v_total_value
      FROM fifo_cost_lots
      WHERE company_id = v_company_id AND lot_type = 'opening_stock';
    END IF;
  END LOOP;

  RAISE NOTICE '✅ Opening Stock Complete:';
  RAISE NOTICE '   - Products Processed: %', v_products_processed;
  RAISE NOTICE '   - Lots Created: %', v_products_processed;
  RAISE NOTICE '   - Total Value: %', v_total_value;
  RAISE NOTICE '========================================';
END $$;

-- 🔹 الخطوة 6: عرض إحصائيات بعد الترحيل
DO $$
DECLARE
  v_total_lots INTEGER;
  v_total_value NUMERIC;
  v_products_with_lots INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📊 Post-Migration Statistics:';
  RAISE NOTICE '========================================';
  
  SELECT COUNT(*) INTO v_total_lots FROM fifo_cost_lots;
  RAISE NOTICE 'Total FIFO Lots: %', v_total_lots;
  
  SELECT COALESCE(SUM(remaining_quantity * unit_cost), 0) INTO v_total_value 
  FROM fifo_cost_lots;
  RAISE NOTICE 'Total Inventory Value: %', v_total_value;
  
  SELECT COUNT(DISTINCT product_id) INTO v_products_with_lots FROM fifo_cost_lots;
  RAISE NOTICE 'Products with FIFO Lots: %', v_products_with_lots;
  
  RAISE NOTICE '========================================';
END $$;

-- 🔹 الخطوة 7: عرض أمثلة من الدفعات المنشأة
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📋 Sample FIFO Lots (First 5):';
  RAISE NOTICE '========================================';
END $$;

SELECT 
  p.name AS product_name,
  fcl.lot_date,
  fcl.lot_type,
  fcl.original_quantity,
  fcl.remaining_quantity,
  fcl.unit_cost,
  (fcl.remaining_quantity * fcl.unit_cost) AS total_value
FROM fifo_cost_lots fcl
JOIN products p ON p.id = fcl.product_id
ORDER BY fcl.created_at DESC
LIMIT 5;

-- 🔹 الخطوة 8: التحقق من النتائج
DO $$
DECLARE
  v_products_without_lots INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔍 Validation:';
  RAISE NOTICE '========================================';
  
  -- المنتجات التي لها مخزون ولكن بدون دفعات
  SELECT COUNT(*) INTO v_products_without_lots
  FROM products p
  WHERE p.item_type = 'product'
    AND p.quantity_on_hand > 0
    AND NOT EXISTS (
      SELECT 1 FROM fifo_cost_lots fcl 
      WHERE fcl.product_id = p.id 
      AND fcl.remaining_quantity > 0
    );
  
  IF v_products_without_lots > 0 THEN
    RAISE WARNING '⚠️  % products have inventory but no FIFO lots!', v_products_without_lots;
    RAISE NOTICE 'Run: SELECT * FROM products WHERE item_type = ''product'' AND quantity_on_hand > 0 AND id NOT IN (SELECT DISTINCT product_id FROM fifo_cost_lots WHERE remaining_quantity > 0);';
  ELSE
    RAISE NOTICE '✅ All products with inventory have FIFO lots';
  END IF;
  
  RAISE NOTICE '========================================';
END $$;

-- 🔹 النهاية
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '🎉 FIFO Migration Completed Successfully!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '1. Review the FIFO lots: SELECT * FROM v_fifo_lots_summary;';
  RAISE NOTICE '2. Test a new purchase to verify auto-creation';
  RAISE NOTICE '3. Test a sale to verify FIFO consumption';
  RAISE NOTICE '4. Test a return to verify FIFO reversal';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
END $$;

