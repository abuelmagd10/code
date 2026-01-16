-- =============================================
-- 🧪 اختبار دالة get_available_inventory_quantity
-- Test Script for get_available_inventory_quantity RPC Function
-- =============================================

-- =====================================
-- 1. التحقق من وجود الدالة
-- =====================================
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  prosrc as function_body
FROM pg_proc
WHERE proname = 'get_available_inventory_quantity';

-- =====================================
-- 2. الحصول على معرفات البيانات المطلوبة
-- =====================================
-- الحصول على company_id
SELECT id as company_id, name as company_name 
FROM companies 
LIMIT 1;

-- الحصول على product_id للمنتج "boom"
SELECT id as product_id, name as product_name, sku, quantity_on_hand
FROM products 
WHERE name ILIKE '%boom%' OR sku ILIKE '%1001%'
LIMIT 1;

-- الحصول على warehouse_id للمخزن الرئيسي
SELECT id as warehouse_id, name as warehouse_name, branch_id
FROM warehouses 
WHERE name ILIKE '%رئيسي%' OR name ILIKE '%main%'
LIMIT 1;

-- =====================================
-- 3. اختبار الدالة مع بيانات حقيقية
-- =====================================
-- استبدل القيم التالية بالقيم الفعلية من الاستعلامات أعلاه
-- Example (استبدل بالقيم الفعلية):
/*
SELECT get_available_inventory_quantity(
  'f0ffc062-1e6e-4324-8be4-f5052e881a67'::uuid, -- company_id (من الاستعلام أعلاه)
  NULL::uuid, -- branch_id (NULL أو من warehouse)
  '06623a6d-5bb4-472c-89c5-fe6cc2d27a9d'::uuid, -- warehouse_id (من الاستعلام أعلاه)
  NULL::uuid, -- cost_center_id
  'YOUR_PRODUCT_ID'::uuid -- product_id (من الاستعلام أعلاه)
) as available_quantity;
*/

-- =====================================
-- 4. اختبار شامل: التحقق من الرصيد من inventory_transactions
-- =====================================
-- استبدل القيم التالية بالقيم الفعلية
/*
SELECT 
  COALESCE(SUM(quantity_change), 0) as total_from_transactions,
  COUNT(*) as transaction_count
FROM inventory_transactions
WHERE company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'::uuid
  AND product_id = 'YOUR_PRODUCT_ID'::uuid
  AND (warehouse_id = '06623a6d-5bb4-472c-89c5-fe6cc2d27a9d'::uuid OR warehouse_id IS NULL)
  AND (is_deleted IS NULL OR is_deleted = false);
*/

-- =====================================
-- 5. التحقق من quantity_on_hand للمنتج
-- =====================================
-- استبدل القيم التالية بالقيم الفعلية
/*
SELECT 
  id,
  name,
  sku,
  quantity_on_hand,
  company_id
FROM products
WHERE id = 'YOUR_PRODUCT_ID'::uuid
  AND company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'::uuid;
*/

-- =====================================
-- 6. اختبار شامل تلقائي (يستخدم القيم الفعلية من الجداول)
-- =====================================
DO $$
DECLARE
  v_company_id UUID;
  v_product_id UUID;
  v_warehouse_id UUID;
  v_available_qty INTEGER;
  v_product_qty INTEGER;
  v_transaction_qty INTEGER;
BEGIN
  -- الحصول على company_id
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  
  -- الحصول على product_id للمنتج "boom"
  SELECT id INTO v_product_id 
  FROM products 
  WHERE (name ILIKE '%boom%' OR sku ILIKE '%1001%')
    AND company_id = v_company_id
  LIMIT 1;
  
  -- الحصول على warehouse_id للمخزن الرئيسي
  SELECT id INTO v_warehouse_id 
  FROM warehouses 
  WHERE (name ILIKE '%رئيسي%' OR name ILIKE '%main%')
    AND company_id = v_company_id
  LIMIT 1;
  
  -- عرض القيم
  RAISE NOTICE 'Company ID: %', v_company_id;
  RAISE NOTICE 'Product ID: %', v_product_id;
  RAISE NOTICE 'Warehouse ID: %', v_warehouse_id;
  
  -- اختبار الدالة
  IF v_company_id IS NOT NULL AND v_product_id IS NOT NULL THEN
    v_available_qty := get_available_inventory_quantity(
      v_company_id,
      NULL, -- branch_id
      v_warehouse_id,
      NULL, -- cost_center_id
      v_product_id
    );
    
    RAISE NOTICE 'Available Quantity (from RPC): %', v_available_qty;
    
    -- التحقق من quantity_on_hand
    SELECT quantity_on_hand INTO v_product_qty
    FROM products
    WHERE id = v_product_id;
    
    RAISE NOTICE 'Product quantity_on_hand: %', v_product_qty;
    
    -- التحقق من inventory_transactions
    SELECT COALESCE(SUM(quantity_change), 0) INTO v_transaction_qty
    FROM inventory_transactions
    WHERE company_id = v_company_id
      AND product_id = v_product_id
      AND (warehouse_id = v_warehouse_id OR warehouse_id IS NULL)
      AND (is_deleted IS NULL OR is_deleted = false);
    
    RAISE NOTICE 'Total from inventory_transactions: %', v_transaction_qty;
    
    -- التحقق من النتيجة
    IF v_available_qty = 0 AND v_product_qty > 0 THEN
      RAISE WARNING '⚠️ RPC returned 0 but product has quantity_on_hand = %. The fallback may not be working correctly!', v_product_qty;
    ELSIF v_available_qty > 0 THEN
      RAISE NOTICE '✅ RPC function is working correctly. Available quantity: %', v_available_qty;
    ELSE
      RAISE WARNING '⚠️ No available quantity found. Check inventory_transactions and products.quantity_on_hand';
    END IF;
  ELSE
    RAISE WARNING '⚠️ Could not find required data (company, product, or warehouse)';
  END IF;
END $$;

-- =====================================
-- 7. إعادة إنشاء الدالة (إذا كانت هناك مشكلة)
-- =====================================
-- قم بتشغيل هذا فقط إذا كانت هناك مشكلة في الدالة
/*
CREATE OR REPLACE FUNCTION get_available_inventory_quantity(
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_cost_center_id UUID,
  p_product_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_available_qty INTEGER := 0;
  v_product_qty INTEGER := 0;
BEGIN
  -- حساب الرصيد المتاح من inventory_transactions
  SELECT COALESCE(SUM(quantity_change), 0) INTO v_available_qty
  FROM inventory_transactions
  WHERE company_id = p_company_id
    AND product_id = p_product_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
    AND (p_cost_center_id IS NULL OR cost_center_id = p_cost_center_id)
    AND (is_deleted IS NULL OR is_deleted = false);
  
  -- إذا لم توجد transactions (v_available_qty = 0)، استخدم quantity_on_hand من المنتج كـ fallback
  IF v_available_qty = 0 THEN
    SELECT COALESCE(quantity_on_hand, 0) INTO v_product_qty
    FROM products
    WHERE id = p_product_id AND company_id = p_company_id;
    
    -- إذا كان المنتج موجوداً وله quantity_on_hand، استخدمه
    IF v_product_qty > 0 THEN
      RETURN v_product_qty;
    END IF;
  END IF;
  
  RETURN GREATEST(0, v_available_qty); -- لا نرجع قيم سالبة
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
*/
