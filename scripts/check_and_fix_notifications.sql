-- =====================================================
-- 🔍 فحص وإصلاح نظام الإشعارات
-- =====================================================
-- هذا الـ script يتحقق من:
-- 1. وجود جدول notifications
-- 2. وجود دالة create_notification
-- 3. وجود الأعمدة الجديدة (event_key, severity, category)
-- 4. تحديث الدالة إذا لزم الأمر
-- =====================================================

-- 1️⃣ التحقق من وجود جدول notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications'
  ) THEN
    RAISE EXCEPTION '❌ جدول notifications غير موجود! يجب تشغيل scripts/create_notifications_table.sql أولاً';
  ELSE
    RAISE NOTICE '✅ جدول notifications موجود';
  END IF;
END $$;

-- 2️⃣ التحقق من وجود الأعمدة الجديدة
DO $$
BEGIN
  -- التحقق من event_key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'event_key'
  ) THEN
    RAISE NOTICE '⚠️ إضافة عمود event_key...';
    ALTER TABLE notifications ADD COLUMN event_key TEXT NULL;
    RAISE NOTICE '✅ تم إضافة event_key';
  ELSE
    RAISE NOTICE '✅ عمود event_key موجود';
  END IF;

  -- التحقق من severity
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'severity'
  ) THEN
    RAISE NOTICE '⚠️ إضافة عمود severity...';
    ALTER TABLE notifications 
    ADD COLUMN severity TEXT NOT NULL DEFAULT 'info' 
    CHECK (severity IN ('info', 'warning', 'error', 'critical'));
    RAISE NOTICE '✅ تم إضافة severity';
  ELSE
    RAISE NOTICE '✅ عمود severity موجود';
  END IF;

  -- التحقق من category
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'category'
  ) THEN
    RAISE NOTICE '⚠️ إضافة عمود category...';
    ALTER TABLE notifications 
    ADD COLUMN category TEXT NOT NULL DEFAULT 'system' 
    CHECK (category IN ('finance', 'inventory', 'sales', 'approvals', 'system'));
    RAISE NOTICE '✅ تم إضافة category';
  ELSE
    RAISE NOTICE '✅ عمود category موجود';
  END IF;
END $$;

-- 3️⃣ التحقق من وجود فهرس event_key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'notifications' 
    AND indexname = 'idx_notifications_event_key_unique'
  ) THEN
    RAISE NOTICE '⚠️ إنشاء فهرس event_key...';
    CREATE UNIQUE INDEX idx_notifications_event_key_unique 
    ON notifications(company_id, event_key) 
    WHERE event_key IS NOT NULL;
    RAISE NOTICE '✅ تم إنشاء فهرس event_key';
  ELSE
    RAISE NOTICE '✅ فهرس event_key موجود';
  END IF;
END $$;

-- 4️⃣ تحديث دالة create_notification لدعم المعاملات الجديدة
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
  -- ✅ المعاملات الجديدة (اختيارية للحفاظ على التوافق)
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
  -- ✅ Idempotency Check: إذا كان event_key موجودًا، نعيد الإشعار الموجود
  IF p_event_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM notifications
    WHERE company_id = p_company_id
      AND event_key = p_event_key
    LIMIT 1;
    
    IF v_existing_id IS NOT NULL THEN
      -- ✅ إرجاع الإشعار الموجود بدلاً من إنشاء جديد
      RETURN v_existing_id;
    END IF;
  END IF;

  -- ✅ إنشاء إشعار جديد
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

-- 5️⃣ تحديث دالة get_user_notifications لدعم المعاملات الجديدة
CREATE OR REPLACE FUNCTION get_user_notifications(
  p_user_id UUID,
  p_company_id UUID,
  p_branch_id UUID DEFAULT NULL,
  p_warehouse_id UUID DEFAULT NULL,
  p_status VARCHAR(20) DEFAULT NULL,
  -- ✅ المعاملات الجديدة (اختيارية)
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
  -- ✅ إرجاع الحقول الجديدة
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
  -- ✅ جلب دور المستخدم في الشركة
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
    -- ✅ فلترة حسب severity و category
    AND (p_severity IS NULL OR n.severity = p_severity)
    AND (p_category IS NULL OR n.category = p_category)
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

-- 6️⃣ اختبار بسيط
DO $$
DECLARE
  v_test_company_id UUID;
  v_test_user_id UUID;
  v_notification_id UUID;
BEGIN
  -- جلب أول company و user للاختبار
  SELECT id INTO v_test_company_id FROM companies LIMIT 1;
  SELECT id INTO v_test_user_id FROM auth.users LIMIT 1;
  
  IF v_test_company_id IS NULL OR v_test_user_id IS NULL THEN
    RAISE NOTICE '⚠️ لا توجد بيانات للاختبار';
    RETURN;
  END IF;

  -- اختبار إنشاء إشعار
  BEGIN
    SELECT create_notification(
      p_company_id := v_test_company_id,
      p_reference_type := 'test',
      p_reference_id := gen_random_uuid(),
      p_title := 'Test Notification',
      p_message := 'This is a test notification',
      p_created_by := v_test_user_id,
      p_event_key := 'test:notification:check',
      p_severity := 'info',
      p_category := 'system'
    ) INTO v_notification_id;
    
    RAISE NOTICE '✅ اختبار إنشاء إشعار نجح! ID: %', v_notification_id;
    
    -- حذف الإشعار التجريبي
    DELETE FROM notifications WHERE id = v_notification_id;
    RAISE NOTICE '✅ تم حذف الإشعار التجريبي';
    
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ فشل اختبار إنشاء إشعار: %', SQLERRM;
  END;
END $$;

-- ✅ ملخص
SELECT 
  '✅ تم فحص وإصلاح نظام الإشعارات بنجاح!' AS status,
  '✅ جدول notifications موجود' AS table_status,
  '✅ دالة create_notification محدثة' AS function_status,
  '✅ الأعمدة الجديدة (event_key, severity, category) موجودة' AS columns_status;
