-- =====================================================
-- إصلاح صلاحيات اعتماد إهلاك المخزون
-- =====================================================
-- 
-- المشكلة: Manager لديه صلاحية approve في قاعدة البيانات
-- لكن API endpoint يسمح فقط لـ Admin/Owner
-- 
-- الحل: إزالة صلاحية approve من Manager
-- =====================================================

-- إزالة صلاحية approve من Manager
DELETE FROM role_default_permissions
WHERE role_name = 'manager'
  AND permission_action = 'write_offs:approve';

-- التأكد من أن Owner و Admin فقط لديهم صلاحية approve
-- (هذا موجود بالفعل في السكريبت الأصلي)

-- التحقق من الصلاحيات الحالية
DO $$
DECLARE
  v_owner_approve_count INTEGER;
  v_admin_approve_count INTEGER;
  v_manager_approve_count INTEGER;
BEGIN
  -- التحقق من Owner
  SELECT COUNT(*) INTO v_owner_approve_count
  FROM role_default_permissions
  WHERE role_name = 'owner'
    AND permission_action = 'write_offs:approve';
  
  -- التحقق من Admin
  SELECT COUNT(*) INTO v_admin_approve_count
  FROM role_default_permissions
  WHERE role_name = 'admin'
    AND permission_action = 'write_offs:approve';
  
  -- التحقق من Manager (يجب أن يكون 0)
  SELECT COUNT(*) INTO v_manager_approve_count
  FROM role_default_permissions
  WHERE role_name = 'manager'
    AND permission_action = 'write_offs:approve';
  
  -- عرض النتائج
  RAISE NOTICE '✅ صلاحيات اعتماد الإهلاك:';
  RAISE NOTICE '   - Owner: %', v_owner_approve_count;
  RAISE NOTICE '   - Admin: %', v_admin_approve_count;
  RAISE NOTICE '   - Manager: % (يجب أن يكون 0)', v_manager_approve_count;
  
  IF v_manager_approve_count > 0 THEN
    RAISE WARNING '⚠️ Manager لا يزال لديه صلاحية approve - يجب إزالتها';
  END IF;
  
  IF v_owner_approve_count = 0 OR v_admin_approve_count = 0 THEN
    RAISE WARNING '⚠️ Owner أو Admin لا يملكون صلاحية approve - يجب إضافتها';
  END IF;
END $$;

-- ملاحظة: إذا كان هناك مستخدمون Manager لديهم صلاحيات مخصصة في company_role_permissions
-- يجب إزالة صلاحية approve منهم أيضاً

-- تحديث allowed_actions لإزالة write_offs:approve من Manager
UPDATE company_role_permissions
SET allowed_actions = array_remove(allowed_actions, 'write_offs:approve')
WHERE role = 'manager'
  AND resource = 'write_offs'
  AND allowed_actions IS NOT NULL
  AND 'write_offs:approve' = ANY(allowed_actions);

COMMENT ON TABLE role_default_permissions IS 
'صلاحيات اعتماد إهلاك المخزون: فقط Owner و Admin يمكنهم الاعتماد';
