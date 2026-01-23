-- =====================================================
-- 🔍 التحقق من إشعارات المالك لشركة "تست"
-- =====================================================
-- ⚠️ استبدل COMPANY_ID و USER_ID بالقيم الفعلية
-- =====================================================

-- 1️⃣ جميع الإشعارات في الشركة
SELECT 
  id,
  title,
  message,
  status,
  assigned_to_role,
  assigned_to_user,
  branch_id,
  warehouse_id,
  priority,
  created_at
FROM notifications
WHERE company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'  -- ⚠️ استبدل بـ company_id لشركة "تست"
ORDER BY created_at DESC;

-- 2️⃣ عدد الإشعارات حسب الحالة
SELECT 
  status,
  COUNT(*) AS count
FROM notifications
WHERE company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'  -- ⚠️ استبدل
GROUP BY status
ORDER BY count DESC;

-- 3️⃣ التحقق من دور المالك في الشركة
SELECT 
  cm.user_id,
  cm.role,
  cm.branch_id,
  u.email,
  up.display_name
FROM company_members cm
LEFT JOIN auth.users u ON u.id = cm.user_id
LEFT JOIN user_profiles up ON up.user_id = cm.user_id
WHERE cm.company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'  -- ⚠️ استبدل
  AND cm.role = 'owner';

-- 4️⃣ استدعاء get_user_notifications للمالك
-- ⚠️ استبدل USER_ID و COMPANY_ID بالقيم الفعلية
SELECT * FROM get_user_notifications(
  '5b79b5d1-e829-4c9e-9ecf-5ac4c3eea8e2'::UUID,  -- ⚠️ user_id للمالك
  'f0ffc062-1e6e-4324-8be4-f5052e881a67'::UUID,  -- ⚠️ company_id لشركة "تست"
  NULL,  -- branch_id (Owner يرى جميع الفروع)
  NULL,  -- warehouse_id (Owner يرى جميع المخازن)
  NULL   -- status (الكل)
);

-- 5️⃣ مقارنة: عدد الإشعارات الكلي vs عدد الإشعارات المرجعة للمالك
SELECT 
  (SELECT COUNT(*) FROM notifications 
   WHERE company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'  -- ⚠️ استبدل
     AND status != 'archived') AS total_notifications_in_company,
  (SELECT COUNT(*) FROM get_user_notifications(
    '5b79b5d1-e829-4c9e-9ecf-5ac4c3eea8e2'::UUID,  -- ⚠️ user_id للمالك
    'f0ffc062-1e6e-4324-8be4-f5052e881a67'::UUID,  -- ⚠️ company_id
    NULL, NULL, NULL
  )) AS notifications_returned_for_owner,
  CASE 
    WHEN (SELECT COUNT(*) FROM notifications 
          WHERE company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67' 
            AND status != 'archived') = 
         (SELECT COUNT(*) FROM get_user_notifications(
           '5b79b5d1-e829-4c9e-9ecf-5ac4c3eea8e2'::UUID,
           'f0ffc062-1e6e-4324-8be4-f5052e881a67'::UUID,
           NULL, NULL, NULL
         ))
    THEN '✅ المالك يرى جميع الإشعارات'
    ELSE '⚠️ المالك لا يرى جميع الإشعارات - تحقق من الدالة'
  END AS verification_status;

-- 6️⃣ الإشعارات المخصصة لـ owner أو admin
SELECT 
  id,
  title,
  assigned_to_role,
  assigned_to_user,
  status,
  created_at
FROM notifications
WHERE company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'  -- ⚠️ استبدل
  AND (
    assigned_to_role IN ('owner', 'admin')
    OR assigned_to_role IS NULL
  )
ORDER BY created_at DESC;
