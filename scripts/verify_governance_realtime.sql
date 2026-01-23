-- =====================================================
-- 🔍 التحقق من تفعيل Realtime على جداول الحوكمة
-- =====================================================
-- هذا السكريبت يتحقق من تفعيل Realtime على جميع جداول الحوكمة
-- يجب تشغيله بعد تشغيل enable_realtime_tables.sql

-- =====================================================
-- 1️⃣ التحقق من وجود Publication
-- =====================================================

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    THEN '✅ supabase_realtime publication exists'
    ELSE '❌ supabase_realtime publication NOT FOUND'
  END as publication_status;

-- =====================================================
-- 2️⃣ التحقق من تفعيل Realtime على جداول الحوكمة
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
  END as realtime_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = t.tablename
    )
    THEN '✅ Table Exists'
    ELSE '⚠️ Table NOT Found'
  END as table_status
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
-- 3️⃣ التحقق من RLS Policies
-- =====================================================

SELECT 
  'RLS Policies Status' as check_type,
  tablename,
  COUNT(*) as policy_count,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Has Policies'
    ELSE '❌ NO Policies'
  END as policy_status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'company_members',
    'branches',
    'warehouses',
    'company_role_permissions',
    'permissions'
  )
GROUP BY tablename
ORDER BY tablename;

-- =====================================================
-- 4️⃣ التحقق من وجود الجداول
-- =====================================================

SELECT 
  'Table Existence Check' as check_type,
  table_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = t.table_name
    )
    THEN '✅ Exists'
    ELSE '❌ NOT Found'
  END as table_status
FROM (
  VALUES 
    ('company_members'),
    ('branches'),
    ('warehouses'),
    ('company_role_permissions'),
    ('permissions')
) AS t(table_name)
ORDER BY table_name;

-- =====================================================
-- 5️⃣ ملخص شامل
-- =====================================================

WITH governance_tables AS (
  SELECT tablename
  FROM (
    VALUES 
      ('company_members'),
      ('branches'),
      ('warehouses'),
      ('company_role_permissions'),
      ('permissions')
  ) AS t(tablename)
),
realtime_status AS (
  SELECT 
    gt.tablename,
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = gt.tablename
      )
      THEN true
      ELSE false
    END as is_realtime_enabled,
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = gt.tablename
      )
      THEN true
      ELSE false
    END as table_exists,
    (
      SELECT COUNT(*) 
      FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = gt.tablename
    ) as policy_count
  FROM governance_tables gt
)
SELECT 
  '📊 Governance Realtime Summary' as summary_type,
  COUNT(*) FILTER (WHERE is_realtime_enabled AND table_exists) as enabled_tables,
  COUNT(*) FILTER (WHERE NOT is_realtime_enabled AND table_exists) as disabled_tables,
  COUNT(*) FILTER (WHERE NOT table_exists) as missing_tables,
  COUNT(*) FILTER (WHERE policy_count > 0) as tables_with_policies,
  COUNT(*) FILTER (WHERE policy_count = 0) as tables_without_policies,
  CASE 
    WHEN COUNT(*) FILTER (WHERE is_realtime_enabled AND table_exists AND policy_count > 0) = COUNT(*) FILTER (WHERE table_exists)
    THEN '✅ ALL TABLES READY'
    ELSE '⚠️ SOME TABLES NEED ATTENTION'
  END as overall_status
FROM realtime_status;

-- =====================================================
-- ✅ انتهى
-- =====================================================
-- إذا كانت جميع الجداول مفعلة ولديها RLS Policies:
-- ✅ النظام جاهز للاستخدام
-- 
-- إذا كان هناك جداول غير مفعلة:
-- ⚠️ قم بتشغيل enable_realtime_tables.sql
