-- =====================================================
-- 🔍 فحص وحذف الإشعارات المكررة
-- =====================================================
-- هذا الـ script يفحص ويحذف الإشعارات المكررة
-- =====================================================

-- ✅ 1. عرض الإشعارات المكررة (مع event_key)
SELECT 
  company_id,
  event_key,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as notification_ids,
  array_agg(created_at ORDER BY created_at) as created_dates
FROM notifications
WHERE event_key IS NOT NULL
  AND status != 'archived'
GROUP BY company_id, event_key
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, company_id, event_key;

-- ✅ 2. عرض الإشعارات المكررة (بدون event_key - نفس reference)
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

-- ✅ 3. حذف الإشعارات المكررة (مع event_key) - الاحتفاظ بالأحدث فقط
DO $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  WITH duplicates AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY company_id, event_key 
        ORDER BY created_at DESC
      ) as rn
    FROM notifications
    WHERE event_key IS NOT NULL
      AND status != 'archived'
  )
  DELETE FROM notifications
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ تم حذف % إشعار مكرر (مع event_key)', v_deleted_count;
END $$;

-- ✅ 4. حذف الإشعارات المكررة (بدون event_key) - الاحتفاظ بالأحدث فقط
DO $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  WITH duplicates AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY company_id, reference_type, reference_id, assigned_to_role, assigned_to_user
        ORDER BY created_at DESC
      ) as rn
    FROM notifications
    WHERE event_key IS NULL
      AND status != 'archived'
      AND reference_type = 'inventory_write_off'
      AND assigned_to_role = 'admin'
  )
  DELETE FROM notifications
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ تم حذف % إشعار مكرر (بدون event_key)', v_deleted_count;
END $$;

-- ✅ 5. عرض ملخص بعد الحذف
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
  AND status != 'archived';

-- ✅ تم الفحص والحذف
SELECT '✅ تم فحص وحذف الإشعارات المكررة!' AS status;
