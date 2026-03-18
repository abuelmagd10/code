-- =====================================================
-- 🔧 إصلاح مشكلة تضارب الدوال (HTTP 300 - PGRST203)
-- =====================================================

-- 1️⃣ حذف جميع النسخ القديمة والمتضاربة لدالة get_user_notifications
DO $$ 
DECLARE 
    stmt TEXT;
BEGIN 
    FOR stmt IN 
        SELECT 'DROP FUNCTION ' || oid::regprocedure || ' CASCADE;'
        FROM pg_proc 
        WHERE proname = 'get_user_notifications' 
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE stmt;
    END LOOP;
END $$;

-- 2️⃣ إعادة إنشاء الدالة بنسخة واحدة فقط وموحدة
CREATE OR REPLACE FUNCTION get_user_notifications(
  p_user_id UUID,
  p_company_id UUID,
  p_branch_id UUID DEFAULT NULL,
  p_warehouse_id UUID DEFAULT NULL,
  p_status VARCHAR(20) DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_search_query TEXT DEFAULT NULL,
  p_priority VARCHAR(20) DEFAULT NULL,
  p_reference_type VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  reference_type VARCHAR(50),
  reference_id UUID,
  title VARCHAR(255),
  message TEXT,
  priority VARCHAR(20),
  status VARCHAR(20),
  created_at TIMESTAMPTZ,
  branch_name TEXT,
  warehouse_name VARCHAR(255),
  severity TEXT,
  category TEXT,
  event_key TEXT,
  read_at TIMESTAMPTZ,
  actioned_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role VARCHAR(50);
BEGIN
  -- جلب دور المستخدم في الشركة
  SELECT cm.role INTO v_user_role
  FROM company_members cm
  WHERE cm.user_id = p_user_id
    AND cm.company_id = p_company_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    n.id,
    n.reference_type,
    n.reference_id,
    n.title,
    n.message,
    n.priority,
    -- ✅ جلب الحالة الخاصة بالمستخدم، وإذا لم تكن موجودة نفترض أنها unread
    COALESCE(nus.status, 'unread')::VARCHAR(20) AS status,
    n.created_at,
    b.name AS branch_name,
    w.name AS warehouse_name,
    COALESCE(n.severity, 'info')::TEXT AS severity,
    COALESCE(n.category, 'system')::TEXT AS category,
    n.event_key,
    nus.read_at,
    nus.actioned_at
  FROM notifications n
  LEFT JOIN branches b ON (n.branch_id = b.id AND b.company_id = p_company_id)
  LEFT JOIN warehouses w ON (n.warehouse_id = w.id AND w.company_id = p_company_id)
  -- ✅ ربط مع جدول الحالات الخاص بالمستخدم الحالي
  LEFT JOIN notification_user_states nus ON (n.id = nus.notification_id AND nus.user_id = p_user_id)
  WHERE n.company_id = p_company_id
    -- فلترة التخصيص للمستخدم (مباشر أو عام)
    AND (
      v_user_role IN ('owner', 'admin')
      OR n.assigned_to_user = p_user_id 
      OR n.assigned_to_user IS NULL
    )
    -- فلترة التخصيص للدور
    AND (
      v_user_role IN ('owner', 'admin')
      OR n.assigned_to_role IS NULL
      OR n.assigned_to_role = v_user_role
      OR (n.assigned_to_role = 'admin' AND v_user_role = 'owner')
      OR v_user_role IS NULL
    )
    -- فلترة الفرع
    AND (
      v_user_role IN ('owner', 'admin')
      OR p_branch_id IS NULL 
      OR n.branch_id = p_branch_id 
      OR n.branch_id IS NULL
    )
    -- فلترة المخزن
    AND (
      v_user_role IN ('owner', 'admin')
      OR p_warehouse_id IS NULL 
      OR n.warehouse_id = p_warehouse_id 
      OR n.warehouse_id IS NULL
    )
    -- ✅ فلترة الحالة استناداً إلى حالة المستخدم الفعلية
    AND (
      CASE 
        WHEN p_status IS NULL THEN COALESCE(nus.status, 'unread') != 'archived'
        WHEN p_status = 'archived' THEN COALESCE(nus.status, 'unread') = 'archived'
        WHEN p_status = 'actioned' THEN COALESCE(nus.status, 'unread') = 'actioned'
        ELSE COALESCE(nus.status, 'unread') = p_status
      END
    )
    AND (n.expires_at IS NULL OR n.expires_at > NOW())
    AND (p_severity IS NULL OR COALESCE(n.severity, 'info') = p_severity)
    AND (p_category IS NULL OR COALESCE(n.category, 'system') = p_category)
    -- ✅ Server-side filtering للبحث، الأولوية ونوع الإشعار
    AND (p_search_query IS NULL OR (n.title ILIKE '%' || p_search_query || '%' OR n.message ILIKE '%' || p_search_query || '%'))
    AND (p_priority IS NULL OR n.priority = p_priority)
    AND (p_reference_type IS NULL OR n.reference_type = p_reference_type)
  ORDER BY
    CASE n.priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
    END,
    n.created_at DESC;
END;
$$;

-- تحديث الـ Schema Cache لإجبار PostgREST على قراءة التغييرات وتجنب PGRST203
NOTIFY pgrst, 'reload schema';

SELECT '✅ RPC ambiguity resolved successfully!' AS result;
