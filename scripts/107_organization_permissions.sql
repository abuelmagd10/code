-- =============================================
-- صلاحيات الهيكل التنظيمي وإدارة الصلاحيات
-- =============================================

-- === الهيكل التنظيمي (Organization) ===
INSERT INTO permissions (action, resource, category, title_ar, title_en, is_dangerous) VALUES
  -- الفروع
  ('branches:access', 'branches', 'organization', 'الوصول للفروع', 'Access Branches', FALSE),
  ('branches:read', 'branches', 'organization', 'عرض الفروع', 'View Branches', FALSE),
  ('branches:create', 'branches', 'organization', 'إنشاء فرع', 'Create Branch', FALSE),
  ('branches:update', 'branches', 'organization', 'تعديل فرع', 'Update Branch', FALSE),
  ('branches:delete', 'branches', 'organization', 'حذف فرع', 'Delete Branch', TRUE),

  -- مراكز التكلفة
  ('cost_centers:access', 'cost_centers', 'organization', 'الوصول لمراكز التكلفة', 'Access Cost Centers', FALSE),
  ('cost_centers:read', 'cost_centers', 'organization', 'عرض مراكز التكلفة', 'View Cost Centers', FALSE),
  ('cost_centers:create', 'cost_centers', 'organization', 'إنشاء مركز تكلفة', 'Create Cost Center', FALSE),
  ('cost_centers:update', 'cost_centers', 'organization', 'تعديل مركز تكلفة', 'Update Cost Center', FALSE),
  ('cost_centers:delete', 'cost_centers', 'organization', 'حذف مركز تكلفة', 'Delete Cost Center', TRUE),

  -- المستودعات
  ('warehouses:access', 'warehouses', 'organization', 'الوصول للمستودعات', 'Access Warehouses', FALSE),
  ('warehouses:read', 'warehouses', 'organization', 'عرض المستودعات', 'View Warehouses', FALSE),
  ('warehouses:create', 'warehouses', 'organization', 'إنشاء مستودع', 'Create Warehouse', FALSE),
  ('warehouses:update', 'warehouses', 'organization', 'تعديل مستودع', 'Update Warehouse', FALSE),
  ('warehouses:delete', 'warehouses', 'organization', 'حذف مستودع', 'Delete Warehouse', TRUE)
ON CONFLICT (action) DO NOTHING;

-- === إدارة الصلاحيات (Permissions) ===
INSERT INTO permissions (action, resource, category, title_ar, title_en, is_dangerous) VALUES
  -- مشاركة الصلاحيات
  ('permission_sharing:access', 'permission_sharing', 'permissions', 'الوصول لمشاركة الصلاحيات', 'Access Permission Sharing', FALSE),
  ('permission_sharing:read', 'permission_sharing', 'permissions', 'عرض الصلاحيات المشتركة', 'View Shared Permissions', FALSE),
  ('permission_sharing:create', 'permission_sharing', 'permissions', 'إنشاء مشاركة صلاحيات', 'Create Permission Share', FALSE),
  ('permission_sharing:update', 'permission_sharing', 'permissions', 'تعديل مشاركة صلاحيات', 'Update Permission Share', FALSE),
  ('permission_sharing:delete', 'permission_sharing', 'permissions', 'حذف مشاركة صلاحيات', 'Delete Permission Share', TRUE),

  -- نقل الصلاحيات
  ('permission_transfers:access', 'permission_transfers', 'permissions', 'الوصول لنقل الصلاحيات', 'Access Permission Transfers', FALSE),
  ('permission_transfers:read', 'permission_transfers', 'permissions', 'عرض نقل الصلاحيات', 'View Permission Transfers', FALSE),
  ('permission_transfers:create', 'permission_transfers', 'permissions', 'إنشاء نقل صلاحيات', 'Create Permission Transfer', TRUE),
  ('permission_transfers:update', 'permission_transfers', 'permissions', 'تعديل نقل صلاحيات', 'Update Permission Transfer', TRUE),

  -- وصول الفروع
  ('user_branch_access:access', 'user_branch_access', 'permissions', 'الوصول لإدارة وصول الفروع', 'Access Branch Access Management', FALSE),
  ('user_branch_access:read', 'user_branch_access', 'permissions', 'عرض وصول الفروع', 'View Branch Access', FALSE),
  ('user_branch_access:create', 'user_branch_access', 'permissions', 'إضافة وصول فرع', 'Create Branch Access', FALSE),
  ('user_branch_access:update', 'user_branch_access', 'permissions', 'تعديل وصول فرع', 'Update Branch Access', FALSE),
  ('user_branch_access:delete', 'user_branch_access', 'permissions', 'حذف وصول فرع', 'Delete Branch Access', TRUE),

  -- صلاحيات الأدوار
  ('role_permissions:access', 'role_permissions', 'permissions', 'الوصول لصلاحيات الأدوار', 'Access Role Permissions', FALSE),
  ('role_permissions:read', 'role_permissions', 'permissions', 'عرض صلاحيات الأدوار', 'View Role Permissions', FALSE),
  ('role_permissions:create', 'role_permissions', 'permissions', 'إنشاء صلاحية دور', 'Create Role Permission', TRUE),
  ('role_permissions:update', 'role_permissions', 'permissions', 'تعديل صلاحية دور', 'Update Role Permission', TRUE),
  ('role_permissions:delete', 'role_permissions', 'permissions', 'حذف صلاحية دور', 'Delete Role Permission', TRUE)
ON CONFLICT (action) DO NOTHING;

-- =============================================
-- الصلاحيات الافتراضية للأدوار الجديدة
-- =============================================

-- === Owner - المالك (كل الصلاحيات الجديدة) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'owner', action FROM permissions 
WHERE resource IN ('branches', 'cost_centers', 'warehouses', 'permission_sharing', 'permission_transfers', 'user_branch_access', 'role_permissions')
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Admin - المدير (كل الصلاحيات ما عدا الحذف) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'admin', action FROM permissions 
WHERE resource IN ('branches', 'cost_centers', 'warehouses', 'permission_sharing', 'permission_transfers', 'user_branch_access', 'role_permissions')
AND action NOT LIKE '%:delete'
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Manager - مدير (صلاحيات القراءة والوصول فقط) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'manager', action FROM permissions 
WHERE resource IN ('branches', 'cost_centers', 'warehouses', 'user_branch_access')
AND (action LIKE '%:access' OR action LIKE '%:read')
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Accountant - محاسب (قراءة الهيكل التنظيمي فقط) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'accountant', action FROM permissions 
WHERE resource IN ('branches', 'cost_centers')
AND (action LIKE '%:access' OR action LIKE '%:read')
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Store Manager - مدير مخزن (المستودعات + مراكز التكلفة) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'store_manager', action FROM permissions 
WHERE resource IN ('warehouses', 'cost_centers')
AND action NOT LIKE '%:delete'
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Staff - موظف (قراءة فقط) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'staff', action FROM permissions 
WHERE resource IN ('branches', 'warehouses')
AND (action LIKE '%:access' OR action LIKE '%:read')
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Viewer - مشاهد (قراءة فقط) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'viewer', action FROM permissions 
WHERE resource IN ('branches', 'cost_centers', 'warehouses')
AND (action LIKE '%:access' OR action LIKE '%:read')
ON CONFLICT (role_name, permission_action) DO NOTHING;

