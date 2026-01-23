-- =====================================================
-- 🔍 التحقق من وجود approval_workflows وإضافته
-- =====================================================

-- 1️⃣ البحث عن جداول الموافقات
SELECT 
  tablename,
  'Found table' as status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND (
    tablename LIKE '%approval%' 
    OR tablename LIKE '%workflow%'
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
    RAISE NOTICE '⚠️ Table approval_workflows does not exist in database';
    RAISE NOTICE '💡 Check the table list above to find the correct table name';
  END IF;
END $$;

-- 3️⃣ التحقق النهائي من الجداول المفعلة
SELECT 
  tablename,
  '✅ Enabled in Realtime' as status
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND schemaname = 'public'
  AND (
    tablename LIKE '%approval%' 
    OR tablename LIKE '%workflow%'
  )
ORDER BY tablename;
