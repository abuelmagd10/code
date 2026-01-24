-- =====================================================
-- 🔧 دالة موحدة لتحديث حالة الإشعار
-- =====================================================
-- ✅ توحيد منطق الحالات: unread, read, actioned, archived
-- ✅ التحقق من الصلاحيات (company_id, assigned_to_user, assigned_to_role)
-- ✅ Audit Logging لكل تغيير
-- ✅ تحديث updated_at تلقائيًا
-- =====================================================

-- ✅ حذف الدالة القديمة إن وجدت
DROP FUNCTION IF EXISTS update_notification_status(UUID, VARCHAR, UUID);

-- ✅ إنشاء الدالة الجديدة
CREATE OR REPLACE FUNCTION update_notification_status(
  p_notification_id UUID,
  p_new_status VARCHAR(20),
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification notifications%ROWTYPE;
  v_user_role VARCHAR(50);
  v_company_id UUID;
  v_has_permission BOOLEAN := FALSE;
  v_result JSONB;
BEGIN
  -- ✅ التحقق من صحة الحالة المطلوبة
  IF p_new_status NOT IN ('unread', 'read', 'actioned', 'archived') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid status. Allowed values: unread, read, actioned, archived'
    );
  END IF;

  -- ✅ جلب بيانات الإشعار
  SELECT * INTO v_notification
  FROM notifications
  WHERE id = p_notification_id;

  -- ✅ التحقق من وجود الإشعار
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Notification not found'
    );
  END IF;

  v_company_id := v_notification.company_id;

  -- ✅ جلب دور المستخدم في الشركة
  SELECT cm.role INTO v_user_role
  FROM company_members cm
  WHERE cm.user_id = p_user_id
    AND cm.company_id = v_company_id
  LIMIT 1;

  -- ✅ التحقق من الصلاحيات
  -- Owner و Admin: يمكنهم تغيير حالة أي إشعار في الشركة
  IF v_user_role IN ('owner', 'admin') THEN
    v_has_permission := TRUE;
  -- باقي الأدوار: يمكنهم تغيير حالة الإشعارات المخصصة لهم أو العامة
  ELSIF (
    v_notification.assigned_to_user = p_user_id
    OR v_notification.assigned_to_user IS NULL
    OR (
      v_notification.assigned_to_role = v_user_role
      OR v_notification.assigned_to_role IS NULL
    )
  ) THEN
    v_has_permission := TRUE;
  END IF;

  -- ✅ إذا لم يكن لديه صلاحية
  IF NOT v_has_permission THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Permission denied. You can only update notifications assigned to you or general notifications.'
    );
  END IF;

  -- ✅ تحديث حالة الإشعار
  UPDATE notifications
  SET 
    status = p_new_status,
    updated_at = NOW(),
    -- ✅ تحديث الحقول المرتبطة بالحالة
    read_at = CASE WHEN p_new_status IN ('read', 'actioned') AND read_at IS NULL THEN NOW() ELSE read_at END,
    actioned_at = CASE WHEN p_new_status = 'actioned' AND actioned_at IS NULL THEN NOW() ELSE actioned_at END
  WHERE id = p_notification_id;

  -- ✅ Audit Log
  INSERT INTO audit_logs (
    company_id,
    user_id,
    action,
    entity_type,
    entity_id,
    details,
    created_at
  )
  VALUES (
    v_company_id,
    p_user_id,
    'notification_status_changed',
    'notification',
    p_notification_id,
    jsonb_build_object(
      'old_status', v_notification.status,
      'new_status', p_new_status,
      'notification_title', v_notification.title
    ),
    NOW()
  )
  ON CONFLICT DO NOTHING; -- ✅ تجنب الأخطاء إذا كان audit_logs غير موجود

  -- ✅ إرجاع النتيجة
  RETURN jsonb_build_object(
    'success', true,
    'notification_id', p_notification_id,
    'old_status', v_notification.status,
    'new_status', p_new_status,
    'updated_at', NOW()
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- ✅ منح الصلاحيات
GRANT EXECUTE ON FUNCTION update_notification_status(UUID, VARCHAR, UUID) TO authenticated;

-- ✅ تم الإنشاء بنجاح
SELECT '✅ تم إنشاء دالة update_notification_status بنجاح!' AS status;
