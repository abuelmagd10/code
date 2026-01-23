-- =====================================================
-- 🔔 تفعيل Supabase Realtime لجدول notifications
-- =====================================================
-- هذا الـ script يفعل Realtime لجدول notifications
-- مما يسمح بتحديث الإشعارات في الوقت الفعلي
-- =====================================================

-- ✅ تفعيل Realtime لجدول notifications
-- هذا يسمح للـ client بالاستماع للتغييرات في الوقت الفعلي
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ✅ التحقق من أن Realtime مفعّل
SELECT 
  schemaname,
  tablename,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'notifications'
    ) THEN '✅ Enabled'
    ELSE '❌ Disabled'
  END AS realtime_status
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename = 'notifications';

-- ✅ تم التفعيل بنجاح
SELECT '✅ تم تفعيل Supabase Realtime لجدول notifications بنجاح!' AS status;
