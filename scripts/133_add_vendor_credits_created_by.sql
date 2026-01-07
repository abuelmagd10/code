-- =============================================
-- إضافة حقل created_by لجدول vendor_credits
-- Add created_by field to vendor_credits table
-- =============================================
-- هذا السكريبت يضيف حقل created_by لتتبع من أنشأ إشعار الدائن
-- ويدعم نظام التحكم في الوصول حسب الموظف
-- =============================================

-- 1️⃣ إضافة حقل created_by
ALTER TABLE vendor_credits 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2️⃣ إنشاء index لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_vendor_credits_created_by ON vendor_credits(created_by);

-- 3️⃣ إضافة تعليق توضيحي
COMMENT ON COLUMN vendor_credits.created_by IS 'User who created this vendor credit - used for employee-based access control';

-- 4️⃣ تحديث السجلات الموجودة (اختياري)
-- يمكن تعيين created_by للسجلات الموجودة بناءً على منطق معين
-- مثلاً: تعيين أول مستخدم في الشركة أو تركه NULL

-- رسالة نجاح
DO $$
BEGIN
  RAISE NOTICE '✅ Successfully added created_by field to vendor_credits table';
  RAISE NOTICE '✅ Created index idx_vendor_credits_created_by';
  RAISE NOTICE '📝 Note: Existing records will have created_by = NULL';
  RAISE NOTICE '📝 New vendor credits will automatically track the creator';
END $$;

