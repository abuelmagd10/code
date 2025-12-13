-- =============================================
-- إضافة حقل created_by_user_id لجدول العملاء
-- لربط كل عميل بالموظف الذي أنشأه
-- =============================================

-- 1. إضافة حقل created_by_user_id لجدول العملاء
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. إنشاء فهرس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_customers_created_by_user_id ON customers(created_by_user_id);

-- 3. فهرس مركب للبحث بـ company_id + created_by_user_id
CREATE INDEX IF NOT EXISTS idx_customers_company_user ON customers(company_id, created_by_user_id);

-- 4. تحديث العملاء الحاليين لربطهم بمالك الشركة (اختياري)
-- هذا يضمن أن العملاء الموجودين مسبقاً يُنسبون لمالك الشركة
UPDATE customers c
SET created_by_user_id = comp.user_id
FROM companies comp
WHERE c.company_id = comp.id
AND c.created_by_user_id IS NULL;

-- 5. إضافة comment توضيحي
COMMENT ON COLUMN customers.created_by_user_id IS 'معرف المستخدم الذي أنشأ هذا العميل - يستخدم لعرض العملاء حسب الموظف';

-- =============================================
-- سياسة جديدة لجدول العملاء (اختياري)
-- تمنع الموظفين من تعديل عملاء موظفين آخرين
-- =============================================

-- DROP POLICY IF EXISTS customers_employee_isolation ON customers;

-- CREATE POLICY customers_employee_isolation ON customers
-- FOR ALL
-- USING (
--     EXISTS (
--         SELECT 1 FROM company_members cm
--         WHERE cm.company_id = customers.company_id
--         AND cm.user_id = auth.uid()
--         AND (
--             cm.role IN ('owner', 'admin') -- المديرين يرون الكل
--             OR customers.created_by_user_id = auth.uid() -- الموظف يرى عملاءه فقط
--         )
--     )
-- );

SELECT 'Migration 061_customer_created_by_user completed successfully' AS status;

