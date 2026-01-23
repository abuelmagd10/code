-- =====================================================
-- 🔄 تفعيل Realtime على جدول approval_workflows
-- =====================================================
-- سكريبت بسيط لإضافة approval_workflows إلى Realtime
-- =====================================================

-- التحقق من وجود الجدول وإضافته إلى Realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'approval_workflows') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'approval_workflows'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE approval_workflows;
      RAISE NOTICE '✅ Added approval_workflows to realtime';
    ELSE
      RAISE NOTICE '✅ approval_workflows already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table approval_workflows does not exist';
    RAISE NOTICE '💡 Tip: Check if the table name is different (e.g., approvals, workflow_approvals)';
  END IF;
END $$;

-- 1️⃣ أولاً: البحث عن جداول الموافقات الموجودة
SELECT 
  tablename,
  'Found table (may be the approvals table)' as note
FROM pg_tables 
WHERE schemaname = 'public' 
  AND (
    tablename LIKE '%approval%' 
    OR tablename LIKE '%workflow%'
  )
ORDER BY tablename;

-- 2️⃣ التحقق من التفعيل
SELECT 
  schemaname,
  tablename,
  '✅ Enabled' as realtime_status
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND schemaname = 'public'
  AND tablename = 'approval_workflows';

-- 3️⃣ إذا لم يظهر أي نتيجة، عرض جميع الجداول المفعلة في Realtime
SELECT 
  tablename,
  'Currently enabled in Realtime' as status
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND schemaname = 'public'
ORDER BY tablename;
