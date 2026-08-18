-- ---------------------------------------------------------------------------
-- v3.75.60 — **ودالّتُنا تحملُ مسارَها، ولحمُ غيرِنا لا يُمَسّ.**
--
-- ═══ أوّلاً: المعدودُ يُنقَّى قبلَ أن يُسدَّد ═══
--
-- أعلنّا فى v3.75.59 دَيناً قوامُه «٥٨٨ دالّةً بصلاحيّاتِ مُنادِيها بلا مسارِ
-- بحث»، ونقلنا الرقمَ عن المستشارِ كما هو. **والقياسُ يقولُ إنّ الرقمَ ليس
-- دَيناً كلَّه، وإنّ الدَّينَ فى الوقتِ نفسِه أكبرُ منه**:
--
--     بلا مسارِ بحثٍ فى public ...................  ٥٩٢
--       منها لحمُ امتدادَين (vector · pg_trgm) ....  ١٤٩  ← ليست لنا
--         · ١٤٥ دالّةً بلغةِ C   · ٤ تجميعات
--       ومنها ما نملكُه نحن .....................  ٤٤٣
--
--     ودوالُّنا كلُّها (بصلاحيّاتِ مُنادِيها) .....  ٤٩٦
--       بلا مسارٍ أصلاً ..........................  ٤٤٣
--       **بمسارٍ مضبوطٍ لا يذكرُ pg_temp** ........   ٤٨  ← لم يرَها بلاغُ المستشار
--       تذكرُ pg_temp سلفاً ......................    ٥
--
-- **والـ١٤٩ لا تُزوَّرُ أصلاً**: جسدُها مكتوبٌ بلغةِ C، فلا حلَّ أسماءٍ فيها
-- يمرُّ بمسارِ البحث. **ولا يُصلَحُ عطبٌ بعطبٍ آخَر**: ضبطُها يمسُّ امتداداً
-- لا نملكُه ويُربكُ ترقيتَه. **فتُستثنى بخاصّيّةٍ لا باسم** — عضويّةُ
-- الامتدادِ فى `pg_depend.deptype = 'e'` — **والحكمُ بالأثرِ لا بالاسم.**
--
-- **والـ٤٨ هى الوجهُ الآخَرُ للدرسِ نفسِه**: مسارُها مضبوطٌ (`public` أو
-- `public, pg_catalog`) فيبدو أنّها «مُعالَجة»، **وهى مفتوحةٌ تماماً كالتى بلا
-- ضبط** — لأنّ Postgres يقدِّمُ مخطَّطَ الجداولِ المؤقّتةِ ما لم يُذكَرْ صراحةً.
-- **فشكلُ الضبطِ ليس ضبطاً، والحالتانِ سواءٌ فى الأثرِ فتُعالَجانِ معاً — ٤٩١.**
--
-- ═══ وثانياً: العطبُ حقيقىٌّ وبُرهِنَ حيّاً على البيتَين ═══
--
-- على **الإنتاجِ نفسِه**، داخلَ معاملةٍ أُلغيت:
--
--     calculate_invoice_net_amount(<معرّفٌ لا صفَّ له>)
--       قبلَ التزوير ...............................        ٠
--       بعدَ CREATE TEMP TABLE invoices ............  ٩٩٩٬٩٩٩   ← قرأتِ المزوَّر
--       بعدَ ALTER ... SET search_path ..............        ٠   ← عادتِ الحقيقة
--       صفوفُ invoices الحقيقيّةُ بعدَ الإلغاء ......       ٢٤   ← لم يُمَسَّ صفّ
--
-- **والخطوةُ الوسطى هى الشاهد**: بلا «٩٩٩٬٩٩٩» لكان «٠ ثمّ ٠» يُقرَأُ حصانةً
-- وهو قد يكونُ عجزَ التزوير. **والطمأنينةُ الكاذبةُ أسوأُ من الغياب.**
--
-- وهذه الدالّةُ **بصلاحيّاتِ مُنادِيها** — فلا صلاحيّةَ ارتفعت. لكنّها
-- **قرأت مزوَّراً**، ولو كانت تكتبُ لكتبت صادقاً عمّا قرأته كاذباً. **و٢١٥ من
-- الـ٤٤٣ تُسمّى جدولاً حقيقيّاً بلا تأهيلٍ بالمخطَّط** (منها ١٠٣ دوالُّ زناد
-- تعملُ داخلَ كتابةِ المُنادى نفسِه)، **و١٠٧ منها يبلغُها زائرٌ بلا هويّة**.
--
-- ═══ وثالثاً: ما الذى لا يتغيّر ═══
--
-- الذيلُ `public, extensions, pg_temp` **مرآةٌ لما يجرى اليوم**: مسارُ البحثِ
-- الفعلىُّ فى هذا المشروعِ هو `public, extensions`. فلا يتغيّرُ حلُّ اسمٍ
-- واحد — **يُضافُ `pg_temp` أخيراً فقط**، فيُؤخَّرُ مكانُ المُنادى بعدَ بيتِنا
-- بدلَ أن يسبقَه. **ولا يملكُ `anon` ولا `authenticated` إنشاءَ شىءٍ فى
-- `public` ولا فى `extensions`** — فالذيلُ كلُّه خارجَ يدِ المُنادى.
--
-- **ومن كان له ذيلٌ يأخذُ ذيلَه هو** مضافاً إليه `pg_temp` — لا قالباً واحداً
-- يُلغى ما اختارَه غيرُنا. **وكلُّ دالّةٍ تأخذُ ذيلَها هى.**
--
-- وقِيسَ قبلَ الكتابةِ أنّ التثبيتَ لا يكسِرُ شيئاً:
--
--     دوالُّنا التى تحتاجُ مخطَّطاً غيرَ public/pg_catalog بلا تأهيل ....  ٠
--     دوالُّنا مستعملةٌ فى تعبيرِ فهرس .............................  ٠
--     دوالُّنا مستعملةٌ فى سياسةِ RLS ..............................  ٠
--     دوالُّنا مستعملةٌ فى قيدِ CHECK ..............................  ٠
--     دوالُّنا مستعملةٌ فى تعريفِ منظور ............................  ٠
--     دوالُّنا تُنشئُ جدولاً مؤقّتاً بنفسِها .......................  ٠
--     تعبيرٌ افتراضىٌّ يستعملُ واحدةً منها (ai_normalize_for_fts) ....  ١  ← ثابتةٌ ويبقى صالحاً
--
-- **ولا تُكتَبُ ٤٩١ سطراً بأسماء**: البيتانِ يختلفانِ اليومَ فعلاً، **فقائمةٌ
-- مكتوبةٌ بيدٍ تصيرُ كاذبةً يومَ يختلفان**. **فيُكتَبُ الشرطُ لا القائمة.**
--
-- **ولا يُمَسُّ جسدُ دالّةٍ واحدة**: `ALTER FUNCTION ... SET` يُغيِّرُ الإعدادَ
-- وحدَه — لا نصَّ يُعادُ كتابتُه، ولا منحةَ تتغيّر، ولا صفَّ يُمَسّ.
-- ---------------------------------------------------------------------------

-- ═══ (١) المخطَّطُ المذكورُ فى الذيلِ يجبُ أن يكونَ قائماً ═══
-- **ولا يُبنى حكمٌ على مكانٍ لم يُقَسْ وجودُه.**
DO $guard_schema$
BEGIN
  IF to_regnamespace('extensions') IS NULL THEN
    RAISE EXCEPTION 'v3.75.60: المخطَّطُ extensions غيرُ موجود — والذيلُ يذكرُه، فلا أُطبِّقُ ذيلاً يُشيرُ إلى العدم.'
      USING ERRCODE = '3F000';
  END IF;
  IF to_regnamespace('public') IS NULL THEN
    RAISE EXCEPTION 'v3.75.60: المخطَّطُ public غيرُ موجود.' USING ERRCODE = '3F000';
  END IF;
END
$guard_schema$;

-- ═══ (٢) العلاج — بالخاصّيّةِ لا بالقائمة، وفى الحالتَين معاً ═══
DO $migration$
DECLARE
  r             record;
  v_tail        text;
  n_from_unset  int := 0;
  n_from_partial int := 0;
  n_left        int;
  n_foreign     int;
  n_foreign_set int;
  n_definer_bad int;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig,
           (SELECT substring(c from 13) FROM unnest(coalesce(p.proconfig, '{}')) c
             WHERE c LIKE 'search_path=%') AS sp
      FROM pg_proc p
      JOIN pg_language l ON l.oid = p.prolang
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prokind = 'f'
       AND NOT p.prosecdef
       AND l.lanname IN ('plpgsql', 'sql')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.objid = p.oid
                          AND d.classid = 'pg_proc'::regclass
                          AND d.deptype = 'e')
       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
                        WHERE c LIKE 'search_path=%'
                          AND c ~ '(^|[=,[:space:]])pg_temp([,[:space:]]|$)')
     ORDER BY p.oid::regprocedure::text
  LOOP
    IF r.sp IS NULL OR btrim(r.sp) = '' THEN
      -- **بلا ذيلٍ سابق**: يُعطَى مرآةَ ما يجرى اليومَ فعلاً.
      v_tail := 'public, extensions';
      n_from_unset := n_from_unset + 1;
    ELSE
      -- **وله ذيلُه**: يُصانُ كما هو ويُذيَّلُ بـ pg_temp — ولا يُلغى اختيارُ غيرِنا.
      v_tail := btrim(r.sp);
      n_from_partial := n_from_partial + 1;
    END IF;

    -- **ولا يُبنى أمرٌ على نصٍّ لم يُتحقَّقْ من شكلِه**: أسماءُ مخطَّطاتٍ
    -- مفصولةٌ بفواصلَ لا غير — وإلّا رُفض.
    IF v_tail !~ '^[a-zA-Z_"$][a-zA-Z0-9_"$]*( *, *[a-zA-Z_"$][a-zA-Z0-9_"$]*)*$' THEN
      RAISE EXCEPTION 'v3.75.60: ذيلٌ غيرُ مفهومٍ للدالّة % — [%] — ولا أُخمّن.', r.sig, v_tail
        USING ERRCODE = '22023';
    END IF;

    EXECUTE format('ALTER FUNCTION %s SET search_path = %s, pg_temp', r.sig, v_tail);
  END LOOP;

  -- (أ) **ولا يبقى منّا واحدٌ يسبقُه مكانُ المُنادى** — غائباً كان ضبطُه أو ناقصاً.
  SELECT count(*) INTO n_left
    FROM pg_proc p
    JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prokind = 'f'
     AND NOT p.prosecdef
     AND l.lanname IN ('plpgsql', 'sql')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid
                        AND d.classid = 'pg_proc'::regclass
                        AND d.deptype = 'e')
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
                      WHERE c LIKE 'search_path=%'
                        AND c ~ '(^|[=,[:space:]])pg_temp([,[:space:]]|$)');

  IF n_left <> 0 THEN
    RAISE EXCEPTION 'v3.75.60: بقىَ % من دوالِّنا يسبقُه مخطَّطُ المُنادى بعدَ العلاج — ونصفُ جراحةٍ أسوأُ من لا جراحة.', n_left
      USING ERRCODE = '23514';
  END IF;

  -- (ب) **ولحمُ غيرِنا لم يُمَسّ**: لا امتدادَ نالَ ضبطاً من يدِنا.
  SELECT count(*) INTO n_foreign
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND EXISTS (SELECT 1 FROM pg_depend d
                  WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e');

  SELECT count(*) INTO n_foreign_set
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND EXISTS (SELECT 1 FROM pg_depend d
                  WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
     AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');

  IF n_foreign_set <> 0 THEN
    RAISE EXCEPTION 'v3.75.60: % من لحمِ الامتداداتِ نالَ مسارَ بحثٍ — ولا يُعالَجُ لحمُ غيرِنا.', n_foreign_set
      USING ERRCODE = '23514';
  END IF;

  -- (ج) **ومكسبُ الدفعةِ السابقةِ لم يُنقَض**: صلاحيّاتٌ كاملةٌ بلا pg_temp = صفر.
  SELECT count(*) INTO n_definer_bad
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prokind = 'f'
     AND p.prosecdef
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
                      WHERE c LIKE 'search_path=%' AND c LIKE '%pg_temp%');

  IF n_definer_bad <> 0 THEN
    RAISE EXCEPTION 'v3.75.60: % دالّةً بصلاحيّاتٍ كاملةٍ يسبقُها مخطَّطُ المُنادى — مكسبُ v3.75.59 نُقض.', n_definer_bad
      USING ERRCODE = '23514';
  END IF;

  RAISE NOTICE 'v3.75.60: من بلا ضبطٍ % · من ضبطٍ ناقصٍ % · باقٍ % · لحمُ امتداداتٍ لم يُمَسّ % · صلاحيّاتٌ كاملةٌ بلا pg_temp %',
    n_from_unset, n_from_partial, n_left, n_foreign, n_definer_bad;
END
$migration$;

-- ═══ (٣) ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه ═══
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_60_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $check$
DECLARE
  n_ours_unset   int;
  n_ours_no_temp int;
  n_ours_total   int;
  n_definer_bad  int;
  n_foreign      int;
  n_foreign_set  int;
BEGIN
  -- **دوالُّنا** = فى public · دالّة · بصلاحيّاتِ مُنادِيها · plpgsql أو sql ·
  -- **وليست لحمَ امتدادٍ** — تُعرَّفُ بالخاصّيّةِ لا بقائمةِ أسماء.
  SELECT count(*) INTO n_ours_total
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prokind = 'f' AND NOT p.prosecdef
     AND l.lanname IN ('plpgsql', 'sql')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e');

  SELECT count(*) INTO n_ours_unset
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prokind = 'f' AND NOT p.prosecdef
     AND l.lanname IN ('plpgsql', 'sql')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');

  IF n_ours_unset <> 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % من دوالِّنا بلا مسارِ بحث — ومخطَّطُ المُنادى يسبقُ بيتَنا (v3.75.60)', n_ours_unset
      USING ERRCODE = '23514';
  END IF;

  -- **وشكلُ الضبطِ ليس ضبطاً**: مسارٌ مضبوطٌ لا يذكرُ pg_temp يتركُ البابَ مفتوحاً.
  SELECT count(*) INTO n_ours_no_temp
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prokind = 'f' AND NOT p.prosecdef
     AND l.lanname IN ('plpgsql', 'sql')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
                      WHERE c LIKE 'search_path=%' AND c ~ '(^|[=,[:space:]])pg_temp([,[:space:]]|$)');

  IF n_ours_no_temp <> 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % من دوالِّنا مسارُها لا يذكرُ pg_temp (v3.75.60)', n_ours_no_temp
      USING ERRCODE = '23514';
  END IF;

  -- **ومكسبُ v3.75.59 يُحرَسُ هنا أيضاً** — ولا تشفعُ نسخةٌ لأخرى.
  SELECT count(*) INTO n_definer_bad
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prokind = 'f' AND p.prosecdef
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
                      WHERE c LIKE 'search_path=%' AND c LIKE '%pg_temp%');

  IF n_definer_bad <> 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % دالّةً بصلاحيّاتٍ كاملةٍ يسبقُها مخطَّطُ المُنادى (v3.75.60)', n_definer_bad
      USING ERRCODE = '23514';
  END IF;

  -- **ولحمُ غيرِنا يُعَدُّ ولا يُمَسّ** — ومعدودٌ لا مسكوتٌ عنه.
  SELECT count(*) INTO n_foreign
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND EXISTS (SELECT 1 FROM pg_depend d
                  WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e');

  SELECT count(*) INTO n_foreign_set
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND EXISTS (SELECT 1 FROM pg_depend d
                  WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
     AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');

  IF n_foreign_set <> 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % من لحمِ الامتداداتِ نالَ مسارَ بحثٍ من يدِنا (v3.75.60)', n_foreign_set
      USING ERRCODE = '23514';
  END IF;

  RETURN format('v3.75.60 ok — دوالُّنا %s كلُّها تحملُ مسارَها ويذكرُ pg_temp · صلاحيّاتٌ كاملةٌ يسبقُها المُنادى %s · لحمُ امتداداتٍ معدودٌ لم يُمَسّ %s',
                n_ours_total, n_definer_bad, n_foreign);
END
$check$;

-- **وحارسٌ يُفتَحُ بابُه ليس حارساً**: المنحةُ الافتراضيّةُ لعمومِ الأدوارِ تُنزَع.
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_60_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_60_check() TO service_role;

COMMENT ON FUNCTION public.assert_baseline_v3_75_60_check() IS 'v3.75.60 — ودالّتُنا تحملُ مسارَها، ولحمُ غيرِنا لا يُمَسّ. يُثبِّتُ صفراً فى ثلاثةِ اتّجاهات: لا دالّةَ لنا بلا مسارِ بحث، ولا مسارَ لنا يخلو من pg_temp، ولا دالّةَ بصلاحيّاتٍ كاملةٍ يسبقُها مخطَّطُ المُنادى. ويَعُدُّ لحمَ الامتداداتِ فى public ويرفضُ أن ينالَ ضبطاً من يدِنا. ودوالُّنا تُعرَّفُ بالخاصّيّةِ - عضويّةُ الامتدادِ فى pg_depend - لا بقائمةِ أسماءٍ تصيرُ كاذبةً يومَ يختلفُ البيتان.';
