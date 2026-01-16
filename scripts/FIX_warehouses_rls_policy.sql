-- =============================================
-- إصلاح RLS Policies للمخازن
-- Fix Warehouses RLS Policies
-- =============================================
-- هذا الـ script يصلح سياسات RLS للمخازن لضمان:
-- 1. عرض المخازن المرتبطة بالفروع المسموح بها للمستخدم
-- 2. عدم كسر الصلاحيات الحالية
-- 3. احترام الحوكمة (governance)

-- =====================================
-- 1. إزالة السياسات القديمة (إن وجدت)
-- =====================================
DROP POLICY IF EXISTS warehouses_select_policy ON warehouses;
DROP POLICY IF EXISTS warehouses_insert_policy ON warehouses;
DROP POLICY IF EXISTS warehouses_update_policy ON warehouses;
DROP POLICY IF EXISTS warehouses_delete_policy ON warehouses;

-- =====================================
-- 2. إنشاء سياسة SELECT محسّنة
-- =====================================
-- ✅ السياسة الجديدة تسمح برؤية:
-- - كل مخازن الشركة إذا كان المستخدم عضو في الشركة
-- - لا نطبق فلتر branch_id هنا لأن الحوكمة تطبق في API layer
-- - هذا يضمن أن API route يمكنه تطبيق فلاتر branch_id بشكل صحيح
CREATE POLICY warehouses_select_policy ON warehouses FOR SELECT USING (
    -- المستخدم عضو في الشركة
    company_id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
    -- ✅ لا نضيف فلتر branch_id هنا لأن:
    -- 1. API route يطبق فلاتر branch_id بشكل صحيح
    -- 2. بعض المستخدمين (مثل Admin) يحتاجون رؤية كل المخازن
    -- 3. RLS policy يجب أن تكون بسيطة وتطبق في API layer
);

-- =====================================
-- 3. إنشاء سياسة INSERT
-- =====================================
CREATE POLICY warehouses_insert_policy ON warehouses FOR INSERT WITH CHECK (
    company_id IN (
        SELECT company_id FROM company_members 
        WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin', 'super_admin', 'gm', 'general_manager', 'generalmanager', 'superadmin')
    )
);

-- =====================================
-- 4. إنشاء سياسة UPDATE
-- =====================================
CREATE POLICY warehouses_update_policy ON warehouses FOR UPDATE USING (
    company_id IN (
        SELECT company_id FROM company_members 
        WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin', 'super_admin', 'gm', 'general_manager', 'generalmanager', 'superadmin')
    )
);

-- =====================================
-- 5. إنشاء سياسة DELETE
-- =====================================
CREATE POLICY warehouses_delete_policy ON warehouses FOR DELETE USING (
    company_id IN (
        SELECT company_id FROM company_members 
        WHERE user_id = auth.uid() 
        AND role IN ('owner', 'super_admin', 'superadmin')
    )
    AND is_main = FALSE  -- منع حذف المخزن الرئيسي
);

-- =====================================
-- 6. التأكد من تفعيل RLS
-- =====================================
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

-- =====================================
-- ملاحظات مهمة:
-- =====================================
-- ✅ RLS policy للمخازن تسمح برؤية كل مخازن الشركة
-- ✅ فلترة branch_id تطبق في API route (/api/warehouses)
-- ✅ هذا يضمن:
--    - Admin/GM يرون كل المخازن
--    - Manager يرون مخازن فرعهم فقط (من خلال API)
--    - Staff يرون مخزنهم فقط (من خلال API)
-- =====================================
