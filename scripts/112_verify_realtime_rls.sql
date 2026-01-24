-- =====================================================
-- 🔍 التحقق من RLS Policies وتأثيرها على Realtime
-- =====================================================
-- هذا السكريبت يتحقق من RLS Policies على جداول الحوكمة
-- ويوضح إذا كانت تمنع وصول أحداث Realtime
-- =====================================================

-- =====================================================
-- 1️⃣ التحقق من RLS Policies على company_members
-- =====================================================

SELECT 
  'RLS Policies for company_members' as check_type,
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'company_members'
ORDER BY policyname;

-- =====================================================
-- 2️⃣ التحقق من تفعيل RLS على company_members
-- =====================================================

SELECT 
  'RLS Enabled Status' as check_type,
  tablename,
  CASE 
    WHEN (SELECT relrowsecurity FROM pg_class WHERE relname = 'company_members' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
    THEN '✅ RLS Enabled'
    ELSE '❌ RLS NOT Enabled'
  END as rls_status
FROM (VALUES ('company_members')) AS t(tablename);

-- =====================================================
-- 3️⃣ التحقق من RLS Policies على user_branch_access
-- =====================================================

SELECT 
  'RLS Policies for user_branch_access' as check_type,
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'user_branch_access'
ORDER BY policyname;

-- =====================================================
-- 4️⃣ ملاحظة مهمة: Realtime و RLS
-- =====================================================
-- 
-- ⚠️ في Supabase، Realtime يعمل مع RLS Policies:
-- 
-- 1. إذا كانت RLS Policy تمنع المستخدم من قراءة السجل،
--    فلن يصل الحدث Realtime للمستخدم.
-- 
-- 2. للـ UPDATE events:
--    - يجب أن يكون المستخدم قادراً على قراءة السجل (SELECT policy)
--    - حتى لو كان التغيير من Owner/Admin
-- 
-- 3. الحل:
--    - تأكد من أن SELECT policy على company_members تسمح للمستخدم
--      بقراءة سجله الخاص (user_id = auth.uid())
--    - تأكد من أن SELECT policy تسمح لـ Owner/Admin بقراءة جميع السجلات
-- 
-- =====================================================
-- 5️⃣ اختبار: التحقق من أن المستخدم يمكنه قراءة سجله
-- =====================================================
-- 
-- شغّل هذا الاستعلام كمستخدم عادي (ليس Owner/Admin):
-- 
-- SELECT * FROM company_members 
-- WHERE company_id = 'YOUR_COMPANY_ID' 
--   AND user_id = auth.uid();
-- 
-- يجب أن يعيد سجل واحد على الأقل.
-- 
-- =====================================================
