-- =============================================
-- نظام الصلاحيات المحسن (Enhanced RBAC System)
-- =============================================
-- يوفر:
-- 1. جدول roles مركزي للأدوار
-- 2. جدول permissions مركزي للصلاحيات مع actions دقيقة
-- 3. جدول role_default_permissions للصلاحيات الافتراضية
-- 4. تحديث company_role_permissions لإضافة can_access (إخفاء من القائمة)
-- 5. صلاحيات افتراضية تُنسخ عند إنشاء شركة جديدة
-- =============================================

-- =====================================
-- 1. جدول الأدوار المركزي
-- =====================================
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  priority INTEGER NOT NULL DEFAULT 100, -- ترتيب الأهمية (owner=1, admin=2, ...)
  is_system BOOLEAN DEFAULT TRUE, -- أدوار النظام لا يمكن حذفها
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- إدراج الأدوار الافتراضية
INSERT INTO roles (name, title_ar, title_en, priority, is_system) VALUES
  ('owner', 'المالك', 'Owner', 1, TRUE),
  ('admin', 'المدير', 'Admin', 2, TRUE),
  ('manager', 'مدير', 'Manager', 3, TRUE),
  ('accountant', 'محاسب', 'Accountant', 4, TRUE),
  ('store_manager', 'مدير مخزن', 'Store Manager', 5, TRUE),
  ('staff', 'موظف', 'Staff', 6, TRUE),
  ('viewer', 'عارض', 'Viewer', 7, TRUE)
ON CONFLICT (name) DO NOTHING;

-- =====================================
-- 2. جدول الصلاحيات المركزي
-- =====================================
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL UNIQUE, -- مثال: invoices:read, invoices:partial_return
  resource TEXT NOT NULL, -- المورد الرئيسي
  category TEXT NOT NULL, -- التصنيف (sales, purchases, inventory, accounting, hr, settings)
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  is_dangerous BOOLEAN DEFAULT FALSE, -- عمليات حساسة تحتاج تأكيد إضافي
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================
-- 3. جدول الصلاحيات الافتراضية للأدوار
-- =====================================
CREATE TABLE IF NOT EXISTS role_default_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name TEXT NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
  permission_action TEXT NOT NULL REFERENCES permissions(action) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_name, permission_action)
);

-- =====================================
-- 4. تحديث جدول company_role_permissions
-- =====================================
-- إضافة حقل can_access لإخفاء الصفحة من القائمة الجانبية
ALTER TABLE company_role_permissions 
  ADD COLUMN IF NOT EXISTS can_access BOOLEAN DEFAULT TRUE;

-- إضافة حقل لتخزين صلاحيات مفصلة (actions)
ALTER TABLE company_role_permissions 
  ADD COLUMN IF NOT EXISTS allowed_actions TEXT[] DEFAULT '{}';

-- تحديث constraint للأدوار ليشمل جميع الأدوار
ALTER TABLE company_role_permissions 
  DROP CONSTRAINT IF EXISTS company_role_permissions_role_check;

-- إضافة constraint جديد
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_role_permissions_role_check_v2'
  ) THEN
    ALTER TABLE company_role_permissions 
      ADD CONSTRAINT company_role_permissions_role_check_v2 
      CHECK (role IN ('owner','admin','manager','accountant','store_manager','staff','viewer'));
  END IF;
END $$;

-- =====================================
-- 5. إنشاء فهارس للأداء
-- =====================================
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);
CREATE INDEX IF NOT EXISTS idx_permissions_action ON permissions(action);
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);
CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category);
CREATE INDEX IF NOT EXISTS idx_role_default_permissions_role ON role_default_permissions(role_name);
CREATE INDEX IF NOT EXISTS idx_company_role_permissions_access ON company_role_permissions(company_id, role, can_access);

-- =====================================
-- 6. RLS Policies
-- =====================================
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_default_permissions ENABLE ROW LEVEL SECURITY;

-- السماح للجميع بقراءة الأدوار والصلاحيات (بيانات عامة)
DROP POLICY IF EXISTS roles_select_all ON roles;
CREATE POLICY roles_select_all ON roles FOR SELECT USING (true);

DROP POLICY IF EXISTS permissions_select_all ON permissions;
CREATE POLICY permissions_select_all ON permissions FOR SELECT USING (true);

DROP POLICY IF EXISTS role_default_permissions_select_all ON role_default_permissions;
CREATE POLICY role_default_permissions_select_all ON role_default_permissions FOR SELECT USING (true);

-- فقط owner/admin يمكنهم تعديل الأدوار والصلاحيات
DROP POLICY IF EXISTS roles_modify_admin ON roles;
CREATE POLICY roles_modify_admin ON roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS permissions_modify_admin ON permissions;
CREATE POLICY permissions_modify_admin ON permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
    )
  );

-- =============================================
-- 7. إدراج جميع الصلاحيات المتاحة في التطبيق
-- =============================================

-- === المبيعات (Sales) ===
INSERT INTO permissions (action, resource, category, title_ar, title_en, is_dangerous) VALUES
  -- العملاء
  ('customers:access', 'customers', 'sales', 'الوصول للعملاء', 'Access Customers', FALSE),
  ('customers:read', 'customers', 'sales', 'عرض العملاء', 'View Customers', FALSE),
  ('customers:create', 'customers', 'sales', 'إضافة عميل', 'Create Customer', FALSE),
  ('customers:update', 'customers', 'sales', 'تعديل عميل', 'Update Customer', FALSE),
  ('customers:delete', 'customers', 'sales', 'حذف عميل', 'Delete Customer', TRUE),
  ('customers:credit_refund', 'customers', 'sales', 'صرف رصيد دائن للعميل', 'Refund Customer Credit', TRUE),

  -- أوامر البيع
  ('sales_orders:access', 'sales_orders', 'sales', 'الوصول لأوامر البيع', 'Access Sales Orders', FALSE),
  ('sales_orders:read', 'sales_orders', 'sales', 'عرض أوامر البيع', 'View Sales Orders', FALSE),
  ('sales_orders:create', 'sales_orders', 'sales', 'إنشاء أمر بيع', 'Create Sales Order', FALSE),
  ('sales_orders:update', 'sales_orders', 'sales', 'تعديل أمر بيع', 'Update Sales Order', FALSE),
  ('sales_orders:delete', 'sales_orders', 'sales', 'حذف أمر بيع', 'Delete Sales Order', TRUE),
  ('sales_orders:convert_to_invoice', 'sales_orders', 'sales', 'تحويل لفاتورة', 'Convert to Invoice', FALSE),

  -- فواتير المبيعات
  ('invoices:access', 'invoices', 'sales', 'الوصول للفواتير', 'Access Invoices', FALSE),
  ('invoices:read', 'invoices', 'sales', 'عرض الفواتير', 'View Invoices', FALSE),
  ('invoices:create', 'invoices', 'sales', 'إنشاء فاتورة', 'Create Invoice', FALSE),
  ('invoices:update', 'invoices', 'sales', 'تعديل فاتورة', 'Update Invoice', FALSE),
  ('invoices:delete', 'invoices', 'sales', 'حذف فاتورة', 'Delete Invoice', TRUE),
  ('invoices:send', 'invoices', 'sales', 'إرسال فاتورة', 'Send Invoice', FALSE),
  ('invoices:cancel', 'invoices', 'sales', 'إلغاء فاتورة', 'Cancel Invoice', TRUE),
  ('invoices:void', 'invoices', 'sales', 'إبطال فاتورة', 'Void Invoice', TRUE),
  ('invoices:record_payment', 'invoices', 'sales', 'تسجيل دفعة', 'Record Payment', FALSE),
  ('invoices:partial_return', 'invoices', 'sales', 'مرتجع جزئي', 'Partial Return', TRUE),
  ('invoices:full_return', 'invoices', 'sales', 'مرتجع كامل', 'Full Return', TRUE),
  ('invoices:reverse_return', 'invoices', 'sales', 'عكس المرتجع', 'Reverse Return', TRUE),
  ('invoices:issue_credit_note', 'invoices', 'sales', 'إصدار مذكرة دائن', 'Issue Credit Note', TRUE),
  ('invoices:print', 'invoices', 'sales', 'طباعة فاتورة', 'Print Invoice', FALSE),
  ('invoices:download_pdf', 'invoices', 'sales', 'تنزيل PDF', 'Download PDF', FALSE),

  -- مرتجعات المبيعات
  ('sales_returns:access', 'sales_returns', 'sales', 'الوصول لمرتجعات المبيعات', 'Access Sales Returns', FALSE),
  ('sales_returns:read', 'sales_returns', 'sales', 'عرض مرتجعات المبيعات', 'View Sales Returns', FALSE),
  ('sales_returns:create', 'sales_returns', 'sales', 'إنشاء مرتجع مبيعات', 'Create Sales Return', FALSE),
  ('sales_returns:update', 'sales_returns', 'sales', 'تعديل مرتجع مبيعات', 'Update Sales Return', FALSE),
  ('sales_returns:delete', 'sales_returns', 'sales', 'حذف مرتجع مبيعات', 'Delete Sales Return', TRUE)
ON CONFLICT (action) DO NOTHING;

-- === المشتريات (Purchases) ===
INSERT INTO permissions (action, resource, category, title_ar, title_en, is_dangerous) VALUES
  -- الموردين
  ('suppliers:access', 'suppliers', 'purchases', 'الوصول للموردين', 'Access Suppliers', FALSE),
  ('suppliers:read', 'suppliers', 'purchases', 'عرض الموردين', 'View Suppliers', FALSE),
  ('suppliers:create', 'suppliers', 'purchases', 'إضافة مورد', 'Create Supplier', FALSE),
  ('suppliers:update', 'suppliers', 'purchases', 'تعديل مورد', 'Update Supplier', FALSE),
  ('suppliers:delete', 'suppliers', 'purchases', 'حذف مورد', 'Delete Supplier', TRUE),

  -- أوامر الشراء
  ('purchase_orders:access', 'purchase_orders', 'purchases', 'الوصول لأوامر الشراء', 'Access Purchase Orders', FALSE),
  ('purchase_orders:read', 'purchase_orders', 'purchases', 'عرض أوامر الشراء', 'View Purchase Orders', FALSE),
  ('purchase_orders:create', 'purchase_orders', 'purchases', 'إنشاء أمر شراء', 'Create Purchase Order', FALSE),
  ('purchase_orders:update', 'purchase_orders', 'purchases', 'تعديل أمر شراء', 'Update Purchase Order', FALSE),
  ('purchase_orders:delete', 'purchase_orders', 'purchases', 'حذف أمر شراء', 'Delete Purchase Order', TRUE),
  ('purchase_orders:send', 'purchase_orders', 'purchases', 'إرسال أمر شراء', 'Send Purchase Order', FALSE),
  ('purchase_orders:convert_to_bill', 'purchase_orders', 'purchases', 'تحويل لفاتورة شراء', 'Convert to Bill', FALSE),

  -- فواتير المشتريات
  ('bills:access', 'bills', 'purchases', 'الوصول لفواتير الشراء', 'Access Bills', FALSE),
  ('bills:read', 'bills', 'purchases', 'عرض فواتير الشراء', 'View Bills', FALSE),
  ('bills:create', 'bills', 'purchases', 'إنشاء فاتورة شراء', 'Create Bill', FALSE),
  ('bills:update', 'bills', 'purchases', 'تعديل فاتورة شراء', 'Update Bill', FALSE),
  ('bills:delete', 'bills', 'purchases', 'حذف فاتورة شراء', 'Delete Bill', TRUE),
  ('bills:send', 'bills', 'purchases', 'إرسال فاتورة شراء', 'Send Bill', FALSE),
  ('bills:cancel', 'bills', 'purchases', 'إلغاء فاتورة شراء', 'Cancel Bill', TRUE),
  ('bills:void', 'bills', 'purchases', 'إبطال فاتورة شراء', 'Void Bill', TRUE),
  ('bills:record_payment', 'bills', 'purchases', 'تسجيل دفعة للمورد', 'Record Supplier Payment', FALSE),
  ('bills:partial_return', 'bills', 'purchases', 'مرتجع جزئي مشتريات', 'Partial Purchase Return', TRUE),
  ('bills:full_return', 'bills', 'purchases', 'مرتجع كامل مشتريات', 'Full Purchase Return', TRUE),
  ('bills:reverse_return', 'bills', 'purchases', 'عكس مرتجع المشتريات', 'Reverse Purchase Return', TRUE),

  -- إشعارات دائن الموردين
  ('vendor_credits:access', 'vendor_credits', 'purchases', 'الوصول لإشعارات الموردين', 'Access Vendor Credits', FALSE),
  ('vendor_credits:read', 'vendor_credits', 'purchases', 'عرض إشعارات الموردين', 'View Vendor Credits', FALSE),
  ('vendor_credits:create', 'vendor_credits', 'purchases', 'إنشاء إشعار دائن', 'Create Vendor Credit', FALSE),
  ('vendor_credits:update', 'vendor_credits', 'purchases', 'تعديل إشعار دائن', 'Update Vendor Credit', FALSE),
  ('vendor_credits:delete', 'vendor_credits', 'purchases', 'حذف إشعار دائن', 'Delete Vendor Credit', TRUE),
  ('vendor_credits:apply', 'vendor_credits', 'purchases', 'تطبيق إشعار دائن', 'Apply Vendor Credit', FALSE)
ON CONFLICT (action) DO NOTHING;

-- === المخزون (Inventory) ===
INSERT INTO permissions (action, resource, category, title_ar, title_en, is_dangerous) VALUES
  -- المنتجات
  ('products:access', 'products', 'inventory', 'الوصول للمنتجات', 'Access Products', FALSE),
  ('products:read', 'products', 'inventory', 'عرض المنتجات', 'View Products', FALSE),
  ('products:create', 'products', 'inventory', 'إضافة منتج', 'Create Product', FALSE),
  ('products:update', 'products', 'inventory', 'تعديل منتج', 'Update Product', FALSE),
  ('products:delete', 'products', 'inventory', 'حذف منتج', 'Delete Product', TRUE),

  -- المخزون
  ('inventory:access', 'inventory', 'inventory', 'الوصول للمخزون', 'Access Inventory', FALSE),
  ('inventory:read', 'inventory', 'inventory', 'عرض المخزون', 'View Inventory', FALSE),
  ('inventory:adjust', 'inventory', 'inventory', 'تسوية المخزون', 'Adjust Inventory', TRUE),
  ('inventory:transfer', 'inventory', 'inventory', 'نقل المخزون', 'Transfer Inventory', FALSE),
  ('inventory:reconcile', 'inventory', 'inventory', 'مطابقة المخزون', 'Reconcile Inventory', TRUE),
  ('inventory:count', 'inventory', 'inventory', 'جرد المخزون', 'Count Inventory', FALSE)
ON CONFLICT (action) DO NOTHING;

-- === المحاسبة (Accounting) ===
INSERT INTO permissions (action, resource, category, title_ar, title_en, is_dangerous) VALUES
  -- المدفوعات
  ('payments:access', 'payments', 'accounting', 'الوصول للمدفوعات', 'Access Payments', FALSE),
  ('payments:read', 'payments', 'accounting', 'عرض المدفوعات', 'View Payments', FALSE),
  ('payments:create', 'payments', 'accounting', 'إنشاء دفعة', 'Create Payment', FALSE),
  ('payments:update', 'payments', 'accounting', 'تعديل دفعة', 'Update Payment', FALSE),
  ('payments:delete', 'payments', 'accounting', 'حذف دفعة', 'Delete Payment', TRUE),
  ('payments:link_invoice', 'payments', 'accounting', 'ربط بفاتورة', 'Link to Invoice', FALSE),
  ('payments:link_bill', 'payments', 'accounting', 'ربط بفاتورة شراء', 'Link to Bill', FALSE),

  -- القيود اليومية
  ('journal_entries:access', 'journal_entries', 'accounting', 'الوصول للقيود', 'Access Journal Entries', FALSE),
  ('journal_entries:read', 'journal_entries', 'accounting', 'عرض القيود', 'View Journal Entries', FALSE),
  ('journal_entries:create', 'journal_entries', 'accounting', 'إنشاء قيد', 'Create Journal Entry', FALSE),
  ('journal_entries:update', 'journal_entries', 'accounting', 'تعديل قيد', 'Update Journal Entry', FALSE),
  ('journal_entries:delete', 'journal_entries', 'accounting', 'حذف قيد', 'Delete Journal Entry', TRUE),
  ('journal_entries:post', 'journal_entries', 'accounting', 'ترحيل قيد', 'Post Journal Entry', FALSE),
  ('journal_entries:unpost', 'journal_entries', 'accounting', 'إلغاء ترحيل', 'Unpost Journal Entry', TRUE),

  -- دليل الحسابات
  ('chart_of_accounts:access', 'chart_of_accounts', 'accounting', 'الوصول لدليل الحسابات', 'Access Chart of Accounts', FALSE),
  ('chart_of_accounts:read', 'chart_of_accounts', 'accounting', 'عرض دليل الحسابات', 'View Chart of Accounts', FALSE),
  ('chart_of_accounts:create', 'chart_of_accounts', 'accounting', 'إضافة حساب', 'Create Account', FALSE),
  ('chart_of_accounts:update', 'chart_of_accounts', 'accounting', 'تعديل حساب', 'Update Account', FALSE),
  ('chart_of_accounts:delete', 'chart_of_accounts', 'accounting', 'حذف حساب', 'Delete Account', TRUE),

  -- البنوك
  ('banking:access', 'banking', 'accounting', 'الوصول للبنوك', 'Access Banking', FALSE),
  ('banking:read', 'banking', 'accounting', 'عرض البنوك', 'View Banking', FALSE),
  ('banking:create', 'banking', 'accounting', 'إضافة حساب بنكي', 'Create Bank Account', FALSE),
  ('banking:reconcile', 'banking', 'accounting', 'مطابقة بنكية', 'Bank Reconciliation', TRUE),

  -- الضرائب
  ('taxes:access', 'taxes', 'accounting', 'الوصول للضرائب', 'Access Taxes', FALSE),
  ('taxes:read', 'taxes', 'accounting', 'عرض الضرائب', 'View Taxes', FALSE),
  ('taxes:create', 'taxes', 'accounting', 'إضافة ضريبة', 'Create Tax', FALSE),
  ('taxes:update', 'taxes', 'accounting', 'تعديل ضريبة', 'Update Tax', FALSE),
  ('taxes:delete', 'taxes', 'accounting', 'حذف ضريبة', 'Delete Tax', TRUE),

  -- المساهمين
  ('shareholders:access', 'shareholders', 'accounting', 'الوصول للمساهمين', 'Access Shareholders', FALSE),
  ('shareholders:read', 'shareholders', 'accounting', 'عرض المساهمين', 'View Shareholders', FALSE),
  ('shareholders:create', 'shareholders', 'accounting', 'إضافة مساهم', 'Create Shareholder', FALSE),
  ('shareholders:update', 'shareholders', 'accounting', 'تعديل مساهم', 'Update Shareholder', FALSE),
  ('shareholders:delete', 'shareholders', 'accounting', 'حذف مساهم', 'Delete Shareholder', TRUE),

  -- التقارير
  ('reports:access', 'reports', 'accounting', 'الوصول للتقارير', 'Access Reports', FALSE),
  ('reports:read', 'reports', 'accounting', 'عرض التقارير', 'View Reports', FALSE),
  ('reports:income_statement', 'reports', 'accounting', 'قائمة الدخل', 'Income Statement', FALSE),
  ('reports:balance_sheet', 'reports', 'accounting', 'الميزانية العمومية', 'Balance Sheet', FALSE),
  ('reports:cash_flow', 'reports', 'accounting', 'التدفقات النقدية', 'Cash Flow', FALSE),
  ('reports:trial_balance', 'reports', 'accounting', 'ميزان المراجعة', 'Trial Balance', FALSE),
  ('reports:aging_ar', 'reports', 'accounting', 'أعمار الذمم المدينة', 'AR Aging', FALSE),
  ('reports:aging_ap', 'reports', 'accounting', 'أعمار الذمم الدائنة', 'AP Aging', FALSE),
  ('reports:vat', 'reports', 'accounting', 'تقارير الضريبة', 'VAT Reports', FALSE),
  ('reports:inventory_valuation', 'reports', 'accounting', 'تقييم المخزون', 'Inventory Valuation', FALSE),
  ('reports:inventory_audit', 'reports', 'accounting', 'تدقيق المخزون', 'Inventory Audit', FALSE),
  ('reports:fx_gains_losses', 'reports', 'accounting', 'أرباح/خسائر العملات', 'FX Gains/Losses', FALSE),
  ('reports:sales', 'reports', 'accounting', 'تقارير المبيعات', 'Sales Reports', FALSE),
  ('reports:purchases', 'reports', 'accounting', 'تقارير المشتريات', 'Purchases Reports', FALSE)
ON CONFLICT (action) DO NOTHING;

-- === الموارد البشرية (HR) ===
INSERT INTO permissions (action, resource, category, title_ar, title_en, is_dangerous) VALUES
  -- الموظفين
  ('employees:access', 'employees', 'hr', 'الوصول للموظفين', 'Access Employees', FALSE),
  ('employees:read', 'employees', 'hr', 'عرض الموظفين', 'View Employees', FALSE),
  ('employees:create', 'employees', 'hr', 'إضافة موظف', 'Create Employee', FALSE),
  ('employees:update', 'employees', 'hr', 'تعديل موظف', 'Update Employee', FALSE),
  ('employees:delete', 'employees', 'hr', 'حذف موظف', 'Delete Employee', TRUE),

  -- الحضور
  ('attendance:access', 'attendance', 'hr', 'الوصول للحضور', 'Access Attendance', FALSE),
  ('attendance:read', 'attendance', 'hr', 'عرض الحضور', 'View Attendance', FALSE),
  ('attendance:create', 'attendance', 'hr', 'تسجيل حضور', 'Record Attendance', FALSE),
  ('attendance:update', 'attendance', 'hr', 'تعديل حضور', 'Update Attendance', FALSE),

  -- الرواتب
  ('payroll:access', 'payroll', 'hr', 'الوصول للرواتب', 'Access Payroll', FALSE),
  ('payroll:read', 'payroll', 'hr', 'عرض الرواتب', 'View Payroll', FALSE),
  ('payroll:create', 'payroll', 'hr', 'إنشاء مسير رواتب', 'Create Payroll', FALSE),
  ('payroll:process', 'payroll', 'hr', 'معالجة الرواتب', 'Process Payroll', TRUE),
  ('payroll:approve', 'payroll', 'hr', 'اعتماد الرواتب', 'Approve Payroll', TRUE)
ON CONFLICT (action) DO NOTHING;

-- === الإعدادات (Settings) ===
INSERT INTO permissions (action, resource, category, title_ar, title_en, is_dangerous) VALUES
  -- لوحة التحكم
  ('dashboard:access', 'dashboard', 'settings', 'الوصول للوحة التحكم', 'Access Dashboard', FALSE),
  ('dashboard:read', 'dashboard', 'settings', 'عرض لوحة التحكم', 'View Dashboard', FALSE),

  -- عروض الأسعار
  ('estimates:access', 'estimates', 'sales', 'الوصول لعروض الأسعار', 'Access Estimates', FALSE),
  ('estimates:read', 'estimates', 'sales', 'عرض عروض الأسعار', 'View Estimates', FALSE),
  ('estimates:create', 'estimates', 'sales', 'إنشاء عرض سعر', 'Create Estimate', FALSE),
  ('estimates:update', 'estimates', 'sales', 'تعديل عرض سعر', 'Update Estimate', FALSE),
  ('estimates:delete', 'estimates', 'sales', 'حذف عرض سعر', 'Delete Estimate', TRUE),
  ('estimates:send', 'estimates', 'sales', 'إرسال عرض سعر', 'Send Estimate', FALSE),
  ('estimates:convert_to_invoice', 'estimates', 'sales', 'تحويل لفاتورة', 'Convert to Invoice', FALSE),

  -- إدارة المستخدمين
  ('users:access', 'users', 'settings', 'الوصول للمستخدمين', 'Access Users', FALSE),
  ('users:read', 'users', 'settings', 'عرض المستخدمين', 'View Users', FALSE),
  ('users:invite', 'users', 'settings', 'دعوة مستخدم', 'Invite User', FALSE),
  ('users:update_role', 'users', 'settings', 'تغيير دور المستخدم', 'Update User Role', TRUE),
  ('users:delete', 'users', 'settings', 'حذف مستخدم', 'Delete User', TRUE),
  ('users:manage_permissions', 'users', 'settings', 'إدارة الصلاحيات', 'Manage Permissions', TRUE),

  -- أسعار الصرف
  ('exchange_rates:access', 'exchange_rates', 'settings', 'الوصول لأسعار الصرف', 'Access Exchange Rates', FALSE),
  ('exchange_rates:read', 'exchange_rates', 'settings', 'عرض أسعار الصرف', 'View Exchange Rates', FALSE),
  ('exchange_rates:create', 'exchange_rates', 'settings', 'إضافة سعر صرف', 'Create Exchange Rate', FALSE),
  ('exchange_rates:update', 'exchange_rates', 'settings', 'تعديل سعر صرف', 'Update Exchange Rate', FALSE),

  -- الصيانة
  ('maintenance:access', 'maintenance', 'settings', 'الوصول للصيانة', 'Access Maintenance', FALSE),
  ('maintenance:read', 'maintenance', 'settings', 'عرض الصيانة', 'View Maintenance', FALSE),
  ('maintenance:execute', 'maintenance', 'settings', 'تنفيذ عمليات الصيانة', 'Execute Maintenance', TRUE),

  -- سجل التدقيق
  ('audit_log:access', 'audit_log', 'settings', 'الوصول لسجل التدقيق', 'Access Audit Log', FALSE),
  ('audit_log:read', 'audit_log', 'settings', 'عرض سجل التدقيق', 'View Audit Log', FALSE),

  -- إعدادات الشركة
  ('company_settings:access', 'company_settings', 'settings', 'الوصول لإعدادات الشركة', 'Access Company Settings', FALSE),
  ('company_settings:read', 'company_settings', 'settings', 'عرض إعدادات الشركة', 'View Company Settings', FALSE),
  ('company_settings:update', 'company_settings', 'settings', 'تعديل إعدادات الشركة', 'Update Company Settings', TRUE)
ON CONFLICT (action) DO NOTHING;

-- =============================================
-- 8. الصلاحيات الافتراضية لكل دور
-- =============================================

-- === Owner - المالك (كل الصلاحيات) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'owner', action FROM permissions
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Admin - المدير (كل الصلاحيات ما عدا حذف الشركة) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'admin', action FROM permissions
WHERE action NOT IN ('company_settings:delete')
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Manager - مدير (معظم الصلاحيات ما عدا الإعدادات الحساسة) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'manager', action FROM permissions
WHERE action NOT LIKE 'users:%'
  AND action NOT LIKE 'company_settings:%'
  AND action NOT LIKE 'maintenance:%'
  AND action NOT LIKE 'audit_log:%'
  AND action NOT IN ('payroll:approve', 'banking:reconcile')
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Accountant - محاسب (صلاحيات مالية ومحاسبية) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'accountant', action FROM permissions
WHERE (
  category IN ('accounting', 'sales', 'purchases')
  OR action LIKE 'dashboard:%'
  OR action LIKE 'products:read'
  OR action LIKE 'products:access'
  OR action LIKE 'inventory:read'
  OR action LIKE 'inventory:access'
  OR action LIKE 'customers:read'
  OR action LIKE 'customers:access'
  OR action LIKE 'suppliers:read'
  OR action LIKE 'suppliers:access'
)
AND action NOT LIKE '%:delete'
AND action NOT LIKE 'users:%'
AND action NOT LIKE 'company_settings:%'
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Store Manager - مدير مخزن (صلاحيات المخزون والمنتجات) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'store_manager', action FROM permissions
WHERE (
  category = 'inventory'
  OR action LIKE 'dashboard:%'
  OR action LIKE 'products:%'
  OR action LIKE 'suppliers:read'
  OR action LIKE 'suppliers:access'
  OR action LIKE 'purchase_orders:%'
  OR action LIKE 'bills:read'
  OR action LIKE 'bills:access'
)
AND action NOT LIKE 'users:%'
AND action NOT LIKE 'company_settings:%'
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Staff - موظف (صلاحيات أساسية للعمل اليومي) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'staff', action FROM permissions
WHERE action IN (
  -- لوحة التحكم
  'dashboard:access', 'dashboard:read',
  -- العملاء
  'customers:access', 'customers:read', 'customers:create', 'customers:update',
  -- أوامر البيع
  'sales_orders:access', 'sales_orders:read', 'sales_orders:create', 'sales_orders:update',
  -- الفواتير
  'invoices:access', 'invoices:read', 'invoices:create', 'invoices:update', 'invoices:send', 'invoices:print', 'invoices:download_pdf',
  -- المنتجات
  'products:access', 'products:read',
  -- المخزون
  'inventory:access', 'inventory:read',
  -- عروض الأسعار
  'estimates:access', 'estimates:read', 'estimates:create', 'estimates:update', 'estimates:send'
)
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- === Viewer - عارض (قراءة فقط) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'viewer', action FROM permissions
WHERE action LIKE '%:read' OR action LIKE '%:access'
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- =============================================
-- 9. دالة نسخ الصلاحيات الافتراضية للشركة الجديدة
-- =============================================
CREATE OR REPLACE FUNCTION copy_default_permissions_for_company(p_company_id UUID)
RETURNS void AS $$
DECLARE
  v_role TEXT;
  v_resource TEXT;
  v_actions TEXT[];
  v_can_read BOOLEAN;
  v_can_write BOOLEAN;
  v_can_update BOOLEAN;
  v_can_delete BOOLEAN;
  v_all_access BOOLEAN;
  v_can_access BOOLEAN;
BEGIN
  -- لكل دور
  FOR v_role IN SELECT name FROM roles LOOP
    -- لكل مورد فريد
    FOR v_resource IN
      SELECT DISTINCT p.resource
      FROM permissions p
      JOIN role_default_permissions rdp ON rdp.permission_action = p.action
      WHERE rdp.role_name = v_role
    LOOP
      -- جمع الـ actions لهذا المورد
      SELECT ARRAY_AGG(p.action)
      INTO v_actions
      FROM permissions p
      JOIN role_default_permissions rdp ON rdp.permission_action = p.action
      WHERE rdp.role_name = v_role AND p.resource = v_resource;

      -- تحديد الصلاحيات الأساسية
      v_can_access := EXISTS (
        SELECT 1 FROM role_default_permissions rdp
        JOIN permissions p ON p.action = rdp.permission_action
        WHERE rdp.role_name = v_role AND p.resource = v_resource AND p.action LIKE '%:access'
      );

      v_can_read := EXISTS (
        SELECT 1 FROM role_default_permissions rdp
        JOIN permissions p ON p.action = rdp.permission_action
        WHERE rdp.role_name = v_role AND p.resource = v_resource AND p.action LIKE '%:read'
      );

      v_can_write := EXISTS (
        SELECT 1 FROM role_default_permissions rdp
        JOIN permissions p ON p.action = rdp.permission_action
        WHERE rdp.role_name = v_role AND p.resource = v_resource AND p.action LIKE '%:create'
      );

      v_can_update := EXISTS (
        SELECT 1 FROM role_default_permissions rdp
        JOIN permissions p ON p.action = rdp.permission_action
        WHERE rdp.role_name = v_role AND p.resource = v_resource AND p.action LIKE '%:update'
      );

      v_can_delete := EXISTS (
        SELECT 1 FROM role_default_permissions rdp
        JOIN permissions p ON p.action = rdp.permission_action
        WHERE rdp.role_name = v_role AND p.resource = v_resource AND p.action LIKE '%:delete'
      );

      -- owner و admin لديهم كل الصلاحيات
      v_all_access := v_role IN ('owner', 'admin');

      -- إدراج أو تحديث الصلاحية
      INSERT INTO company_role_permissions (
        company_id, role, resource,
        can_read, can_write, can_update, can_delete, all_access, can_access,
        allowed_actions
      ) VALUES (
        p_company_id, v_role, v_resource,
        v_can_read, v_can_write, v_can_update, v_can_delete, v_all_access, v_can_access,
        v_actions
      )
      ON CONFLICT (company_id, role, resource) DO UPDATE SET
        can_read = EXCLUDED.can_read,
        can_write = EXCLUDED.can_write,
        can_update = EXCLUDED.can_update,
        can_delete = EXCLUDED.can_delete,
        all_access = EXCLUDED.all_access,
        can_access = EXCLUDED.can_access,
        allowed_actions = EXCLUDED.allowed_actions;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 10. Trigger لنسخ الصلاحيات عند إنشاء شركة جديدة
-- =============================================
CREATE OR REPLACE FUNCTION trigger_copy_permissions_on_company_create()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM copy_default_permissions_for_company(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_copy_permissions_on_company_create ON companies;
CREATE TRIGGER trg_copy_permissions_on_company_create
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION trigger_copy_permissions_on_company_create();

-- =============================================
-- 11. دالة للتحقق من صلاحية معينة
-- =============================================
CREATE OR REPLACE FUNCTION check_permission(
  p_user_id UUID,
  p_company_id UUID,
  p_action TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
  v_resource TEXT;
  v_has_permission BOOLEAN := FALSE;
BEGIN
  -- الحصول على دور المستخدم في الشركة
  SELECT role INTO v_role
  FROM company_members
  WHERE user_id = p_user_id AND company_id = p_company_id;

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- owner و admin لديهم كل الصلاحيات
  IF v_role IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

  -- استخراج المورد من الـ action
  v_resource := split_part(p_action, ':', 1);

  -- التحقق من الصلاحية
  SELECT EXISTS (
    SELECT 1 FROM company_role_permissions crp
    WHERE crp.company_id = p_company_id
      AND crp.role = v_role
      AND crp.resource = v_resource
      AND (
        crp.all_access = TRUE
        OR p_action = ANY(crp.allowed_actions)
        OR (p_action LIKE '%:read' AND crp.can_read = TRUE)
        OR (p_action LIKE '%:create' AND crp.can_write = TRUE)
        OR (p_action LIKE '%:update' AND crp.can_update = TRUE)
        OR (p_action LIKE '%:delete' AND crp.can_delete = TRUE)
      )
  ) INTO v_has_permission;

  RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 12. دالة للتحقق من إمكانية الوصول للصفحة
-- =============================================
CREATE OR REPLACE FUNCTION check_page_access(
  p_user_id UUID,
  p_company_id UUID,
  p_resource TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
  v_can_access BOOLEAN := FALSE;
BEGIN
  -- الحصول على دور المستخدم
  SELECT role INTO v_role
  FROM company_members
  WHERE user_id = p_user_id AND company_id = p_company_id;

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- owner و admin لديهم وصول لكل الصفحات
  IF v_role IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

  -- التحقق من can_access
  SELECT COALESCE(crp.can_access, TRUE) INTO v_can_access
  FROM company_role_permissions crp
  WHERE crp.company_id = p_company_id
    AND crp.role = v_role
    AND crp.resource = p_resource;

  -- إذا لم يوجد سجل، نفترض أن الوصول مسموح
  RETURN COALESCE(v_can_access, TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 13. نسخ الصلاحيات للشركات الموجودة
-- =============================================
DO $$
DECLARE
  v_company_id UUID;
BEGIN
  FOR v_company_id IN SELECT id FROM companies LOOP
    PERFORM copy_default_permissions_for_company(v_company_id);
  END LOOP;
END $$;

-- =============================================
-- ✅ تم إنشاء نظام الصلاحيات المحسن بنجاح
-- =============================================

