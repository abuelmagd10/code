-- =====================================================
-- 🔧 إصلاح: Owner و Admin يرون جميع الإشعارات
-- =====================================================
-- المشكلة: Owner و Admin لا يرون الإشعارات المخصصة لمستخدمين آخرين
-- الحل: تعديل منطق get_user_notifications ليرى Owner/Admin جميع الإشعارات
-- =====================================================

-- ✅ حذف الدالة القديمة أولاً (إذا كانت موجودة)
DROP FUNCTION IF EXISTS get_user_notifications(
  UUID, UUID, UUID, UUID, VARCHAR, TEXT, TEXT
);

DROP FUNCTION IF EXISTS get_user_notifications(
  UUID, UUID, UUID, UUID, VARCHAR
);

DROP FUNCTION IF EXISTS get_user_notifications(
  UUID, UUID
);

-- ✅ إنشاء/تحديث دالة get_user_notifications
CREATE OR REPLACE FUNCTION get_user_notifications(
  p_user_id UUID,
  p_company_id UUID,
  p_branch_id UUID DEFAULT NULL,
  p_warehouse_id UUID DEFAULT NULL,
  p_status VARCHAR(20) DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL
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
  branch_name VARCHAR(255),
  warehouse_name VARCHAR(255),
  severity TEXT,
  category TEXT,
  event_key TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role VARCHAR(50);
BEGIN
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
    n.status,
    n.created_at,
    b.name AS branch_name,
    w.name AS warehouse_name,
    COALESCE(n.severity, 'info')::TEXT AS severity,
    COALESCE(n.category, 'system')::TEXT AS category,
    n.event_key
  FROM notifications n
  LEFT JOIN branches b ON (n.branch_id = b.id AND b.company_id = p_company_id)
  LEFT JOIN warehouses w ON (n.warehouse_id = w.id AND w.company_id = p_company_id)
  WHERE n.company_id = p_company_id
    AND (
      -- ✅ منطق محسّن للفلترة حسب assigned_to_user:
      -- 1. Owner و Admin يرون جميع الإشعارات في الشركة بغض النظر عن assigned_to_user
      -- 2. المستخدمون الآخرون يرون فقط الإشعارات المخصصة لهم أو بدون تخصيص
      v_user_role IN ('owner', 'admin')
      OR n.assigned_to_user = p_user_id 
      OR n.assigned_to_user IS NULL
    )
    AND (
      -- ✅ منطق محسّن للفلترة حسب الدور:
      -- 1. Owner و Admin يرون جميع الإشعارات بغض النظر عن assigned_to_role
      -- 2. إذا كان assigned_to_role = NULL → يظهر للجميع
      -- 3. إذا كان assigned_to_role = v_user_role → يظهر للمستخدم
      -- 4. إذا كان assigned_to_role = 'admin' و v_user_role = 'owner' → يظهر (owner أعلى من admin)
      v_user_role IN ('owner', 'admin')
      OR n.assigned_to_role IS NULL
      OR n.assigned_to_role = v_user_role
      OR (n.assigned_to_role = 'admin' AND v_user_role = 'owner')
      OR v_user_role IS NULL
    )
    AND (
      -- ✅ منطق محسّن للفلترة حسب الفرع:
      -- 1. Owner و Admin يرون جميع الإشعارات في الشركة بغض النظر عن branch_id
      -- 2. المستخدمون الآخرون يرون فقط إشعارات فرعهم
      v_user_role IN ('owner', 'admin')
      OR p_branch_id IS NULL 
      OR n.branch_id = p_branch_id 
      OR n.branch_id IS NULL
    )
    AND (
      -- ✅ منطق محسّن للفلترة حسب المخزن:
      -- 1. Owner و Admin يرون جميع الإشعارات بغض النظر عن warehouse_id
      -- 2. المستخدمون الآخرون يرون فقط إشعارات مخزنهم
      v_user_role IN ('owner', 'admin')
      OR p_warehouse_id IS NULL 
      OR n.warehouse_id = p_warehouse_id 
      OR n.warehouse_id IS NULL
    )
    AND (p_status IS NULL OR n.status = p_status)
    AND (p_severity IS NULL OR COALESCE(n.severity, 'info') = p_severity)
    AND (p_category IS NULL OR COALESCE(n.category, 'system') = p_category)
    AND (n.expires_at IS NULL OR n.expires_at > NOW())
    AND n.status != 'archived'
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

-- ✅ تم الإصلاح بنجاح
SELECT '✅ تم إصلاح get_user_notifications - Owner و Admin يرون الآن جميع الإشعارات!' AS status;
