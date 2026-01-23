-- =====================================================
-- 🔍 فحص بسيط للإشعارات المكررة
-- =====================================================

-- ✅ 1. فحص الإشعارات المكررة (مع event_key)
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

-- ✅ 2. عرض جميع إشعارات write-off (الأخيرة)
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
ORDER BY created_at DESC;

-- ✅ 3. فحص unique index
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'notifications'
  AND indexname LIKE '%event_key%';

-- ✅ 4. فحص دالة create_notification - هل تدعم event_key؟
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'create_notification'
  AND n.nspname = 'public';
