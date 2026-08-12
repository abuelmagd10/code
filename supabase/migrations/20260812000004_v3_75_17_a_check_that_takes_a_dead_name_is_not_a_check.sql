-- ============================================================================
-- v3.75.17 — «وفحصٌ يقبلُ اسماً ميّتاً بدلَ الحىِّ ليس فحصاً»
-- ============================================================================
--
-- ═══ (أ) فمٌ يقبلُ مفتاحاً لا يفتحُ شيئاً ═══
--
-- أربعةُ فحوصٍ مرجعيّةٍ تسألُ عن سياساتِ الاعتماد، وتقولُ فى ستّةِ مواضع:
--
--     IF v_def NOT LIKE '%''owner''%'
--        OR (v_def NOT LIKE '%''admin''%' AND v_def NOT LIKE '%''general_manager''%')
--     THEN RAISE EXCEPTION ...
--
-- أى: «يجب أن تُسمّىَ السياسةُ المالكَ، وأن تُسمّىَ المديرَ **أو** general_manager».
-- والاسمُ الثانى **لا يستطيع أحدٌ أن يشغله** منذ v3.74.993. فالتسامحُ يعنى شيئاً
-- واحداً: لو أُعيدت كتابةُ سياسةٍ فسمّت general_manager وحدَه بدلَ admin،
-- **لمرَّ الفحصُ راضياً** بينما البابُ قد أُغلق فى وجهِ كلِّ مديرٍ عامّ.
--
--     **وفحصٌ يقبلُ اسماً ميّتاً بدلَ الحىِّ ليس فحصاً.**
--
-- والتشديدُ محايدٌ اليوم، أقوى غداً — وليس رهاناً على عيّنة: بعد v3.75.16 قِيست
-- القاعدةُ كلُّها فكان **صفرَ سياسةٍ تحملُ general_manager**. فالطرفُ الثانى من
-- «أو» كاذبٌ فى كلِّ الحالات، ومرورُ الفحوصِ اليومَ لا يأتى إلّا من `admin`.
-- وحذفُ طرفٍ كاذبٍ من «أو» لا يغيّرُ قيمةَ الشرطِ الآن، ويمنعُ غداً ما كان يمرّ.
--
-- ═══ (ب) وأسوأُ منه: فحصٌ **يشترطُ** الاسمَ الميّت ═══
--
-- على قاعدةِ الاختبارِ يقولُ `assert_baseline` نفسُه:
--
--     IF NOT EXISTS (... p.proname='can_modify_data'
--       AND pg_get_functiondef(p.oid) LIKE '%purchasing_officer%'
--       AND pg_get_functiondef(p.oid) LIKE '%general_manager%') THEN
--       RAISE EXCEPTION 'can_modify_data is missing modern operational roles';
--
-- فهو **يطلبُ من الدالّةِ أن تحملَ اسماً ميّتاً**، ولا يسألُ أصلاً عن ثلاثِ
-- وظائفَ حيّةٍ يسألُ عنها الإنتاج: `booking_officer` و`manufacturing_officer`
-- و`hr_officer`. والنتيجةُ ليست نظريّة: **هذا الفحصُ ساقطٌ على قاعدةِ الاختبارِ
-- الآن** (`can_modify_data` نظيفةٌ ومتطابقةٌ على القاعدتَين، بصمةً واحدة). ولم
-- يظهرْ لأنّ الحارسَ يقرأُ قاعدةَ الإنتاجِ وحدَها.
--
--     **وحارسٌ على بيتٍ واحدٍ من بيتَين ليس حارساً.**
--
-- فيُستبدَلُ الشرطُ الميّتُ بالشروطِ الثلاثةِ الحيّة — لا يُحذَفُ فيضعُف، بل
-- يُنقَلُ إلى ما يسألُ عنه الإنتاجُ فعلاً.
--
-- ═══ (ج) وثلاثةُ مواضعَ تسمّى أسماءً لا تُشغَل ═══
--
--   • `current_user_record_visibility` و`current_user_resource_visibility`:
--     `'supervisor'` داخلَ قائمةِ نطاقِ الفرع.
--   • `ai_current_user_allowed_resources`: فرعا `CASE` كاملانِ لـ`'sales'`
--     و`'employee'`.
--
-- والبرهانُ منطقىٌّ لا عيّنة: القيمةُ المقارَنةُ فى الثلاثةِ تأتى من
-- `company_members.role`، وعليه قيدٌ **مُتحقَّقٌ منه** يحصرُه فى الأحدَ عشرَ اسماً
-- الحيّة. **فلا يساوى أبداً اسماً ميّتاً لأىِّ صفٍّ ممكن** — وحذفُ عنصرٍ لا
-- يتحقّقُ من قائمةِ «أو»، أو فرعٍ لا يُبلَغُ من `CASE`، لا يغيّرُ النتيجة.
--
-- ═══ (د) ونظافةٌ باليدِ لا تُورَّثُ لقاعدةٍ جديدة ═══
--
-- `get_user_approval_badges` نظيفةٌ على الإنتاج، وعلى الاختبارِ ما زالت تقول
-- `IF v_is_admin OR v_role = 'general_manager' THEN`. أى أنّ أحداً نظّفَ الإنتاجَ
-- بيدِه دونَ هجرة — **فأىُّ قاعدةٍ جديدةٍ تُبنى من الهجراتِ تُولَدُ بالاسمِ
-- الميّت**. وقِيس ذلك ولم يُخمَّن: نزعُ ` OR v_role = 'general_manager'` من نسخةِ
-- الاختبارِ يُنتجُ **بصمةً مطابقةً تماماً** لنسخةِ الإنتاج
-- (`266512bc8a1dc220a56929d6d9e14163`).
--
--     **ونظافةٌ باليدِ لا تُورَّث.**
--
-- ويُصحَّحُ معها تعليقٌ بقىَ بعد موتِ سببِه: «Only owner/admin/general_manager».
-- **وإعلانٌ يبقى بعد موتِ سببِه يصيرُ غطاءً.**
--
-- ═══ ولا نسخَ بيد ═══
--
-- كلُّ تحويلٍ هنا **يقرأُ التعريفَ من القاعدةِ ويعيدُ إصدارَه** بعد نزعِ جزءٍ
-- محدَّدٍ بنصِّه أو استبدالِه. لا تُكتَبُ دالّةٌ باليدِ ولا تُهدَمُ وتُبنى. وكلُّ
-- `replace` **لا أثرَ له إن كان الجزءُ غائباً** — فالهجرةُ تُعادُ بلا ضرر،
-- وتصلحُ لقاعدةٍ وُلدت أمسِ كما لقاعدةٍ عمرُها سنة.
--
-- **لا شاشةَ تتغيّر، ولا منطقَ أعمالٍ يتغيّر، ولا صفَّ بياناتٍ يُلمَس.**
-- ============================================================================

DO $mig$
DECLARE
  r        record;
  v_def    text;
  v_new    text;
  v_fns    int := 0;
  v_left   int := 0;
  v_names  text[];
  v_roles  text[];
BEGIN
  -- ── (١) الفحوصُ المرجعيّة: تسامحٌ يُنزَع، وشرطٌ ميّتٌ يُستبدَلُ بالحىّ ──
  FOR r IN
    SELECT p.oid, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('assert_baseline',
                         'assert_baseline_v3_74_430_check',
                         'assert_baseline_v3_74_437_check',
                         'assert_baseline_v3_74_438_check')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := v_def;

    -- الطرفُ الكاذبُ من «أو». الأقواسُ الباقيةُ حولَ شرطٍ واحدٍ سليمةٌ نحويّاً.
    v_new := replace(v_new, $q$ AND v_def NOT LIKE '%''general_manager''%'$q$, '');
    v_new := replace(v_new, $q$ AND v_approve_def NOT LIKE '%''general_manager''%'$q$, '');
    v_new := replace(v_new, $q$ AND v_pay_ins_def NOT LIKE '%''general_manager''%'$q$, '');
    v_new := replace(v_new, $q$ AND v_pr_ins_def NOT LIKE '%''general_manager''%'$q$, '');

    -- والشرطُ الذى يطلبُ اسماً ميّتاً يُنقَلُ إلى الوظائفِ الحيّةِ الثلاث،
    -- كما يسألُ عنها الإنتاجُ اليوم. لا يُحذَفُ فيضعُفَ الفحص.
    v_new := replace(v_new,
$q$    AND pg_get_functiondef(p.oid) LIKE '%general_manager%') THEN
$q$,
$q$    AND pg_get_functiondef(p.oid) LIKE '%booking_officer%'
    AND pg_get_functiondef(p.oid) LIKE '%manufacturing_officer%'
    AND pg_get_functiondef(p.oid) LIKE '%hr_officer%') THEN
$q$);

    IF v_new <> v_def THEN
      EXECUTE v_new;
      v_fns := v_fns + 1;
    END IF;
  END LOOP;

  -- ── (٢) 'supervisor' فى دالّتَى الرؤية ──────────────────────────────────
  FOR r IN
    SELECT p.oid, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('current_user_record_visibility',
                         'current_user_resource_visibility')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def,
                     $q$'manager', 'accountant', 'supervisor', 'store_manager',$q$,
                     $q$'manager', 'accountant', 'store_manager',$q$);
    -- تعليقٌ يقولُ إنّ general_manager ينضمُّ إلى المالكِ والمدير، وقد نُزع
    -- الاسمُ من الوجودِ منذ v3.74.993.
    v_new := replace(v_new,
                     $q$  -- v3.74.317: general_manager joins owner/admin at the company scope$q$,
                     $q$  -- owner/admin see the whole company$q$);
    IF v_new <> v_def THEN
      EXECUTE v_new;
      v_fns := v_fns + 1;
    END IF;
  END LOOP;

  -- ── (٣) فرعا CASE ميّتانِ فى مساعِدِ الذكاءِ الاصطناعىّ ──────────────────
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'ai_current_user_allowed_resources'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def,
$q$        WHEN 'sales' THEN ARRAY[
          'dashboard','customers','estimates','sales_orders','invoices',
          'product_availability']
$q$, '');
    v_new := replace(v_new,
$q$        WHEN 'employee' THEN ARRAY['dashboard','attendance']
$q$, '');
    IF v_new <> v_def THEN
      EXECUTE v_new;
      v_fns := v_fns + 1;
    END IF;
  END LOOP;

  -- ── (٤) ونظافةٌ باليدِ لا تُورَّث ────────────────────────────────────────
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_user_approval_badges'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, $q$ OR v_role = 'general_manager'$q$, '');
    v_new := replace(v_new, $q$owner/admin/general_manager$q$, $q$owner/admin$q$);
    IF v_new <> v_def THEN
      EXECUTE v_new;
      v_fns := v_fns + 1;
    END IF;
  END LOOP;

  -- ── (٥) ولا يُقالُ «تمّ» بلا قياس ───────────────────────────────────────
  SELECT count(*) INTO v_left
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (
       (p.proname IN ('assert_baseline','assert_baseline_v3_74_430_check',
                      'assert_baseline_v3_74_437_check','assert_baseline_v3_74_438_check',
                      'get_user_approval_badges')
        AND strpos(pg_get_functiondef(p.oid), 'general_manager') > 0)
       OR
       (p.proname IN ('current_user_record_visibility','current_user_resource_visibility')
        AND strpos(pg_get_functiondef(p.oid), $q$'supervisor'$q$) > 0)
       OR
       (p.proname = 'ai_current_user_allowed_resources'
        AND (strpos(pg_get_functiondef(p.oid), $q$WHEN 'sales'$q$) > 0
          OR strpos(pg_get_functiondef(p.oid), $q$WHEN 'employee'$q$) > 0))
     );

  IF v_left > 0 THEN
    RAISE EXCEPTION 'v3.75.17: بقىَ % موضعاً لم يُنزَع — التحويلُ لم يكتمل', v_left;
  END IF;

  -- ── (٦) والبرهانُ يقومُ على مقدّمةٍ، فتُثبَّتُ المقدّمة ──────────────────
  -- كلُّ ما نُزع أعلاه إنّما جاز نزعُه لأنّ عمودَ العضويّةِ محصورٌ فى الأسماءِ
  -- الحيّة. فلو اتّسع القيدُ لاسمٍ آخرَ لانقلبَ البرهان. ولا يُقارَنُ بقائمةٍ
  -- مكتوبةٍ هنا بل بجدولِ الوظائفِ نفسِه — **ولا يُحكَمُ بعددٍ مكتوبٍ بيد.**
  SELECT array_agg(m[1] ORDER BY m[1]) INTO v_names
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace,
    LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') AS m
   WHERE n.nspname = 'public' AND cl.relname = 'company_members'
     AND c.conname = 'company_members_role_check';

  SELECT array_agg(name ORDER BY name) INTO v_roles FROM public.roles;

  IF v_names IS DISTINCT FROM v_roles THEN
    RAISE EXCEPTION 'v3.75.17: مفرداتُ العضويّةِ لا تطابقُ جدولَ الوظائف — % مقابل %',
      v_names, v_roles;
  END IF;

  RAISE NOTICE 'v3.75.17: حُوِّلت % دالّةً، ولا موضعَ باقياً، والمقدّمةُ قائمة (% اسماً).',
    v_fns, array_length(v_roles, 1);
END
$mig$;


-- ============================================================================
-- الفحصُ المرجعىُّ — يُشغَّلُ مع كلِّ دفعةٍ بعد اليوم
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_17_check()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_bad    int;
  v_names  text[];
  v_roles  text[];
BEGIN
  -- (أ) ولا يقبلُ فحصٌ اسماً ميّتاً بدلَ الحىّ، ولا يشترطُه
  SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('assert_baseline','assert_baseline_v3_74_430_check',
                       'assert_baseline_v3_74_437_check','assert_baseline_v3_74_438_check')
     AND strpos(pg_get_functiondef(p.oid), 'general_manager') > 0;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: عادَ general_manager إلى % فحصاً مرجعيّاً (v3.75.17)', v_bad;
  END IF;

  -- (ب) ولا تسمّى دالّةُ رؤيةٍ وظيفةً لا يشغلها أحد
  SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('current_user_record_visibility','current_user_resource_visibility')
     AND strpos(pg_get_functiondef(p.oid), '''supervisor''') > 0;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: عادَ supervisor إلى % دالّةَ رؤية (v3.75.17)', v_bad;
  END IF;

  -- (ج) ولا فرعَ لا يُبلَغُ فى مساعِدِ الذكاءِ الاصطناعىّ
  SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'ai_current_user_allowed_resources'
     AND (strpos(pg_get_functiondef(p.oid), 'WHEN ''sales''') > 0
       OR strpos(pg_get_functiondef(p.oid), 'WHEN ''employee''') > 0);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: عادَ فرعُ CASE ميّتٌ إلى ai_current_user_allowed_resources (v3.75.17)';
  END IF;

  -- (د) ونظافةُ شارةِ الاعتماداتِ ليست يدويّة
  SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_user_approval_badges'
     AND strpos(pg_get_functiondef(p.oid), 'general_manager') > 0;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: عادَ general_manager إلى get_user_approval_badges (v3.75.17)';
  END IF;

  -- (ه) وأنّ الفحصَ الكبيرَ يسألُ عن الوظائفِ التشغيليّةِ الحيّةِ الأربع
  SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'assert_baseline'
     AND (strpos(pg_get_functiondef(p.oid), '%purchasing_officer%') = 0
       OR strpos(pg_get_functiondef(p.oid), '%booking_officer%') = 0
       OR strpos(pg_get_functiondef(p.oid), '%manufacturing_officer%') = 0
       OR strpos(pg_get_functiondef(p.oid), '%hr_officer%') = 0);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: assert_baseline لم يعُدْ يسألُ عن الوظائفِ التشغيليّةِ الأربع (v3.75.17)';
  END IF;

  -- (و) والمقدّمةُ التى قامَ عليها كلُّ نزعٍ أعلاه — تُقاسُ ولا تُفترَض
  SELECT array_agg(m[1] ORDER BY m[1]) INTO v_names
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace,
    LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') AS m
   WHERE n.nspname = 'public' AND cl.relname = 'company_members'
     AND c.conname = 'company_members_role_check';

  SELECT array_agg(name ORDER BY name) INTO v_roles FROM public.roles;

  IF v_names IS NULL OR v_names IS DISTINCT FROM v_roles THEN
    RAISE EXCEPTION 'BASELINE FAIL: مفرداتُ العضويّةِ لا تطابقُ جدولَ الوظائف — % مقابل % (v3.75.17)',
      v_names, v_roles;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.assert_baseline_v3_75_17_check() IS
  'v3.75.17 — وفحصٌ يقبلُ اسماً ميّتاً بدلَ الحىِّ ليس فحصاً.';

-- وحارسٌ يُفتَحُ بابُه ليس حارساً: الفحوصُ المرجعيّةُ لا يبلغُها زائرٌ ولا
-- مستخدمٌ مسجَّل (v3.75.11).
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_17_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_17_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_17_check() FROM authenticated;
