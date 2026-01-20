-- =====================================================
-- 🔍 تشخيص مشكلة الإشعارات في شركة Test - فرع مصر الجديدة
-- =====================================================
-- هذا الـ script يساعد في اكتشاف الإشعارات التي تظهر في العدد
-- ولكن لا تظهر في القائمة
-- =====================================================

-- 1️⃣ البحث عن شركة Test
SELECT id, name FROM companies WHERE name ILIKE '%test%' OR name ILIKE '%تست%';

-- 2️⃣ البحث عن فرع مصر الجديدة
SELECT id, name, company_id 
FROM branches 
WHERE name ILIKE '%مصر الجديدة%' OR name ILIKE '%new cairo%';

-- 3️⃣ جلب جميع الإشعارات غير المقروءة في الشركة
-- ⚠️ استبدل COMPANY_ID و BRANCH_ID بالقيم الفعلية من الخطوتين السابقتين
/*
SELECT 
  n.id,
  n.title,
  n.message,
  n.status,
  n.assigned_to_user,
  n.assigned_to_role,
  n.branch_id,
  n.expires_at,
  n.created_at,
  CASE 
    WHEN n.expires_at IS NOT NULL AND n.expires_at < NOW() THEN 'منتهي الصلاحية'
    WHEN n.status = 'archived' THEN 'مؤرشف'
    ELSE 'صالح'
  END AS validity_status
FROM notifications n
WHERE n.company_id = 'COMPANY_ID_HERE'  -- ⚠️ استبدل
  AND n.status = 'unread'
ORDER BY n.created_at DESC;
*/

-- 4️⃣ جلب الإشعارات المنتهية الصلاحية
-- ⚠️ استبدل COMPANY_ID بالقيمة الفعلية
/*
SELECT 
  id,
  title,
  expires_at,
  NOW() as current_time,
  expires_at < NOW() as is_expired
FROM notifications
WHERE company_id = 'COMPANY_ID_HERE'  -- ⚠️ استبدل
  AND status = 'unread'
  AND expires_at IS NOT NULL
  AND expires_at < NOW();
*/

-- 5️⃣ جلب الإشعارات المؤرشفة (يجب ألا تظهر)
-- ⚠️ استبدل COMPANY_ID بالقيمة الفعلية
/*
SELECT 
  id,
  title,
  status
FROM notifications
WHERE company_id = 'COMPANY_ID_HERE'  -- ⚠️ استبدل
  AND status = 'archived';
*/

-- 6️⃣ اختبار دالة get_user_notifications
-- ⚠️ استبدل USER_ID, COMPANY_ID, BRANCH_ID بالقيم الفعلية
/*
SELECT * FROM get_user_notifications(
  p_user_id := 'USER_ID_HERE',  -- ⚠️ استبدل
  p_company_id := 'COMPANY_ID_HERE',  -- ⚠️ استبدل
  p_branch_id := 'BRANCH_ID_HERE',  -- ⚠️ استبدل (أو NULL)
  p_warehouse_id := NULL,
  p_status := 'unread'
);
*/

-- 7️⃣ مقارنة عدد الإشعارات
-- ⚠️ استبدل القيم
/*
-- عدد الإشعارات من الاستعلام المباشر (الطريقة القديمة)
SELECT COUNT(*) as direct_count
FROM notifications
WHERE company_id = 'COMPANY_ID_HERE'
  AND status = 'unread'
  AND (assigned_to_user = 'USER_ID_HERE' OR assigned_to_user IS NULL)
  AND (assigned_to_role = 'USER_ROLE_HERE' OR assigned_to_role IS NULL OR 'USER_ROLE_HERE' IS NULL)
  AND (branch_id = 'BRANCH_ID_HERE' OR branch_id IS NULL);

-- عدد الإشعارات من دالة SQL (الطريقة الجديدة)
SELECT COUNT(*) as function_count
FROM get_user_notifications(
  'USER_ID_HERE',
  'COMPANY_ID_HERE',
  'BRANCH_ID_HERE',
  NULL,
  'unread'
);
*/
