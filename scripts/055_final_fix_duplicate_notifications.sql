-- =====================================================
-- 🔧 الحل النهائي لمنع التكرار في الإشعارات
-- =====================================================
-- هذا الـ script يضمن:
-- 1. إضافة event_key و severity و category إذا لم تكن موجودة
-- 2. تحديث دالة create_notification لمنع التكرار
-- 3. حذف الإشعارات المكررة الموجودة
-- =====================================================

-- ✅ 1. إضافة الأعمدة المطلوبة إذا لم تكن موجودة
DO $$
BEGIN
  -- event_key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notifications' 
    AND column_name = 'event_key'
  ) THEN
    ALTER TABLE notifications ADD COLUMN event_key TEXT;
    RAISE NOTICE '✅ تم إضافة عمود event_key';
  ELSE
    RAISE NOTICE '✅ عمود event_key موجود بالفعل';
  END IF;

  -- severity
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notifications' 
    AND column_name = 'severity'
  ) THEN
    ALTER TABLE notifications ADD COLUMN severity TEXT NOT NULL DEFAULT 'info' 
      CHECK (severity IN ('info', 'warning', 'error', 'critical'));
    RAISE NOTICE '✅ تم إضافة عمود severity';
  ELSE
    RAISE NOTICE '✅ عمود severity موجود بالفعل';
  END IF;

  -- category
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notifications' 
    AND column_name = 'category'
  ) THEN
    ALTER TABLE notifications ADD COLUMN category TEXT NOT NULL DEFAULT 'system' 
      CHECK (category IN ('finance', 'inventory', 'sales', 'approvals', 'system'));
    RAISE NOTICE '✅ تم إضافة عمود category';
  ELSE
    RAISE NOTICE '✅ عمود category موجود بالفعل';
  END IF;
END $$;

-- ✅ 2. إضافة فهرس فريد على (company_id, event_key) لمنع التكرار
DROP INDEX IF EXISTS uniq_notifications_company_event_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notifications_company_event_key
ON notifications(company_id, event_key)
WHERE event_key IS NOT NULL;

-- ✅ 3. تحديث دالة create_notification لدعم event_key وفحص التكرار
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
  -- ✅ إذا كان event_key محدداً، نتحقق من وجود إشعار بنفس event_key
  IF p_event_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM notifications
    WHERE company_id = p_company_id
      AND event_key = p_event_key
      AND status != 'archived' -- نسمح بإعادة إنشاء إذا كان الإشعار السابق مؤرشف
    LIMIT 1;

    -- إذا وُجد إشعار موجود، نعيده بدلاً من إنشاء جديد
    IF v_existing_id IS NOT NULL THEN
      RAISE NOTICE '⚠️ Notification with event_key % already exists (id: %). Returning existing notification.', p_event_key, v_existing_id;
      RETURN v_existing_id;
    END IF;
  END IF;

  -- إنشاء الإشعار الجديد
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
EXCEPTION
  WHEN unique_violation THEN
    -- إذا حدث تكرار رغم الفحص (race condition)، نعيد الإشعار الموجود
    SELECT id INTO v_existing_id
    FROM notifications
    WHERE company_id = p_company_id
      AND event_key = p_event_key
    LIMIT 1;
    
    IF v_existing_id IS NOT NULL THEN
      RAISE NOTICE '⚠️ Duplicate notification prevented (race condition). Returning existing notification (id: %).', v_existing_id;
      RETURN v_existing_id;
    ELSE
      RAISE;
    END IF;
END;
$$;

-- ✅ 4. حذف الإشعارات المكررة الموجودة (نفس event_key)
-- تحذير: هذا سيحذف الإشعارات المكررة القديمة، مع الاحتفاظ بالأحدث فقط
DO $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- حذف الإشعارات المكررة، مع الاحتفاظ بالأحدث فقط
  WITH duplicates AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY company_id, event_key 
        ORDER BY created_at DESC
      ) as rn
    FROM notifications
    WHERE event_key IS NOT NULL
      AND status != 'archived'
  )
  DELETE FROM notifications
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ تم حذف % إشعار مكرر', v_deleted_count;
END $$;

-- ✅ 5. حذف الإشعارات المكررة بدون event_key (نفس reference_type, reference_id, assigned_to_role)
-- هذا للتعامل مع الإشعارات القديمة التي لا تحتوي على event_key
DO $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  WITH duplicates AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY company_id, reference_type, reference_id, assigned_to_role, assigned_to_user
        ORDER BY created_at DESC
      ) as rn
    FROM notifications
    WHERE event_key IS NULL
      AND status != 'archived'
      AND reference_type = 'inventory_write_off'
      AND assigned_to_role = 'admin'
  )
  DELETE FROM notifications
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ تم حذف % إشعار مكرر بدون event_key', v_deleted_count;
END $$;

-- ✅ تم الإصلاح بنجاح
SELECT '✅ تم تطبيق الحل النهائي لمنع التكرار في الإشعارات!' AS status;
