-- =====================================================
-- 🔧 إصلاح دالة create_notification - تحديث إلزامي
-- =====================================================
-- هذا الـ script يحدّث دالة create_notification لدعم المعاملات الجديدة
-- ⚠️ مهم: شغّل هذا الـ script إذا كانت الإشعارات لا تعمل
-- =====================================================

-- ✅ حذف الدالة القديمة أولاً (إذا كانت موجودة)
DROP FUNCTION IF EXISTS create_notification(
  UUID, VARCHAR, UUID, VARCHAR, TEXT, UUID, UUID, UUID, UUID, VARCHAR, UUID, VARCHAR
);

DROP FUNCTION IF EXISTS create_notification(
  UUID, VARCHAR, UUID, VARCHAR, TEXT, UUID, UUID, UUID, UUID, VARCHAR, UUID, VARCHAR, TEXT, TEXT, TEXT
);

-- ✅ إنشاء/تحديث دالة create_notification مع المعاملات الجديدة
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
  -- ✅ المعاملات الجديدة
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
  -- ✅ Idempotency: التحقق من وجود إشعار بنفس event_key
  IF p_event_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM notifications
    WHERE company_id = p_company_id
      AND event_key = p_event_key
    LIMIT 1;
    
    IF v_existing_id IS NOT NULL THEN
      RAISE NOTICE 'إشعار موجود بالفعل بنفس event_key: %', p_event_key;
      RETURN v_existing_id;
    END IF;
  END IF;

  -- ✅ إنشاء الإشعار مع المعاملات الجديدة
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

-- ✅ التحقق من أن الدالة تم تحديثها بنجاح
DO $$
DECLARE
  v_param_text TEXT;
BEGIN
  SELECT pg_get_function_arguments(p.oid) INTO v_param_text
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'create_notification'
  LIMIT 1;
  
  IF v_param_text LIKE '%p_event_key%' 
     AND v_param_text LIKE '%p_severity%' 
     AND v_param_text LIKE '%p_category%' THEN
    RAISE NOTICE '✅ تم تحديث دالة create_notification بنجاح!';
    RAISE NOTICE '✅ المعاملات الجديدة: p_event_key, p_severity, p_category';
  ELSE
    RAISE EXCEPTION '❌ فشل تحديث دالة create_notification. المعاملات الحالية: %', v_param_text;
  END IF;
END $$;

-- ✅ تم الإصلاح بنجاح
SELECT '✅ تم تحديث دالة create_notification بنجاح!' AS status;
