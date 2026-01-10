-- 🔒 RLS Policies لنظام التحكم في رؤية البيانات
-- تطبيق قواعد الأمان على مستوى قاعدة البيانات

-- =====================================================
-- 1️⃣ إنشاء دالة مساعدة للتحقق من الدور والصلاحيات
-- =====================================================

CREATE OR REPLACE FUNCTION get_user_visibility_filter(
  p_user_id UUID,
  p_company_id UUID,
  p_table_name TEXT
) RETURNS JSONB AS $$
DECLARE
  v_member RECORD;
  v_result JSONB;
BEGIN
  -- جلب معلومات العضوية
  SELECT role, branch_id, cost_center_id, warehouse_id
  INTO v_member
  FROM company_members
  WHERE user_id = p_user_id AND company_id = p_company_id;

  -- إذا لم يتم العثور على العضوية
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allow_access', false);
  END IF;

  -- تحديد قواعد الرؤية حسب الدور
  CASE v_member.role
    WHEN 'owner', 'admin', 'general_manager' THEN
      -- يرى كل شيء في الشركة
      v_result := jsonb_build_object(
        'allow_access', true,
        'filter_type', 'company_wide',
        'company_id', p_company_id
      );
    
    WHEN 'accountant', 'manager' THEN
      -- يرى كل شيء في نطاقه (branch + cost_center)
      v_result := jsonb_build_object(
        'allow_access', true,
        'filter_type', 'scope_based',
        'company_id', p_company_id,
        'branch_id', v_member.branch_id,
        'cost_center_id', v_member.cost_center_id
      );
    
    WHEN 'staff' THEN
      -- يرى فقط ما أنشأه في نطاقه
      v_result := jsonb_build_object(
        'allow_access', true,
        'filter_type', 'created_by',
        'company_id', p_company_id,
        'branch_id', v_member.branch_id,
        'cost_center_id', v_member.cost_center_id,
        'warehouse_id', v_member.warehouse_id,
        'created_by_user_id', p_user_id
      );
    
    ELSE
      -- دور غير معروف - منع الوصول
      v_result := jsonb_build_object('allow_access', false);
  END CASE;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 2️⃣ RLS Policy للفواتير (invoices)
-- =====================================================

-- تمكين RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- حذف السياسات الموجودة
DROP POLICY IF EXISTS "invoices_visibility_policy" ON invoices;

-- إنشاء سياسة جديدة
CREATE POLICY "invoices_visibility_policy" ON invoices
  FOR ALL
  TO authenticated
  USING (
    CASE 
      WHEN auth.uid() IS NULL THEN false
      ELSE
        (
          SELECT 
            CASE 
              WHEN (filter->>'allow_access')::boolean = false THEN false
              WHEN filter->>'filter_type' = 'company_wide' THEN 
                company_id = (filter->>'company_id')::uuid
              WHEN filter->>'filter_type' = 'scope_based' THEN 
                company_id = (filter->>'company_id')::uuid AND
                (branch_id = (filter->>'branch_id')::uuid OR (filter->>'branch_id') IS NULL) AND
                (cost_center_id = (filter->>'cost_center_id')::uuid OR (filter->>'cost_center_id') IS NULL)
              WHEN filter->>'filter_type' = 'created_by' THEN 
                company_id = (filter->>'company_id')::uuid AND
                created_by_user_id = (filter->>'created_by_user_id')::uuid AND
                (branch_id = (filter->>'branch_id')::uuid OR (filter->>'branch_id') IS NULL) AND
                (cost_center_id = (filter->>'cost_center_id')::uuid OR (filter->>'cost_center_id') IS NULL)
              ELSE false
            END
          FROM get_user_visibility_filter(auth.uid(), company_id, 'invoices') AS filter
        )
    END
  );

-- =====================================================
-- 3️⃣ RLS Policy لأوامر البيع (sales_orders)
-- =====================================================

ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales_orders_visibility_policy" ON sales_orders;

CREATE POLICY "sales_orders_visibility_policy" ON sales_orders
  FOR ALL
  TO authenticated
  USING (
    CASE 
      WHEN auth.uid() IS NULL THEN false
      ELSE
        (
          SELECT 
            CASE 
              WHEN (filter->>'allow_access')::boolean = false THEN false
              WHEN filter->>'filter_type' = 'company_wide' THEN 
                company_id = (filter->>'company_id')::uuid
              WHEN filter->>'filter_type' = 'scope_based' THEN 
                company_id = (filter->>'company_id')::uuid AND
                (branch_id = (filter->>'branch_id')::uuid OR (filter->>'branch_id') IS NULL) AND
                (cost_center_id = (filter->>'cost_center_id')::uuid OR (filter->>'cost_center_id') IS NULL)
              WHEN filter->>'filter_type' = 'created_by' THEN 
                company_id = (filter->>'company_id')::uuid AND
                created_by_user_id = (filter->>'created_by_user_id')::uuid AND
                (branch_id = (filter->>'branch_id')::uuid OR (filter->>'branch_id') IS NULL) AND
                (cost_center_id = (filter->>'cost_center_id')::uuid OR (filter->>'cost_center_id') IS NULL)
              ELSE false
            END
          FROM get_user_visibility_filter(auth.uid(), company_id, 'sales_orders') AS filter
        )
    END
  );

-- =====================================================
-- 4️⃣ RLS Policy لفواتير الشراء (bills)
-- =====================================================

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bills_visibility_policy" ON bills;

CREATE POLICY "bills_visibility_policy" ON bills
  FOR ALL
  TO authenticated
  USING (
    CASE 
      WHEN auth.uid() IS NULL THEN false
      ELSE
        (
          SELECT 
            CASE 
              WHEN (filter->>'allow_access')::boolean = false THEN false
              WHEN filter->>'filter_type' = 'company_wide' THEN 
                company_id = (filter->>'company_id')::uuid
              WHEN filter->>'filter_type' = 'scope_based' THEN 
                company_id = (filter->>'company_id')::uuid AND
                (branch_id = (filter->>'branch_id')::uuid OR (filter->>'branch_id') IS NULL) AND
                (cost_center_id = (filter->>'cost_center_id')::uuid OR (filter->>'cost_center_id') IS NULL)
              WHEN filter->>'filter_type' = 'created_by' THEN 
                company_id = (filter->>'company_id')::uuid AND
                created_by_user_id = (filter->>'created_by_user_id')::uuid AND
                (branch_id = (filter->>'branch_id')::uuid OR (filter->>'branch_id') IS NULL) AND
                (cost_center_id = (filter->>'cost_center_id')::uuid OR (filter->>'cost_center_id') IS NULL)
              ELSE false
            END
          FROM get_user_visibility_filter(auth.uid(), company_id, 'bills') AS filter
        )
    END
  );

-- =====================================================
-- 5️⃣ RLS Policy لأوامر الشراء (purchase_orders)
-- =====================================================

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchase_orders_visibility_policy" ON purchase_orders;

CREATE POLICY "purchase_orders_visibility_policy" ON purchase_orders
  FOR ALL
  TO authenticated
  USING (
    CASE 
      WHEN auth.uid() IS NULL THEN false
      ELSE
        (
          SELECT 
            CASE 
              WHEN (filter->>'allow_access')::boolean = false THEN false
              WHEN filter->>'filter_type' = 'company_wide' THEN 
                company_id = (filter->>'company_id')::uuid
              WHEN filter->>'filter_type' = 'scope_based' THEN 
                company_id = (filter->>'company_id')::uuid AND
                (branch_id = (filter->>'branch_id')::uuid OR (filter->>'branch_id') IS NULL) AND
                (cost_center_id = (filter->>'cost_center_id')::uuid OR (filter->>'cost_center_id') IS NULL)
              WHEN filter->>'filter_type' = 'created_by' THEN 
                company_id = (filter->>'company_id')::uuid AND
                created_by_user_id = (filter->>'created_by_user_id')::uuid AND
                (branch_id = (filter->>'branch_id')::uuid OR (filter->>'branch_id') IS NULL) AND
                (cost_center_id = (filter->>'cost_center_id')::uuid OR (filter->>'cost_center_id') IS NULL)
              ELSE false
            END
          FROM get_user_visibility_filter(auth.uid(), company_id, 'purchase_orders') AS filter
        )
    END
  );

-- =====================================================
-- 6️⃣ RLS Policy لمرتجعات المبيعات (sales_returns)
-- =====================================================

ALTER TABLE sales_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales_returns_visibility_policy" ON sales_returns;

CREATE POLICY "sales_returns_visibility_policy" ON sales_returns
  FOR ALL
  TO authenticated
  USING (
    CASE 
      WHEN auth.uid() IS NULL THEN false
      ELSE
        (
          SELECT 
            CASE 
              WHEN (filter->>'allow_access')::boolean = false THEN false
              WHEN filter->>'filter_type' = 'company_wide' THEN 
                company_id = (filter->>'company_id')::uuid
              WHEN filter->>'filter_type' = 'scope_based' THEN 
                company_id = (filter->>'company_id')::uuid AND
                (branch_id = (filter->>'branch_id')::uuid OR (filter->>'branch_id') IS NULL) AND
                (cost_center_id = (filter->>'cost_center_id')::uuid OR (filter->>'cost_center_id') IS NULL)
              WHEN filter->>'filter_type' = 'created_by' THEN 
                company_id = (filter->>'company_id')::uuid AND
                created_by_user_id = (filter->>'created_by_user_id')::uuid AND
                (branch_id = (filter->>'branch_id')::uuid OR (filter->>'branch_id') IS NULL) AND
                (cost_center_id = (filter->>'cost_center_id')::uuid OR (filter->>'cost_center_id') IS NULL)
              ELSE false
            END
          FROM get_user_visibility_filter(auth.uid(), company_id, 'sales_returns') AS filter
        )
    END
  );

-- =====================================================
-- 7️⃣ RLS Policy لإشعارات مدين العملاء (customer_debit_notes)
-- =====================================================

ALTER TABLE customer_debit_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_debit_notes_visibility_policy" ON customer_debit_notes;

CREATE POLICY "customer_debit_notes_visibility_policy" ON customer_debit_notes
  FOR ALL
  TO authenticated
  USING (
    CASE 
      WHEN auth.uid() IS NULL THEN false
      ELSE
        (
          SELECT 
            CASE 
              WHEN (filter->>'allow_access')::boolean = false THEN false
              WHEN filter->>'filter_type' = 'company_wide' THEN 
                company_id = (filter->>'company_id')::uuid
              WHEN filter->>'filter_type' = 'scope_based' THEN 
                company_id = (filter->>'company_id')::uuid AND
                (branch_id = (filter->>'branch_id')::uuid OR (filter->>'branch_id') IS NULL) AND
                (cost_center_id = (filter->>'cost_center_id')::uuid OR (filter->>'cost_center_id') IS NULL)
              WHEN filter->>'filter_type' = 'created_by' THEN 
                company_id = (filter->>'company_id')::uuid AND
                created_by_user_id = (filter->>'created_by_user_id')::uuid AND
                (branch_id = (filter->>'branch_id')::uuid OR (filter->>'branch_id') IS NULL) AND
                (cost_center_id = (filter->>'cost_center_id')::uuid OR (filter->>'cost_center_id') IS NULL)
              ELSE false
            END
          FROM get_user_visibility_filter(auth.uid(), company_id, 'customer_debit_notes') AS filter
        )
    END
  );

-- =====================================================
-- 8️⃣ RLS Policy لإشعارات دائن الموردين (vendor_credits)
-- =====================================================

ALTER TABLE vendor_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vendor_credits_visibility_policy" ON vendor_credits;

CREATE POLICY "vendor_credits_visibility_policy" ON vendor_credits
  FOR ALL
  TO authenticated
  USING (
    CASE 
      WHEN auth.uid() IS NULL THEN false
      ELSE
        (
          SELECT 
            CASE 
              WHEN (filter->>'allow_access')::boolean = false THEN false
              WHEN filter->>'filter_type' = 'company_wide' THEN 
                company_id = (filter->>'company_id')::uuid
              WHEN filter->>'filter_type' = 'scope_based' THEN 
                company_id = (filter->>'company_id')::uuid AND
                (branch_id = (filter->>'branch_id')::uuid OR (filter->>'branch_id') IS NULL) AND
                (cost_center_id = (filter->>'cost_center_id')::uuid OR (filter->>'cost_center_id') IS NULL)
              WHEN filter->>'filter_type' = 'created_by' THEN 
                company_id = (filter->>'company_id')::uuid AND
                created_by_user_id = (filter->>'created_by_user_id')::uuid AND
                (branch_id = (filter->>'branch_id')::uuid OR (filter->>'branch_id') IS NULL) AND
                (cost_center_id = (filter->>'cost_center_id')::uuid OR (filter->>'cost_center_id') IS NULL)
              ELSE false
            END
          FROM get_user_visibility_filter(auth.uid(), company_id, 'vendor_credits') AS filter
        )
    END
  );

-- =====================================================
-- 9️⃣ إنشاء فهارس لتحسين الأداء
-- =====================================================

-- فهارس للفواتير
CREATE INDEX IF NOT EXISTS idx_invoices_visibility 
ON invoices (company_id, branch_id, cost_center_id, created_by_user_id);

-- فهارس لأوامر البيع
CREATE INDEX IF NOT EXISTS idx_sales_orders_visibility 
ON sales_orders (company_id, branch_id, cost_center_id, created_by_user_id);

-- فهارس لفواتير الشراء
CREATE INDEX IF NOT EXISTS idx_bills_visibility 
ON bills (company_id, branch_id, cost_center_id, created_by_user_id);

-- فهارس لأوامر الشراء
CREATE INDEX IF NOT EXISTS idx_purchase_orders_visibility 
ON purchase_orders (company_id, branch_id, cost_center_id, created_by_user_id);

-- فهارس لمرتجعات المبيعات
CREATE INDEX IF NOT EXISTS idx_sales_returns_visibility 
ON sales_returns (company_id, branch_id, cost_center_id, created_by_user_id);

-- فهارس لإشعارات مدين العملاء
CREATE INDEX IF NOT EXISTS idx_customer_debit_notes_visibility 
ON customer_debit_notes (company_id, branch_id, cost_center_id, created_by_user_id);

-- فهارس لإشعارات دائن الموردين
CREATE INDEX IF NOT EXISTS idx_vendor_credits_visibility 
ON vendor_credits (company_id, branch_id, cost_center_id, created_by_user_id);

-- =====================================================
-- 🎯 تم تطبيق نظام التحكم في الرؤية بنجاح!
-- =====================================================

-- التحقق من تطبيق السياسات
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename IN (
  'invoices', 'sales_orders', 'bills', 'purchase_orders', 
  'sales_returns', 'customer_debit_notes', 'vendor_credits'
)
ORDER BY tablename, policyname;