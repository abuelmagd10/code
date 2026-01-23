-- =====================================================
-- 🔍 فحص تفصيلي للإشعارات المكررة
-- =====================================================

-- ✅ 1. الإشعارات المكررة (نفس event_key)
SELECT 
  'DUPLICATES' as check_type,
  company_id,
  event_key,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as notification_ids,
  array_agg(created_at ORDER BY created_at) as created_dates
FROM notifications
WHERE event_key IS NOT NULL
  AND status != 'archived'
  AND reference_type = 'inventory_write_off'
GROUP BY company_id, event_key
HAVING COUNT(*) > 1;

-- ✅ 2. جميع إشعارات write-off (الأخيرة)
SELECT 
  'ALL_WRITE_OFF_NOTIFICATIONS' as check_type,
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
  'UNIQUE_INDEX_CHECK' as check_type,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'notifications'
  AND indexname LIKE '%event_key%';

-- ✅ 4. فحص دالة create_notification - هل تمنع التكرار؟
SELECT 
  'FUNCTION_CHECK' as check_type,
  p.proname as function_name,
  CASE 
    WHEN pg_get_functiondef(p.oid) LIKE '%event_key%' AND pg_get_functiondef(p.oid) LIKE '%v_existing_id%' 
    THEN 'HAS_DUPLICATE_CHECK'
    ELSE 'NO_DUPLICATE_CHECK'
  END as has_duplicate_prevention
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'create_notification'
  AND n.nspname = 'public';
