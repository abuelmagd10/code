-- v3.75.25 — «وبابٌ لا يستطيعُ أحدٌ فتحَه لا يُترَكُ مواربًا»
-- =============================================================================
-- الدفعةُ الأولى من تنظيفِ الـ١٣٤ دالّةً ذاتِ الصلاحيّاتِ الكاملةِ التى يبلغُها
-- الزائر. **ولا تُنظَّفُ بقائمةٍ مكتوبةٍ بيد، بل بقانونٍ يُقاسُ حيّاً.**
--
-- ═══ القانون ═══
-- **دالّةُ الزنادِ لا يستطيعُ أحدٌ نداءَها مباشرةً — لا زائرٌ ولا مستخدمٌ ولا
-- مالك.** بوستجريس نفسُه يرفضُ قبلَ أن ينظرَ فى المنحة. فمنحتُها **زينةٌ على
-- بابٍ لا يُفتَح**: لا تفيدُ أحداً، وتُضخِّمُ ما يُحصى على الزائرِ فتُخفى الحقيقىَّ
-- بين الوهمىّ. **وبابٌ لا يستطيعُ أحدٌ فتحَه لا يُترَكُ مواربًا.**
--
-- ═══ وقِيس حيّاً لا نظريّاً — ثلاثُ تجاربَ داخلَ معاملةٍ أُلغيت ═══
--   ١) نداءٌ مباشرٌ لدالّةِ زناد، فرفضَتْه القاعدةُ بنفسِها:
--        > `trigger functions can only be called as triggers`
--   ٢) ثمّ نُزعت المنحةُ من ٧٠ دالّةً، **فنجحَ تحديثٌ حقيقىٌّ يُشغّلُ أزندة**
--      (`UPDATE companies` → صفٌّ واحد).
--   ٣) **وحارسُ عزلِ الفروعِ ظلَّ يرفضُ** حركةَ مخزنٍ بلا فرعٍ برسالتِه بعينِها:
--        > `Branch is required (inventory_transactions.branch_id is null)`
--   ⇒ **الأزندةُ تعملُ، والحرّاسُ يحرسون، ولا أحدَ يفقدُ شيئاً.**
--
-- ═══ ولا يُنزَعُ إلّا من الزنادِ ═══
-- ولا تُمَسُّ دالّةٌ يستطيعُ إنسانٌ نداءَها. **ولا اتّساعَ ولا ضيقَ فى صلاحيّةِ
-- إنسانٍ واحد.** والمالكُ يحتفظُ بمنحتِه لأنّ `CREATE TRIGGER` تحتاجُها.
-- =============================================================================

DO $mig$
DECLARE
  r record;
  v_cnt int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.prorettype = 'trigger'::regtype
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
     ORDER BY 1
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || r.sig || ' FROM PUBLIC, anon, authenticated';
    v_cnt := v_cnt + 1;
  END LOOP;

  RAISE NOTICE 'v3.75.25: نُزعت منحةُ النداءِ من % دالّةَ زنادٍ لا يستطيعُ أحدٌ نداءَها.', v_cnt;

  -- **ولا يُقالُ تمَّ قبلَ أن يُقاس**: يُشترَطُ ألّا يبقى واحدةٌ.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prorettype = 'trigger'::regtype
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'v3.75.25: بقيت دالّةُ زنادٍ ممنوحةٌ للنداء بعدَ النزع.';
  END IF;
END $mig$;

-- =============================================================================
-- الفحصُ المرجعىُّ — قانونٌ يُقاسُ حيّاً، لا قائمةٌ تُكتَبُ بيد.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_25_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_open    TEXT;
  v_n       INT;
  v_ceiling CONSTANT INT := 65;
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
  SELECT string_agg(x.proname, ', ' ORDER BY x.proname) INTO v_open
  FROM (
    WITH pol AS (
      SELECT COALESCE(pg_get_expr(p2.polqual, p2.polrelid), '') || ' ' ||
             COALESCE(pg_get_expr(p2.polwithcheck, p2.polrelid), '') AS body
        FROM pg_policy p2
        JOIN pg_class c ON c.oid = p2.polrelid
        JOIN pg_namespace n2 ON n2.oid = c.relnamespace AND n2.nspname = 'public'
       WHERE has_table_privilege('anon', c.oid, 'SELECT')
    ), fn AS (
      SELECT p3.oid, p3.proname
        FROM pg_proc p3 JOIN pg_namespace n3 ON n3.oid = p3.pronamespace
       WHERE n3.nspname = 'public' AND p3.prokind = 'f'
    )
    SELECT DISTINCT fn.proname
      FROM fn JOIN pol ON pol.body ~ ('\m' || fn.proname || '\s*\(')
     WHERE NOT has_function_privilege('anon', fn.oid, 'EXECUTE')
  ) x;
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.25: نُزعت منحةٌ تحتاجُها سياسةُ حماية: %', v_open;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_25_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_25_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_25_check() FROM authenticated;

SELECT public.assert_baseline_v3_75_25_check();
SELECT public.assert_baseline_v3_75_24_check();
SELECT public.assert_baseline_v3_75_23_check();
