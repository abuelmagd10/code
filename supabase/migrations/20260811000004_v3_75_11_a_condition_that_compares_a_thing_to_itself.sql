-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.11 — **وشرطٌ يُقارنُ الشىءَ بنفسِه ليس شرطاً**
-- ═══════════════════════════════════════════════════════════════════════════
-- أربعُ سياساتِ إدخالٍ كان حارسُها:
--
--     cm.company_id = cm.company_id
--
-- وهو **صحيحٌ دائماً**. المقصودُ كان `cm.company_id = <الجدول>.company_id`،
-- فسقطتْ كلمةٌ وبقىَ بابٌ يسألُ «هل أنتَ عضوٌ؟» ولا يسألُ «أهذا صفُّك؟».
-- والدليلُ على أنّه سهوٌ لا قرار: الصياغةُ الصحيحةُ قائمةٌ **فى الجدولِ نفسِه**
-- فى سياستَى القراءةِ والتعديل.
--
-- ومعها بابٌ خامسٌ من عائلةٍ أخرى: `shareholders` فيه سياستا إدخال، إحداهما
-- صحيحةٌ والأخرى شرطُها `true` — وسياساتُ الصفوفِ **تُجمَعُ بـ«أو»**، فالثانيةُ
-- تُلغى الأولى. **وبابٌ ثانٍ بجوارِ البابِ المحروسِ يُبطلُ الحراسة.**
--
-- ═══ ما قِيس قبلَ الكتابة (تجربةٌ حيّةٌ أُلغيت) ═══
--   موظّفٌ (staff) عضوٌ فى شركةٍ واحدةٍ فقط كتبَ فى شركةٍ أخرى: إعداداتِ
--   مصروفاتِها، وإعداداتِ مسحوباتِها، وحدودَ تنبيهاتِها، ومساهماً فيها،
--   **ومستندَ إهلاكِ مخزونٍ فى دفاترِها**. خمسةٌ من خمسة.
--
-- ═══ وما قِيس قبلَ العلاج ═══
--   جدولُ حقيقةٍ على السكّانِ الأحياء: ١٣ عضواً × ٦ شركاتٍ = ٧٨ زوجاً.
--   بالشرطِ الجديد: العضوُ فى شركتِه ١٣/١٣ يمرّ، والغريبُ ٦٣/٦٥ يُمنع،
--   والزوجانِ الباقيانِ رجلٌ عضوٌ فعلاً فى شركتين. **ولا أحدَ يفقدُ شيئاً.**
--
-- ═══ وما لم يُفعل عمداً ═══
--   شرطُ الفرعِ المكسور (`cm.branch_id = cm.branch_id`) لم يمنعْ أحداً قطّ،
--   فيُحذَفُ ولا يُستبدَلُ بقيدٍ جديدٍ قد يمنعُ موظّفاً بلا فرع.
--   **والعلاجُ يُصلحُ العطبَ ولا يُهرّبُ معه سياسةً جديدة.**
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ (١) الشرطُ يربطُ الصفَّ بمن يكتبُه ═══
-- كلُّ صياغةٍ أدناه منقولةٌ حرفاً من سياسةِ القراءةِ المجاورةِ فى الجدولِ نفسِه.

ALTER POLICY company_expenses_settings_insert ON public.company_expenses_settings
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = company_expenses_settings.company_id
      AND cm.user_id = auth.uid()
  ));

ALTER POLICY company_drawings_settings_insert ON public.company_drawings_settings
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = company_drawings_settings.company_id
      AND cm.user_id = auth.uid()
  ));

ALTER POLICY company_dashboard_alert_limits_insert ON public.company_dashboard_alert_limits
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = company_dashboard_alert_limits.company_id
      AND cm.user_id = auth.uid()
  ));

ALTER POLICY write_offs_insert ON public.inventory_write_offs
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = inventory_write_offs.company_id
      AND cm.user_id = auth.uid()
  ));

-- ═══ (٢) ولا بابَ ثانٍ بجوارِ البابِ المحروس ═══
-- تبقى `shareholders_insert` وحدَها، وشرطُها can_modify_data(company_id).
-- وقِيس أثرُ الحذف: كلُّ الوظائفِ الحيّةِ تمرُّ بها إلّا `viewer` — ولا viewer
-- بين الأعضاءِ اليوم، ومنعُ المشاهدِ من إنشاءِ مساهمٍ هو الصوابُ نفسُه.
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.shareholders;

-- ═══ (٣) وكتالوجُ الجميعِ لا يكتبُ فيه مستأجرٌ واحد ═══
-- `roles` و`permissions` و`role_default_permissions` **بلا عمودِ شركةٍ إطلاقاً**:
-- كتالوجٌ واحدٌ يُقرأُ عند ميلادِ كلِّ شركة. وكان مالكُ أىِّ شركةٍ يستطيع أن
-- يحذفَ منه أو يُعيدَ تسميةَ وظيفةِ المالكِ نفسِها — فيصيبَ كلَّ شركةٍ قائمةٍ
-- وكلَّ شركةٍ ستُولَد. ولا سطرَ فى المشروعِ كلِّه يكتبُ فيها: الكتابةُ من
-- الهجراتِ وحدَها. **وشكلُ الجدولِ يقول إنّه للجميع، فلا يملكُه واحد.**
ALTER POLICY roles_modify_admin ON public.roles
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
ALTER POLICY permissions_modify_admin ON public.permissions
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- **وأقلُّ صلاحيّةٍ تكفى** — الحمايةُ فى طبقتين: المنحةُ والسياسةُ معاً.
REVOKE INSERT, UPDATE, DELETE ON public.roles FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.permissions FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.role_default_permissions FROM authenticated, anon;

-- ═══ (٤) الفحصُ المرجعىّ ═══
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_11_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_bad  text;
  v_seen int;
BEGIN
  -- ═══ (أ) لا شرطَ يُقارنُ الشىءَ بنفسِه ═══
  SELECT string_agg(t, ' | ') INTO v_bad FROM (
    SELECT DISTINCT c.relname || '.' || pol.polname || ' → ' || m[1] AS t
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL regexp_matches(
      coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ~ ' ||
      coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''),
      '(\m([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*\2\.\3\M)', 'g') m
    WHERE n.nspname IN ('public', 'storage')
  ) s;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: شرطٌ يقارنُ الشىءَ بنفسِه فهو صحيحٌ دائماً: % (v3.75.11)', v_bad;
  END IF;

  -- ═══ (ب) وكلُّ سياسةِ كتابةٍ يبلغُها المستخدمُ تربطُ الصفَّ بمن يكتبُه ═══
  -- المقياسُ اعتمادٌ مسجَّلٌ فى القاعدة (pg_depend) لا شكلُ نصّ: هل تمسُّ
  -- السياسةُ عموداً من أعمدةِ جدولِها؟ فإن لم تمسَّ، فهى تسألُ عن الشخصِ
  -- ولا تسألُ عن الصفّ. **ومن لا يُسأل عن صفِّه يكتبُ فى صفِّ غيرِه.**
  SELECT string_agg(t, ' | ') INTO v_bad FROM (
    SELECT c.relname || '.' || pol.polname AS t
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND pol.polcmd <> 'r'
      AND pol.polpermissive
      -- منعٌ صريحٌ ليس ثغرة
      AND coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') <> 'false'
      AND coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') <> 'false'
      -- ما لا يبلغُه إلّا مفتاحُ الخدمة
      AND coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
        || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') !~* 'service_role'
      AND NOT (array_length(pol.polroles, 1) = 1
               AND (SELECT r.rolname FROM pg_roles r WHERE r.oid = pol.polroles[1]) = 'service_role')
      -- **استثناءٌ واحدٌ معلَن**: التسجيلُ يقعُ قبل أن يكونَ للطالبِ حسابٌ أصلاً،
      -- فلا صفَّ يُربَطُ به. معدودٌ لا مسكوتٌ عنه.
      AND c.relname <> 'pending_companies'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_policy'::regclass AND d.objid = pol.oid
          AND d.refobjid = c.oid AND d.refobjsubid > 0
      )
  ) s;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: سياسةُ كتابةٍ لا تربطُ الصفَّ بمن يكتبُه: % (v3.75.11)', v_bad;
  END IF;

  -- ═══ (ج) والبابُ الثانى لا يعود ═══
  IF EXISTS (
    SELECT 1 FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
    WHERE c.relname = 'shareholders' AND pol.polname = 'Enable insert for authenticated users only'
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: عادَ البابُ الثانى على المساهمين (v3.75.11)';
  END IF;

  -- ═══ (د) وكتالوجُ الجميعِ لا يكتبُ فيه مستأجر ═══
  SELECT string_agg(t, ' · ') INTO v_bad FROM (
    SELECT c.relname AS t
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('roles', 'permissions', 'role_default_permissions')
      AND (has_table_privilege('authenticated', c.oid, 'INSERT')
        OR has_table_privilege('authenticated', c.oid, 'UPDATE')
        OR has_table_privilege('authenticated', c.oid, 'DELETE')
        OR has_table_privilege('anon', c.oid, 'INSERT'))
  ) s;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: كتالوجٌ عالمىٌّ ممنوحٌ للمستخدمِ النهائىِّ بالكتابة: % (v3.75.11)', v_bad;
  END IF;

  -- ═══ (ه) والفخُّ يُشغَّل بلا لمسِ صفٍّ واحد ═══
  -- **فخٌّ لا يُشغَّل ليس فخّاً**: يُصطنَعُ نصٌّ فيه المقارنةُ بالنفس، فيجب أن
  -- تراه القاعدةُ نفسُها التى حكمت على السياسات.
  IF NOT ('(cm.company_id = cm.company_id) and (cm.user_id = auth.uid())'
          ~ '\m([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*\1\.\2\M') THEN
    RAISE EXCEPTION 'BASELINE FAIL: القاعدةُ لا ترى المقارنةَ بالنفسِ حتى حين تُصطنَع (v3.75.11)';
  END IF;
  -- **ولا يصرخُ على البرىء**: المقارنةُ الصحيحةُ ليست مقارنةً بالنفس.
  IF ('(cm.company_id = shareholders.company_id)'
      ~ '\m([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*\1\.\2\M') THEN
    RAISE EXCEPTION 'BASELINE FAIL: القاعدةُ تصرخُ على شرطٍ سليم (v3.75.11)';
  END IF;

  -- ═══ (ز) ولا فحصٌ مرجعىٌّ يبلغُه زائرٌ أو مستخدم ═══
  -- **وحارسٌ يُفتَحُ بابُه ليس حارساً**: الفحوصُ المرجعيّةُ كلُّها
  -- SECURITY DEFINER — تعملُ بصلاحيّاتِ صاحبِ القاعدة. وأداتُها للمُطوِّرِ
  -- ولسكربتِ الدفعة، لا لزائرٍ ولا لمستخدمٍ نهائىّ. **وأقلُّ صلاحيّةٍ تكفى.**
  SELECT string_agg(t, ' · ') INTO v_bad FROM (
    SELECT p.proname AS t
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'assert\_baseline%'
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) s;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: فحصٌ مرجعىٌّ يبلغُه زائرٌ أو مستخدم: % (v3.75.11)', v_bad;
  END IF;

  -- ═══ (ح) ولا يُقرأُ فراغٌ ويُسمّى سلاماً ═══
  SELECT count(*) INTO v_seen FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND pol.polcmd <> 'r';
  IF v_seen = 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: لا سياسةَ كتابةٍ واحدةً — بحثٌ لا يجد ليس دليلَ غياب (v3.75.11)';
  END IF;
END;
$function$;

-- ═══ (٥) وبابُ الفحصِ المرجعىِّ يُغلَقُ على أهلِه ═══
--
-- **هذا الانحرافُ صنعتُه أنا، ولوحةُ التحكّمِ أمسكته.**
--
-- أبلغتْ «سلامةُ النظام» عن خطرٍ عالٍ: «دوالُّ تُعدِّلُ البياناتِ ويمكن نداؤها
-- بدون تسجيل دخول» — والدالّةُ المُسمّاةُ هى `assert_baseline_v3_75_9_check`،
-- أى فحصٌ مرجعىٌّ كتبتُه أنا. وسببُ التقاطِه أنّ داخلَه **نصّاً مصطنَعاً**
-- فيه `insert into ... do update set` يُشغَّلُ به فخُّه، فرآه الكاشفُ كتابةً.
--
-- والكاشفُ **مُحقٌّ فى قاعدتِه وإن أخطأ فى هذه الحالةِ بعينِها**: ثمانيةَ عشرَ
-- فحصاً مرجعيّاً كان يبلغُها زائرٌ بلا حساب، وثلاثون يبلغُها أىُّ مستخدم،
-- وكلُّها SECURITY DEFINER. ولا سطرَ فى المشروعِ ينادى واحداً منها — تُنادى
-- من سكربتِ الدفعةِ بمستخدمِ القاعدة. فالعلاجُ ليس إسكاتَ الكاشفِ بل
-- **إغلاقَ البابِ فعلاً**، ثمّ يحرسُ الفحصُ المرجعىُّ نفسُه ألّا يُفتَحَ ثانيةً.
DO $$
DECLARE r record; v_n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'assert\_baseline%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'v3.75.11: أُغلق بابُ % فحصاً مرجعيّاً', v_n;
END $$;
