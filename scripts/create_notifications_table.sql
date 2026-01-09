-- =====================================================
-- 🔔 إنشاء جدول الإشعارات (Notifications Table)
-- =====================================================
-- يجب تشغيل هذا الـ script في Supabase SQL Editor
-- =====================================================

-- 1️⃣ إنشاء جدول notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 🏢 السياق التنظيمي (إلزامي)
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  
  -- 📋 نوع الإشعار والمرجع (إلزامي)
  reference_type VARCHAR(50) NOT NULL,
  reference_id UUID NOT NULL,
  
  -- 👤 من أنشأ ولمن موجه
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to_role VARCHAR(50),
  assigned_to_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- 📝 محتوى الإشعار
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- ✅ الحالة
  status VARCHAR(20) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived', 'actioned')),
  read_at TIMESTAMPTZ,
  actioned_at TIMESTAMPTZ,
  
  -- 📅 التواريخ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  
  -- 🔍 فهارس للأداء
  CONSTRAINT notifications_reference_check CHECK (reference_type IS NOT NULL AND reference_id IS NOT NULL)
);

-- 2️⃣ إنشاء الفهارس
CREATE INDEX IF NOT EXISTS idx_notifications_company_status ON notifications(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_assigned_to_user ON notifications(assigned_to_user, status) WHERE assigned_to_user IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_assigned_to_role ON notifications(assigned_to_role, status) WHERE assigned_to_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_branch ON notifications(branch_id, status) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_warehouse ON notifications(warehouse_id, status) WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_reference ON notifications(reference_type, reference_id);

-- 3️⃣ RLS Policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy: المستخدمون يمكنهم رؤية الإشعارات المخصصة لهم أو لدورهم
CREATE POLICY "Users can view their own notifications"
  ON notifications
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
    AND (
      assigned_to_user = auth.uid()
      OR assigned_to_user IS NULL
      OR assigned_to_role IN (
        SELECT role FROM company_members 
        WHERE user_id = auth.uid() 
        AND company_id = notifications.company_id
      )
    )
  );

-- Policy: المستخدمون يمكنهم إنشاء إشعارات
CREATE POLICY "Users can create notifications"
  ON notifications
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- Policy: المستخدمون يمكنهم تحديث الإشعارات المخصصة لهم
CREATE POLICY "Users can update their own notifications"
  ON notifications
  FOR UPDATE
  USING (
    assigned_to_user = auth.uid()
    OR assigned_to_role IN (
      SELECT role FROM company_members 
      WHERE user_id = auth.uid() 
      AND company_id = notifications.company_id
    )
  );

-- 4️⃣ دالة إنشاء إشعار
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
  p_priority VARCHAR(20) DEFAULT 'normal'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
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
    status
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
    'unread'
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- 5️⃣ دالة الحصول على إشعارات المستخدم
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
  -- جلب دور المستخدم في الشركة
  SELECT role INTO v_user_role
  FROM company_members
  WHERE user_id = p_user_id
    AND company_id = p_company_id
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
    )
    AND (p_branch_id IS NULL OR n.branch_id = p_branch_id OR n.branch_id IS NULL)
    AND (p_warehouse_id IS NULL OR n.warehouse_id = p_warehouse_id OR n.warehouse_id IS NULL)
    AND (p_status IS NULL OR n.status = p_status)
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

-- 6️⃣ دالة تحديث حالة الإشعار كمقروء
CREATE OR REPLACE FUNCTION mark_notification_as_read(
  p_notification_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE notifications
  SET status = 'read',
      read_at = NOW()
  WHERE id = p_notification_id
    AND (
      assigned_to_user = p_user_id 
      OR assigned_to_user IS NULL
      OR assigned_to_role IN (
        SELECT role FROM company_members 
        WHERE user_id = p_user_id 
        AND company_id = notifications.company_id
      )
    );

  RETURN FOUND;
END;
$$;

-- ✅ تم الإنشاء بنجاح
SELECT '✅ Notifications table and functions created successfully!' AS status;
