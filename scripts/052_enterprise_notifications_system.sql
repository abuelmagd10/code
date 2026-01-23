-- =====================================================
-- 🔔 نظام الإشعارات الاحترافي (ERP Standard)
-- =====================================================
-- هذا الـ script ينشئ نظام إشعارات احترافي متكامل:
-- 1. تبسيط فلترة SQL (company_id, assigned_to_user, assigned_to_role فقط)
-- 2. إصلاح منطق الصلاحيات (owner/admin يرون كل شيء)
-- 3. إزالة فلترة branch/warehouse من SQL (تتم في الواجهة)
-- =====================================================

-- ✅ حذف الدالة القديمة أولاً
DROP FUNCTION IF EXISTS get_user_notifications(
  UUID, UUID, UUID, UUID, VARCHAR, TEXT, TEXT
);

DROP FUNCTION IF EXISTS get_user_notifications(
  UUID, UUID, UUID, UUID, VARCHAR
);

DROP FUNCTION IF EXISTS get_user_notifications(
  UUID, UUID, UUID, UUID
);

DROP FUNCTION IF EXISTS get_user_notifications(
  UUID, UUID
);

-- ✅ إنشاء دالة get_user_notifications محسّنة (ERP Standard)
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
  company_id UUID,
  branch_id UUID,
  cost_center_id UUID,
  warehouse_id UUID,
  reference_type VARCHAR(50),
  reference_id UUID,
  created_by UUID,
  assigned_to_role VARCHAR(50),
  assigned_to_user UUID,
  title VARCHAR(255),
  message TEXT,
  priority VARCHAR(20),
  status VARCHAR(20),
  read_at TIMESTAMPTZ,
  actioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  severity TEXT,
  category TEXT,
  event_key TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role VARCHAR(50);
  v_is_owner BOOLEAN := FALSE;
BEGIN
  -- ✅ جلب دور المستخدم في الشركة
  SELECT cm.role INTO v_user_role
  FROM company_members cm
  WHERE cm.user_id = p_user_id
    AND cm.company_id = p_company_id
  LIMIT 1;

  -- ✅ التحقق من أن المستخدم هو owner للشركة
  SELECT EXISTS(
    SELECT 1 FROM companies c
    WHERE c.id = p_company_id
      AND c.user_id = p_user_id
  ) INTO v_is_owner;

  -- ✅ إذا كان owner، نعيّن الدور كـ 'owner'
  IF v_is_owner THEN
    v_user_role := 'owner';
  END IF;

  RETURN QUERY
  SELECT
    n.id,
    n.company_id,
    n.branch_id,
    n.cost_center_id,
    n.warehouse_id,
    n.reference_type,
    n.reference_id,
    n.created_by,
    n.assigned_to_role,
    n.assigned_to_user,
    n.title,
    n.message,
    n.priority,
    n.status,
    n.read_at,
    n.actioned_at,
    n.created_at,
    n.expires_at,
    COALESCE(n.severity, 'info')::TEXT AS severity,
    COALESCE(n.category, 'system')::TEXT AS category,
    n.event_key
  FROM notifications n
  WHERE n.company_id = p_company_id
    -- ✅ فلترة حسب assigned_to_user:
    -- 1. Owner و Admin يرون جميع الإشعارات في الشركة
    -- 2. المستخدمون الآخرون يرون فقط الإشعارات المخصصة لهم أو بدون تخصيص
    AND (
      v_user_role IN ('owner', 'admin')
      OR n.assigned_to_user = p_user_id
      OR n.assigned_to_user IS NULL
    )
    -- ✅ فلترة حسب assigned_to_role:
    -- 1. Owner و Admin يرون جميع الإشعارات بغض النظر عن assigned_to_role
    -- 2. إذا كان assigned_to_role = NULL → يظهر للجميع
    -- 3. إذا كان assigned_to_role = v_user_role → يظهر للمستخدم
    -- 4. إذا كان assigned_to_role = 'admin' و v_user_role = 'owner' → يظهر (owner أعلى من admin)
    AND (
      v_user_role IN ('owner', 'admin')
      OR n.assigned_to_role IS NULL
      OR n.assigned_to_role = v_user_role
      OR (n.assigned_to_role = 'admin' AND v_user_role = 'owner')
      OR v_user_role IS NULL
    )
    -- ✅ فلترة حسب الحالة (status)
    AND (p_status IS NULL OR n.status = p_status)
    -- ✅ فلترة حسب severity
    AND (p_severity IS NULL OR COALESCE(n.severity, 'info') = p_severity)
    -- ✅ فلترة حسب category
    AND (p_category IS NULL OR COALESCE(n.category, 'system') = p_category)
    -- ✅ فلترة حسب انتهاء الصلاحية
    AND (n.expires_at IS NULL OR n.expires_at > NOW())
    -- ✅ استبعاد الإشعارات المؤرشفة
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

-- ✅ تم إنشاء النظام بنجاح
SELECT '✅ تم إنشاء نظام الإشعارات الاحترافي (ERP Standard) بنجاح!' AS status;
