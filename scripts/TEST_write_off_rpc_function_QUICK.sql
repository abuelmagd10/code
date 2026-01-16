-- =============================================
-- 🧪 اختبار سريع لدالة get_available_inventory_quantity
-- Quick Test for get_available_inventory_quantity RPC Function
-- الشركة: تست
-- الفرع: مصر الجديدة
-- =============================================

-- =====================================
-- 1. الحصول على company_id لشركة "تست"
-- =====================================
SELECT 
  id as company_id,
  name as company_name
FROM companies
WHERE name ILIKE '%تست%' OR name ILIKE '%test%'
LIMIT 1;

-- =====================================
-- 2. الحصول على branch_id و warehouse_id لفرع "مصر الجديدة" في شركة "تست"
-- =====================================
SELECT 
  b.id as branch_id,
  b.name as branch_name,
  w.id as warehouse_id,
  w.name as warehouse_name,
  c.id as company_id,
  c.name as company_name
FROM branches b
LEFT JOIN warehouses w ON w.branch_id = b.id
LEFT JOIN companies c ON c.id = b.company_id
WHERE (b.name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new cairo%')
  AND (c.name ILIKE '%تست%' OR c.name ILIKE '%test%')
LIMIT 1;

-- =====================================
-- 3. الحصول على product_id للمنتج "boom" في شركة "تست"
-- =====================================
SELECT 
  c.id as company_id,
  c.name as company_name,
  p.id as product_id,
  p.name as product_name,
  p.sku,
  p.quantity_on_hand
FROM companies c
INNER JOIN products p ON p.company_id = c.id
WHERE (c.name ILIKE '%تست%' OR c.name ILIKE '%test%')
  AND (p.name ILIKE '%boom%' OR p.sku ILIKE '%1001%')
LIMIT 1;

-- =====================================
-- 4. اختبار شامل تلقائي
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
  -- الحصول على company_id لشركة "تست"
  SELECT id INTO v_company_id 
  FROM companies 
  WHERE name ILIKE '%تست%' OR name ILIKE '%test%'
  LIMIT 1;
  
  IF v_company_id IS NULL THEN
    RAISE WARNING '⚠️ Could not find company "تست"';
    RETURN;
  END IF;
  
  -- الحصول على branch_id و warehouse_id لفرع "مصر الجديدة" في شركة "تست"
  SELECT b.id, w.id INTO v_branch_id, v_warehouse_id
  FROM branches b
  LEFT JOIN warehouses w ON w.branch_id = b.id
  WHERE (b.name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new cairo%')
    AND b.company_id = v_company_id
  LIMIT 1;
  
  IF v_branch_id IS NULL THEN
    RAISE WARNING '⚠️ Could not find branch "مصر الجديدة" for company "تست"';
    RETURN;
  END IF;
  
  -- الحصول على product_id للمنتج "boom" في شركة "تست"
  SELECT id, quantity_on_hand INTO v_product_id, v_product_qty
  FROM products 
  WHERE (name ILIKE '%boom%' OR sku ILIKE '%1001%')
    AND company_id = v_company_id
  LIMIT 1;
  
  IF v_product_id IS NULL THEN
    RAISE WARNING '⚠️ Could not find product "boom" for company "تست"';
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
-- 5. اختبار مباشر للدالة (استبدل القيم من الاستعلامات أعلاه)
-- =====================================
-- بعد الحصول على القيم من الاستعلامات أعلاه، نفذ:
/*
SELECT get_available_inventory_quantity(
  'YOUR_COMPANY_ID'::uuid, -- من الاستعلام 1 (شركة تست)
  'YOUR_BRANCH_ID'::uuid, -- من الاستعلام 2 (فرع مصر الجديدة)
  'YOUR_WAREHOUSE_ID'::uuid, -- من الاستعلام 2 (مخزن فرع مصر الجديدة)
  NULL::uuid, -- cost_center_id
  'YOUR_PRODUCT_ID'::uuid -- من الاستعلام 3 (boom)
) as available_quantity;
*/
