-- =====================================================
-- 🔔 Trigger لتحديث الإشعارات تلقائياً عند الإنشاء
-- =====================================================
-- هذا الـ script ينشئ trigger يضمن أن Realtime يعمل بشكل صحيح
-- =====================================================

-- ✅ إنشاء trigger function لإرسال إشعار Realtime
CREATE OR REPLACE FUNCTION notify_notification_inserted()
RETURNS TRIGGER AS $$
BEGIN
  -- ✅ إرسال إشعار Realtime (PostgreSQL NOTIFY)
  PERFORM pg_notify('notification_inserted', json_build_object(
    'id', NEW.id,
    'company_id', NEW.company_id,
    'assigned_to_role', NEW.assigned_to_role,
    'assigned_to_user', NEW.assigned_to_user,
    'reference_type', NEW.reference_type,
    'reference_id', NEW.reference_id
  )::text);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ✅ إنشاء trigger
DROP TRIGGER IF EXISTS trg_notify_notification_inserted ON notifications;
CREATE TRIGGER trg_notify_notification_inserted
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION notify_notification_inserted();

-- ✅ تم الإعداد بنجاح
SELECT '✅ تم إنشاء trigger لتحديث الإشعارات تلقائياً!' AS status;
