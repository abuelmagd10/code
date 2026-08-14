-- ---------------------------------------------------------------------------
-- v3.75.31 — «وبيتٌ واحدٌ للسقف»
-- ---------------------------------------------------------------------------
-- **وسقفٌ لا يمنعُ شيئاً يُطمئنُ ولا يحرس.**
--
-- أربعةُ فحوصٍ مرجعيّةٍ تحكمُ على **رقمٍ واحد**: عددُ دالّاتِ الصلاحيّاتِ الكاملةِ
-- التى يبلغُها الزائر. والواقعُ اليومَ **٣٥ فى البيتَين** (الإنتاجُ وبيتُ الاختبار).
-- وسقوفُها المكتوبةُ باليد:
--
--     assert_baseline_v3_75_24_check .... ١٣٥
--     assert_baseline_v3_75_25_check ....  ٦٥
--     assert_baseline_v3_75_27_check ....  ٣٨
--     assert_baseline_v3_75_28_check ....  ٣٦
--
-- فالسقفانِ الأوّلانِ **ميّتان**: يسمحانِ بأن يتضاعفَ ما يبلغُه الزائرُ ثلاثَ مرّاتٍ
-- ثمّ لا يصرخان. وهما مكتوبانِ باليدِ **أربعَ مرّاتٍ لرقمٍ واحد** — **ولا يُبنى بيتٌ
-- ثانٍ**، فكيف بأربعة؟ يُخفَضُ أحدُها فيبقى الباقى يُطمئن.
--
-- فيُولَدُ **البيتُ الواحد** `public.anon_reachable_ceiling()`، وتُعادُ كتابةُ الفحوصِ
-- الأربعةِ **بلا تغييرٍ إلّا سطرَ السقف** — لا يُمَسُّ تعريفُ ما تعُدُّه، فلا انحرافَ
-- فى الحكم. والتغييرُ **تضييقٌ خالص**: ١٣٥ ← ٣٦ و٦٥ ← ٣٦.
--
-- **ولا يُصدَّقُ هذا بالوصف**: تُصوَّرُ نصوصُ الأربعةِ قبلَ الجراحة، ثمّ تُقابَلُ بعدَها
-- سطراً بسطر، ويُرفَضُ كلُّ ما ليس سطرَ سقفٍ أو سطرَ تعليق. **ونصفُ جراحةٍ أسوأُ من
-- لا جراحة** — فلو لم يتغيّرْ واحدٌ منها لَصرخت الهجرة.
--
-- ولا هجرةَ بيانات، ولا صلاحيّةَ إنسانٍ اتّسعت أو ضاقت، ولا صفَّ بياناتٍ لُمس.
-- ---------------------------------------------------------------------------

-- ═══ (٠) صورةُ ما قبلَ الجراحة ═══════════════════════════════════════════════
CREATE TEMP TABLE _v3_75_31_before AS
SELECT p.proname, p.prosrc
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('assert_baseline_v3_75_24_check',
                     'assert_baseline_v3_75_25_check',
                     'assert_baseline_v3_75_27_check',
                     'assert_baseline_v3_75_28_check');

DO $do$
BEGIN
  -- **وبحثٌ لا يجد ليس دليلَ غياب**: لو لم تُصوَّرِ الأربعةُ لَكان البرهانُ لاحقاً فارغاً.
  IF (SELECT count(*) FROM _v3_75_31_before) <> 4 THEN
    RAISE EXCEPTION 'v3.75.31: لم أجدِ الفحوصَ الأربعةَ لأُصوّرَها قبلَ الجراحة (وجدتُ %).',
      (SELECT count(*) FROM _v3_75_31_before);
  END IF;
END;
$do$;

-- ═══ (١) البيتُ الواحد ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.anon_reachable_ceiling()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  -- **السقفُ الواحدُ لعددِ دالّاتِ الصلاحيّاتِ الكاملةِ التى يبلغُها الزائر.**
  --
  -- الواقعُ المقيسُ يومَ الولادة: **٣٥ فى الإنتاج و٣٥ فى بيتِ الاختبار** —
  -- والفسحةُ **واحدةٌ معلومةٌ مكتوبةٌ لا مسكوتٌ عنها**، لأنّ البيتَينِ لا يلزمُ
  -- أن يتطابقا حرفاً بحرفٍ وإن لزمَ أن يخضعا لقانونٍ واحد.
  --
  -- **ولا يُرفَعُ هذا الرقمُ ليمرَّ فحص**: رفعُه اعترافٌ بأنّ باباً فُتح، ولا يُرفَعُ
  -- إلّا بقرارٍ مكتوبٍ فى دفعتِه. **ويُخفَضُ فى دفعةِ من خفضَ الواقع** — وإلّا
  -- صارَ سقفاً لا يمنعُ شيئاً، يُطمئنُ ولا يحرس. و`assert_baseline_v3_75_31_check`
  -- يمنعُ الأمرَين: أن ينزلَ تحتَ الواقع، وأن يرتفعَ فوقَه بلا حدّ.
  SELECT 36
$function$;

REVOKE ALL ON FUNCTION public.anon_reachable_ceiling() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anon_reachable_ceiling() TO service_role;

-- ═══ (٢) الفحوصُ الأربعة — بلا تغييرٍ إلّا سطرَ السقف ════════════════════════

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_24_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_missing TEXT;
  v_open    INT;
  v_ceiling CONSTANT INT := public.anon_reachable_ceiling();
BEGIN
  -- (١) **الأرضيّة**: كلُّ دالّةٍ تطرقُها سياسةُ حمايةٍ على جدولٍ يبلغُه الزائرُ
  --     يجب أن يستطيعَ الزائرُ تنفيذَها — وإلّا رُدَّ بعطبٍ لا بصفرِ صفوف.
  --     **وتُقاسُ حيّاً من الكتالوجِ ولا تُكتَبُ قائمةً بيد.**
  --
  --     v3.75.29 — **والحكمُ نفسُه فى جزءٍ من مئةٍ من الزمن**: كان هذا البندُ
  --     يقابلُ كلَّ دالّةٍ بكلِّ سياسةٍ ببصمةٍ نصّيّة (٢٩٫٦٧ ثانيةً على الإنتاج).
  --     وصارَ ينادى **البيتَ الواحد** الذى وُلد فى v3.75.27 فيستخرجُ الأسماءَ
  --     مرّةً واحدةً ويقارنُ بالتساوى (٠٫١٠ ثانية). **ولا يُقبَلُ تسريعٌ يغيّرُ
  --     الحكم**: قُوبل الشكلانِ على السليمِ وعلى أعطابٍ مزروعةٍ فى معاملاتٍ
  --     أُلغيت، فأعطيا **الاسمَ نفسَه بالترتيبِ نفسِه**، ولم يذكرْ أىٌّ منهما
  --     باباً لا تطرقُه سياسة.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_missing
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f'
     AND p.proname = ANY (public.policy_knocked_function_names(true))
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'v3.75.24: سياسةُ حمايةٍ تطرقُ باباً مغلقاً فى وجهِ الزائرِ — تُردُّ بعطبٍ لا بصفرِ صفوف: %',
      v_missing;
  END IF;

  -- (٢) **السقف**: لا يزيدُ عددُ الدالّاتِ ذاتِ الصلاحيّاتِ الكاملةِ التى يبلغُها
  --     الزائر. وقد قِيس ١٣٤ قبلَ هذه الدفعة، وصارَ ١٣٥ **بضرورةٍ مبرهَنة** فى
  --     البندِ (١) لا برغبة. **معدودٌ لا مسكوتٌ عنه.**
  --
  --     v3.75.31 — **والسقفُ صارَ فى بيتٍ واحد**: كان ١٣٥ مكتوباً هنا باليدِ
  --     والواقعُ ٣٥، فكان سقفاً لا يمنعُ شيئاً. وصارَ ينادى
  --     `public.anon_reachable_ceiling()` — **ولا يُبنى بيتٌ ثانٍ**، ولم يُمَسَّ
  --     تعريفُ ما يُعَدُّ هنا حرفاً واحداً.
  SELECT count(*) INTO v_open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_open > v_ceiling THEN
    RAISE EXCEPTION
      'v3.75.24: زادَ ما يبلغُه الزائرُ من دالّاتِ الصلاحيّاتِ الكاملة: % (السقف %).',
      v_open, v_ceiling;
  END IF;

  -- (٣) **المصدر**: الصلاحيّةُ الافتراضيّةُ لم تعُدْ تمنحُ الزائرَ تنفيذَ كلِّ
  --     دالّةٍ جديدة — فتُولَدُ مغلقةً، ومن احتاجَ فتحاً فتحَ بقرارٍ مكتوب.
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d
      JOIN pg_namespace n ON n.oid = d.defaclnamespace
     WHERE n.nspname = 'public' AND d.defaclobjtype = 'f'
       AND d.defaclrole = 'postgres'::regrole
       AND d.defaclacl::text LIKE '%anon=X%'
  ) THEN
    RAISE EXCEPTION 'v3.75.24: الصلاحيّةُ الافتراضيّةُ عادت تمنحُ الزائرَ كلَّ دالّةٍ جديدة.';
  END IF;

  -- (٤) ومن يحتاجُ البابَ يبقى له مفتوحاً — **وحارسٌ يُغلقُ على البرىء يُطفأ.**
  IF NOT has_function_privilege('authenticated', 'public.supplier_is_active_in_my_branch(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.bill_status_is_payable(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.bill_payable_statuses()', 'EXECUTE') THEN
    RAISE EXCEPTION 'v3.75.24: أُغلق بابٌ فى وجهِ من يحتاجُه.';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_25_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_open    TEXT;
  v_n       INT;
  v_ceiling CONSTANT INT := public.anon_reachable_ceiling();
BEGIN
  -- (١) **لا دالّةَ زنادٍ ممنوحةٌ للنداء** — لا لزائرٍ ولا لمستخدم.
  --     تُقاسُ من الكتالوجِ حيّاً، فتشملُ ما يُولَدُ غداً بلا أن يُذكَرَ اسمُه هنا.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prorettype = 'trigger'::regtype
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION
      'v3.75.25: دالّةُ زنادٍ ممنوحةٌ للنداءِ ولا يستطيعُ أحدٌ نداءَها — زينةٌ على بابٍ لا يُفتَح: %',
      v_open;
  END IF;

  -- (٢) **والأزندةُ ما زالت مركَّبةً تعمل** — فالنزعُ لم يُفكَّ زناداً.
  --     يُقاسُ العددُ الحىُّ للأزندةِ غيرِ الداخليّة: لو سقطَ إلى صفرٍ لصرخ.
  SELECT count(*) INTO v_n
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE NOT t.tgisinternal;
  IF v_n < 1 THEN
    RAISE EXCEPTION 'v3.75.25: لا زنادَ مركَّبٌ فى المخطَّطِ العامّ — شىءٌ فُكَّ.';
  END IF;

  -- (٣) **والسقفُ ينزل**: كان ١٣٥ فصارَ ٦٥ بعدَ نزعِ الزنادِ من العدّ.
  --     والإنتاجُ عندَه ٦٤ وبيتُ الاختبارِ ٦٥ — ففسحةُ الإنتاجِ واحدةٌ **معلومةٌ
  --     مكتوبةٌ لا مسكوتٌ عنها**. **ومعدودٌ لا مسكوتٌ عنه.**
  --
  --     v3.75.31 — **وصارَ فى بيتٍ واحد**: كان ٦٥ مكتوباً هنا باليدِ والواقعُ ٣٥،
  --     فينادى `public.anon_reachable_ceiling()`. **ولا يُبنى بيتٌ ثانٍ** —
  --     ولم يُمَسَّ تعريفُ ما يُعَدُّ هنا حرفاً واحداً.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_n > v_ceiling THEN
    RAISE EXCEPTION
      'v3.75.25: زادَ ما يبلغُه الزائرُ من دالّاتِ الصلاحيّاتِ الكاملة: % (السقف %).',
      v_n, v_ceiling;
  END IF;

  -- (٤) **ولم يُغلَقْ على البرىء**: كلُّ دالّةٍ تطرقُها سياسةٌ على جدولٍ يبلغُه
  --     الزائرُ تبقى قابلةً للتنفيذ — وهو شرطُ v3.75.24 يُعادُ هنا لأنّ هذه
  --     الدفعةَ تنزعُ منحاً، **ونازعُ المنحِ أولى الناسِ بأن يُراقَب**.
  --
  --     v3.75.29 — نُقل هذا البندُ إلى **البيتِ الواحد** كما فى `_24_`،
  --     **بالحكمِ نفسِه** مبرهَناً بالزرعِ لا بالوصف. **ولا يُبنى بيتٌ ثانٍ.**
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f'
     AND p.proname = ANY (public.policy_knocked_function_names(true))
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.25: نُزعت منحةٌ تحتاجُها سياسةُ حماية: %', v_open;
  END IF;
END;
$function$;

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
  v_ceiling CONSTANT INT := public.anon_reachable_ceiling();
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
  --
  --     v3.75.31 — **وصارَ فى بيتٍ واحد**: `public.anon_reachable_ceiling()`.
  --     **ولا يُبنى بيتٌ ثانٍ** — ولم يُمَسَّ تعريفُ ما يُعَدُّ هنا حرفاً واحداً.
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

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_28_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_bad     TEXT;
  v_n       INT;
  v_ceiling CONSTANT INT := public.anon_reachable_ceiling();
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
  --
  --     v3.75.31 — **وصارَ فى بيتٍ واحد**: `public.anon_reachable_ceiling()`.
  --     **ولا يُبنى بيتٌ ثانٍ** — ولم يُمَسَّ تعريفُ ما يُعَدُّ هنا حرفاً واحداً.
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

-- ═══ (٣) البرهان: لم يتغيّرْ إلّا سطرُ السقف ═════════════════════════════════
-- **ولا يُصدَّقُ بالوصف.** تُقابَلُ نصوصُ الأربعةِ قبلَ الجراحةِ وبعدَها بعدَ إسقاطِ
-- **أسطرِ التعليقِ وسطرِ السقف** — فإن اختلفَ حرفٌ واحدٌ فى بقيّةِ الأسطر، وهى
-- **أسطرُ التنفيذِ وحدَها**، رُفضت الهجرةُ كلُّها. وكذلك:
--   • كلُّ واحدٍ منها **تغيّرَ فعلاً** — **ونصفُ جراحةٍ أسوأُ من لا جراحة**؛
--   • وفيه **سطرُ سقفٍ واحدٌ لا أكثر**، وينادى البيتَ الواحدَ ولا يحملُ رقماً بيد.
DO $do$
DECLARE
  r        record;
  v_old    TEXT;
  v_new    TEXT;
  v_oldc   TEXT;
  v_newc   TEXT;
  v_lines  INT;
BEGIN
  FOR r IN SELECT b.proname, b.prosrc AS old_src FROM _v3_75_31_before b ORDER BY b.proname LOOP
    v_old := r.old_src;

    SELECT p.prosrc INTO v_new
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.proname;

    IF v_new IS NULL THEN
      RAISE EXCEPTION 'v3.75.31: اختفى الفحصُ % بعدَ الجراحة.', r.proname;
    END IF;

    -- **ونصفُ جراحةٍ أسوأُ من لا جراحة**
    IF v_new = v_old THEN
      RAISE EXCEPTION 'v3.75.31: لم يتغيّرْ % — جراحةٌ نصفُها لم يقع.', r.proname;
    END IF;

    -- سطرُ سقفٍ واحدٌ لا أكثر، وينادى البيتَ ولا يحملُ رقماً مكتوباً بيد
    SELECT count(*) INTO v_lines
      FROM regexp_split_to_table(v_new, E'\n') AS l
     WHERE l LIKE '%v_ceiling CONSTANT INT :=%';
    IF v_lines <> 1 THEN
      RAISE EXCEPTION 'v3.75.31: % فيه % سطرَ سقفٍ لا سطرٌ واحد.', r.proname, v_lines;
    END IF;

    IF v_new NOT LIKE '%v_ceiling CONSTANT INT := public.anon_reachable_ceiling();%' THEN
      RAISE EXCEPTION 'v3.75.31: سقفُ % لا ينادى البيتَ الواحد.', r.proname;
    END IF;

    -- أسطرُ التنفيذِ وحدَها — بلا تعليقٍ وبلا سطرِ السقف
    SELECT string_agg(t.l, E'\n' ORDER BY t.rn) INTO v_oldc
      FROM regexp_split_to_table(v_old, E'\n') WITH ORDINALITY AS t(l, rn)
     WHERE btrim(t.l) NOT LIKE '--%'
       AND t.l NOT LIKE '%v_ceiling CONSTANT INT :=%';

    SELECT string_agg(t.l, E'\n' ORDER BY t.rn) INTO v_newc
      FROM regexp_split_to_table(v_new, E'\n') WITH ORDINALITY AS t(l, rn)
     WHERE btrim(t.l) NOT LIKE '--%'
       AND t.l NOT LIKE '%v_ceiling CONSTANT INT :=%';

    IF v_oldc IS DISTINCT FROM v_newc THEN
      RAISE EXCEPTION
        'v3.75.31: تغيّرَ فى % سطرُ تنفيذٍ ليس سطرَ السقف — الهجرةُ تدّعى تضييقاً وتفعلُ غيرَه.',
        r.proname;
    END IF;
  END LOOP;
END;
$do$;

DROP TABLE IF EXISTS _v3_75_31_before;

-- ═══ (٤) الفحصُ المرجعىُّ الجديد ═════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_31_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_bad     TEXT;
  v_n       INT;
  v_live    INT;
  v_ceiling INT;
  v_slack   CONSTANT INT := 5;
BEGIN
  -- (١) **ولا يُبنى بيتٌ ثانٍ للسقف.** كلُّ فحصٍ مرجعىٍّ يَعُدُّ دالّاتِ الصلاحيّاتِ
  --     الكاملةِ التى يبلغُها الزائرُ **يجبُ أن ينادى البيتَ الواحد**. وهذه
  --     الخاصّيّةُ **لا أثرَ لها فى الكتالوج** — فتُقرأُ من النصّ، وهو استثناءٌ
  --     مذكورٌ لا مسكوتٌ عنه، سبقَ مثلُه فى v3.75.29.
  --
  --     **وهذا هو الفخُّ الحىّ**: فحصٌ خامسٌ يُولَدُ غداً ويكتبُ سقفَه بيدِه
  --     يُكشَفُ فى أوّلِ دفعةٍ **بلا أن يُذكَرَ اسمُه هنا**.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname ~ '^assert_baseline_'
     AND p.prosrc LIKE '%p.prosecdef%'
     AND p.prosrc LIKE '%has_function_privilege(''anon''%'
     AND p.prosrc NOT LIKE '%anon_reachable_ceiling%';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'v3.75.31: فحصٌ مرجعىٌّ يَعُدُّ ما يبلغُه الزائرُ ولا ينادى البيتَ الواحدَ للسقف: %',
      v_bad;
  END IF;

  -- (٢) **وبحثٌ لا يجد ليس دليلَ غياب.** البندُ (١) يمرُّ صامتاً لو اختفت الفحوصُ
  --     الأربعةُ أو أُعيدت كتابتُها بلا عدّ. فيُشترَطُ أن تكونَ الأربعةُ حيّةً
  --     وأن تنادىَ البيتَ **بالاسم**.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('assert_baseline_v3_75_24_check',
                       'assert_baseline_v3_75_25_check',
                       'assert_baseline_v3_75_27_check',
                       'assert_baseline_v3_75_28_check')
     AND p.prosrc LIKE '%anon_reachable_ceiling%';
  IF v_n <> 4 THEN
    RAISE EXCEPTION
      'v3.75.31: الفحوصُ التى تنادى البيتَ الواحدَ % لا ٤ — أحدُها ماتَ أو استعادَ سقفاً بيدِه.',
      v_n;
  END IF;

  -- (٣) **والسقفُ فوقَ الواقعِ ولا يُرفَعُ بلا حدّ.**
  --     • تحتَ الواقعِ ← حارسٌ يصرخُ على البرىءِ فى كلِّ دفعة، **فيُطفأ**.
  --     • فوقَه بلا حدٍّ ← **سقفٌ لا يمنعُ شيئاً يُطمئنُ ولا يحرس**، وهو بعينِه
  --       العطبُ الذى وُلدت هذه الدفعةُ لتُصلحَه (١٣٥ و٦٥ والواقعُ ٣٥).
  --     فالفسحةُ **مسقوفةٌ هى الأخرى**، ومن خفضَ الواقعَ خفضَ السقفَ فى دفعتِه.
  v_ceiling := public.anon_reachable_ceiling();

  SELECT count(*) INTO v_live
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_ceiling < v_live THEN
    RAISE EXCEPTION
      'v3.75.31: السقفُ % تحتَ الواقعِ % — حارسٌ يصرخُ على البرىءِ فى كلِّ دفعة.',
      v_ceiling, v_live;
  END IF;

  IF v_ceiling > v_live + v_slack THEN
    RAISE EXCEPTION
      'v3.75.31: السقفُ % والواقعُ % — فسحةٌ تتجاوزُ % فلا يمنعُ السقفُ شيئاً. يُخفَضُ فى دفعةِ من خفضَ الواقع.',
      v_ceiling, v_live, v_slack;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_31_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_31_check() TO service_role;

-- ═══ (٥) وفخٌّ لا يُشغَّل ليس فخّاً ═══════════════════════════════════════════
SELECT public.assert_baseline_v3_75_31_check();
