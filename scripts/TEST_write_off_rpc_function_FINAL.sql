-- =============================================
-- 🧪 اختبار نهائي مباشر لدالة get_available_inventory_quantity
-- Final Direct Test for get_available_inventory_quantity RPC Function
-- الشركة: تست
-- الفرع: مصر الجديدة
-- المخزن: مخزن مصر الجديدة
-- المنتج: boom
-- =============================================

-- القيم المعروفة:
-- company_id: f0ffc062-1e6e-4324-8be4-f5052e881a67
-- branch_id: 3808e27d-8461-4684-989d-fddbb4f5d029
-- warehouse_id: 3c9a544b-931b-46b0-b429-a89bb7889fa3
-- product_id: 00579d6d-2b39-4ec2-9b17-b1fa6f395d51
-- quantity_on_hand: 1200

-- =====================================
-- 1. اختبار مباشر للدالة
-- =====================================
SELECT 
  get_available_inventory_quantity(
    'f0ffc062-1e6e-4324-8be4-f5052e881a67'::uuid, -- company_id (تست)
    '3808e27d-8461-4684-989d-fddbb4f5d029'::uuid, -- branch_id (مصر الجديدة)
    '3c9a544b-931b-46b0-b429-a89bb7889fa3'::uuid, -- warehouse_id (مخزن مصر الجديدة)
    NULL::uuid, -- cost_center_id
    '00579d6d-2b39-4ec2-9b17-b1fa6f395d51'::uuid -- product_id (boom)
  ) as available_quantity;

-- =====================================
-- 2. التحقق من البيانات الأساسية
-- =====================================
-- التحقق من quantity_on_hand للمنتج
SELECT 
  id,
  name,
  sku,
  quantity_on_hand,
  company_id
FROM products
WHERE id = '00579d6d-2b39-4ec2-9b17-b1fa6f395d51'::uuid
  AND company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'::uuid;

-- التحقق من inventory_transactions
SELECT 
  COALESCE(SUM(quantity_change), 0) as total_from_transactions,
  COUNT(*) as transaction_count
FROM inventory_transactions
WHERE company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'::uuid
  AND product_id = '00579d6d-2b39-4ec2-9b17-b1fa6f395d51'::uuid
  AND (branch_id = '3808e27d-8461-4684-989d-fddbb4f5d029'::uuid OR branch_id IS NULL)
  AND (warehouse_id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::uuid OR warehouse_id IS NULL)
  AND (is_deleted IS NULL OR is_deleted = false);

-- =====================================
-- 3. اختبار شامل تلقائي مع رسائل مفصلة
-- =====================================
DO $$
DECLARE
  v_company_id UUID := 'f0ffc062-1e6e-4324-8be4-f5052e881a67'::uuid;
  v_branch_id UUID := '3808e27d-8461-4684-989d-fddbb4f5d029'::uuid;
  v_warehouse_id UUID := '3c9a544b-931b-46b0-b429-a89bb7889fa3'::uuid;
  v_product_id UUID := '00579d6d-2b39-4ec2-9b17-b1fa6f395d51'::uuid;
  v_available_qty INTEGER;
  v_product_qty INTEGER;
  v_transaction_qty INTEGER;
  v_transaction_count INTEGER;
BEGIN
  -- عرض القيم
  RAISE NOTICE '========================================';
  RAISE NOTICE '🧪 Testing RPC Function: get_available_inventory_quantity';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Company: تست';
  RAISE NOTICE 'Company ID: %', v_company_id;
  RAISE NOTICE 'Branch: مصر الجديدة';
  RAISE NOTICE 'Branch ID: %', v_branch_id;
  RAISE NOTICE 'Warehouse: مخزن مصر الجديدة';
  RAISE NOTICE 'Warehouse ID: %', v_warehouse_id;
  RAISE NOTICE 'Product: boom';
  RAISE NOTICE 'Product ID: %', v_product_id;
  RAISE NOTICE '========================================';
  
  -- التحقق من quantity_on_hand
  SELECT quantity_on_hand INTO v_product_qty
  FROM products
  WHERE id = v_product_id
    AND company_id = v_company_id;
  
  RAISE NOTICE 'Product quantity_on_hand: %', v_product_qty;
  
  -- التحقق من inventory_transactions
  SELECT 
    COALESCE(SUM(quantity_change), 0),
    COUNT(*)
  INTO v_transaction_qty, v_transaction_count
  FROM inventory_transactions
  WHERE company_id = v_company_id
    AND product_id = v_product_id
    AND (branch_id = v_branch_id OR branch_id IS NULL)
    AND (warehouse_id = v_warehouse_id OR warehouse_id IS NULL)
    AND (is_deleted IS NULL OR is_deleted = false);
  
  RAISE NOTICE 'Total from inventory_transactions: % (count: %)', v_transaction_qty, v_transaction_count;
  
  -- اختبار الدالة
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Calling RPC function...';
  RAISE NOTICE '========================================';
  
  v_available_qty := get_available_inventory_quantity(
    v_company_id,
    v_branch_id,
    v_warehouse_id,
    NULL, -- cost_center_id
    v_product_id
  );
  
  RAISE NOTICE '✅ RPC Function Result: %', v_available_qty;
  RAISE NOTICE '========================================';
  
  -- التحقق من النتيجة
  IF v_available_qty = 0 AND v_product_qty > 0 THEN
    RAISE WARNING '⚠️⚠️⚠️ PROBLEM DETECTED ⚠️⚠️⚠️';
    RAISE WARNING 'RPC returned 0 but product has quantity_on_hand = %', v_product_qty;
    RAISE WARNING 'The fallback to quantity_on_hand is NOT working!';
    RAISE WARNING 'Expected: % (from quantity_on_hand)', v_product_qty;
    RAISE WARNING 'Actual: 0';
    RAISE WARNING 'This means the RPC function needs to be fixed!';
    RAISE WARNING 'Please check the RPC function definition in scripts/042_write_off_governance_validation.sql';
  ELSIF v_available_qty > 0 THEN
    RAISE NOTICE '✅✅✅ SUCCESS ✅✅✅';
    RAISE NOTICE 'RPC function is working correctly!';
    RAISE NOTICE 'Available quantity: %', v_available_qty;
    IF v_available_qty = v_product_qty THEN
      RAISE NOTICE '✅ Using fallback (quantity_on_hand) correctly!';
      RAISE NOTICE '✅ This is correct behavior when no inventory_transactions exist.';
    ELSIF v_available_qty = v_transaction_qty THEN
      RAISE NOTICE '✅ Using inventory_transactions correctly!';
      RAISE NOTICE '✅ This is correct behavior when inventory_transactions exist.';
    ELSE
      RAISE NOTICE '✅ RPC returned a valid quantity (not 0).';
    END IF;
  ELSE
    RAISE WARNING '⚠️ No available quantity found.';
    RAISE WARNING 'Check: inventory_transactions = %, quantity_on_hand = %', v_transaction_qty, v_product_qty;
  END IF;
  
  RAISE NOTICE '========================================';
END $$;
