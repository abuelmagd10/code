-- ---------------------------------------------------------------------------
-- v3.75.59 — **ولا يُسبَقُ البيتُ بمكانٍ يملكُه المُنادى.**
--
-- ═══ ما الذى قِيسَ، ولماذا لم يره أحد ═══
--
-- كان مستشارُ Supabase يبلِّغُ عن `function_search_path_mutable` — دوالُّ بلا
-- مسارِ بحثٍ مضبوط. وأُعلنَ ذلك ثلاثَ دفعاتٍ «عطباً أمنيّاً يُسدَّدُ بدفعتِه».
-- فلمّا قِيسَ وُجدَ أنّ ما يُبلِّغُ عنه المستشارُ **هو الأخفّ**:
--
--     دوالُّ public ........................  ١٣٩٦
--     بلا ضبطٍ أصلاً (بلاغُ المستشار) ......   ٥٨٨   ← **صفرٌ منها بصلاحيّاتٍ كاملة**
--     مضبوطةٌ ولا تذكرُ pg_temp ............   ٧٨٦   ← **٧٣٨ منها بصلاحيّاتٍ كاملة**
--     تذكرُ pg_temp .......................    ٢٢
--
-- **والعطبُ الحقيقىُّ لا يُبلِّغُ عنه المستشارُ أصلاً.** فPostgres يبحثُ فى
-- مخطَّطِ الجداولِ المؤقّتةِ (`pg_temp`) **أوّلاً** ما لم يُذكَرْ صراحةً فى
-- المسار. فالضبطُ الذى ظنَنّاه علاجاً — `SET search_path = public` — **يتركُ
-- البابَ الأخطرَ مفتوحاً**: مُنادٍ يُنشئُ جدولاً مؤقّتاً باسمِ جدولٍ حقيقىٍّ،
-- فتقرأُ الدالّةُ **بصلاحيّاتٍ كاملة** من جدولِه هو لا من جدولِ الشركة.
--
-- ═══ والبرهانُ حىٌّ لا مُستنتَج — غُرسَ على بيتِ الاختبارِ ثمّ أُلغى ═══
--
--     بوّابةٌ نسخةٌ طبقُ الأصلِ من شكلِ بوّاباتِنا (SECURITY DEFINER,
--     search_path = public, pg_catalog) تقرأُ company_members بلا تأهيل:
--
--         قبلَ التزوير ......................  false
--         بعدَ CREATE TEMP TABLE company_members  true   ← عضويّةٌ لا وجودَ لها
--         النسخةُ نفسُها وفيها pg_temp .......  false   ← محصَّنة
--
-- وستٌّ من بوّاباتِ الهويّةِ الحيّةِ تقرأُ `company_members` **بلا تأهيل**:
-- assert_company_access · is_company_member · check_permission · can_modify_data
-- · fn_user_company_access · fn_user_company_ids — كلُّها بصلاحيّاتٍ كاملة،
-- ويبلغُها المستخدِمُ المسجَّل، **ولا واحدةَ منها كانت تذكرُ pg_temp**.
--
-- و`TEMPORARY` ممنوحةٌ لعمومِ الأدوارِ بافتراضِ Postgres، **بينما لا يملكُ
-- `authenticated` ولا `anon` إنشاءَ جدولٍ فى public ولا إنشاءَ مخطَّط** — فالجدولُ
-- المؤقّتُ هو الطريقُ الوحيدُ، وهو مفتوح. **وبحثٌ لا يجد ليس دليلَ غياب.**
--
-- ═══ ولا يُمَسُّ جسدُ دالّةٍ واحدة ═══
--
-- العلاجُ `ALTER FUNCTION ... SET search_path = <ما هو قائمٌ> , pg_temp` —
-- يُغيِّرُ **الإعدادَ وحدَه**، فلا نصَّ يُعادُ كتابتُه ولا سلوكَ يتغيّر. وكلُّ
-- دالّةٍ تأخذُ **ذيلَها هى** لا قالباً واحداً للجميع، **وشكلُ النداءِ خاصّيّةٌ
-- فى صاحبِه**.
--
-- **ولا يُدمَّرُ استعمالٌ قائم**: قِيسَ فى القاعدةِ كلِّها **من يُنشئُ جدولاً
-- مؤقّتاً داخلَ دالّة** فكان **واحداً** (`assert_baseline_v3_75_6_check`)،
-- واسمُ جدولِه لا يُصادفُ اسمَ جدولٍ حقيقىٍّ — فتأخيرُ pg_temp لا يكسرُ أحداً.
--
-- ═══ ويُكتَبُ الحكمُ خاصّيّةً لا قائمة ═══
--
-- لا تُكتَبُ هنا ٧٣٨ سطراً بأسماءٍ — فقائمةٌ مكتوبةٌ بيدٍ **تصيرُ كاذبةً يومَ
-- يختلفُ البيتان**. وقد قِيسَ أنّهما يختلفان اليومَ فعلاً بدالّتَين
-- (`register_asset_addition` بستّةِ وسائطَ و`rls_auto_enable`) موجودتَين على
-- الإنتاجِ وغائبتَين عن الاختبار. فيُكتَبُ **الشرطُ** ويُطبَّقُ على ما يُطابقُه
-- فى كلِّ بيت، **ولا يُحكَمُ على موضعٍ لم يُقرَأ**.
--
-- ═══ ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه ═══
--
-- يُولَدُ `assert_baseline_v3_75_59_check` فيُثبِّتُ **الصفر**: لا دالّةَ
-- بصلاحيّاتٍ كاملةٍ بلا `pg_temp` فى ذيلِها، ولا واحدةَ بلا مسارِ بحثٍ أصلاً.
-- وأىُّ دالّةٍ جديدةٍ تُولَدُ ناقصةً تُوقِفُ الشجرةَ فى أوّلِ دفعة.
--
-- **والـ٥٨٨ التى بلا ضبطٍ أصلاً معدودةٌ لا مسكوتٌ عنها**: كلُّها بصلاحيّاتِ
-- مُنادِيها فلا ترفعُ صلاحيّةً، وتُعرَضُ فى نصِّ الفحصِ وتُسدَّدُ بدفعتِها.
-- ---------------------------------------------------------------------------

-- ═══ (١) الجراحة: ذيلٌ يُلحَقُ، ولا جسدَ يُمَسّ ═══
DO $migration$
DECLARE
  r        record;
  v_tail   text;
  n_done   int := 0;
  n_left   int;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig,
           (SELECT c FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%') AS sp
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prokind = 'f'
       AND p.prosecdef
       AND p.proconfig IS NOT NULL
       AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                    WHERE c LIKE 'search_path=%' AND c NOT LIKE '%pg_temp%')
     ORDER BY p.oid::regprocedure::text
  LOOP
    v_tail := substring(r.sp from 13);

    -- **ولا يُبَدَّلُ ما لم يُقرَأ**: لا يُمَسُّ إعدادٌ غيرُ مألوفِ الشكل.
    IF v_tail !~ '^[a-zA-Z_][a-zA-Z0-9_]*( *, *[a-zA-Z_][a-zA-Z0-9_]*)*$' THEN
      RAISE EXCEPTION 'v3.75.59: مسارُ بحثٍ بشكلٍ غيرِ مألوفٍ فى % — %', r.sig, r.sp
        USING ERRCODE = '22023';
    END IF;

    EXECUTE format('ALTER FUNCTION %s SET search_path = %s, pg_temp', r.sig, v_tail);
    n_done := n_done + 1;
  END LOOP;

  -- **وفخٌّ لا يُشغَّلُ ليس فخّاً**: يُقاسُ الأثرُ فى المعاملةِ نفسِها.
  SELECT count(*) INTO n_left
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prokind = 'f'
     AND p.prosecdef
     AND (p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                          WHERE c LIKE 'search_path=%' AND c LIKE '%pg_temp%'));

  IF n_left <> 0 THEN
    RAISE EXCEPTION 'v3.75.59: بقيت % دالّةً بصلاحيّاتٍ كاملةٍ يسبقُها مكانُ المُنادى', n_left
      USING ERRCODE = '23514';
  END IF;

  RAISE NOTICE 'v3.75.59: أُلحقَ pg_temp بذيلِ % دالّةً بصلاحيّاتٍ كاملة، ولم يبقَ موضعٌ.', n_done;
END
$migration$;

-- ═══ (٢) ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه ═══
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_59_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $check$
DECLARE
  n_no_temp   int;
  n_no_path   int;
  n_invoker   int;
  n_gates_bad int;
BEGIN
  -- (أ) لا دالّةَ بصلاحيّاتٍ كاملةٍ يسبقُها مكانٌ يملكُه المُنادى.
  SELECT count(*) INTO n_no_temp
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prokind = 'f'
     AND p.prosecdef
     AND p.proconfig IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                  WHERE c LIKE 'search_path=%' AND c NOT LIKE '%pg_temp%');

  IF n_no_temp <> 0 THEN
    RAISE EXCEPTION 'v3.75.59: % دالّةً بصلاحيّاتٍ كاملةٍ مسارُها لا يذكرُ pg_temp — ومُنادٍ يُنشئُ جدولاً مؤقّتاً يسبقُ بيتَها', n_no_temp
      USING ERRCODE = '23514';
  END IF;

  -- (ب) ولا واحدةَ منها بلا مسارِ بحثٍ أصلاً.
  SELECT count(*) INTO n_no_path
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prokind = 'f'
     AND p.prosecdef
     AND (p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));

  IF n_no_path <> 0 THEN
    RAISE EXCEPTION 'v3.75.59: % دالّةً بصلاحيّاتٍ كاملةٍ بلا مسارِ بحثٍ أصلاً', n_no_path
      USING ERRCODE = '23514';
  END IF;

  -- (ج) وبوّاباتُ الهويّةِ تُسمّى بأعيانِها — **والحكمُ بالأثرِ لا بالعدد**:
  -- هؤلاءِ من يُبنى عليهنّ كلُّ عزلٍ بين الشركات، فتُقاسُ كلُّ واحدةٍ باسمِها.
  SELECT count(*) INTO n_gates_bad
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('assert_company_access', 'is_company_member', 'check_permission',
                       'can_modify_data', 'fn_user_company_access', 'fn_user_company_ids',
                       'get_user_company_ids', 'assert_is_self')
     AND p.prosecdef
     AND (p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                          WHERE c LIKE 'search_path=%' AND c LIKE '%pg_temp%'));

  IF n_gates_bad <> 0 THEN
    RAISE EXCEPTION 'v3.75.59: % بوّابةَ هويّةٍ يسبقُها مكانُ المُنادى — والعضويّةُ تُزوَّرُ بجدولٍ مؤقّت', n_gates_bad
      USING ERRCODE = '23514';
  END IF;

  -- (د) ومعدودٌ لا مسكوتٌ عنه: من بصلاحيّاتِ مُنادِيها بلا مسارِ بحث.
  SELECT count(*) INTO n_invoker
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prokind IN ('f','p')
     AND NOT p.prosecdef
     AND (p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));

  RETURN 'v3.75.59 ok: لا دالّةَ بصلاحيّاتٍ كاملةٍ يسبقُها مكانُ المُنادى، وبوّاباتُ الهويّةِ محصَّنةٌ بأعيانِها. وبصلاحيّاتِ مُنادِيها بلا مسارِ بحث: '
         || n_invoker || ' (معدودةٌ لا مسكوتٌ عنها — لا ترفعُ صلاحيّةً، وتُسدَّدُ بدفعتِها).';
END
$check$;

-- **وحارسٌ يُفتَحُ بابُه ليس حارساً**، والمنحةُ الافتراضيّةُ لعمومِ الأدوارِ
-- ولـauthenticated تُنزَعُ صراحةً — فـFROM PUBLIC وحدَها لا تكفى.
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_59_check()  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_59_check() TO service_role;

COMMENT ON FUNCTION public.assert_baseline_v3_75_59_check() IS 'v3.75.59: ولا يُسبَقُ البيتُ بمكانٍ يملكُه المُنادى — كلُّ دالّةٍ بصلاحيّاتٍ كاملةٍ فى public يذكرُ مسارُها pg_temp صراحةً، فلا يُقدَّمُ جدولٌ مؤقّتٌ يُنشئُه المُنادى على جدولِ الشركة. مُثبَّتٌ عند الصفرِ فى الاتّجاهَين، وبوّاباتُ الهويّةِ مُسمّاةٌ بأعيانِها.';
