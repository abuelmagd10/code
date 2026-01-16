-- =============================================
-- 🧪 اختبار مباشر لدالة get_available_inventory_quantity
-- Direct Test for get_available_inventory_quantity RPC Function
-- الشركة: تست
-- الفرع: مصر الجديدة
-- المنتج: boom
-- =============================================

-- القيم المعروفة:
-- company_id: f0ffc062-1e6e-4324-8be4-f5052e881a67
-- product_id: 00579d6d-2b39-4ec2-9b17-b1fa6f395d51
-- quantity_on_hand: 1200

-- =====================================
-- 1. الحصول على branch_id و warehouse_id لفرع "مصر الجديدة"
-- =====================================
SELECT 
  b.id as branch_id,
  b.name as branch_name,
  w.id as warehouse_id,
  w.name as warehouse_name
FROM branches b
LEFT JOIN warehouses w ON w.branch_id = b.id
WHERE b.company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'::uuid
  AND (b.name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new cairo%')
LIMIT 1;

-- =====================================
-- 2. اختبار شامل تلقائي
-- =====================================
DO $$
DECLARE
  v_company_id UUID := 'f0ffc062-1e6e-4324-8be4-f5052e881a67'::uuid;
  v_product_id UUID := '00579d6d-2b39-4ec2-9b17-b1fa6f395d51'::uuid;
  v_warehouse_id UUID;
  v_branch_id UUID;
  v_available_qty INTEGER;
  v_product_qty INTEGER := 1200;
  v_transaction_qty INTEGER;
  v_transaction_count INTEGER;
BEGIN
  -- الحصول على branch_id و warehouse_id لفرع "مصر الجديدة"
  SELECT b.id, w.id INTO v_branch_id, v_warehouse_id
  FROM branches b
  LEFT JOIN warehouses w ON w.branch_id = b.id
  WHERE b.company_id = v_company_id
    AND (b.name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new cairo%')
  LIMIT 1;
  
  IF v_branch_id IS NULL THEN
    RAISE WARNING '⚠️ Could not find branch "مصر الجديدة" for company "تست"';
    RETURN;
  END IF;
  
  -- عرض القيم
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Company: تست';
  RAISE NOTICE 'Company ID: %', v_company_id;
  RAISE NOTICE 'Branch: مصر الجديدة';
  RAISE NOTICE 'Branch ID: %', v_branch_id;
  RAISE NOTICE 'Warehouse ID: %', v_warehouse_id;
  RAISE NOTICE 'Product: boom';
  RAISE NOTICE 'Product ID: %', v_product_id;
  RAISE NOTICE 'Product quantity_on_hand: %', v_product_qty;
  RAISE NOTICE '========================================';
  
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
  RAISE NOTICE 'Testing RPC function...';
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
    RAISE WARNING '⚠️ PROBLEM: RPC returned 0 but product has quantity_on_hand = %', v_product_qty;
    RAISE WARNING '⚠️ The fallback to quantity_on_hand is NOT working!';
    RAISE WARNING '⚠️ Expected: % (from quantity_on_hand)', v_product_qty;
    RAISE WARNING '⚠️ Actual: 0';
    RAISE WARNING '⚠️ This means the RPC function needs to be fixed!';
  ELSIF v_available_qty > 0 THEN
    RAISE NOTICE '✅ SUCCESS: RPC function is working correctly!';
    RAISE NOTICE '✅ Available quantity: %', v_available_qty;
    IF v_available_qty = v_product_qty THEN
      RAISE NOTICE '✅ Using fallback (quantity_on_hand) correctly!';
    ELSIF v_available_qty = v_transaction_qty THEN
      RAISE NOTICE '✅ Using inventory_transactions correctly!';
    END IF;
  ELSE
    RAISE WARNING '⚠️ No available quantity found.';
    RAISE WARNING '⚠️ Check: inventory_transactions = %, quantity_on_hand = %', v_transaction_qty, v_product_qty;
  END IF;
  
  RAISE NOTICE '========================================';
END $$;

-- =====================================
-- 3. اختبار مباشر للدالة (بعد الحصول على branch_id و warehouse_id من الاستعلام 1)
-- =====================================
-- بعد الحصول على branch_id و warehouse_id من الاستعلام الأول، نفذ:
/*
SELECT get_available_inventory_quantity(
  'f0ffc062-1e6e-4324-8be4-f5052e881a67'::uuid, -- company_id (تست)
  'YOUR_BRANCH_ID'::uuid, -- من الاستعلام 1 (فرع مصر الجديدة)
  'YOUR_WAREHOUSE_ID'::uuid, -- من الاستعلام 1 (مخزن فرع مصر الجديدة)
  NULL::uuid, -- cost_center_id
  '00579d6d-2b39-4ec2-9b17-b1fa6f395d51'::uuid -- product_id (boom)
) as available_quantity;
*/
