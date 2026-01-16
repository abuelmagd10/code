-- =============================================
-- 🧪 اختبار سريع لدالة get_available_inventory_quantity
-- Quick Test for get_available_inventory_quantity RPC Function
-- فرع: مصر الجديدة (NOT الفرع الرئيسي)
-- =============================================

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
WHERE b.name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new cairo%'
LIMIT 1;

-- =====================================
-- 2. الحصول على company_id و product_id
-- =====================================
SELECT 
  c.id as company_id,
  c.name as company_name,
  p.id as product_id,
  p.name as product_name,
  p.sku,
  p.quantity_on_hand
FROM companies c
CROSS JOIN products p
WHERE p.name ILIKE '%boom%' OR p.sku ILIKE '%1001%'
LIMIT 1;

-- =====================================
-- 3. اختبار شامل تلقائي
-- =====================================
DO $$
DECLARE
  v_company_id UUID;
  v_product_id UUID;
  v_warehouse_id UUID;
  v_branch_id UUID;
  v_available_qty INTEGER;
  v_product_qty INTEGER;
  v_transaction_qty INTEGER;
  v_transaction_count INTEGER;
BEGIN
  -- الحصول على company_id
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  
  -- الحصول على branch_id و warehouse_id لفرع "مصر الجديدة"
  SELECT b.id, w.id INTO v_branch_id, v_warehouse_id
  FROM branches b
  LEFT JOIN warehouses w ON w.branch_id = b.id
  WHERE (b.name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new cairo%')
    AND b.company_id = v_company_id
  LIMIT 1;
  
  -- الحصول على product_id للمنتج "boom"
  SELECT id, quantity_on_hand INTO v_product_id, v_product_qty
  FROM products 
  WHERE (name ILIKE '%boom%' OR sku ILIKE '%1001%')
    AND company_id = v_company_id
  LIMIT 1;
  
  -- عرض القيم
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Company ID: %', v_company_id;
  RAISE NOTICE 'Product ID: %', v_product_id;
  RAISE NOTICE 'Product Name: boom';
  RAISE NOTICE 'Product quantity_on_hand: %', v_product_qty;
  RAISE NOTICE 'Branch: مصر الجديدة';
  RAISE NOTICE 'Branch ID: %', v_branch_id;
  RAISE NOTICE 'Warehouse ID: %', v_warehouse_id;
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
  IF v_company_id IS NOT NULL AND v_product_id IS NOT NULL THEN
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
  ELSE
    RAISE WARNING '⚠️ Could not find required data (company or product)';
  END IF;
  
  RAISE NOTICE '========================================';
END $$;

-- =====================================
-- 4. اختبار مباشر للدالة (استبدل القيم من الاستعلامات أعلاه)
-- =====================================
-- بعد الحصول على القيم من الاستعلامات أعلاه، نفذ:
/*
SELECT get_available_inventory_quantity(
  'YOUR_COMPANY_ID'::uuid, -- من الاستعلام 2
  'YOUR_BRANCH_ID'::uuid, -- من الاستعلام 1 (فرع مصر الجديدة)
  'YOUR_WAREHOUSE_ID'::uuid, -- من الاستعلام 1 (مخزن فرع مصر الجديدة)
  NULL::uuid, -- cost_center_id
  'YOUR_PRODUCT_ID'::uuid -- من الاستعلام 2 (boom)
) as available_quantity;
*/
