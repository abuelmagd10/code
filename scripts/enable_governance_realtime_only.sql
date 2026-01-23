-- =====================================================
-- 🔐 تفعيل Realtime على جداول الحوكمة فقط
-- =====================================================
-- هذا السكريبت يفعل Realtime على جداول الحوكمة فقط
-- استخدمه إذا كانت الجداول الأخرى مفعلة بالفعل

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
-- 2️⃣ تفعيل Realtime على جداول الحوكمة
-- =====================================================

-- company_members
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
      RAISE NOTICE '✅ Added company_members to realtime';
    ELSE
      RAISE NOTICE '✅ company_members already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table company_members does not exist';
  END IF;
END $$;

-- branches
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
      RAISE NOTICE '✅ Added branches to realtime';
    ELSE
      RAISE NOTICE '✅ branches already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table branches does not exist';
  END IF;
END $$;

-- warehouses
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
      RAISE NOTICE '✅ Added warehouses to realtime';
    ELSE
      RAISE NOTICE '✅ warehouses already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table warehouses does not exist';
  END IF;
END $$;

-- company_role_permissions
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
      RAISE NOTICE '✅ Added company_role_permissions to realtime';
    ELSE
      RAISE NOTICE '✅ company_role_permissions already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table company_role_permissions does not exist';
  END IF;
END $$;

-- permissions (إن وجدت - جدول اختياري)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'permissions') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'permissions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE permissions;
      RAISE NOTICE '✅ Added permissions to realtime';
    ELSE
      RAISE NOTICE '✅ permissions already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE 'ℹ️ Table permissions does not exist (optional table)';
  END IF;
END $$;

-- =====================================================
-- 3️⃣ التحقق من التفعيل
-- =====================================================

SELECT 
  'Governance Tables Realtime Status' as check_type,
  tablename,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = t.tablename
    )
    THEN '✅ Enabled'
    ELSE '❌ NOT Enabled'
  END as realtime_status
FROM (
  VALUES 
    ('company_members'),
    ('branches'),
    ('warehouses'),
    ('company_role_permissions'),
    ('permissions')
) AS t(tablename)
ORDER BY tablename;

-- =====================================================
-- ✅ انتهى
-- =====================================================
-- بعد تشغيل هذا السكريبت، يجب أن تكون جميع جداول الحوكمة مفعلة
-- قم بتشغيل scripts/verify_governance_realtime.sql للتحقق النهائي
