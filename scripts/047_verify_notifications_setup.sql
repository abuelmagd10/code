-- =====================================================
-- 🔍 التحقق من إعداد نظام الإشعارات
-- =====================================================
-- هذا الـ script يتحقق من أن جميع المكونات المطلوبة موجودة
-- =====================================================

-- 1️⃣ التحقق من وجود جدول notifications
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
    RAISE NOTICE '✅ جدول notifications موجود';
  ELSE
    RAISE EXCEPTION '❌ جدول notifications غير موجود - شغّل create_notifications_table.sql أولاً';
  END IF;
END $$;

-- 2️⃣ التحقق من وجود الأعمدة الجديدة
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notifications' AND column_name = 'event_key'
  ) THEN
    RAISE NOTICE '✅ عمود event_key موجود';
  ELSE
    RAISE EXCEPTION '❌ عمود event_key غير موجود - شغّل QUICK_FIX_NOTIFICATIONS.sql';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notifications' AND column_name = 'severity'
  ) THEN
    RAISE NOTICE '✅ عمود severity موجود';
  ELSE
    RAISE EXCEPTION '❌ عمود severity غير موجود - شغّل QUICK_FIX_NOTIFICATIONS.sql';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notifications' AND column_name = 'category'
  ) THEN
    RAISE NOTICE '✅ عمود category موجود';
  ELSE
    RAISE EXCEPTION '❌ عمود category غير موجود - شغّل QUICK_FIX_NOTIFICATIONS.sql';
  END IF;
END $$;

-- 3️⃣ التحقق من دالة create_notification
DO $$
DECLARE
  v_param_count INTEGER;
BEGIN
  -- التحقق من وجود الدالة
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'create_notification'
  ) THEN
    RAISE EXCEPTION '❌ دالة create_notification غير موجودة';
  END IF;
  
  -- التحقق من المعاملات
  SELECT COUNT(*) INTO v_param_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  JOIN pg_proc_arguments pa ON p.oid = pa.prooid
  WHERE n.nspname = 'public' 
    AND p.proname = 'create_notification'
    AND pa.proname IN ('p_event_key', 'p_severity', 'p_category');
  
  IF v_param_count >= 3 THEN
    RAISE NOTICE '✅ دالة create_notification تدعم المعاملات الجديدة (event_key, severity, category)';
  ELSE
    RAISE EXCEPTION '❌ دالة create_notification لا تدعم المعاملات الجديدة - شغّل QUICK_FIX_NOTIFICATIONS.sql';
  END IF;
END $$;

-- 4️⃣ التحقق من دالة get_user_notifications
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_user_notifications'
  ) THEN
    RAISE NOTICE '✅ دالة get_user_notifications موجودة';
  ELSE
    RAISE EXCEPTION '❌ دالة get_user_notifications غير موجودة';
  END IF;
END $$;

-- 5️⃣ التحقق من Realtime
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'notifications'
  ) THEN
    RAISE NOTICE '✅ Realtime مفعّل لجدول notifications';
  ELSE
    RAISE WARNING '⚠️ Realtime غير مفعّل لجدول notifications - شغّل 046_enable_realtime_notifications.sql';
  END IF;
END $$;

-- 6️⃣ التحقق من RLS Policies
DO $$
DECLARE
  v_policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE tablename = 'notifications';
  
  IF v_policy_count > 0 THEN
    RAISE NOTICE '✅ يوجد % سياسات RLS لجدول notifications', v_policy_count;
  ELSE
    RAISE WARNING '⚠️ لا توجد سياسات RLS لجدول notifications';
  END IF;
END $$;

-- ✅ تم التحقق بنجاح
SELECT '✅ تم التحقق من إعداد نظام الإشعارات بنجاح!' AS status;
