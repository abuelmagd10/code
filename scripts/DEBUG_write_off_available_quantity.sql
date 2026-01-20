-- =============================================
-- 🔍 دالة تشخيصية لفحص الرصيد المتاح في الإهلاك
-- =============================================
-- هذه الدالة تساعد في تشخيص مشكلة الرصيد المتاح
-- استخدمها لمعرفة لماذا يظهر الرصيد = 0
-- =============================================

CREATE OR REPLACE FUNCTION debug_available_inventory_quantity(
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_cost_center_id UUID,
  p_product_id UUID
)
RETURNS TABLE (
  debug_step TEXT,
  value_text TEXT,
  value_uuid UUID,
  value_int INTEGER,
  detail TEXT
) AS $$
DECLARE
  v_final_branch_id UUID;
  v_final_cost_center_id UUID;
  v_warehouse_branch_id UUID;
  v_branch_default_cost_center_id UUID;
  v_available_qty INTEGER := 0;
  v_transaction_count INTEGER := 0;
  v_product_qty INTEGER := 0;
BEGIN
  -- 1. معاملات الدالة الأصلية
  RETURN QUERY SELECT 
    'Input Parameters'::TEXT,
    'company_id'::TEXT,
    NULL::UUID,
    NULL::INTEGER,
    p_company_id::TEXT as detail;
  
  RETURN QUERY SELECT 
    'Input Parameters'::TEXT,
    'product_id'::TEXT,
    NULL::UUID,
    NULL::INTEGER,
    p_product_id::TEXT as detail;
  
  RETURN QUERY SELECT 
    'Input Parameters'::TEXT,
    'warehouse_id'::TEXT,
    p_warehouse_id,
    NULL::INTEGER,
    COALESCE(p_warehouse_id::TEXT, 'NULL') as detail;
  
  RETURN QUERY SELECT 
    'Input Parameters'::TEXT,
    'branch_id'::TEXT,
    p_branch_id,
    NULL::INTEGER,
    COALESCE(p_branch_id::TEXT, 'NULL') as detail;
  
  RETURN QUERY SELECT 
    'Input Parameters'::TEXT,
    'cost_center_id'::TEXT,
    p_cost_center_id,
    NULL::INTEGER,
    COALESCE(p_cost_center_id::TEXT, 'NULL') as detail;

  -- 2. جلب branch_id من warehouse
  IF p_warehouse_id IS NOT NULL THEN
    SELECT branch_id INTO v_warehouse_branch_id
    FROM warehouses
    WHERE id = p_warehouse_id AND company_id = p_company_id;
    
    RETURN QUERY SELECT 
      'Warehouse Lookup'::TEXT,
      'warehouse.branch_id'::TEXT,
      v_warehouse_branch_id,
      NULL::INTEGER,
      COALESCE(v_warehouse_branch_id::TEXT, 'NULL (warehouse not found or no branch_id)') as detail;
  END IF;

  -- 3. تحديد branch_id النهائي
  IF p_warehouse_id IS NOT NULL AND v_warehouse_branch_id IS NOT NULL THEN
    v_final_branch_id := COALESCE(p_branch_id, v_warehouse_branch_id);
  ELSE
    v_final_branch_id := p_branch_id;
  END IF;
  
  RETURN QUERY SELECT 
    'Final Values'::TEXT,
    'final_branch_id'::TEXT,
    v_final_branch_id,
    NULL::INTEGER,
    COALESCE(v_final_branch_id::TEXT, 'NULL') as detail;

  -- 4. جلب cost_center_id من branch
  IF v_final_branch_id IS NOT NULL AND p_cost_center_id IS NULL THEN
    SELECT default_cost_center_id INTO v_branch_default_cost_center_id
    FROM branches
    WHERE id = v_final_branch_id AND company_id = p_company_id;
    
    RETURN QUERY SELECT 
      'Branch Lookup'::TEXT,
      'branch.default_cost_center_id'::TEXT,
      v_branch_default_cost_center_id,
      NULL::INTEGER,
      COALESCE(v_branch_default_cost_center_id::TEXT, 'NULL (branch not found or no default_cost_center_id)') as detail;
    
    v_final_cost_center_id := v_branch_default_cost_center_id;
  ELSE
    v_final_cost_center_id := p_cost_center_id;
  END IF;
  
  RETURN QUERY SELECT 
    'Final Values'::TEXT,
    'final_cost_center_id'::TEXT,
    v_final_cost_center_id,
    NULL::INTEGER,
    COALESCE(v_final_cost_center_id::TEXT, 'NULL') as detail;

  -- 5. حساب عدد Transactions المطابقة
  SELECT COUNT(*) INTO v_transaction_count
  FROM inventory_transactions
  WHERE company_id = p_company_id
    AND product_id = p_product_id
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
    AND (v_final_branch_id IS NULL OR branch_id = v_final_branch_id)
    AND (v_final_cost_center_id IS NULL OR cost_center_id = v_final_cost_center_id)
    AND (is_deleted IS NULL OR is_deleted = false);
  
  RETURN QUERY SELECT 
    'Transaction Count'::TEXT,
    'matching_transactions'::TEXT,
    NULL::UUID,
    v_transaction_count,
    'Transactions matching all criteria' as detail;

  -- 6. حساب الرصيد المتاح
  SELECT COALESCE(SUM(quantity_change), 0) INTO v_available_qty
  FROM inventory_transactions
  WHERE company_id = p_company_id
    AND product_id = p_product_id
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
    AND (v_final_branch_id IS NULL OR branch_id = v_final_branch_id)
    AND (v_final_cost_center_id IS NULL OR cost_center_id = v_final_cost_center_id)
    AND (is_deleted IS NULL OR is_deleted = false);
  
  RETURN QUERY SELECT 
    'Calculated Balance'::TEXT,
    'available_quantity'::TEXT,
    NULL::UUID,
    v_available_qty,
    'Sum of quantity_change from matching transactions' as detail;

  -- 7. جلب quantity_on_hand من المنتج
  SELECT COALESCE(quantity_on_hand, 0) INTO v_product_qty
  FROM products
  WHERE id = p_product_id AND company_id = p_company_id;
  
  RETURN QUERY SELECT 
    'Product Info'::TEXT,
    'quantity_on_hand'::TEXT,
    NULL::UUID,
    v_product_qty,
    'From products table' as detail;

  -- 8. عرض عينة من Transactions
  RETURN QUERY 
  SELECT 
    'Sample Transactions'::TEXT,
    CONCAT('tx_', tx.id::TEXT)::TEXT,
    NULL::UUID,
    tx.quantity_change,
    CONCAT(
      'type: ', COALESCE(tx.transaction_type, 'NULL'), 
      ', warehouse: ', COALESCE(tx.warehouse_id::TEXT, 'NULL'),
      ', branch: ', COALESCE(tx.branch_id::TEXT, 'NULL'),
      ', cost_center: ', COALESCE(tx.cost_center_id::TEXT, 'NULL'),
      ', deleted: ', COALESCE(tx.is_deleted::TEXT, 'NULL')
    ) as detail
  FROM inventory_transactions tx
  WHERE tx.company_id = p_company_id
    AND tx.product_id = p_product_id
  ORDER BY tx.created_at DESC
  LIMIT 10;

  -- 9. النتيجة النهائية
  IF v_transaction_count = 0 THEN
    RETURN QUERY SELECT 
      'Final Result'::TEXT,
      'result'::TEXT,
      NULL::UUID,
      GREATEST(0, v_product_qty),
      'No transactions found, using quantity_on_hand' as detail;
  ELSE
    RETURN QUERY SELECT 
      'Final Result'::TEXT,
      'result'::TEXT,
      NULL::UUID,
      GREATEST(0, v_available_qty),
      'Using sum from transactions' as detail;
  END IF;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION debug_available_inventory_quantity IS 
'دالة تشخيصية لفحص الرصيد المتاح في الإهلاك. تساعد في معرفة لماذا يظهر الرصيد = 0.';
