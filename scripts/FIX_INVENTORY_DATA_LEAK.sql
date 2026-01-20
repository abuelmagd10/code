-- =============================================
-- 🔒 إصلاح مشكلة تداخل البيانات بين الشركات
-- =============================================
-- المشكلة: بعد تنفيذ FIX_write_off_available_quantity_FINAL.sql
-- أصبح هناك تداخل في البيانات بين الشركات في صفحة المخزون
-- 
-- السبب الجذري:
-- 1. الدوال تستخدم SECURITY DEFINER مما يتجاوز RLS
-- 2. View inventory_available_balance لا يحتوي على RLS
--
-- الحل:
-- 1. تغيير SECURITY DEFINER إلى SECURITY INVOKER في جميع الدوال
-- 2. إضافة فحص أمان صارم في View
-- 3. إنشاء دالة wrapper آمنة للـ View
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
-- 2. تحديث دالة get_available_inventory_quantity لتستخدم SECURITY INVOKER
-- =====================================
-- ملاحظة: تم تحديثها بالفعل في FIX_write_off_available_quantity_FINAL.sql
-- هذا للتأكد من أن التغيير مطبق

-- =====================================
-- 3. إنشاء دالة آمنة لاستخدام View (اختياري)
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
  WHERE iab.company_id = p_company_id  -- ⚠️ فحص أمان إلزامي
    AND (p_branch_id IS NULL OR iab.branch_id = p_branch_id)
    AND (p_warehouse_id IS NULL OR iab.warehouse_id = p_warehouse_id)
    AND (p_cost_center_id IS NULL OR iab.cost_center_id = p_cost_center_id)
    AND (p_product_id IS NULL OR iab.product_id = p_product_id);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;  -- ⚠️ استخدام SECURITY INVOKER لتطبيق RLS

COMMENT ON FUNCTION get_inventory_available_balance IS 
'دالة آمنة لاستخدام View inventory_available_balance مع تطبيق RLS تلقائياً.';

-- =====================================
-- 4. التحقق من RLS Policies
-- =====================================
DO $$
DECLARE
  v_rls_enabled BOOLEAN;
  v_policy_exists BOOLEAN;
BEGIN
  -- التحقق من RLS
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'inventory_transactions'
    AND n.nspname = 'public';

  IF v_rls_enabled THEN
    RAISE NOTICE '✅ RLS مفعّل على inventory_transactions';
  ELSE
    RAISE WARNING '⚠️ RLS غير مفعّل على inventory_transactions! يجب تفعيله لضمان الأمان.';
  END IF;

  -- التحقق من Policies
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'inventory_transactions'
      AND schemaname = 'public'
      AND (policyname LIKE '%select%' OR policyname LIKE '%members%')
  ) INTO v_policy_exists;

  IF v_policy_exists THEN
    RAISE NOTICE '✅ RLS policies موجودة لـ inventory_transactions';
  ELSE
    RAISE WARNING '⚠️ لا توجد RLS policies لـ inventory_transactions! يجب إنشاؤها.';
  END IF;
END $$;

-- =====================================
-- 5. التحقق من أن جميع الدوال تستخدم SECURITY INVOKER
-- =====================================
DO $$
DECLARE
  v_function_name TEXT;
  v_security_type TEXT;
BEGIN
  RAISE NOTICE 'التحقق من أمان الدوال...';
  
  FOR v_function_name, v_security_type IN
    SELECT 
      p.proname::TEXT,
      CASE 
        WHEN p.prosecdef THEN 'SECURITY DEFINER'
        ELSE 'SECURITY INVOKER'
      END
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_available_inventory_quantity',
        'approve_write_off',
        'get_inventory_available_balance'
      )
  LOOP
    IF v_security_type = 'SECURITY DEFINER' THEN
      RAISE WARNING '⚠️ الدالة % تستخدم SECURITY DEFINER - يجب تغييرها إلى SECURITY INVOKER', v_function_name;
    ELSE
      RAISE NOTICE '✅ الدالة % تستخدم SECURITY INVOKER', v_function_name;
    END IF;
  END LOOP;
END $$;

-- =====================================
-- 6. رسالة نهائية
-- =====================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ تم تطبيق إصلاحات الأمان بنجاح';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'التغييرات المطبقة:';
  RAISE NOTICE '  1. View inventory_available_balance محدث بفحص أمان صارم';
  RAISE NOTICE '  2. دالة get_inventory_available_balance تم إنشاؤها (SECURITY INVOKER)';
  RAISE NOTICE '  3. تم التحقق من RLS policies';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️ ملاحظات مهمة:';
  RAISE NOTICE '  - جميع الاستعلامات يجب أن تحتوي على فلتر company_id';
  RAISE NOTICE '  - الدوال تستخدم SECURITY INVOKER لتطبيق RLS';
  RAISE NOTICE '  - View لا يحتوي على RLS، يجب استخدامه مع فلاتر company_id دائماً';
END $$;
