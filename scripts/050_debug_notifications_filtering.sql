-- =====================================================
-- 🔍 Debug: التحقق من فلترة الإشعارات للمالك
-- =====================================================
-- هذا الـ script يساعد في تشخيص مشكلة الإشعارات المفقودة
-- =====================================================

-- ✅ 1. التحقق من جميع الإشعارات في الشركة
SELECT 
  id,
  title,
  assigned_to_role,
  assigned_to_user,
  branch_id,
  warehouse_id,
  status,
  created_at
FROM notifications
WHERE company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'
ORDER BY created_at DESC
LIMIT 20;

-- ✅ 2. التحقق من الإشعارات المخصصة لـ owner
SELECT 
  id,
  title,
  assigned_to_role,
  assigned_to_user,
  branch_id,
  warehouse_id,
  status,
  created_at
FROM notifications
WHERE company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'
  AND (
    assigned_to_role = 'owner'
    OR assigned_to_role = 'admin'
    OR assigned_to_role IS NULL
  )
ORDER BY created_at DESC;

-- ✅ 3. التحقق من دور المستخدم (المالك)
SELECT 
  cm.user_id,
  cm.role,
  cm.branch_id,
  u.email
FROM company_members cm
JOIN auth.users u ON u.id = cm.user_id
WHERE cm.company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'
  AND cm.role = 'owner';

-- ✅ 4. استدعاء get_user_notifications مباشرة للمالك
SELECT * FROM get_user_notifications(
  '5b79b5d1-e829-4c9e-9ecf-5ac4c3eea8e2'::UUID,  -- user_id للمالك
  'f0ffc062-1e6e-4324-8be4-f5052e881a67'::UUID,  -- company_id
  NULL,  -- branch_id
  NULL,  -- warehouse_id
  NULL   -- status
);

-- ✅ 5. مقارنة: عدد الإشعارات الكلي vs عدد الإشعارات المرجعة
SELECT 
  (SELECT COUNT(*) FROM notifications 
   WHERE company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'
     AND (assigned_to_role IN ('owner', 'admin') OR assigned_to_role IS NULL)
     AND status != 'archived'
     AND (expires_at IS NULL OR expires_at > NOW())
  ) AS total_notifications_for_owner,
  (SELECT COUNT(*) FROM get_user_notifications(
    '5b79b5d1-e829-4c9e-9ecf-5ac4c3eea8e2'::UUID,
    'f0ffc062-1e6e-4324-8be4-f5052e881a67'::UUID,
    NULL, NULL, NULL
  )) AS notifications_returned_by_function;

-- ✅ 6. التحقق من الإشعارات المفقودة (موجودة في notifications لكن غير مرجعة من get_user_notifications)
WITH all_notifications AS (
  SELECT id, title, assigned_to_role, assigned_to_user, branch_id, warehouse_id, status, created_at
  FROM notifications
  WHERE company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'
    AND (assigned_to_role IN ('owner', 'admin') OR assigned_to_role IS NULL)
    AND status != 'archived'
    AND (expires_at IS NULL OR expires_at > NOW())
),
returned_notifications AS (
  SELECT id FROM get_user_notifications(
    '5b79b5d1-e829-4c9e-9ecf-5ac4c3eea8e2'::UUID,
    'f0ffc062-1e6e-4324-8be4-f5052e881a67'::UUID,
    NULL, NULL, NULL
  )
)
SELECT 
  an.id,
  an.title,
  an.assigned_to_role,
  an.assigned_to_user,
  an.branch_id,
  an.warehouse_id,
  an.status,
  an.created_at,
  CASE 
    WHEN rn.id IS NULL THEN '❌ Missing'
    ELSE '✅ Found'
  END AS status_in_function
FROM all_notifications an
LEFT JOIN returned_notifications rn ON an.id = rn.id
WHERE rn.id IS NULL
ORDER BY an.created_at DESC;
