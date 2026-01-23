-- =====================================================
-- 🔍 التحقق من إصلاح مشكلة أرشفة الإشعارات
-- =====================================================
-- هذا الـ script للتحقق من أن الدالة محدثة بشكل صحيح
-- =====================================================

-- 1️⃣ التحقق من تعريف الدالة الحالي
SELECT 
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'get_user_notifications'
ORDER BY p.oid DESC
LIMIT 1;

-- 2️⃣ اختبار الدالة مع status = 'archived'
-- ⚠️ استبدل USER_ID و COMPANY_ID بالقيم الفعلية
/*
SELECT * FROM get_user_notifications(
  'USER_ID_HERE'::UUID,  -- ⚠️ استبدل
  'COMPANY_ID_HERE'::UUID,  -- ⚠️ استبدل
  NULL,  -- branch_id
  NULL,  -- warehouse_id
  'archived'::VARCHAR  -- p_status
);
*/

-- 3️⃣ التحقق من الإشعارات المؤرشفة في قاعدة البيانات
SELECT 
  COUNT(*) AS total_archived_notifications,
  company_id,
  status
FROM notifications
WHERE status = 'archived'
GROUP BY company_id, status
ORDER BY total_archived_notifications DESC;

-- 4️⃣ التحقق من أن الشرط في الدالة صحيح
-- يجب أن يحتوي على: AND (p_status = 'archived' OR n.status != 'archived')
SELECT 
  CASE 
    WHEN pg_get_functiondef(p.oid) LIKE '%p_status = ''archived'' OR n.status != ''archived''%' 
    THEN '✅ الدالة محدثة بشكل صحيح'
    ELSE '❌ الدالة تحتاج إلى تحديث - شغّل fix_archived_notifications.sql'
  END AS verification_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'get_user_notifications'
ORDER BY p.oid DESC
LIMIT 1;
