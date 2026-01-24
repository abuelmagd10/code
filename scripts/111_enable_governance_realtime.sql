-- =====================================================
-- 🔐 تفعيل Realtime على جداول الحوكمة (Governance Tables)
-- =====================================================
-- هذا السكريبت يفعل Realtime على جداول الحوكمة المطلوبة
-- يجب تشغيله في Supabase SQL Editor
-- 
-- الجداول المفعّلة:
-- 🔐 company_members - أعضاء الشركة (حرج - Blind Refresh)
-- 🔐 user_branch_access - الفروع المسموحة للمستخدم (حرج - Blind Refresh)
-- 🔐 branches - الفروع
-- 🔐 warehouses - المخازن
-- 🔐 company_role_permissions - صلاحيات الأدوار
-- =====================================================

-- =====================================================
-- 1️⃣ التحقق من وجود Publication
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
    RAISE NOTICE '✅ Created supabase_realtime publication';
  ELSE
    RAISE NOTICE '✅ supabase_realtime publication already exists';
  END IF;
END $$;

-- =====================================================
-- 2️⃣ تفعيل Realtime على company_members (حرج)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'company_members') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'company_members'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE company_members;
      RAISE NOTICE '✅ Added company_members to realtime publication';
    ELSE
      RAISE NOTICE '✅ company_members already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '❌ Table company_members does not exist';
  END IF;
END $$;

-- =====================================================
-- 3️⃣ تفعيل Realtime على user_branch_access (حرج)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_branch_access') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'user_branch_access'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE user_branch_access;
      RAISE NOTICE '✅ Added user_branch_access to realtime publication';
    ELSE
      RAISE NOTICE '✅ user_branch_access already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table user_branch_access does not exist (optional for multi-branch support)';
  END IF;
END $$;

-- =====================================================
-- 4️⃣ تفعيل Realtime على branches
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'branches') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'branches'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE branches;
      RAISE NOTICE '✅ Added branches to realtime publication';
    ELSE
      RAISE NOTICE '✅ branches already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '❌ Table branches does not exist';
  END IF;
END $$;

-- =====================================================
-- 5️⃣ تفعيل Realtime على warehouses
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouses') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'warehouses'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE warehouses;
      RAISE NOTICE '✅ Added warehouses to realtime publication';
    ELSE
      RAISE NOTICE '✅ warehouses already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '❌ Table warehouses does not exist';
  END IF;
END $$;

-- =====================================================
-- 6️⃣ تفعيل Realtime على company_role_permissions
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'company_role_permissions') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'company_role_permissions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE company_role_permissions;
      RAISE NOTICE '✅ Added company_role_permissions to realtime publication';
    ELSE
      RAISE NOTICE '✅ company_role_permissions already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '❌ Table company_role_permissions does not exist';
  END IF;
END $$;

-- =====================================================
-- 7️⃣ التحقق النهائي
-- =====================================================

SELECT 
  'Governance Realtime Status' as check_type,
  tablename,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = t.tablename
    )
    THEN '✅ Enabled'
    ELSE '❌ NOT Enabled - Run this script!'
  END as realtime_status
FROM (
  VALUES 
    ('company_members'),
    ('user_branch_access'),
    ('branches'),
    ('warehouses'),
    ('company_role_permissions')
) AS t(tablename)
ORDER BY tablename;

-- =====================================================
-- ✅ انتهى
-- =====================================================
-- 
-- ملاحظات:
-- 1. بعد تشغيل هذا السكريبت، يجب أن ترى "✅ Enabled" لجميع الجداول
-- 2. إذا رأيت "❌ NOT Enabled"، تأكد من أن لديك صلاحيات ALTER PUBLICATION
-- 3. يمكنك أيضاً تفعيل Realtime من Supabase Dashboard:
--    Database → Replication → فعّل لكل جدول
-- 
-- =====================================================
