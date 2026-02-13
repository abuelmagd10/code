-- =====================================================
-- 🔧 إصلاح دالة get_user_notifications - الإصدار 2
-- =====================================================
-- المشكلة: الإشعارات المخصصة لمستخدم معين (assigned_to_user)
-- لا تظهر إذا كان assigned_to_role مختلف عن دور المستخدم
-- الحل: إذا كان الإشعار مخصص لمستخدم معين، نتجاهل شرط الدور
-- =====================================================

DROP FUNCTION IF EXISTS get_user_notifications(UUID, UUID, UUID, UUID, VARCHAR, TEXT, TEXT);
DROP FUNCTION IF EXISTS get_user_notifications(UUID, UUID, UUID, UUID, VARCHAR);
DROP FUNCTION IF EXISTS get_user_notifications(UUID, UUID, UUID, UUID);
DROP FUNCTION IF EXISTS get_user_notifications(UUID, UUID);

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
    n.status,
    n.created_at,
    b.name::VARCHAR(255) AS branch_name,
    w.name::VARCHAR(255) AS warehouse_name,
    COALESCE(n.severity, 'info')::TEXT AS severity,
    COALESCE(n.category, 'system')::TEXT AS category,
    n.event_key
  FROM notifications n
  LEFT JOIN branches b ON (n.branch_id = b.id AND b.company_id = p_company_id)
  LEFT JOIN warehouses w ON (n.warehouse_id = w.id AND w.company_id = p_company_id)
  WHERE n.company_id = p_company_id
    -- ✅ الإشعار يظهر إذا:
    -- 1. مخصص لهذا المستخدم بالتحديد (assigned_to_user = p_user_id)
    -- 2. أو عام (assigned_to_user IS NULL) ويطابق الدور أو الدور عام
    AND (
      n.assigned_to_user = p_user_id  -- مخصص لهذا المستخدم
      OR (
        n.assigned_to_user IS NULL  -- عام
        AND (
          n.assigned_to_role = v_user_role
          OR n.assigned_to_role IS NULL
          OR v_user_role IN ('owner', 'admin')  -- Owner/Admin يرون كل الإشعارات العامة
        )
      )
    )
    AND (p_branch_id IS NULL OR n.branch_id = p_branch_id OR n.branch_id IS NULL)
    AND (p_warehouse_id IS NULL OR n.warehouse_id = p_warehouse_id OR n.warehouse_id IS NULL)
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

-- ✅ تم التحديث
SELECT '✅ تم إصلاح دالة get_user_notifications!' AS status;

