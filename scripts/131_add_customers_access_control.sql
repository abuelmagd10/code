-- =============================================
-- إضافة حقول التحكم بالوصول لجدول العملاء
-- =============================================
-- هذا السكريبت يضيف الحقول اللازمة لنظام التحكم بالوصول
-- على مستوى الموظفين والفروع ومراكز التكلفة
-- =============================================

-- 1️⃣ إضافة حقل created_by_user_id
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2️⃣ إضافة حقل branch_id
ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- 3️⃣ إضافة حقل cost_center_id
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

-- 4️⃣ إضافة حقل warehouse_id
ALTER TABLE customers ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 5️⃣ إنشاء indexes لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_customers_created_by ON customers(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_branch ON customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_cost_center ON customers(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_customers_warehouse ON customers(warehouse_id);

-- 6️⃣ تحديث العملاء الموجودين لتعيين المنشئ (اختياري)
-- يمكن تشغيل هذا إذا كنت تريد تعيين جميع العملاء الحاليين لمالك الشركة
-- UPDATE customers c
-- SET created_by_user_id = co.user_id
-- FROM companies co
-- WHERE c.company_id = co.id
-- AND c.created_by_user_id IS NULL;

COMMENT ON COLUMN customers.created_by_user_id IS 'المستخدم الذي أنشأ العميل - للتحكم بالوصول على مستوى الموظفين';
COMMENT ON COLUMN customers.branch_id IS 'الفرع المرتبط بالعميل - للتحكم بالوصول على مستوى الفروع';
COMMENT ON COLUMN customers.cost_center_id IS 'مركز التكلفة المرتبط بالعميل - للتحكم بالوصول على مستوى مراكز التكلفة';
COMMENT ON COLUMN customers.warehouse_id IS 'المستودع المرتبط بالعميل - للتحكم بالوصول على مستوى المستودعات';

