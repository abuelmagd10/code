-- =====================================
-- إضافة صلاحيات الأصول الثابتة (Fixed Assets) إلى نظام الصلاحيات
-- Add Fixed Assets permissions to RBAC system
-- =====================================

-- إضافة صلاحيات الأصول الثابتة إلى جدول permissions
INSERT INTO permissions (action, resource, category, title_ar, title_en, is_dangerous) VALUES
  -- الأصول الثابتة
  ('fixed_assets:access', 'fixed_assets', 'accounting', 'الوصول للأصول الثابتة', 'Access Fixed Assets', FALSE),
  ('fixed_assets:read', 'fixed_assets', 'accounting', 'عرض الأصول الثابتة', 'View Fixed Assets', FALSE),
  ('fixed_assets:write', 'fixed_assets', 'accounting', 'إضافة أصل ثابت', 'Create Fixed Asset', FALSE),
  ('fixed_assets:update', 'fixed_assets', 'accounting', 'تعديل أصل ثابت', 'Update Fixed Asset', FALSE),
  ('fixed_assets:delete', 'fixed_assets', 'accounting', 'حذف أصل ثابت', 'Delete Fixed Asset', TRUE),
  ('fixed_assets:post_depreciation', 'fixed_assets', 'accounting', 'ترحيل الإهلاك', 'Post Depreciation', FALSE),
  ('fixed_assets:approve_depreciation', 'fixed_assets', 'accounting', 'اعتماد الإهلاك', 'Approve Depreciation', FALSE),
  ('fixed_assets:dispose', 'fixed_assets', 'accounting', 'استبعاد أصل', 'Dispose Asset', TRUE),
  ('fixed_assets:revalue', 'fixed_assets', 'accounting', 'إعادة تقييم أصل', 'Revalue Asset', TRUE),
  
  -- فئات الأصول
  ('asset_categories:access', 'asset_categories', 'accounting', 'الوصول لفئات الأصول', 'Access Asset Categories', FALSE),
  ('asset_categories:read', 'asset_categories', 'accounting', 'عرض فئات الأصول', 'View Asset Categories', FALSE),
  ('asset_categories:write', 'asset_categories', 'accounting', 'إضافة فئة أصول', 'Create Asset Category', FALSE),
  ('asset_categories:update', 'asset_categories', 'accounting', 'تعديل فئة أصول', 'Update Asset Category', FALSE),
  ('asset_categories:delete', 'asset_categories', 'accounting', 'حذف فئة أصول', 'Delete Asset Category', TRUE),
  
  -- تقارير الأصول الثابتة
  ('fixed_assets_reports:access', 'fixed_assets_reports', 'accounting', 'الوصول لتقارير الأصول', 'Access Fixed Assets Reports', FALSE),
  ('fixed_assets_reports:read', 'fixed_assets_reports', 'accounting', 'عرض تقارير الأصول', 'View Fixed Assets Reports', FALSE)
ON CONFLICT (action) DO NOTHING;

-- =====================================
-- إضافة الصلاحيات الافتراضية للأدوار
-- =====================================

-- === Owner - المالك (كل الصلاحيات) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'owner', action FROM permissions
WHERE action LIKE 'fixed_assets:%' 
   OR action LIKE 'asset_categories:%'
   OR action LIKE 'fixed_assets_reports:%'
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Admin - المدير (كل الصلاحيات) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'admin', action FROM permissions
WHERE action LIKE 'fixed_assets:%' 
   OR action LIKE 'asset_categories:%'
   OR action LIKE 'fixed_assets_reports:%'
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Manager - مدير (معظم الصلاحيات) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'manager', action FROM permissions
WHERE action IN (
  'fixed_assets:access', 'fixed_assets:read', 'fixed_assets:write', 'fixed_assets:update',
  'fixed_assets:post_depreciation', 'fixed_assets:approve_depreciation',
  'asset_categories:access', 'asset_categories:read', 'asset_categories:write', 'asset_categories:update',
  'fixed_assets_reports:access', 'fixed_assets_reports:read'
)
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Accountant - محاسب (صلاحيات محاسبية) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'accountant', action FROM permissions
WHERE action IN (
  'fixed_assets:access', 'fixed_assets:read', 'fixed_assets:write', 'fixed_assets:update',
  'fixed_assets:post_depreciation', 'fixed_assets:approve_depreciation',
  'asset_categories:access', 'asset_categories:read',
  'fixed_assets_reports:access', 'fixed_assets_reports:read'
)
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Staff - موظف (صلاحيات محدودة) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'staff', action FROM permissions
WHERE action IN (
  'fixed_assets:access', 'fixed_assets:read',
  'asset_categories:access', 'asset_categories:read',
  'fixed_assets_reports:access', 'fixed_assets_reports:read'
)
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Viewer - عارض (قراءة فقط) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'viewer', action FROM permissions
WHERE action IN (
  'fixed_assets:access', 'fixed_assets:read',
  'asset_categories:access', 'asset_categories:read',
  'fixed_assets_reports:access', 'fixed_assets_reports:read'
)
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- =====================================
-- تحديث الصلاحيات للشركات الموجودة
-- =====================================
-- ملاحظة: يمكن تشغيل copy_default_permissions_for_company لكل شركة موجودة
-- أو إنشاء دالة لتحديث الصلاحيات للشركات الموجودة

-- رسالة تأكيد
DO $$
BEGIN
  RAISE NOTICE 'Fixed Assets permissions have been added successfully!';
  RAISE NOTICE 'All roles now have appropriate permissions for fixed assets.';
  RAISE NOTICE 'To apply to existing companies, run: SELECT copy_default_permissions_for_company(company_id);';
END $$;

