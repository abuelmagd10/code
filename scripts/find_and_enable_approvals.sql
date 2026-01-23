-- =====================================================
-- 🔍 البحث عن جدول الموافقات وتفعيل Realtime عليه
-- =====================================================

-- 1️⃣ البحث عن جميع الجداول التي تحتوي على "approval" أو "workflow"
SELECT 
  tablename,
  'Found table - check if this is the approvals table' as note
FROM pg_tables 
WHERE schemaname = 'public' 
  AND (
    tablename ILIKE '%approval%' 
    OR tablename ILIKE '%workflow%'
  )
ORDER BY tablename;

-- 2️⃣ محاولة إضافة approval_workflows إذا كان موجوداً
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
    RAISE NOTICE '💡 Please check the table list above and use the correct table name';
  END IF;
END $$;

-- 3️⃣ التحقق من جميع الجداول المفعلة في Realtime (للمراجعة)
SELECT 
  tablename,
  '✅ Enabled in Realtime' as status
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND schemaname = 'public'
ORDER BY tablename;
