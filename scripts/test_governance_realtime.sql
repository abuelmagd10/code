-- =====================================================
-- 🧪 اختبارات نظام Realtime للحوكمة
-- =====================================================
-- هذا السكريبت يحتوي على اختبارات لتغيير الدور/الفرع/الصلاحيات
-- ⚠️ تحذير: هذا السكريبت سيعدل البيانات الفعلية
-- استخدمه فقط في بيئة الاختبار

-- =====================================================
-- 1️⃣ اختبار تغيير الدور
-- =====================================================

-- ملاحظة: استبدل 'test-user-id' و 'test-company-id' بقيم حقيقية

-- قبل التغيير: التحقق من الدور الحالي
SELECT 
  'Before Role Change' as test_step,
  user_id,
  company_id,
  role,
  branch_id,
  warehouse_id
FROM company_members
WHERE user_id = 'test-user-id'::uuid
  AND company_id = 'test-company-id'::uuid;

-- تغيير الدور من 'employee' إلى 'manager'
-- UPDATE company_members
-- SET role = 'manager'
-- WHERE user_id = 'test-user-id'::uuid
--   AND company_id = 'test-company-id'::uuid;

-- بعد التغيير: التحقق من الدور الجديد
-- SELECT 
--   'After Role Change' as test_step,
--   user_id,
--   company_id,
--   role,
--   branch_id,
--   warehouse_id
-- FROM company_members
-- WHERE user_id = 'test-user-id'::uuid
--   AND company_id = 'test-company-id'::uuid;

-- =====================================================
-- 2️⃣ اختبار تغيير الفرع
-- =====================================================

-- قبل التغيير: التحقق من الفرع الحالي
-- SELECT 
--   'Before Branch Change' as test_step,
--   user_id,
--   company_id,
--   branch_id
-- FROM company_members
-- WHERE user_id = 'test-user-id'::uuid
--   AND company_id = 'test-company-id'::uuid;

-- تغيير الفرع
-- UPDATE company_members
-- SET branch_id = 'new-branch-id'::uuid
-- WHERE user_id = 'test-user-id'::uuid
--   AND company_id = 'test-company-id'::uuid;

-- بعد التغيير: التحقق من الفرع الجديد
-- SELECT 
--   'After Branch Change' as test_step,
--   user_id,
--   company_id,
--   branch_id
-- FROM company_members
-- WHERE user_id = 'test-user-id'::uuid
--   AND company_id = 'test-company-id'::uuid;

-- =====================================================
-- 3️⃣ اختبار تغيير المخزن
-- =====================================================

-- قبل التغيير: التحقق من المخزن الحالي
-- SELECT 
--   'Before Warehouse Change' as test_step,
--   user_id,
--   company_id,
--   warehouse_id
-- FROM company_members
-- WHERE user_id = 'test-user-id'::uuid
--   AND company_id = 'test-company-id'::uuid;

-- تغيير المخزن
-- UPDATE company_members
-- SET warehouse_id = 'new-warehouse-id'::uuid
-- WHERE user_id = 'test-user-id'::uuid
--   AND company_id = 'test-company-id'::uuid;

-- بعد التغيير: التحقق من المخزن الجديد
-- SELECT 
--   'After Warehouse Change' as test_step,
--   user_id,
--   company_id,
--   warehouse_id
-- FROM company_members
-- WHERE user_id = 'test-user-id'::uuid
--   AND company_id = 'test-company-id'::uuid;

-- =====================================================
-- 4️⃣ اختبار تغيير صلاحيات الدور
-- =====================================================

-- قبل التغيير: التحقق من الصلاحيات الحالية
-- SELECT 
--   'Before Permission Change' as test_step,
--   company_id,
--   role,
--   resource,
--   can_read,
--   can_write,
--   can_update,
--   can_delete
-- FROM company_role_permissions
-- WHERE company_id = 'test-company-id'::uuid
--   AND role = 'employee'
--   AND resource = 'invoices';

-- إضافة صلاحية حذف الفواتير لدور employee
-- INSERT INTO company_role_permissions (
--   company_id,
--   role,
--   resource,
--   can_read,
--   can_write,
--   can_update,
--   can_delete
-- ) VALUES (
--   'test-company-id'::uuid,
--   'employee',
--   'invoices',
--   true,
--   true,
--   true,
--   true
-- )
-- ON CONFLICT (company_id, role, resource) 
-- DO UPDATE SET 
--   can_delete = true;

-- بعد التغيير: التحقق من الصلاحيات الجديدة
-- SELECT 
--   'After Permission Change' as test_step,
--   company_id,
--   role,
--   resource,
--   can_read,
--   can_write,
--   can_update,
--   can_delete
-- FROM company_role_permissions
-- WHERE company_id = 'test-company-id'::uuid
--   AND role = 'employee'
--   AND resource = 'invoices';

-- =====================================================
-- 5️⃣ اختبار منع استقبال أحداث من شركة أخرى
-- =====================================================

-- هذا الاختبار يجب أن يتم من التطبيق:
-- 1. تسجيل دخول كمستخدم في شركة A
-- 2. تغيير دور مستخدم في شركة B (من حساب آخر)
-- 3. التحقق من عدم استقبال الحدث في شركة A

-- =====================================================
-- 6️⃣ اختبار إعادة بناء الاشتراكات
-- =====================================================

-- هذا الاختبار يجب أن يتم من التطبيق:
-- 1. تسجيل دخول كمستخدم في فرع A
-- 2. فتح صفحة sales-orders (يجب أن تعرض فقط أوامر فرع A)
-- 3. تغيير الفرع إلى فرع B (من حساب آخر)
-- 4. التحقق من:
--    - إعادة بناء السياق
--    - إعادة الاشتراك في sales_orders بفلتر فرع B
--    - تحديث البيانات المعروضة

-- =====================================================
-- ✅ ملاحظات الاختبار
-- =====================================================

-- 1. جميع الاختبارات المعلقة (commented) يجب تفعيلها يدوياً
-- 2. استبدل 'test-user-id' و 'test-company-id' بقيم حقيقية
-- 3. استخدم حسابين مختلفين: واحد للاختبار والآخر لإجراء التغييرات
-- 4. راقب Console في المتصفح للتحقق من استقبال الأحداث
-- 5. تحقق من ظهور Toast messages عند التغييرات
