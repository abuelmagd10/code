-- =====================================================
-- 🔧 إصلاح خطأ SQL Ambiguity في دالة get_user_notifications
-- =====================================================
-- المشكلة: column reference "company_id" is ambiguous
-- الحل: تحديد الجدول بوضوح في جميع الاستعلامات
-- =====================================================

-- 1️⃣ إعادة إنشاء RLS Policies مع تحديد الجدول بوضوح
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;

-- Policy: المستخدمون يمكنهم رؤية الإشعارات المخصصة لهم أو لدورهم
CREATE POLICY "Users can view their own notifications"
  ON notifications
  FOR SELECT
  USING (
    notifications.company_id IN (
      SELECT cm.company_id FROM company_members cm WHERE cm.user_id = auth.uid()
    )
    AND (
      notifications.assigned_to_user = auth.uid()
      OR notifications.assigned_to_user IS NULL
      OR notifications.assigned_to_role IN (
        SELECT cm2.role FROM company_members cm2
        WHERE cm2.user_id = auth.uid() 
        AND cm2.company_id = notifications.company_id
      )
    )
  );

-- Policy: المستخدمون يمكنهم إنشاء إشعارات
CREATE POLICY "Users can create notifications"
  ON notifications
  FOR INSERT
  WITH CHECK (
    notifications.company_id IN (
      SELECT cm.company_id FROM company_members cm WHERE cm.user_id = auth.uid()
    )
    AND notifications.created_by = auth.uid()
  );

-- Policy: المستخدمون يمكنهم تحديث الإشعارات المخصصة لهم
CREATE POLICY "Users can update their own notifications"
  ON notifications
  FOR UPDATE
  USING (
    notifications.assigned_to_user = auth.uid()
    OR notifications.assigned_to_role IN (
      SELECT cm.role FROM company_members cm
      WHERE cm.user_id = auth.uid() 
      AND cm.company_id = notifications.company_id
    )
  );

-- 2️⃣ إعادة إنشاء دالة get_user_notifications مع إصلاح ambiguity
CREATE OR REPLACE FUNCTION get_user_notifications(
  p_user_id UUID,
  p_company_id UUID,
  p_branch_id UUID DEFAULT NULL,
  p_warehouse_id UUID DEFAULT NULL,
  p_status VARCHAR(20) DEFAULT NULL
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
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role VARCHAR(50);
BEGIN
  -- ✅ جلب دور المستخدم في الشركة - تحديد الجدول بوضوح لتجنب ambiguity
  SELECT cm.role INTO v_user_role
  FROM company_members cm
  WHERE cm.user_id = p_user_id
    AND cm.company_id = p_company_id
  LIMIT 1;

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
    n.expires_at
  FROM notifications n
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
SELECT '✅ Notifications function ambiguity fixed successfully!' AS status;
