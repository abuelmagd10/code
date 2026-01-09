-- =============================================
-- Customer Debit Notes - Installation Verification
-- التحقق من تثبيت إشعارات مدين العملاء
-- =============================================

-- 1️⃣ Check Tables
SELECT 
  '✅ Tables' as check_type,
  COUNT(*) as count,
  string_agg(table_name, ', ' ORDER BY table_name) as items
FROM information_schema.tables
WHERE table_name LIKE 'customer_debit%'
  AND table_schema = 'public';

-- Expected: 3 tables
-- customer_debit_note_applications, customer_debit_note_items, customer_debit_notes

-- 2️⃣ Check Functions
SELECT 
  '✅ Functions' as check_type,
  COUNT(*) as count,
  string_agg(routine_name, ', ' ORDER BY routine_name) as items
FROM information_schema.routines
WHERE routine_name LIKE '%debit%'
  AND routine_schema = 'public'
  AND routine_name NOT LIKE '%supplier%';

-- Expected: 14+ functions

-- 3️⃣ Check Triggers
SELECT 
  '✅ Triggers' as check_type,
  COUNT(*) as count,
  string_agg(trigger_name || ' (' || event_object_table || ')', ', ' ORDER BY trigger_name) as items
FROM information_schema.triggers
WHERE trigger_name LIKE '%debit%'
  AND trigger_schema = 'public'
  AND trigger_name NOT LIKE '%supplier%';

-- Expected: 12+ triggers

-- 4️⃣ Check Indexes
SELECT 
  '✅ Indexes' as check_type,
  COUNT(*) as count,
  string_agg(indexname, ', ' ORDER BY indexname) as items
FROM pg_indexes
WHERE indexname LIKE '%debit%'
  AND schemaname = 'public'
  AND indexname NOT LIKE '%supplier%';

-- Expected: 15+ indexes

-- 5️⃣ Check Constraints
SELECT 
  '✅ Constraints' as check_type,
  COUNT(*) as count,
  string_agg(constraint_name, ', ' ORDER BY constraint_name) as items
FROM information_schema.table_constraints
WHERE table_name LIKE 'customer_debit%'
  AND constraint_schema = 'public';

-- Expected: 10+ constraints

-- 6️⃣ Detailed Function List
SELECT 
  routine_name as function_name,
  routine_type as type,
  CASE 
    WHEN routine_name LIKE 'create_%' THEN '🆕 Creation'
    WHEN routine_name LIKE 'apply_%' THEN '✅ Application'
    WHEN routine_name LIKE 'approve_%' THEN '👍 Approval'
    WHEN routine_name LIKE 'reject_%' THEN '👎 Rejection'
    WHEN routine_name LIKE 'submit_%' THEN '📤 Submission'
    WHEN routine_name LIKE 'prevent_%' THEN '🔒 Guard'
    WHEN routine_name LIKE 'validate_%' THEN '✔️ Validation'
    WHEN routine_name LIKE 'sync_%' THEN '🔄 Sync'
    WHEN routine_name LIKE 'update_%' THEN '🔄 Update'
    WHEN routine_name LIKE 'calculate_%' THEN '🧮 Calculation'
    WHEN routine_name LIKE 'generate_%' THEN '🔢 Generation'
    WHEN routine_name LIKE 'check_%' THEN '🔍 Check'
    ELSE '❓ Other'
  END as category
FROM information_schema.routines
WHERE routine_name LIKE '%debit%'
  AND routine_schema = 'public'
  AND routine_name NOT LIKE '%supplier%'
ORDER BY category, routine_name;

-- 7️⃣ Table Structure Verification
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'customer_debit_notes'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 8️⃣ Check Foreign Keys
SELECT 
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name LIKE 'customer_debit%'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- =============================================
-- 🎯 Summary Report
-- =============================================

SELECT 
  '🎉 INSTALLATION VERIFICATION COMPLETE' as status,
  CASE 
    WHEN (SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE 'customer_debit%' AND table_schema = 'public') = 3
     AND (SELECT COUNT(*) FROM information_schema.routines WHERE routine_name LIKE '%debit%' AND routine_schema = 'public' AND routine_name NOT LIKE '%supplier%') >= 14
     AND (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_name LIKE '%debit%' AND trigger_schema = 'public' AND trigger_name NOT LIKE '%supplier%') >= 12
    THEN '✅ ALL CHECKS PASSED'
    ELSE '⚠️ SOME CHECKS FAILED - Review above results'
  END as result;

-- =============================================
-- Expected Results Summary:
-- ✅ 3 Tables
-- ✅ 14+ Functions
-- ✅ 12+ Triggers
-- ✅ 15+ Indexes
-- ✅ 10+ Constraints
-- =============================================

