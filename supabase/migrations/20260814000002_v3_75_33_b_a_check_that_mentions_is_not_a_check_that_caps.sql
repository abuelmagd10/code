-- ---------------------------------------------------------------------------
-- v3.75.33-b — «وذِكرٌ ليس حُكماً، وشكلُ النصِّ ليس خاصّيّة»
-- ---------------------------------------------------------------------------
-- **حارسٌ كتبتُه فى v3.75.31 صرخَ على برىءٍ وُلد فى v3.75.33.**
--
-- البندُ (١) من `assert_baseline_v3_75_31_check` كان يقول: كلُّ فحصٍ مرجعىٍّ
-- **«يَعُدُّ ما يبلغُه الزائرُ»** يجبُ أن ينادىَ البيتَ الواحدَ للسقف. وقاسَ ذلك
-- بشكلِ النصّ:
--
--     AND p.prosrc LIKE '%p.prosecdef%'
--     AND p.prosrc LIKE '%has_function_privilege(''anon''%'
--
-- فلمّا وُلد `assert_baseline_v3_75_33_check` — وهو **لا يَعُدُّ شيئاً ولا سقفَ
-- له**، إنّما يتحقّقُ أنّ بابَينِ بعينِهما مغلقانِ فى وجهِ الزائر (فيذكرُ
-- `has_function_privilege('anon'`) وأنّ أربعَ دالّاتٍ ما زالت بصلاحيّاتٍ كاملة
-- (فيذكرُ `p.prosecdef`) — **طابقَ الشكلَ فصرخَ عليه**، ووقفت دفعةٌ سليمةٌ تماماً
-- بعدَ عشرِ دقائقَ من الحراسةِ والبناء.
--
-- **والعطبُ ليس فى الفحصِ الجديدِ بل فى الحارسِ القديم**: ذِكرُ عبارةٍ ليس عدّاً،
-- **والجوارُ ليس انتماءً**. ولم تُغيَّرْ صياغةُ الفحصِ الجديدِ ليفلتَ من النمط —
-- **ذاك تهرّبٌ لا علاج**، وهو الدرسُ المكتوبُ بيدِ من سبقنا فى `parseTriggers`.
--
-- **والخاصّيّةُ الحقيقيّةُ هى السقفُ نفسُه**، لا ما يُذكَرُ بجوارِه: من أعلنَ سقفاً
-- وجبَ أن يقرأَه من البيتِ الواحد. فصارَ البندُ:
--
--     AND p.prosrc ~ 'v_ceiling[[:space:]]+CONSTANT'
--     AND p.prosrc NOT LIKE '%anon_reachable_ceiling%'
--
-- وقِيس قبلَ الكتابة: **الأربعةُ وحدَها تُعلنُ سقفاً** (`_24_` و`_25_` و`_27_`
-- و`_28_`)، وكلُّها تقرؤُه من البيت؛ و`_31_` و`_33_` لا تُعلنانِ سقفاً فلا
-- تُحاكَمان؛ وثلاثةُ فحوصٍ أخرى تذكرُ `prosecdef` ولا تذكرُ الزائرَ أصلاً.
-- **فالبندُ الجديدُ أضيقُ وأصدق: يمسكُ كلَّ من يكتبُ سقفاً بيدِه، ولا يمسُّ من
-- لا سقفَ له.**
--
-- ولا يتغيّرُ فى هذا الفحصِ إلّا شرطا البندِ (١). ولا هجرةَ بيانات، ولا صلاحيّة.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _v3_75_33_b_before AS
SELECT p.proname, p.prosrc
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'assert_baseline_v3_75_31_check';

DO $do$
BEGIN
  IF (SELECT count(*) FROM _v3_75_33_b_before) <> 1 THEN
    RAISE EXCEPTION 'v3.75.33-b: لم أجدِ الفحصَ لأُصوّرَه قبلَ الجراحة.';
  END IF;
END;
$do$;

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
  -- (١) **ولا يُبنى بيتٌ ثانٍ للسقف.** كلُّ فحصٍ مرجعىٍّ **يُعلنُ سقفاً** لهذا
  --     العددِ يجبُ أن يقرأَه من البيتِ الواحد. وهذه الخاصّيّةُ **لا أثرَ لها فى
  --     الكتالوج** — فتُقرأُ من النصّ، وهو استثناءٌ مذكورٌ لا مسكوتٌ عنه.
  --
  --     **وشكلُ النصِّ ليس خاصّيّة** — v3.75.33-b: كان هذا البندُ يمسكُ كلَّ فحصٍ
  --     **يذكرُ** `p.prosecdef` و`has_function_privilege('anon'`، فصرخَ على
  --     `assert_baseline_v3_75_33_check` وهو **لا يَعُدُّ شيئاً ولا سقفَ له**،
  --     إنّما يتحقّقُ أنّ بابَينِ مغلقانِ وأنّ أربعاً بصلاحيّاتٍ كاملة. **وذِكرٌ
  --     ليس عدّاً، والجوارُ ليس انتماءً.** فصارَ يمسكُ **إعلانَ السقفِ نفسَه**:
  --     أضيقُ، وأصدقُ، ولا يمسُّ من لا سقفَ له.
  --
  --     **وهذا هو الفخُّ الحىّ**: فحصٌ خامسٌ يُولَدُ غداً ويكتبُ سقفَه بيدِه
  --     يُكشَفُ فى أوّلِ دفعةٍ **بلا أن يُذكَرَ اسمُه هنا**.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname ~ '^assert_baseline_'
     AND p.prosrc ~ 'v_ceiling[[:space:]]+CONSTANT'
     AND p.prosrc NOT LIKE '%anon_reachable_ceiling%';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'v3.75.31: فحصٌ مرجعىٌّ يُعلنُ سقفاً بيدِه ولا يقرؤُه من البيتِ الواحد: %',
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

-- ═══ البرهان: لم يتغيّرْ إلّا البندُ (١) ═════════════════════════════════════
-- **ولا يُصدَّقُ بالوصف.** والدعوى محدَّدة: **إعلانُ المتغيّرات** كما هو حرفاً
-- بحرف، **وكلُّ ما بعدَ البندِ (١)** كما هو حرفاً بحرف. فما تغيّرَ محصورٌ بينهما.
--
-- (وأوّلُ صياغةٍ لهذا البرهانِ **رفضت الهجرة**، لأنّى غيّرتُ نصَّ الرسالةِ أيضاً
-- ولم أحسبْ لها حساباً. والبرهانُ كان مُحقّاً، فلم أُوسّعْه ليقبلَ ما رفض، بل
-- **حُدِّدت الدعوى** لتقولَ الصدقَ عمّا وقعَ فعلاً — **ونصفُ برهانٍ أسوأُ من لا
-- برهان**.)
DO $do$
DECLARE
  v_old    TEXT;
  v_new    TEXT;
  k_anchor CONSTANT TEXT := 'assert_baseline_v3_75_25_check';
BEGIN
  SELECT prosrc INTO v_old FROM _v3_75_33_b_before;
  SELECT p.prosrc INTO v_new
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'assert_baseline_v3_75_31_check';

  IF v_new = v_old THEN
    RAISE EXCEPTION 'v3.75.33-b: لم يتغيّرْ شىء — جراحةٌ لم تقع.';
  END IF;

  IF substring(v_old from 1 for position('BEGIN' in v_old))
     IS DISTINCT FROM
     substring(v_new from 1 for position('BEGIN' in v_new)) THEN
    RAISE EXCEPTION 'v3.75.33-b: تغيّرَ إعلانُ المتغيّرات — والدعوى أنّه لم يُمَسّ.';
  END IF;

  IF position(k_anchor in v_old) < 1 OR position(k_anchor in v_new) < 1 THEN
    RAISE EXCEPTION 'v3.75.33-b: لم أجدْ مِرساةَ البندِ (٢) — برهانٌ بلا مِرساةٍ ليس برهاناً.';
  END IF;

  IF substr(v_old, position(k_anchor in v_old))
     IS DISTINCT FROM
     substr(v_new, position(k_anchor in v_new)) THEN
    RAISE EXCEPTION
      'v3.75.33-b: تغيّرَ شىءٌ بعدَ البندِ (١) — الهجرةُ تدّعى تصحيحاً وتفعلُ غيرَه.';
  END IF;
END;
$do$;

DROP TABLE IF EXISTS _v3_75_33_b_before;

-- ═══ والفخُّ يُشغَّل: يبرّئُ البرىءَ ويمسكُ المذنب ═══════════════════════════
DO $do$
DECLARE
  v_err   TEXT;
  k_plant CONSTANT TEXT := 'assert_baseline_v9_99_99_check';
BEGIN
  -- (أ) البرىءُ يمرّ: `_33_` لا سقفَ له، فلا يُحاكَم.
  PERFORM public.assert_baseline_v3_75_31_check();

  -- (ب) والمذنبُ يُمسَك: فحصٌ خامسٌ يكتبُ سقفَه بيدِه — يُزرَعُ ثمّ يُلغى.
  --
  --     **وزَرْعٌ يُلغى ليس ادّعاءً.** يُكتَبُ الزرعُ بنصٍّ يُنفَّذ لا بجملةٍ صريحة،
  --     لأنّ حارسَ «الهجرةُ تصفُ القاعدة» يقرأُ كلَّ `CREATE FUNCTION` صريحٍ
  --     **دعوى بأنّ الدالّةَ موجودةٌ حيّة** — وهذه ليست كذلك، بل تُزرَعُ ثمّ
  --     تُلغى فى نفسِ المعاملة. وهو التمييزُ نفسُه الذى تعلّمَه ذاك الحارسُ فى
  --     v3.74.992 لِما يقعُ داخلَ جسدِ دالّةٍ أخرى. **ولا يُصرَخُ على زرعٍ يُلغى.**
  BEGIN
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.%I() RETURNS void LANGUAGE plpgsql '
      'SET search_path TO ''public'',''pg_catalog'' AS $f$ '
      'DECLARE v_n INT; v_ceiling CONSTANT INT := 999; '
      'BEGIN SELECT count(*) INTO v_n FROM pg_proc; '
      'IF v_n > v_ceiling THEN RAISE EXCEPTION ''x''; END IF; END; $f$', k_plant);
    PERFORM public.assert_baseline_v3_75_31_check();
    v_err := '!!! لم يُشغَّل';
    RAISE EXCEPTION 'zz_rollback_33b';
  EXCEPTION WHEN OTHERS THEN
    IF v_err IS NULL THEN v_err := SQLERRM; END IF;
  END;

  IF position(k_plant in v_err) < 1 THEN
    RAISE EXCEPTION 'v3.75.33-b: الفخُّ لم يمسكْ سقفاً مكتوباً بيد — وفخٌّ لا يُشغَّل ليس فخّاً. (%)', v_err;
  END IF;
END;
$do$;
