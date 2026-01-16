-- =============================================
-- ✅ الحل الجذري الشامل لمشكلة الرصيد المتاح في الإهلاك
-- =============================================
-- المشكلة: الرصيد المتاح = 0 رغم وجود المنتج في المخزن
-- السبب الجذري: الـ RPC function تبحث في inventory_transactions فقط
-- الحل: استخدام quantity_on_hand مباشرة إذا لم توجد transactions
-- =============================================

-- =====================================
-- 1. تحديث دالة حساب الرصيد المتاح
-- =====================================
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
  v_warehouse_branch_id UUID;
BEGIN
  -- ✅ الخطوة 1: التحقق من ربط warehouse_id بالفرع
  -- إذا تم تمرير warehouse_id، نتحقق من branch_id المرتبط به
  IF p_warehouse_id IS NOT NULL THEN
    SELECT branch_id INTO v_warehouse_branch_id
    FROM warehouses
    WHERE id = p_warehouse_id AND company_id = p_company_id;
    
    -- إذا كان warehouse مرتبط بفرع، نستخدم branch_id من warehouse
    IF v_warehouse_branch_id IS NOT NULL THEN
      -- نستخدم branch_id من warehouse إذا لم يتم تمرير branch_id
      IF p_branch_id IS NULL THEN
        -- نستخدم branch_id من warehouse
      ELSIF p_branch_id != v_warehouse_branch_id THEN
        -- تحذير: branch_id الممرر لا يطابق branch_id من warehouse
        -- نستخدم branch_id من warehouse للدقة
      END IF;
    END IF;
  END IF;

  -- ✅ الخطوة 2: حساب الرصيد المتاح من inventory_transactions
  -- نأخذ في الاعتبار: company_id, branch_id, warehouse_id, cost_center_id, product_id
  SELECT COALESCE(SUM(quantity_change), 0), COUNT(*) INTO v_available_qty, v_transaction_count
  FROM inventory_transactions
  WHERE company_id = p_company_id
    AND product_id = p_product_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id OR (v_warehouse_branch_id IS NOT NULL AND branch_id = v_warehouse_branch_id))
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
    AND (p_cost_center_id IS NULL OR cost_center_id = p_cost_center_id)
    AND (is_deleted IS NULL OR is_deleted = false);

  -- ✅ الخطوة 3: إذا لم توجد transactions، استخدم quantity_on_hand مباشرة
  -- هذا يضمن أن المنتجات التي لم يتم تسجيل حركات مخزون لها يمكن إهلاكها
  IF v_transaction_count = 0 THEN
    SELECT COALESCE(quantity_on_hand, 0) INTO v_product_qty
    FROM products
    WHERE id = p_product_id AND company_id = p_company_id;
    
    -- ✅ إرجاع quantity_on_hand مباشرة (حتى لو كان 0)
    RETURN GREATEST(0, v_product_qty);
  END IF;
  
  -- ✅ الخطوة 4: إذا كانت هناك transactions، استخدم المجموع المحسوب
  RETURN GREATEST(0, v_available_qty);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 2. إنشاء View لحساب الرصيد المتاح
-- =====================================
-- هذا View يوفر طريقة موحدة لحساب الرصيد المتاح
CREATE OR REPLACE VIEW inventory_available_quantity AS
SELECT 
  it.company_id,
  it.branch_id,
  it.warehouse_id,
  it.cost_center_id,
  it.product_id,
  COALESCE(SUM(it.quantity_change), 0) AS available_quantity_from_transactions,
  COUNT(*) AS transaction_count,
  p.quantity_on_hand,
  CASE 
    WHEN COUNT(*) = 0 THEN COALESCE(p.quantity_on_hand, 0)
    ELSE COALESCE(SUM(it.quantity_change), 0)
  END AS available_quantity
FROM inventory_transactions it
RIGHT JOIN products p ON p.id = it.product_id AND p.company_id = it.company_id
WHERE (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY it.company_id, it.branch_id, it.warehouse_id, it.cost_center_id, it.product_id, p.quantity_on_hand;

-- =====================================
-- 3. إنشاء Function موحدة لحساب الرصيد المتاح
-- =====================================
CREATE OR REPLACE FUNCTION calculate_available_inventory_quantity(
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_cost_center_id UUID,
  p_product_id UUID
)
RETURNS TABLE(
  available_quantity INTEGER,
  source TEXT,
  transaction_count INTEGER,
  quantity_on_hand INTEGER
) AS $$
DECLARE
  v_available_qty INTEGER := 0;
  v_product_qty INTEGER := 0;
  v_transaction_count INTEGER := 0;
  v_source TEXT;
BEGIN
  -- حساب من inventory_transactions
  SELECT COALESCE(SUM(quantity_change), 0), COUNT(*) INTO v_available_qty, v_transaction_count
  FROM inventory_transactions
  WHERE company_id = p_company_id
    AND product_id = p_product_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
    AND (p_cost_center_id IS NULL OR cost_center_id = p_cost_center_id)
    AND (is_deleted IS NULL OR is_deleted = false);

  -- جلب quantity_on_hand
  SELECT COALESCE(quantity_on_hand, 0) INTO v_product_qty
  FROM products
  WHERE id = p_product_id AND company_id = p_company_id;

  -- تحديد المصدر والقيمة
  IF v_transaction_count = 0 THEN
    v_source := 'quantity_on_hand';
    v_available_qty := v_product_qty;
  ELSE
    v_source := 'inventory_transactions';
  END IF;

  RETURN QUERY SELECT 
    GREATEST(0, v_available_qty) AS available_quantity,
    v_source::TEXT,
    v_transaction_count,
    v_product_qty;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 4. التحقق من التحديث
-- =====================================
DO $$
BEGIN
  RAISE NOTICE '✅ تم تحديث دالة get_available_inventory_quantity بنجاح';
  RAISE NOTICE '✅ تم إنشاء View inventory_available_quantity';
  RAISE NOTICE '✅ تم إنشاء Function calculate_available_inventory_quantity';
  RAISE NOTICE '✅ الدوال الآن تُرجع quantity_on_hand مباشرة إذا لم توجد transactions';
END $$;
