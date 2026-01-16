-- =============================================
-- 🔍 التحقق من دالة get_available_inventory_quantity
-- =============================================

-- 1. التحقق من وجود الدالة
SELECT 
  proname AS function_name,
  pg_get_functiondef(oid) AS function_definition
FROM pg_proc 
WHERE proname = 'get_available_inventory_quantity';

-- 2. اختبار الدالة مباشرة
DO $$
DECLARE
  v_company_id UUID := 'f0ffc062-1e6e-4324-8be4-f5052e881a67';
  v_product_id UUID := '00579d6d-2b39-4ec2-9b17-b1fa6f395d51';
  v_branch_id UUID := '3808e27d-8461-4684-989d-fddbb4f5d029';
  v_warehouse_id UUID := '3c9a544b-931b-46b0-b429-a89bb7889fa3';
  v_cost_center_id UUID := NULL;
  v_result INTEGER;
  v_transaction_count INTEGER;
  v_transaction_sum INTEGER;
  v_product_qty INTEGER;
BEGIN
  -- اختبار الدالة
  SELECT get_available_inventory_quantity(
    v_company_id,
    v_branch_id,
    v_warehouse_id,
    v_cost_center_id,
    v_product_id
  ) INTO v_result;
  
  -- التحقق من transactions
  SELECT COUNT(*), COALESCE(SUM(quantity_change), 0) 
  INTO v_transaction_count, v_transaction_sum
  FROM inventory_transactions
  WHERE company_id = v_company_id
    AND product_id = v_product_id
    AND (v_branch_id IS NULL OR branch_id = v_branch_id)
    AND (v_warehouse_id IS NULL OR warehouse_id = v_warehouse_id)
    AND (v_cost_center_id IS NULL OR cost_center_id = v_cost_center_id)
    AND (is_deleted IS NULL OR is_deleted = false);
  
  -- التحقق من quantity_on_hand
  SELECT COALESCE(quantity_on_hand, 0) INTO v_product_qty
  FROM products
  WHERE id = v_product_id AND company_id = v_company_id;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'نتائج الاختبار:';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RPC Function Result: %', v_result;
  RAISE NOTICE 'Transaction Count: %', v_transaction_count;
  RAISE NOTICE 'Transaction Sum: %', v_transaction_sum;
  RAISE NOTICE 'Product quantity_on_hand: %', v_product_qty;
  RAISE NOTICE '========================================';
  
  IF v_result = 0 AND v_transaction_count = 0 AND v_product_qty > 0 THEN
    RAISE NOTICE '❌ المشكلة: الدالة ترجع 0 رغم وجود quantity_on_hand = %', v_product_qty;
  ELSIF v_result = 0 AND v_transaction_count > 0 THEN
    RAISE NOTICE '❌ المشكلة: الدالة ترجع 0 رغم وجود % transactions', v_transaction_count;
  ELSIF v_result > 0 THEN
    RAISE NOTICE '✅ الدالة تعمل بشكل صحيح: النتيجة = %', v_result;
  END IF;
END $$;
