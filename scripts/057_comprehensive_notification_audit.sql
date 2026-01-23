-- =====================================================
-- 🔍 مراجعة شاملة لنظام الإشعارات - تشخيص التكرار
-- =====================================================
-- هذا الـ script يفحص جميع الجوانب المحتملة للتكرار
-- =====================================================

\echo '========================================'
\echo '🔍 مراجعة شاملة لنظام الإشعارات'
\echo '========================================'
\echo ''

-- ✅ 1. فحص وجود الأعمدة المطلوبة
\echo '1️⃣ فحص الأعمدة المطلوبة...'
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'notifications'
  AND column_name IN ('event_key', 'severity', 'category')
ORDER BY column_name;

\echo ''

-- ✅ 2. فحص وجود unique index على event_key
\echo '2️⃣ فحص unique index على event_key...'
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'notifications'
  AND indexname LIKE '%event_key%';

\echo ''

-- ✅ 3. فحص دالة create_notification - المعاملات
\echo '3️⃣ فحص معاملات دالة create_notification...'
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'create_notification'
  AND n.nspname = 'public';

\echo ''

-- ✅ 4. فحص وجود دالة check_notification_exists
\echo '4️⃣ فحص وجود دالة check_notification_exists...'
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'check_notification_exists'
  AND n.nspname = 'public';

\echo ''

-- ✅ 5. فحص triggers على inventory_write_offs
\echo '5️⃣ فحص triggers على inventory_write_offs...'
SELECT 
  trigger_name,
  event_manipulation,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'inventory_write_offs'
ORDER BY trigger_name;

\echo ''

-- ✅ 6. عرض الإشعارات المكررة (مع event_key)
\echo '6️⃣ الإشعارات المكررة (مع event_key)...'
SELECT 
  company_id,
  event_key,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as notification_ids,
  array_agg(created_at ORDER BY created_at) as created_dates,
  array_agg(reference_id ORDER BY created_at) as reference_ids
FROM notifications
WHERE event_key IS NOT NULL
  AND status != 'archived'
  AND reference_type = 'inventory_write_off'
GROUP BY company_id, event_key
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, company_id, event_key;

\echo ''

-- ✅ 7. عرض الإشعارات المكررة (بدون event_key)
\echo '7️⃣ الإشعارات المكررة (بدون event_key)...'
SELECT 
  company_id,
  reference_type,
  reference_id,
  assigned_to_role,
  assigned_to_user,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as notification_ids,
  array_agg(created_at ORDER BY created_at) as created_dates
FROM notifications
WHERE event_key IS NULL
  AND status != 'archived'
  AND reference_type = 'inventory_write_off'
GROUP BY company_id, reference_type, reference_id, assigned_to_role, assigned_to_user
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, company_id, reference_id;

\echo ''

-- ✅ 8. فحص الإشعارات الأخيرة لـ write-offs
\echo '8️⃣ آخر 10 إشعارات لـ write-offs...'
SELECT 
  id,
  company_id,
  reference_id,
  event_key,
  assigned_to_role,
  assigned_to_user,
  title,
  status,
  created_at
FROM notifications
WHERE reference_type = 'inventory_write_off'
ORDER BY created_at DESC
LIMIT 10;

\echo ''

-- ✅ 9. إحصائيات عامة
\echo '9️⃣ إحصائيات عامة...'
SELECT 
  'Total notifications' as metric,
  COUNT(*) as count
FROM notifications
WHERE status != 'archived'

UNION ALL

SELECT 
  'Notifications with event_key' as metric,
  COUNT(*) as count
FROM notifications
WHERE event_key IS NOT NULL
  AND status != 'archived'

UNION ALL

SELECT 
  'Write-off notifications' as metric,
  COUNT(*) as count
FROM notifications
WHERE reference_type = 'inventory_write_off'
  AND status != 'archived'

UNION ALL

SELECT 
  'Write-off notifications with event_key' as metric,
  COUNT(*) as count
FROM notifications
WHERE reference_type = 'inventory_write_off'
  AND event_key IS NOT NULL
  AND status != 'archived'

UNION ALL

SELECT 
  'Write-off notifications without event_key' as metric,
  COUNT(*) as count
FROM notifications
WHERE reference_type = 'inventory_write_off'
  AND event_key IS NULL
  AND status != 'archived';

\echo ''
\echo '========================================'
\echo '✅ انتهى الفحص الشامل'
\echo '========================================'
