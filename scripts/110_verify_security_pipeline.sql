-- =============================================
-- التحقق من Security Realtime Pipeline
-- Verification of Security Realtime Pipeline
-- =============================================
-- هذا السكربت يتحقق من:
-- 1. Single Source of Truth: company_members.role و company_members.branch_id
-- 2. Realtime subscriptions على الجدول الصحيح
-- 3. Schema consistency

-- =============================================
-- 1. التحقق من schema جدول company_members
-- =============================================
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'company_members'
ORDER BY ordinal_position;

-- =============================================
-- 2. التحقق من وجود role و branch_id
-- =============================================
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'company_members' 
            AND column_name = 'role'
        ) THEN '✅ role column exists'
        ELSE '❌ role column MISSING'
    END as role_check,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'company_members' 
            AND column_name = 'branch_id'
        ) THEN '✅ branch_id column exists'
        ELSE '❌ branch_id column MISSING'
    END as branch_id_check;

-- =============================================
-- 3. التحقق من Realtime publications
-- =============================================
-- Supabase Realtime يعمل على publications
-- التحقق من أن company_members في publication
SELECT 
    schemaname,
    tablename,
    CASE 
        WHEN tablename = 'company_members' THEN '✅ company_members is in Realtime publication'
        ELSE '❌ company_members NOT in Realtime publication'
    END as realtime_status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'company_members';

-- إذا لم يكن company_members في publication، يجب إضافته:
-- ALTER PUBLICATION supabase_realtime ADD TABLE company_members;

-- =============================================
-- 4. عرض عينة من البيانات للتأكد من البنية
-- =============================================
SELECT 
    id,
    company_id,
    user_id,
    role,
    branch_id,
    warehouse_id,
    cost_center_id,
    created_at
FROM company_members
LIMIT 5;

-- =============================================
-- 5. التحقق من أن role و branch_id قابلة للقراءة
-- =============================================
SELECT 
    COUNT(*) as total_members,
    COUNT(role) as members_with_role,
    COUNT(branch_id) as members_with_branch,
    COUNT(DISTINCT role) as unique_roles
FROM company_members;

-- =============================================
-- 6. التحقق من أن Realtime مفعّل على company_members
-- =============================================
-- إذا لم يكن company_members في Realtime publication، يجب تفعيله:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'company_members'
  ) THEN
    RAISE WARNING '❌ company_members is NOT in Realtime publication - Realtime will not work!';
    RAISE NOTICE '🔧 To fix: ALTER PUBLICATION supabase_realtime ADD TABLE company_members;';
  ELSE
    RAISE NOTICE '✅ company_members is in Realtime publication';
  END IF;
END $$;

-- =============================================
-- 7. التحقق من user_branch_access table (للفروع المتعددة)
-- =============================================
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'user_branch_access'
        ) THEN '✅ user_branch_access table exists'
        ELSE '⚠️ user_branch_access table does not exist (optional for multi-branch support)'
    END as user_branch_access_check;

-- التحقق من أن user_branch_access في Realtime publication
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
            AND tablename = 'user_branch_access'
        ) THEN '✅ user_branch_access is in Realtime publication'
        ELSE '❌ user_branch_access NOT in Realtime publication - Realtime will not work!'
    END as user_branch_access_realtime_check;

-- =============================================
-- 8. ملخص التحقق النهائي
-- =============================================
SELECT 
    'Schema Verification Summary' as check_type,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'company_members' 
            AND column_name = 'role'
        ) THEN '✅'
        ELSE '❌'
    END as role_column,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'company_members' 
            AND column_name = 'branch_id'
        ) THEN '✅'
        ELSE '❌'
    END as branch_id_column,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
            AND tablename = 'company_members'
        ) THEN '✅'
        ELSE '❌'
    END as realtime_enabled;

-- =============================================
-- ✅ إذا كل شيء صحيح، يجب أن ترى:
-- ✅ role column exists
-- ✅ branch_id column exists
-- ✅ company_members في supabase_realtime publication
-- ✅ بيانات في company_members مع role و branch_id
-- =============================================
