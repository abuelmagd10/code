-- ════════════════════════════════════════════════════════════════════════════
-- v3.74.857 (تكملة) — سياسة سجل التدقيق يجب أن تُطابق `assert_company_access`
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔴 **انحدارٌ أدخلتُه أنا فى الملف السابق `20260727000003`.**
--
-- كتبتُ سياسة إدخال سجل التدقيق هكذا:
--     WITH CHECK (company_id IS NULL OR company_id IN (SELECT fn_user_company_ids()))
--
-- و`fn_user_company_ids()` تقرأ `company_members` **وحدها**. وهذا يعيد بالضبط
-- العطب الذى أُصلح فى **v3.74.836**:
--
--   INSERT companies
--     → trg_seed_company_accounts
--        → seed_default_chart_of_accounts → sync_company_chart_of_accounts
--           → INSERT chart_of_accounts
--              → audit_trigger_function → create_audit_log
--                 → INSERT audit_logs   ← تُرفَض هنا
--
-- لأن **صفّ العضوية يُكتب بعد عودة إدراج الشركة**، فمُنشئ الشركة يُعامَل
-- كغريبٍ عن شركته هو طوال تلك الجملة الواحدة. فتسقط تهيئة دليل الحسابات،
-- وتسقط الجملة كلها، فلا شركة ولا أثر — والعميل يرى «فشل فى إنشاء الشركة».
--
-- وقد أمسكه `verify-signup-path.js` قبل النشر: «دليل الحسابات صفر حساب،
-- والمتوقع ٥٠ على الأقل». وهو السكربت المكتوب لهذه الحادثة بعينها.
--
-- ⇒ **الدرس**: الدرس المسجَّل فى **دالة** لا يسرى تلقائياً على **سياسة**.
--    أى شرطٍ يحرس بيانات شركة يجب أن يُطابق `assert_company_access` بفروعها
--    الثلاثة، لا فرعَ العضوية وحده.
--
-- 🟢 والحل ليس تخفيفاً للحماية: `companies.user_id` هو **نفس الشخص**، مسجَّلاً
--    فى مكان آخر. الغريب يبقى ممنوعاً كما كان.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- دالةٌ واحدة تُجسّد القاعدة، فلا تتفرّق النسخ وتتباين مرةً أخرى.
-- SECURITY DEFINER لازمة: لو قرأت السياسةُ `companies` مباشرةً لخضعت القراءة
-- بدورها للحماية، وهى غير مضمونة للشركة الوليدة داخل جملة إنشائها.
CREATE OR REPLACE FUNCTION public.fn_user_company_access(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT
    p_company_id IS NULL
    OR EXISTS (SELECT 1 FROM company_members
                WHERE company_id = p_company_id AND user_id = auth.uid())
    -- v3.74.836 — مالك الشركة المسجَّل على السجل نفسه: مُنشئ الشركة أثناء
    -- تهيئتها، قبل أن يُكتب صفّ عضويته.
    OR EXISTS (SELECT 1 FROM companies
                WHERE id = p_company_id AND user_id = auth.uid());
$function$;

-- ⚠️ `CREATE FUNCTION` يمنح التنفيذ لـ PUBLIC تلقائياً — وPUBLIC تشمل الزائر.
--    (درس v3.74.844: عشر دوال شُحنت مفتوحة بهذا السبب وحده.)
REVOKE ALL ON FUNCTION public.fn_user_company_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_user_company_access(uuid) TO authenticated, service_role;

-- ── سجل التدقيق ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_insert ON public.audit_logs
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (public.fn_user_company_access(company_id));

-- ── تقدُّم الإعداد ──────────────────────────────────────────────────────────
-- نفس التصحيح وقائياً: هذه الجداول تُكتب أثناء التهيئة أيضاً، ولا نريد
-- اكتشاف نفس الفخّ من شكوى عميل بدل من فحصٍ آلى.
DROP POLICY IF EXISTS onboarding_member_insert ON public.onboarding_progress;
CREATE POLICY onboarding_member_insert ON public.onboarding_progress
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (public.fn_user_company_access(company_id));

DROP POLICY IF EXISTS onboarding_member_update ON public.onboarding_progress;
CREATE POLICY onboarding_member_update ON public.onboarding_progress
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (public.fn_user_company_access(company_id))
  WITH CHECK (public.fn_user_company_access(company_id));

COMMIT;
