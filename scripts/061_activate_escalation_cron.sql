-- ============================================================
-- 061: تفعيل Cron Job لمصفوفة التصعيد (Escalation Matrix)
--
-- ❗ تعليمات التشغيل:
-- 1. افتح Supabase Dashboard → SQL Editor
-- 2. انسخ هذا الكود وشغّله
-- 3. للتحقق من الجدول: SELECT * FROM cron.job WHERE jobname = 'escalate-notifications';
--
-- ملاحظة: يتطلب تفعيل امتداد pg_cron أولاً من Supabase Dashboard:
--   Database → Extensions → pg_cron → Enable
-- ============================================================

-- تفعيل امتداد pg_cron (يتطلب صلاحيات superuser عبر Supabase Dashboard)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- تسجيل Cron Job يعمل كل ساعة تماماً
SELECT cron.schedule(
  'escalate-notifications',      -- اسم الوظيفة
  '0 * * * *',                   -- Cron expression: كل ساعة (الدقيقة 0)
  $$
  SELECT net.http_post(
    url := 'https://hfvsbsizokxontflgdyn.supabase.co/functions/v1/notification-escalation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- للتحقق من الجدول الزمني
-- SELECT * FROM cron.job WHERE jobname = 'escalate-notifications';

-- لحذف الوظيفة إذا لزم:
-- SELECT cron.unschedule('escalate-notifications');
