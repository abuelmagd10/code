-- =============================================
-- 🔐 Enable Realtime for company_members table
-- =============================================
-- 
-- هذا Migration يُفعِّل Realtime لجدول company_members
-- حتى تنعكس تغييرات الفرع/الدور على المستخدمين فوراً
-- بدون الحاجة لعمل Refresh للصفحة.
--
-- المشكلة:
-- - الكود (realtime-manager.ts) يشترك في أحداث company_members
-- - لكن Supabase Realtime لا يُرسل أحداثاً إذا لم يكن الجدول
--   مُضافاً لـ supabase_realtime publication
-- - وإذا لم يكن REPLICA IDENTITY = FULL، لن يُرسل payload.old
--   مما يمنع اكتشاف user_id في UPDATE events
--
-- الحل:
-- 1. SET REPLICA IDENTITY FULL على جدول company_members
--    → يضمن إرسال payload.old كاملاً في UPDATE events
--    → ضروري لاكتشاف user_id في realtime-manager.ts
-- 2. ADD TABLE TO supabase_realtime publication
--    → يُدرج الجدول في قناة Realtime الخاصة بـ Supabase
-- =============================================

-- الخطوة 1: تفعيل REPLICA IDENTITY FULL
-- يضمن إرسال كامل بيانات السجل القديم (OLD) في أحداث UPDATE
-- بدونه لن يتضمن payload.old حقل user_id الضروري لتحديد هوية المستخدم
ALTER TABLE public.company_members REPLICA IDENTITY FULL;

-- الخطوة 2: إضافة الجدول لـ Supabase Realtime publication (إذا لم يكن موجوداً)
-- يُدرج الجدول في نظام Realtime ليستقبل التطبيق أحداث INSERT/UPDATE/DELETE
-- ملاحظة: company_members قد يكون مضافاً بالفعل في بعض البيئات
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'company_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.company_members;
  END IF;
END;
$$;
