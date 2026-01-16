-- =============================================
-- ✅ الحل الجذري لمشكلة الرصيد المتاح في الإهلاك
-- =============================================
-- المشكلة: الـ RPC function كانت تُرجع 0 عندما لا توجد transactions
-- الحل: تعديل الـ RPC function لتعيد quantity_on_hand مباشرة إذا لم توجد transactions
-- =============================================

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
  
  -- ✅ الحل الجذري: إذا لم توجد transactions على الإطلاق، استخدم quantity_on_hand من المنتج
  -- هذا يضمن أن المنتجات التي لم يتم تسجيل حركات مخزون لها (مثل المنتجات الجديدة) 
  -- يمكن إهلاكها بناءً على quantity_on_hand
  IF v_transaction_count = 0 THEN
    SELECT COALESCE(quantity_on_hand, 0) INTO v_product_qty
    FROM products
    WHERE id = p_product_id AND company_id = p_company_id;
    
    -- ✅ إرجاع quantity_on_hand حتى لو كان 0 (لأنه القيمة الصحيحة)
    RETURN GREATEST(0, v_product_qty);
  END IF;
  
  -- إذا كانت هناك transactions، استخدم المجموع المحسوب
  RETURN GREATEST(0, v_available_qty);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- ✅ التحقق من التحديث
-- =============================================
DO $$
BEGIN
  RAISE NOTICE '✅ تم تحديث دالة get_available_inventory_quantity بنجاح';
  RAISE NOTICE '✅ الدالة الآن تُرجع quantity_on_hand مباشرة إذا لم توجد transactions';
END $$;
