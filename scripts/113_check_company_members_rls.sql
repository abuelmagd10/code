-- =====================================================
-- 🔍 فحص RLS Policies على company_members (حرج)
-- =====================================================
-- هذا السكريبت يفحص RLS Policies على company_members
-- لأن هذا هو الجدول الذي يتم تحديثه عند تغيير الدور/الفرع
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
ORDER BY cmd, policyname;

-- =====================================================
-- 2️⃣ التحقق من تفعيل RLS على company_members
-- =====================================================

SELECT 
  'RLS Enabled Status' as check_type,
  tablename,
  CASE 
    WHEN (SELECT relrowsecurity FROM pg_class WHERE relname = 'company_members' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
    THEN '✅ RLS Enabled'
    ELSE '❌ RLS NOT Enabled - This is a security issue!'
  END as rls_status
FROM (VALUES ('company_members')) AS t(tablename);

-- =====================================================
-- 3️⃣ اختبار: هل المستخدم يمكنه قراءة سجله؟
-- =====================================================
-- 
-- ⚠️ هذا مهم جداً لـ Realtime:
-- 
-- في Supabase، Realtime يعمل مع RLS Policies.
-- إذا كانت SELECT policy تمنع المستخدم من قراءة السجل،
-- فلن يصل الحدث Realtime للمستخدم.
-- 
-- يجب أن يكون هناك SELECT policy تسمح للمستخدم بقراءة سجله:
-- 
-- SELECT * FROM company_members 
-- WHERE company_id = 'YOUR_COMPANY_ID' 
--   AND user_id = auth.uid();
-- 
-- يجب أن يعيد سجل واحد على الأقل.
-- 
-- =====================================================
-- 4️⃣ ملاحظة حرجة: Realtime و RLS
-- =====================================================
-- 
-- ⚠️ المشكلة المحتملة:
-- 
-- عندما يغير Owner/Admin دور مستخدم آخر:
-- 1. يتم UPDATE على company_members
-- 2. Supabase Realtime يرسل الحدث
-- 3. لكن إذا كانت SELECT policy تمنع المستخدم من قراءة سجله → ❌ لن يصل الحدث
-- 
-- الحل:
-- - يجب أن تكون SELECT policy تسمح للمستخدم بقراءة سجله الخاص
-- - مثال: USING (user_id = auth.uid() OR is_company_member(company_id))
-- 
-- =====================================================
