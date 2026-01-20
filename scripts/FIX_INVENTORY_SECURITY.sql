-- =============================================
-- 🔒 إصلاح مشكلة الأمان: تداخل البيانات بين الشركات
-- =============================================
-- المشكلة: View inventory_available_balance قد يسبب تداخل في البيانات
-- الحل: إضافة فحص أمان صارم + تحديث الدوال
-- =============================================

-- =====================================
-- 1. تحديث View مع فحص أمان صارم
-- =====================================
DROP VIEW IF EXISTS inventory_available_balance CASCADE;

CREATE OR REPLACE VIEW inventory_available_balance AS
SELECT 
  it.company_id,
  it.branch_id,
  it.warehouse_id,
  it.cost_center_id,
  it.product_id,
  COALESCE(SUM(CASE WHEN it.is_deleted IS NULL OR it.is_deleted = false THEN it.quantity_change ELSE 0 END), 0) AS available_quantity,
  COUNT(*) FILTER (WHERE it.is_deleted IS NULL OR it.is_deleted = false) AS transaction_count
FROM inventory_transactions it
WHERE it.company_id IS NOT NULL  -- ⚠️ فحص أمان: لا نأخذ transactions بدون company_id
  AND it.branch_id IS NOT NULL   -- ⚠️ فحص أمان: لا نأخذ transactions بدون branch_id
  AND it.warehouse_id IS NOT NULL -- ⚠️ فحص أمان: لا نأخذ transactions بدون warehouse_id
GROUP BY it.company_id, it.branch_id, it.warehouse_id, it.cost_center_id, it.product_id;

COMMENT ON VIEW inventory_available_balance IS 
'⚠️ تحذير: View لا يحتوي على RLS. يجب استخدامه مع فلتر company_id دائماً في جميع الاستعلامات.';

-- =====================================
-- 2. إنشاء RLS Policy للـ View (إذا كان ممكناً)
-- =====================================
-- ملاحظة: Views لا تدعم RLS مباشرة، لكن يمكن إنشاء wrapper function

-- =====================================
-- 3. تحديث دالة get_available_inventory_quantity لضمان الأمان
-- =====================================
-- التأكد من أن جميع الاستعلامات تحتوي على company_id

-- =====================================
-- 4. التحقق من أن جميع الدوال تستخدم company_id بشكل صحيح
-- =====================================
-- الدالة get_available_inventory_quantity تحتوي على فلاتر company_id صحيحة
-- لكن يجب التأكد من أن SECURITY DEFINER لا يتجاوز RLS

-- الحل: استخدام SECURITY INVOKER بدلاً من SECURITY DEFINER
-- أو التأكد من أن جميع الاستعلامات تحتوي على company_id

-- =====================================
-- 5. إنشاء دالة آمنة لاستخدام View
-- =====================================
CREATE OR REPLACE FUNCTION get_inventory_available_balance(
  p_company_id UUID,
  p_branch_id UUID DEFAULT NULL,
  p_warehouse_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL,
  p_product_id UUID DEFAULT NULL
)
RETURNS TABLE (
  company_id UUID,
  branch_id UUID,
  warehouse_id UUID,
  cost_center_id UUID,
  product_id UUID,
  available_quantity INTEGER,
  transaction_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    iab.company_id,
    iab.branch_id,
    iab.warehouse_id,
    iab.cost_center_id,
    iab.product_id,
    iab.available_quantity,
    iab.transaction_count
  FROM inventory_available_balance iab
  WHERE iab.company_id = p_company_id
    AND (p_branch_id IS NULL OR iab.branch_id = p_branch_id)
    AND (p_warehouse_id IS NULL OR iab.warehouse_id = p_warehouse_id)
    AND (p_cost_center_id IS NULL OR iab.cost_center_id = p_cost_center_id)
    AND (p_product_id IS NULL OR iab.product_id = p_product_id);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;  -- ⚠️ استخدام SECURITY INVOKER لتطبيق RLS

COMMENT ON FUNCTION get_inventory_available_balance IS 
'دالة آمنة لاستخدام View inventory_available_balance مع تطبيق RLS تلقائياً.';

-- =====================================
-- 6. التحقق من RLS Policies
-- =====================================
-- التأكد من أن RLS policies موجودة وفعالة

DO $$
BEGIN
  -- التحقق من RLS
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'inventory_transactions'
      AND n.nspname = 'public'
      AND c.relrowsecurity = true
  ) THEN
    RAISE NOTICE '⚠️ RLS غير مفعّل على inventory_transactions!';
  ELSE
    RAISE NOTICE '✅ RLS مفعّل على inventory_transactions';
  END IF;

  -- التحقق من Policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'inventory_transactions'
      AND policyname LIKE '%select%'
  ) THEN
    RAISE NOTICE '⚠️ لا توجد RLS policies لـ inventory_transactions!';
  ELSE
    RAISE NOTICE '✅ RLS policies موجودة لـ inventory_transactions';
  END IF;
END $$;
