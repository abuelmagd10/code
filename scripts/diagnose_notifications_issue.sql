-- =====================================================
-- 🔍 تشخيص مشكلة الإشعارات
-- =====================================================
-- هذا الـ script للتحقق من سبب عدم وصول الإشعارات
-- =====================================================

-- 1️⃣ التحقق من وجود جدول notifications
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications')
    THEN '✅ جدول notifications موجود'
    ELSE '❌ جدول notifications غير موجود'
  END AS table_status;

-- 2️⃣ عدد الإشعارات في قاعدة البيانات
SELECT 
  COUNT(*) AS total_notifications,
  COUNT(CASE WHEN status = 'unread' THEN 1 END) AS unread_count,
  COUNT(CASE WHEN status = 'read' THEN 1 END) AS read_count,
  COUNT(CASE WHEN status = 'archived' THEN 1 END) AS archived_count,
  COUNT(CASE WHEN status = 'actioned' THEN 1 END) AS actioned_count
FROM notifications;

-- 3️⃣ التحقق من دالة create_notification
SELECT 
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS function_arguments,
  CASE 
    WHEN pg_get_function_arguments(p.oid) LIKE '%p_event_key%' 
     AND pg_get_function_arguments(p.oid) LIKE '%p_severity%' 
     AND pg_get_function_arguments(p.oid) LIKE '%p_category%'
    THEN '✅ الدالة محدثة (تدعم المعاملات الجديدة)'
    ELSE '❌ الدالة تحتاج إلى تحديث - شغّل scripts/048_fix_create_notification_function.sql'
  END AS function_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'create_notification'
ORDER BY p.oid DESC
LIMIT 1;

-- 4️⃣ التحقق من دالة get_user_notifications
SELECT 
  p.proname AS function_name,
  CASE 
    WHEN pg_get_functiondef(p.oid) LIKE '%p_status = ''archived''%' 
     AND pg_get_functiondef(p.oid) LIKE '%CASE%'
    THEN '✅ الدالة محدثة (تدعم المؤرشفة)'
    ELSE '❌ الدالة تحتاج إلى تحديث - شغّل scripts/fix_archived_notifications.sql'
  END AS function_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'get_user_notifications'
ORDER BY p.oid DESC
LIMIT 1;

-- 5️⃣ عينة من الإشعارات الأخيرة
SELECT 
  id,
  title,
  status,
  assigned_to_role,
  assigned_to_user,
  company_id,
  branch_id,
  warehouse_id,
  created_at
FROM notifications
ORDER BY created_at DESC
LIMIT 10;

-- 6️⃣ التحقق من الصلاحيات (RLS Policies)
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'notifications';

-- 7️⃣ اختبار إنشاء إشعار (اختياري - استبدل القيم)
/*
SELECT create_notification(
  'COMPANY_ID_HERE'::UUID,  -- ⚠️ استبدل
  'test_notification'::VARCHAR,
  gen_random_uuid()::UUID,
  'Test Notification'::VARCHAR,
  'This is a test notification'::TEXT,
  'USER_ID_HERE'::UUID,  -- ⚠️ استبدل
  NULL,  -- branch_id
  NULL,  -- cost_center_id
  NULL,  -- warehouse_id
  'admin'::VARCHAR,  -- assigned_to_role
  NULL,  -- assigned_to_user
  'normal'::VARCHAR,  -- priority
  'test-event-key-' || NOW()::TEXT,  -- event_key
  'info'::TEXT,  -- severity
  'system'::TEXT  -- category
);
*/

-- 8️⃣ التحقق من وجود أعمدة event_key, severity, category
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'notifications'
  AND column_name IN ('event_key', 'severity', 'category')
ORDER BY column_name;
