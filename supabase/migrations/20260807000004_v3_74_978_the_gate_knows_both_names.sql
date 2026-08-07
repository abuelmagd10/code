-- ═══════════════════════════════════════════════════════════════════════════
-- v3.74.978 — بوّابةُ الاعتماد تعرف الاسمين
-- ═══════════════════════════════════════════════════════════════════════════
--
-- فى ٩٧٧ وُسّع كلُّ بابٍ يقبل `general_manager` ليقبل `admin` معه. ثمّ قِيست
-- النتيجةُ على قاعدة الإنتاج بانتحال عضويّةٍ حقيقيّةٍ تحت الاسمين، فتطابق
-- كلُّ شىء **إلّا موضعاً واحداً**: بوّابةُ الاعتماد `can_approve` المبنيّة فى
-- ٩٧٦ تقبل `admin` ولا تعرف `general_manager` — أى **عكسُ العطب المعالَج**.
--
-- وأثرُها اليومَ صفرٌ لسببين مقيسَين: هى **غيرُ موصولةٍ** بأىِّ شاشةٍ أو مسار
-- (وحارسٌ فى سكربت الدفع يمنع وصلَها)، **ولا عضوَ واحداً** فى أىِّ شركةٍ يحمل
-- أيَّ الاسمين. لكنّ «أثرُه صفر» ليس سبباً لتركِ تناقض: البوّابةُ التى يُراد
-- لها أن تكون البيتَ الواحدَ لسلطة الاعتماد لا يجوز أن تكون هى الوحيدةَ التى
-- تفرّق بين اسمَى دورٍ واحد.
--
-- وتُكتب الدالّةُ هنا **كاملةً** لا بتبديلِ نصّ، ليقارن حارسُ
-- `check-migration-matches-db.js` جسمَها بما فى القاعدة حرفاً بحرف: ملفُّ
-- الهجرة دعوى، وهذه صيغةٌ تجعل الدعوى قابلةً للتكذيب.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.can_approve(p_company_id uuid, p_resource text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_uid  uuid := auth.uid();
        v_role text;
        v_ok   boolean;
BEGIN
  IF v_uid IS NULL OR p_company_id IS NULL OR p_resource IS NULL THEN
    RETURN false;   -- العجزُ عن التحقّق يُغلق ولا يفتح (درس ٨٦٥)
  END IF;

  -- الطابقُ الأوّل: مالكُ الشركة المسجَّل معتمِدٌ دائماً، ولو لم يُذكر عضواً.
  IF EXISTS (SELECT 1 FROM public.companies c
              WHERE c.id = p_company_id AND c.user_id = v_uid) THEN
    RETURN true;
  END IF;

  SELECT lower(btrim(cm.role)) INTO v_role
    FROM public.company_members cm
   WHERE cm.company_id = p_company_id AND cm.user_id = v_uid
   LIMIT 1;

  IF v_role IS NULL THEN RETURN false; END IF;
  -- v3.74.978: «مدير عام» له اسمان حتى الخطوة الثانية، والبابُ يعرفهما معاً.
  IF v_role IN ('owner', 'admin', 'general_manager') THEN RETURN true; END IF;

  -- وما عداهما: تُسأل شاشةُ الصلاحيات، بلغتيها معاً.
  SELECT (p.all_access
          OR 'approve' = ANY(p.allowed_actions)
          OR '*'       = ANY(p.allowed_actions)
          OR (p_resource || ':approve') = ANY(p.allowed_actions))
    INTO v_ok
    FROM public.company_role_permissions p
   WHERE p.company_id = p_company_id
     AND lower(btrim(p.role)) = v_role
     AND p.resource = p_resource
   LIMIT 1;

  RETURN COALESCE(v_ok, false);
END
$function$;

-- لا تُولد مفتوحةً للزائر المجهول (درس ٩٧٢)، ولا يكفى سحبُها من PUBLIC:
-- لكلٍّ من anon وauthenticated منحةٌ افتراضيّةٌ مستقلّة فى Supabase.
REVOKE EXECUTE ON FUNCTION public.can_approve(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_approve(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.can_approve(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_approve(uuid, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- والملفُّ يُصدّق على نفسه.
-- ─────────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname = 'can_approve';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'v3.74.978: can_approve غير موجودة بعد التطبيق';
  END IF;
  IF strpos(v_src, '''general_manager''') = 0 OR strpos(v_src, '''admin''') = 0 THEN
    RAISE EXCEPTION 'v3.74.978: البوّابة لا تعرف الاسمين معاً';
  END IF;
  IF has_function_privilege('anon', 'public.can_approve(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'v3.74.978: البوّابة ما زالت قابلةً للنداء من الزائر المجهول';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.can_approve(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'v3.74.978: البوّابة غيرُ قابلةٍ للنداء من مستخدمٍ مسجَّل';
  END IF;

  RAISE NOTICE 'v3.74.978: البوّابة تعرف الاسمين، ومغلقةٌ على الزائر المجهول.';
END $mig$;

COMMIT;
