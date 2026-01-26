-- =====================================================
-- 📋 إضافة صلاحيات صفحة "توفر المنتجات في الفروع"
-- =====================================================
-- هذا السكريبت يضيف صلاحيات صفحة product_availability
-- للاطلاع فقط (Read-only) - متاحة لجميع الأدوار
-- =====================================================

-- =====================================
-- 1. إضافة الصلاحيات في جدول permissions
-- =====================================
INSERT INTO permissions (action, resource, category, title_ar, title_en, description_ar, description_en, is_dangerous)
VALUES
  -- صلاحيات توفر المنتجات في الفروع
  ('product_availability:access', 'product_availability', 'inventory', 'الوصول لتوفر المنتجات في الفروع', 'Access Product Availability', 'الوصول لصفحة البحث عن توفر المنتجات في جميع الفروع', 'Access page to search for product availability across all branches', FALSE),
  ('product_availability:read', 'product_availability', 'inventory', 'عرض توفر المنتجات في الفروع', 'View Product Availability', 'عرض توفر المنتجات في جميع الفروع والمخازن', 'View product availability across all branches and warehouses', FALSE)
ON CONFLICT (action) DO NOTHING;

-- =====================================
-- 2. إضافة الصلاحيات الافتراضية للأدوار
-- =====================================

-- === Owner - المالك (كل الصلاحيات) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'owner', action FROM permissions 
WHERE resource = 'product_availability'
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Admin - المدير (كل الصلاحيات) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'admin', action FROM permissions 
WHERE resource = 'product_availability'
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Manager - مدير (صلاحيات القراءة) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'manager', action FROM permissions 
WHERE resource = 'product_availability'
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Accountant - محاسب (صلاحيات القراءة) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'accountant', action FROM permissions 
WHERE resource = 'product_availability'
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Store Manager - مدير مخزن (صلاحيات القراءة) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'store_manager', action FROM permissions 
WHERE resource = 'product_availability'
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Staff - موظف (صلاحيات القراءة) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'staff', action FROM permissions 
WHERE resource = 'product_availability'
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Viewer - عارض (صلاحيات القراءة) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'viewer', action FROM permissions 
WHERE resource = 'product_availability'
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- =====================================
-- 3. تطبيق الصلاحيات على الشركات الموجودة
-- =====================================
-- ملاحظة: هذا السكريبت يضيف الصلاحيات للشركات الموجودة
-- باستخدام دالة copy_default_permissions_for_company

DO $$
DECLARE
  v_company_id UUID;
BEGIN
  -- لكل شركة موجودة
  FOR v_company_id IN SELECT id FROM companies LOOP
    -- نسخ الصلاحيات الافتراضية للشركة
    PERFORM copy_default_permissions_for_company(v_company_id);
  END LOOP;
  
  RAISE NOTICE '✅ تم تطبيق صلاحيات product_availability على جميع الشركات';
END $$;

-- =====================================
-- 4. إضافة الصلاحيات مباشرة في company_role_permissions
-- =====================================
-- هذا يضمن أن الشركات الموجودة تحصل على الصلاحيات فوراً
-- حتى لو لم تعمل دالة copy_default_permissions_for_company

INSERT INTO company_role_permissions (
  company_id, 
  role, 
  resource,
  can_read, 
  can_write, 
  can_update, 
  can_delete, 
  all_access, 
  can_access,
  allowed_actions
)
SELECT 
  c.id as company_id,
  r.name as role,
  'product_availability' as resource,
  TRUE as can_read,  -- للاطلاع فقط
  FALSE as can_write,
  FALSE as can_update,
  FALSE as can_delete,
  FALSE as all_access,
  TRUE as can_access,  -- الصفحة متاحة
  ARRAY['product_availability:access', 'product_availability:read']::TEXT[] as allowed_actions
FROM companies c
CROSS JOIN roles r
WHERE r.name IN ('owner', 'admin', 'manager', 'accountant', 'store_manager', 'staff', 'viewer')
ON CONFLICT (company_id, role, resource) DO UPDATE SET
  can_read = TRUE,
  can_access = TRUE,
  allowed_actions = ARRAY['product_availability:access', 'product_availability:read']::TEXT[];

-- رسالة تأكيد
DO $$
BEGIN
  RAISE NOTICE '✅ تم إضافة صلاحيات product_availability بنجاح';
  RAISE NOTICE '✅ جميع الأدوار الآن لديها صلاحية الوصول لصفحة توفر المنتجات في الفروع';
END $$;
