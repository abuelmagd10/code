-- =====================================================
-- 🔍 التشخيص النهائي - جميع المعلومات في مكان واحد
-- =====================================================

-- ✅ 1. الإشعارات المكررة (نفس event_key) - هذا هو الأهم!
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
HAVING COUNT(*) > 1;

-- ✅ 2. جميع إشعارات write-off (للمقارنة)
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

-- ✅ 3. فحص unique index - هل موجود؟
SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN 'EXISTS'
    ELSE 'MISSING'
  END as index_status,
  COALESCE(MAX(indexname), 'NONE') as indexname,
  COALESCE(MAX(indexdef), 'NONE') as indexdef
FROM pg_indexes
WHERE tablename = 'notifications'
  AND indexname LIKE '%event_key%';

-- ✅ 4. ملخص سريع
SELECT 
  'SUMMARY' as info_type,
  (SELECT COUNT(*) FROM notifications WHERE reference_type = 'inventory_write_off' AND status != 'archived') as total_write_off_notifications,
  (SELECT COUNT(*) FROM notifications WHERE reference_type = 'inventory_write_off' AND event_key IS NOT NULL AND status != 'archived') as with_event_key,
  (SELECT COUNT(DISTINCT event_key) FROM notifications WHERE reference_type = 'inventory_write_off' AND event_key IS NOT NULL AND status != 'archived') as unique_event_keys,
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'notifications' AND indexname LIKE '%event_key%') as unique_indexes_count;
