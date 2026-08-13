-- =============================================================================
-- v3.75.28 — **ولا رخصةَ بلا طارق**
-- =============================================================================
--
-- دفعةٌ صغيرةٌ تسدِّدُ دَيناً **سمّتْه الدفعةُ السابقةُ بيدِها**.
--
-- الحكاية
-- -------
-- تركت v3.75.27 أربعةَ أسماءٍ مُعلَنةً «أبواباً لِما قبلَ الدخول»، وقالت فى
-- سجلِّها إنّ اثنَين منها **لا يناديهما اليومَ سطرٌ واحدٌ فى التطبيق**، وإنّ
-- ثالثاً مُعلَنٌ وهو **مغلَقٌ فعلاً ويُنادى بعدَ الدخول**. فقِيسَ الثلاثةُ الآن.
--
-- والقياس
-- -------
-- ١) بحثٌ فى شفرةِ التطبيقِ كلِّها (app · lib · components · hooks):
--    `check_username_available` و`generate_username_from_email` — **صفرُ نداء**.
-- ٢) وسجلُّ الطلباتِ الحىُّ على الإنتاج (٢٤ ساعة): **صفرُ طلبٍ** يبلغُ
--    بابَيهما، بينما `get_user_company_status` أكثرُ الأبوابِ طرقاً (٧٠٩٨).
-- ٣) ومن يناديهما فى القاعدة؟ دالّتانِ **كلتاهما SECURITY DEFINER**:
--    `create_user_profile_on_signup()` (زنادُ التسجيل) و`update_username()`.
--    والنداءُ داخلَ دالّةٍ كهذه يجرى **بصلاحيّةِ صاحبِها لا صاحبِ الجلسة**،
--    فلا يحتاجُ منحةً للزائرِ ولا للمستخدم.
--
-- والبرهانُ الحىُّ قبلَ الكتابة
-- -----------------------------
-- أُغلق البابانِ **داخلَ معاملةٍ أُلغيت على الإنتاج** — على الزائرِ وعلى
-- المستخدمِ المسجَّلِ وعلى الجميع — ثمّ نُودى `update_username` **بهويّةِ
-- مستخدمٍ مسجَّل**، فأجاب: `{"success": true}`. أى **الغلافُ يعمل والبابُ
-- المباشرُ مغلق**. **ولا يقالُ آمنٌ قبلَ أن يُجرَّب.**
--
-- والقانونُ الذى يمنعُ تكرارَها
-- ----------------------------
-- لم يكنِ العطبُ فى الاسمَين، بل فى أنّ **إعلاناً يبقى بعدَ أن يموتَ سببُه**.
-- **ولا رخصةَ بلا طارق**: من اليومَ لا يبقى اسمٌ فى إعلانِ ما قبلَ الدخولِ
-- إلّا إن كان **فى شفرةِ التطبيقِ سطرٌ يناديه فعلاً** — يحرسُه حارسُ المستودع
-- `check-anon-reachable-functions.js`، ويحرسُ الفحصُ المرجعىُّ هنا الجهةَ
-- المقابلة: **لا اسمٌ مُعلَنٌ وهو مغلَقٌ أصلاً** — فإعلانٌ لا يفتحُ شيئاً
-- **يُطمئنُ ولا يحرس**.
--
-- ولا هجرةَ تنزعُ هنا بيدٍ: **يُصحَّحُ الإعلانُ وحدَه، ثمّ يعملُ قانونُ
-- v3.75.27 نفسُه** فيُغلقُ ما سقط من الإعلان. **ولا يُبنى بيتٌ ثانٍ.**
--
-- والنتيجةُ المقيسة: **٣٧ ← ٣٥**، والإعلانُ **٥ ← ٢**، وكلُّ اسمٍ باقٍ
-- **يناديه سطرٌ فى شاشةٍ يراها من لا حسابَ له بعد**.
--
-- ولا صفَّ بياناتٍ يُلمَس، ولا شاشةَ تتغيّر، ولا صلاحيّةَ إنسانٍ تتّسعُ أو تضيق.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- (١) الإعلانُ يقولُ الصدق — ولا شىءَ غيرُه يُكتَبُ بيدٍ فى هذه الدفعة.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.anon_prelogin_exceptions()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  -- **الأبوابُ التى يطرقُها من لا حسابَ له بعد.**
  -- كلُّ اسمٍ هنا **دَينٌ مُعلَنٌ لا رخصة**، **ولا رخصةَ بلا طارق**: يُشترَطُ
  -- أن يناديَه سطرٌ فى شفرةِ التطبيق، وإلّا سقطَ حارسُ المستودع.
  --
  -- v3.75.28 — رُفعت ثلاثةُ أسماءٍ بعدَ قياس:
  --   check_username_available     — صفرُ نداءٍ فى الشفرة، وصفرُ طلبٍ حىّ.
  --   generate_username_from_email — كذلك. وكلتاهما تُنادى **من داخلِ**
  --                                  دالّتَين SECURITY DEFINER، فلا تحتاجُ منحة.
  --   get_user_company_status      — **مغلَقٌ للزائرِ أصلاً** ويُنادى بعدَ الدخول
  --                                  (٧٠٩٨ طلباً)، فإعلانُه كان وصفاً كاذباً.
  SELECT ARRAY[
    'find_user_by_login',  -- app/auth/login/page.tsx — تحوّلُ اسمَ المستخدمِ إلى بريد
    'auth_email_state'     -- app/auth/sign-up-success/page.tsx — بتٌّ واحدٌ ومحدودةٌ بمعدّل
  ]::text[]
$function$;

REVOKE ALL ON FUNCTION public.anon_prelogin_exceptions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anon_prelogin_exceptions() FROM anon;
REVOKE ALL ON FUNCTION public.anon_prelogin_exceptions() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.anon_prelogin_exceptions() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- (٢) ولا يُغلَقُ بابٌ باسمِه هنا: **يعملُ قانونُ v3.75.27 نفسُه** على الإعلانِ
--     الجديد، فيسقطُ ما لم يعُدْ مُعلَناً. **ولا يُبنى بيتٌ ثانٍ.**
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
    IF has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      v_auth_before := v_auth_before || r.oid;
    END IF;
    IF has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      v_svc_before := v_svc_before || r.oid;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;

  RAISE NOTICE 'v3.75.28: أُغلق % باباً سقطَ إعلانُه بعدَ القياس.',
    COALESCE(array_length(v_targets, 1), 0);

  -- (أ) **ولا يقالُ تمَّ قبلَ أن يُقاس.**
  SELECT count(*) INTO v_n
    FROM unnest(v_targets) AS t(oid)
   WHERE has_function_privilege('anon', t.oid, 'EXECUTE');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'v3.75.28: بقى % باباً يبلغُه الزائرُ بعدَ النزع.', v_n;
  END IF;

  -- (ب) **ولم يُغلَقْ على البرىء** — لا مستخدمٌ مسجَّلٌ ولا مفتاحُ خدمةٍ فقدَ باباً.
  SELECT string_agg(t.oid::regprocedure::text, ', ') INTO v_bad
    FROM unnest(v_auth_before) AS t(oid)
   WHERE NOT has_function_privilege('authenticated', t.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.28: سقطت منحةُ المستخدمِ المسجَّلِ عن: %', v_bad;
  END IF;

  SELECT string_agg(t.oid::regprocedure::text, ', ') INTO v_bad
    FROM unnest(v_svc_before) AS t(oid)
   WHERE NOT has_function_privilege('service_role', t.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.28: سقطت منحةُ مفتاحِ الخدمةِ عن: %', v_bad;
  END IF;

  -- (ج) **وبابٌ تطرقُه سياسةٌ لا يُغلَقُ فى وجهِ الطارق.**
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND p.proname = ANY (public.policy_knocked_function_names(true))
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.28: نُزعت منحةٌ تحتاجُها سياسةُ حماية: %', v_bad;
  END IF;

  -- (د) **وتُقرأُ القاعدةُ بعينِ الزائرِ نفسِه** — بصفرِ صفوفٍ لا بعطب.
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
    RAISE EXCEPTION 'v3.75.28: الزائرُ يُردُّ بعطبٍ لا بصفرِ صفوفٍ على % جدولاً: %',
      array_length(v_failed, 1), array_to_string(v_failed[1:5], ' | ');
  END IF;

  RAISE NOTICE 'v3.75.28: قُرئ % جدولاً بعينِ الزائرِ فأجابت كلُّها.', v_probed;
END $mig$;

-- =============================================================================
-- الفحصُ المرجعىُّ — **وإعلانٌ لا يفتحُ شيئاً يُطمئنُ ولا يحرس**.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_28_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_bad     TEXT;
  v_n       INT;
  v_ceiling CONSTANT INT := 36;   -- الإنتاجُ ٣٥، وفسحةُ بيتِ الاختبارِ واحدةٌ **معلومةٌ مكتوبة**
BEGIN
  -- (١) **ولا إعلانَ ميّت**: كلُّ اسمٍ فى إعلانِ ما قبلَ الدخولِ يجبُ أن يكونَ
  --     **مفتوحاً للزائرِ فعلاً**. فاسمٌ مُعلَنٌ وهو مغلَقٌ أصلاً لا يفتحُ باباً
  --     ولا يحرسُ شيئاً — هو رخصةٌ معلَّقةٌ فى الهواءِ تُطمئنُ من يقرؤُها.
  --     (وهذا بعينِه ما كُشف فى get_user_company_status.)
  SELECT string_agg(nm, ', ' ORDER BY nm) INTO v_bad
    FROM unnest(public.anon_prelogin_exceptions()) AS nm
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = nm
        AND has_function_privilege('anon', p.oid, 'EXECUTE')
   );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'v3.75.28: إعلانُ ما قبلَ الدخولِ يذكرُ اسماً لا يفتحُ باباً (مغلَقٌ أو غيرُ موجود): %',
      v_bad;
  END IF;

  -- (٢) **وإعلانٌ يتضخّمُ يصيرُ باباً خلفيّاً**: يُسقَفُ عددُ الأسماءِ المُعلَنة،
  --     فلا يُوسَّعُ الاستثناءُ صامتاً دفعةً بعدَ دفعة.
  SELECT count(*) INTO v_n FROM unnest(public.anon_prelogin_exceptions()) AS nm;
  IF v_n > 3 THEN
    RAISE EXCEPTION
      'v3.75.28: إعلانُ ما قبلَ الدخولِ اتّسع إلى % اسماً (السقف ٣) — يُقاسُ كلُّ اسمٍ قبلَ أن يُضاف.',
      v_n;
  END IF;

  -- (٣) **والسقفُ نزل**: ٣٧ ← ٣٥.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
     AND p.prorettype <> 'trigger'::regtype
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_n > v_ceiling THEN
    RAISE EXCEPTION
      'v3.75.28: زادَ ما يبلغُه الزائرُ من دالّاتِ الصلاحيّاتِ الكاملة: % (السقف %).',
      v_n, v_ceiling;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_28_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_28_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_28_check() FROM authenticated;

-- **ولا يقالُ تمَّ قبلَ أن يُقاس** — ويُعادُ فحصُ v3.75.27 هنا بعينِه، لأنّ هذه
-- الدفعةَ غيّرت البيتَ الذى يقرؤُه.
SELECT public.assert_baseline_v3_75_28_check();
SELECT public.assert_baseline_v3_75_27_check();
