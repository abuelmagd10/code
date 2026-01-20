-- =====================================================
-- ⚡ إصلاح سريع لنظام الإشعارات
-- =====================================================
-- شغّل هذا الـ script في Supabase SQL Editor لحل مشكلة 400
-- =====================================================

-- 1️⃣ إضافة الأعمدة إذا لم تكن موجودة
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS event_key TEXT NULL;

ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info' 
  CHECK (severity IN ('info', 'warning', 'error', 'critical'));

ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'system' 
  CHECK (category IN ('finance', 'inventory', 'sales', 'approvals', 'system'));

-- 2️⃣ تحديث دالة get_user_notifications (الأهم!)
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
  severity VARCHAR(20),
  category VARCHAR(20),
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
    COALESCE(n.severity, 'info')::VARCHAR(20) AS severity,
    COALESCE(n.category, 'system')::VARCHAR(20) AS category,
    n.event_key
  FROM notifications n
  LEFT JOIN branches b ON (n.branch_id = b.id AND b.company_id = p_company_id)
  LEFT JOIN warehouses w ON (n.warehouse_id = w.id AND w.company_id = p_company_id)
  WHERE n.company_id = p_company_id
    AND (n.assigned_to_user = p_user_id OR n.assigned_to_user IS NULL)
    AND (
      n.assigned_to_role = v_user_role 
      OR n.assigned_to_role IS NULL
      OR v_user_role IS NULL
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

-- 3️⃣ تحديث دالة create_notification لدعم المعاملات الجديدة
CREATE OR REPLACE FUNCTION create_notification(
  p_company_id UUID,
  p_reference_type VARCHAR(50),
  p_reference_id UUID,
  p_title VARCHAR(255),
  p_message TEXT,
  p_created_by UUID,
  p_branch_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL,
  p_warehouse_id UUID DEFAULT NULL,
  p_assigned_to_role VARCHAR(50) DEFAULT NULL,
  p_assigned_to_user UUID DEFAULT NULL,
  p_priority VARCHAR(20) DEFAULT 'normal',
  p_event_key TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT 'info',
  p_category TEXT DEFAULT 'system'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
  v_existing_id UUID;
BEGIN
  IF p_event_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM notifications
    WHERE company_id = p_company_id
      AND event_key = p_event_key
    LIMIT 1;
    
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  INSERT INTO notifications (
    company_id,
    branch_id,
    cost_center_id,
    warehouse_id,
    reference_type,
    reference_id,
    created_by,
    assigned_to_role,
    assigned_to_user,
    title,
    message,
    priority,
    status,
    event_key,
    severity,
    category
  ) VALUES (
    p_company_id,
    p_branch_id,
    p_cost_center_id,
    p_warehouse_id,
    p_reference_type,
    p_reference_id,
    p_created_by,
    p_assigned_to_role,
    p_assigned_to_user,
    p_title,
    p_message,
    p_priority,
    'unread',
    p_event_key,
    p_severity,
    p_category
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

SELECT '✅ تم إصلاح نظام الإشعارات!' AS status;
