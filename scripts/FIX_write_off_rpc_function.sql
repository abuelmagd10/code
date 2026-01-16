-- =============================================
-- 🔧 إصلاح دالة get_available_inventory_quantity
-- =============================================
-- المشكلة: الدالة كانت تتحقق من v_available_qty = 0
-- لكن هذا قد يكون بسبب أن مجموع quantity_change = 0 حتى لو كانت هناك transactions
-- الحل: التحقق من وجود transactions أولاً باستخدام COUNT(*)

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
  v_transaction_count INTEGER := 0;
BEGIN
  -- حساب الرصيد المتاح من inventory_transactions
  -- نأخذ في الاعتبار: company_id, branch_id, warehouse_id, cost_center_id, product_id
  SELECT COALESCE(SUM(quantity_change), 0), COUNT(*) INTO v_available_qty, v_transaction_count
  FROM inventory_transactions
  WHERE company_id = p_company_id
    AND product_id = p_product_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
    AND (p_cost_center_id IS NULL OR cost_center_id = p_cost_center_id)
    AND (is_deleted IS NULL OR is_deleted = false);
  
  -- إذا لم توجد transactions على الإطلاق (v_transaction_count = 0)، استخدم quantity_on_hand من المنتج كـ fallback
  IF v_transaction_count = 0 THEN
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
