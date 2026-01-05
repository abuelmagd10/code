-- =============================================
-- إضافة حقول التحكم بالوصول لجدول الموردين
-- =============================================
-- هذا السكريبت يضيف الحقول اللازمة لنظام التحكم بالوصول
-- على مستوى الموظفين والفروع ومراكز التكلفة
-- =============================================

-- 1️⃣ إضافة حقل created_by_user_id
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2️⃣ إضافة حقل branch_id
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- 3️⃣ إضافة حقل cost_center_id
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

-- 4️⃣ إضافة حقل warehouse_id
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 5️⃣ إنشاء indexes لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_suppliers_created_by ON suppliers(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_branch ON suppliers(branch_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_cost_center ON suppliers(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_warehouse ON suppliers(warehouse_id);

-- 6️⃣ تحديث الموردين الموجودة لتعيين المنشئ (اختياري)
-- يمكن تشغيل هذا إذا كنت تريد تعيين جميع الموردين الحالية لمالك الشركة
-- UPDATE suppliers s
-- SET created_by_user_id = c.user_id
-- FROM companies c
-- WHERE s.company_id = c.id
-- AND s.created_by_user_id IS NULL;

COMMENT ON COLUMN suppliers.created_by_user_id IS 'المستخدم الذي أنشأ المورد - للتحكم بالوصول على مستوى الموظفين';
COMMENT ON COLUMN suppliers.branch_id IS 'الفرع المرتبط بالمورد - للتحكم بالوصول على مستوى الفروع';
COMMENT ON COLUMN suppliers.cost_center_id IS 'مركز التكلفة المرتبط بالمورد - للتحكم بالوصول على مستوى مراكز التكلفة';
COMMENT ON COLUMN suppliers.warehouse_id IS 'المستودع المرتبط بالمورد - للتحكم بالوصول على مستوى المستودعات';

