-- =============================================================================
-- v3.75.27 — **وبابٌ لا تطرقُه سياسةٌ ولا يحتاجُه زائرٌ يُغلَق**
-- =============================================================================
--
-- الدفعةُ الثانيةُ والأخيرةُ من تنظيفِ الدالّاتِ ذاتِ الصلاحيّاتِ الكاملةِ التى
-- يبلغُها الزائر. **ولا تُغلَقُ بقائمةٍ مكتوبةٍ بيد، بل بقانونٍ يُقاسُ حيّاً.**
--
-- القانون
-- -------
-- دالّةٌ تعملُ بصلاحيّاتِ صاحبِها (SECURITY DEFINER) فى المخطَّطِ العامّ
-- **لا يبلغُها زائرٌ لم يُسجّلْ دخولَه إلّا لسببٍ من اثنين لا ثالثَ لهما**:
--
--   ١) **سياسةُ حمايةٍ تطرقُ بابَها** — فلو أُغلق لَما استطاع بوستجريس تقييمَ
--      السياسةِ أصلاً، ولَرُدَّ الزائرُ **بعطبٍ** بدلَ أن يُردَّ بصفرِ صفوف.
--      وهذا درسُ v3.75.24 مكتوباً بدمِه: **وبابٌ تطرقُه سياسةٌ لا يُغلَقُ فى
--      وجهِ الطارق.**
--   ٢) **أن يكونَ باباً مُعلَناً لِما قبلَ الدخول** — شاشةُ الدخولِ وشاشةُ
--      تأكيدِ البريدِ وشاشةُ التسجيل. وهذه **تسكنُ بيتاً واحداً فى القاعدة**
--      (`anon_prelogin_exceptions()`) لا نسخةً فى الحارسِ وأخرى فى الهجرة —
--      **وفمانِ فى بيتٍ واحدٍ يقولانِ فى الأمرِ الواحدِ قولَين ليس بيتاً.**
--
-- وما عدا ذلك **يُغلَق**. فيصيرُ القانونُ **مغلَقاً** لا سقفاً يتناقصُ بلا نهاية.
--
-- ولماذا يُنزَعُ من PUBLIC ومن anon معاً
-- --------------------------------------
-- **ومنعٌ عن واحدٍ لا يُغلقُ باباً مفتوحاً للجميع.** قِيست الأبوابُ السبعةُ
-- والعشرونَ فكان **٢٥ منها ممنوحاً لـPUBLIC**، فنزعُ الزائرِ وحدَه كان يتركُها
-- مفتوحةً له من البابِ العامّ — وهو مرآةُ خطأِ v3.75.23 مقلوبةً. ونزعُ PUBLIC
-- وحدَه كان يخاطرُ بالمستخدمِ المسجَّلِ وبمفتاحِ الخدمة، **فقِيسَ ذلك أيضاً**:
-- الأبوابُ السبعةُ والعشرونَ **كلُّها تحملُ منحةً صريحةً** لـauthenticated
-- ولـservice_role، فالنزعُ لا يمسُّهما. **ولا يُبنى أمانٌ على الظنّ.**
--
-- والبرهانُ الحىُّ قبلَ الكتابةِ لا بعدَها
-- ----------------------------------------
-- جُرِّبت هذه الجراحةُ كاملةً **داخلَ معاملةٍ أُلغيت** على قاعدةِ الإنتاج:
--
--   • أُغلق ٢٧ باباً، **فبقى صفرٌ منها يبلغُه الزائر**.
--   • **ولم تسقطْ منحةٌ واحدةٌ** عن مستخدمٍ مسجَّلٍ ولا عن مفتاحِ الخدمة.
--   • **و٣٣ دالّةً تطرقُها السياساتُ بقيت مفتوحةً كما هى** — لم تُمَسّ.
--   • ثمّ **انتُحلت هويّةُ الزائرِ وقُرئت ٢٣٩ جدولاً** عليها حمايةُ صفوفٍ
--     يبلغُها: **٢٣٩ أجابت وصفرٌ سقط**. أى **لم يُغلَقْ بابٌ فى وجهِ سياسة**.
--
-- وهذا الأخيرُ هو البرهانُ الحقيقىّ: **والفحصُ ليس الشىءَ الذى يفحصُه** —
-- فبصمةٌ على نصِّ السياسةِ تحكمُ على شكلِ السطر، أمّا القراءةُ بعينِ الزائرِ
-- فتحكمُ على ما يحدثُ فعلاً.
--
-- والنتيجةُ المقيسة
-- -----------------
-- **٦٤ ← ٣٧** دالّةَ صلاحيّاتٍ كاملةٍ يبلغُها الزائر (**−٢٧**). والباقى
-- **٣٣ تطرقُها السياساتُ** + **٤ مُعلَنةٌ لِما قبلَ الدخول** = ٣٧.
-- **فلم يبقَ بابٌ بلا سبب.**
--
-- ولا صفَّ بياناتٍ يُلمَس، ولا شاشةَ تتغيّر، ولا صلاحيّةَ إنسانٍ تتّسعُ أو تضيق.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- (١) بيتٌ واحدٌ لأبوابِ ما قبلَ الدخول — **ولا يُبنى بيتٌ ثانٍ**.
--     تناديه الهجرةُ والفحصُ المرجعىُّ وحارسُ المستودع، فيقولُ الثلاثةُ قولاً
--     واحداً. وتغييرُ السياسةِ يصيرُ **هجرةً تُراجَع** لا سطراً فى سكربت.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.anon_prelogin_exceptions()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  -- **الأبوابُ التى يطرقُها من لا حسابَ له بعد.**
  -- كلُّ اسمٍ هنا **دَينٌ مُعلَنٌ لا رخصة**: يُسأَلُ فى كلِّ مراجعةٍ «أما زال يُطرَق؟»
  SELECT ARRAY[
    'find_user_by_login',            -- شاشةُ الدخول: تحوّلُ اسمَ المستخدمِ إلى بريد
    'auth_email_state',              -- شاشةُ تأكيدِ البريد: بتٌّ واحدٌ ومحدودةٌ بمعدّل
    'check_username_available',      -- شاشةُ التسجيل: هل الاسمُ متاح
    'generate_username_from_email',  -- شاشةُ التسجيل: تقترحُ اسماً
    'get_user_company_status'        -- مُعلَنٌ قديماً، وهو اليومَ **مغلَقٌ فعلاً**
  ]::text[]
$function$;

REVOKE ALL ON FUNCTION public.anon_prelogin_exceptions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anon_prelogin_exceptions() FROM anon;
REVOKE ALL ON FUNCTION public.anon_prelogin_exceptions() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.anon_prelogin_exceptions() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- (٢) بيتٌ واحدٌ لسؤالٍ يُسأَلُ ثلاثَ مرّاتٍ فى هذه الدفعة:
--     **أىُّ الدالّاتِ تطرقُها سياسةُ حماية؟**
--
--     وكان الشكلُ القديمُ يقارنُ **كلَّ دالّةٍ بكلِّ سياسة** ببصمةٍ نصّيّة —
--     ٧٩٣ سياسةً × ألفَ دالّةٍ — فكان `assert_baseline_v3_75_24_check()`
--     **يستغرقُ ٣٧ ثانيةً وحدَه** (مقيسٌ على بيتِ الاختبار). وهنا تُستخرَجُ
--     الأسماءُ من نصوصِ السياساتِ **مرّةً واحدة** ثمّ يُقارَنُ بالتساوى.
--
--     **ولا يُقبَلُ تسريعٌ يغيّرُ الحكم**: قُوبل الشكلانِ على القاعدتَين معاً
--     فأعطيا **٣٦ اسماً بعينِها، وصفرَ فرقٍ فى الاتّجاهَين**.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.policy_knocked_function_names(
  p_anon_readable_only boolean DEFAULT false
)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT s.nm), '{}'::text[])
    FROM (
      SELECT (regexp_matches(
                COALESCE(pg_get_expr(q.polqual, q.polrelid), '') || ' ' ||
                COALESCE(pg_get_expr(q.polwithcheck, q.polrelid), ''),
                '([A-Za-z_][A-Za-z0-9_]*)\s*\(', 'g'))[1] AS nm
        FROM pg_policy q
       WHERE NOT p_anon_readable_only
          OR EXISTS (
               SELECT 1
                 FROM pg_class c
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.oid = q.polrelid
                  AND n.nspname = 'public'
                  AND has_table_privilege('anon', c.oid, 'SELECT')
             )
    ) s
$function$;

REVOKE ALL ON FUNCTION public.policy_knocked_function_names(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.policy_knocked_function_names(boolean) FROM anon;
REVOKE ALL ON FUNCTION public.policy_knocked_function_names(boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.policy_knocked_function_names(boolean) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- (٣) الجراحةُ نفسُها — **خاصّيّةٌ تُقاسُ، لا قائمةٌ تُكتَب**.
-- ─────────────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE
  r              record;
  v_knocked      text[] := public.policy_knocked_function_names(false);
  v_prelogin     text[] := public.anon_prelogin_exceptions();
  v_targets      oid[]  := '{}';
  v_auth_before  oid[]  := '{}';
  v_svc_before   oid[]  := '{}';
  v_n            int;
  v_bad          text;
  v_probed       int    := 0;
  v_failed       text[] := '{}';
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure::text AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.prosecdef
       AND p.prorettype <> 'trigger'::regtype
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND NOT (p.proname = ANY (v_knocked))
       AND NOT (p.proname = ANY (v_prelogin))
  LOOP
    v_targets := v_targets || r.oid;
    -- **ونازعُ المنحِ أولى الناسِ بأن يُراقَب**: يُسجَّلُ من كان يستطيعُ قبلَ
    -- النزعِ لِيُسأَلَ بعدَه. ولو كانت منحةُ المستخدمِ آتيةً من PUBLIC وحدَها
    -- **لَسقطت هنا** — وهذه بعينِها هى الفخّ، فيُشترَطُ بقاؤها بعدُ.
    IF has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      v_auth_before := v_auth_before || r.oid;
    END IF;
    IF has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      v_svc_before := v_svc_before || r.oid;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;

  RAISE NOTICE 'v3.75.27: أُغلق % باباً لا تطرقُه سياسةٌ ولا يحتاجُه زائر.',
    COALESCE(array_length(v_targets, 1), 0);

  -- (أ) **ولا يقالُ تمَّ قبلَ أن يُقاس**: لا واحدَ منها يبلغُه الزائرُ بعدَ النزع.
  SELECT count(*) INTO v_n
    FROM unnest(v_targets) AS t(oid)
   WHERE has_function_privilege('anon', t.oid, 'EXECUTE');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'v3.75.27: بقى % باباً يبلغُه الزائرُ بعدَ النزع.', v_n;
  END IF;

  -- (ب) **ولم يُغلَقْ على البرىء**: لا مستخدمٌ مسجَّلٌ فقدَ ما كان يستطيعُه.
  SELECT string_agg(t.oid::regprocedure::text, ', ') INTO v_bad
    FROM unnest(v_auth_before) AS t(oid)
   WHERE NOT has_function_privilege('authenticated', t.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.27: سقطت منحةُ المستخدمِ المسجَّلِ عن: %', v_bad;
  END IF;

  -- (ج) **ولا مفتاحُ الخدمةِ فقدَ باباً** — وعليه يقومُ مسارُ الخادم.
  SELECT string_agg(t.oid::regprocedure::text, ', ') INTO v_bad
    FROM unnest(v_svc_before) AS t(oid)
   WHERE NOT has_function_privilege('service_role', t.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.27: سقطت منحةُ مفتاحِ الخدمةِ عن: %', v_bad;
  END IF;

  -- (د) **وبابٌ تطرقُه سياسةٌ لا يُغلَقُ فى وجهِ الطارق** — شرطُ v3.75.24 يُعاد.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND p.proname = ANY (public.policy_knocked_function_names(true))
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.27: نُزعت منحةٌ تحتاجُها سياسةُ حماية: %', v_bad;
  END IF;

  -- (هـ) **والبرهانُ الأخير: تُقرأُ القاعدةُ بعينِ الزائرِ نفسِه.**
  --      كلُّ جدولٍ عليه حمايةُ صفوفٍ ويبلغُه الزائرُ يجبُ أن **يُجيب** —
  --      بصفرِ صفوفٍ لا بعطب.
  SET LOCAL ROLE anon;
  FOR r IN
    SELECT c.oid::regclass::text AS t
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
       AND has_table_privilege('anon', c.oid, 'SELECT')
     ORDER BY 1
  LOOP
    BEGIN
      EXECUTE format('SELECT 1 FROM %s LIMIT 1', r.t);
      v_probed := v_probed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed || (r.t || ' :: ' || SQLERRM);
    END;
  END LOOP;
  RESET ROLE;

  IF COALESCE(array_length(v_failed, 1), 0) > 0 THEN
    RAISE EXCEPTION 'v3.75.27: الزائرُ يُردُّ بعطبٍ لا بصفرِ صفوفٍ على % جدولاً: %',
      array_length(v_failed, 1), array_to_string(v_failed[1:5], ' | ');
  END IF;

  RAISE NOTICE 'v3.75.27: قُرئ % جدولاً بعينِ الزائرِ فأجابت كلُّها.', v_probed;
END $mig$;

-- =============================================================================
-- الفحصُ المرجعىُّ — **قانونٌ مغلَقٌ يُقاسُ حيّاً**.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_27_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  r         record;
  v_bad     TEXT;
  v_n       INT;
  v_probed  INT    := 0;
  v_failed  TEXT[] := '{}';
  v_ceiling CONSTANT INT := 38;   -- الإنتاجُ ٣٧، وفسحةُ بيتِ الاختبارِ واحدةٌ **معلومةٌ مكتوبة**
BEGIN
  -- (١) **القانونُ المغلَق**: لا دالّةَ صلاحيّاتٍ كاملةٍ يبلغُها الزائرُ إلّا
  --     لسببٍ من اثنين — سياسةٌ تطرقُها، أو بابٌ مُعلَنٌ لِما قبلَ الدخول.
  --     يُقاسُ من الكتالوجِ حيّاً، **فيشملُ ما يُولَدُ غداً بلا أن يُذكَرَ اسمُه**.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND p.prosecdef
     AND p.prorettype <> 'trigger'::regtype
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT (p.proname = ANY (public.policy_knocked_function_names(false)))
     AND NOT (p.proname = ANY (public.anon_prelogin_exceptions()));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'v3.75.27: بابٌ بصلاحيّاتٍ كاملةٍ يبلغُه الزائرُ ولا سياسةَ تطرقُه ولا إعلانَ له: %',
      v_bad;
  END IF;

  -- (٢) **وبابٌ تطرقُه سياسةٌ لا يُغلَقُ فى وجهِ الطارق** — الجهةُ الأخرى.
  --     **ونازعُ المنحِ أولى الناسِ بأن يُراقَب.**
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND p.proname = ANY (public.policy_knocked_function_names(true))
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.27: نُزعت منحةٌ تحتاجُها سياسةُ حماية: %', v_bad;
  END IF;

  -- (٣) **ولا اسمَ بلا بيت**: كلُّ اسمٍ فى إعلانِ ما قبلَ الدخولِ له دالّةٌ حيّة.
  --     **وإعلانٌ ماتَ موضوعُه يبقى رخصةً معلَّقةً فى الهواء.**
  SELECT string_agg(nm, ', ' ORDER BY nm) INTO v_bad
    FROM unnest(public.anon_prelogin_exceptions()) AS nm
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = nm
   );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.27: إعلانُ ما قبلَ الدخولِ يذكرُ اسماً لا دالّةَ له: %', v_bad;
  END IF;

  -- (٤) **والسقفُ نزل**: ٦٤ ← ٣٧.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
     AND p.prorettype <> 'trigger'::regtype
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_n > v_ceiling THEN
    RAISE EXCEPTION
      'v3.75.27: زادَ ما يبلغُه الزائرُ من دالّاتِ الصلاحيّاتِ الكاملة: % (السقف %).',
      v_n, v_ceiling;
  END IF;

  -- (٥) **والبرهانُ الحىّ**: تُقرأُ القاعدةُ بعينِ الزائرِ نفسِه فى كلِّ دفعة —
  --     **وفخٌّ لا يُشغَّل ليس فخّاً**. وثمنُه أقلُّ من ثانيةٍ واحدة (مقيس).
  SET LOCAL ROLE anon;
  FOR r IN
    SELECT c.oid::regclass::text AS t
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
       AND has_table_privilege('anon', c.oid, 'SELECT')
     ORDER BY 1
  LOOP
    BEGIN
      EXECUTE format('SELECT 1 FROM %s LIMIT 1', r.t);
      v_probed := v_probed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed || (r.t || ' :: ' || SQLERRM);
    END;
  END LOOP;
  RESET ROLE;

  IF COALESCE(array_length(v_failed, 1), 0) > 0 THEN
    RAISE EXCEPTION 'v3.75.27: الزائرُ يُردُّ بعطبٍ لا بصفرِ صفوفٍ على % جدولاً: %',
      array_length(v_failed, 1), array_to_string(v_failed[1:5], ' | ');
  END IF;

  -- **وبحثٌ لا يجد ليس دليلَ غياب**: لو لم يُقرأْ جدولٌ واحدٌ لَكان الفحصُ
  -- صامتاً لا سليماً. فيُشترَطُ أن يكونَ قد قرأَ شيئاً.
  IF v_probed < 1 THEN
    RAISE EXCEPTION 'v3.75.27: لم يُقرأْ جدولٌ واحدٌ بعينِ الزائر — فحصٌ صامتٌ لا سليم.';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_27_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_27_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_27_check() FROM authenticated;

-- **ولا يقالُ تمَّ قبلَ أن يُقاس** — يُشغَّلُ فحصُ هذه الدفعةِ على أثرِها.
-- وجيرانُه الثمانيةُ والأربعونَ تُشغَّلُ كلُّها عند الدفعِ بـ
-- `node scripts/check-baseline-assertions-run.js`، ولا تُعادُ هنا لأنّ
-- `assert_baseline_v3_75_24_check()` وحدَه يستغرقُ ٣٧ ثانية — **دَينٌ مُعلَنٌ
-- يُسدَّدُ فى دفعتِه، بالبيتِ الواحدِ الذى وُلد هنا.**
SELECT public.assert_baseline_v3_75_27_check();
