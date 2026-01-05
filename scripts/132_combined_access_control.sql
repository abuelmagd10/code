-- =============================================
-- إصلاح شامل: إضافة حقول التحكم بالوصول
-- =============================================
-- يجب تطبيق هذا السكريبت عبر Supabase Dashboard > SQL Editor
-- =============================================

-- 1️⃣ إضافة حقول التحكم بالوصول لجدول الموردين (suppliers)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 2️⃣ إضافة حقول التحكم بالوصول لجدول العملاء (customers)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 3️⃣ إنشاء indexes لتحسين الأداء - suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_created_by ON suppliers(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_branch ON suppliers(branch_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_cost_center ON suppliers(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_warehouse ON suppliers(warehouse_id);

-- 4️⃣ إنشاء indexes لتحسين الأداء - customers
CREATE INDEX IF NOT EXISTS idx_customers_created_by ON customers(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_branch ON customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_cost_center ON customers(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_customers_warehouse ON customers(warehouse_id);

-- 5️⃣ إضافة تعليقات توضيحية
COMMENT ON COLUMN suppliers.created_by_user_id IS 'المستخدم الذي أنشأ المورد - للتحكم بالوصول على مستوى الموظفين';
COMMENT ON COLUMN suppliers.branch_id IS 'الفرع المرتبط بالمورد - للتحكم بالوصول على مستوى الفروع';
COMMENT ON COLUMN suppliers.cost_center_id IS 'مركز التكلفة المرتبط بالمورد - للتحكم بالوصول على مستوى مراكز التكلفة';
COMMENT ON COLUMN suppliers.warehouse_id IS 'المستودع المرتبط بالمورد - للتحكم بالوصول على مستوى المستودعات';

COMMENT ON COLUMN customers.created_by_user_id IS 'المستخدم الذي أنشأ العميل - للتحكم بالوصول على مستوى الموظفين';
COMMENT ON COLUMN customers.branch_id IS 'الفرع المرتبط بالعميل - للتحكم بالوصول على مستوى الفروع';
COMMENT ON COLUMN customers.cost_center_id IS 'مركز التكلفة المرتبط بالعميل - للتحكم بالوصول على مستوى مراكز التكلفة';
COMMENT ON COLUMN customers.warehouse_id IS 'المستودع المرتبط بالعميل - للتحكم بالوصول على مستوى المستودعات';

-- ✅ تم الانتهاء من إضافة حقول التحكم بالوصول

