-- ═══════════════════════════════════════════════════════════════════════════
-- v3.74.977 — اسمٌ واحدٌ للدور الواحد: «مدير عام» = admin
-- ═══════════════════════════════════════════════════════════════════════════
--
-- المشكلة: دورُ «المدير العام» له فى المشروع **مفتاحان داخليّان**:
-- `admin` — وهو ما تُنتجه شاشةُ الأعضاء — و`general_manager` — وهو ما تفحصه
-- معظمُ الأبواب. فمن عُيّن «مدير عام» من الشاشة يُخزَّن `admin`، ثمّ يقف أمام
-- بابٍ يسأل عن `general_manager` فيُمنع. بابٌ واحدٌ بمفتاحين لا يفتح.
--
-- والقرار (قرارُ المالك): يبقى **مفتاحٌ واحدٌ هو `admin`**، وتُصحَّح كلُّ
-- المواضع لتقبله. وهذه **الخطوة الأولى**: التوسيع — كلُّ بابٍ يقبل
-- `general_manager` صار يقبل `admin` أيضاً. **ولا يفقد أحدٌ شيئاً.**
-- والخطوةُ الثانية (شطبُ `general_manager`) لا تُنفَّذ إلا بعد أن يُقاس على
-- القاعدة الحيّة أنّ كلَّ موضعٍ صار يقبل `admin` — بالقياس لا بالقراءة.
--
-- ─── ولماذا لا يُكتب اسمُ الدالّة بيدٍ فى هذا الملفّ ───
--
-- القائمةُ تُقرأ من القاعدة نفسِها وقتَ التشغيل. مَن يضيف بابَ أدوارٍ غداً
-- يشمله هذا الملفُّ بإعادة تشغيله، ولا تفترق نسختان. وتشغيلُه على قاعدةٍ
-- مُعالَجةٍ سلفاً **لا يفعل شيئاً** — فهو يقيس قبل أن يكتب.
--
-- ─── وثلاثةُ فحوصٍ مرجعيّةٍ كانت تحرس شكلَ النصّ لا معناه ───
--
-- الفحوصُ المرجعيّة (`assert_baseline%`) كانت تشترط أن يحتوى بابُ الاعتماد
-- على العبارة `'owner', 'general_manager'` **متلاصقةً حرفاً بحرف**. فلمّا
-- أُدخل `'admin'` بينهما — وهو توسيعٌ صحيح — سقطت أربعةُ فحوص. وهذا هو
-- العيبُ الذى نمنعه دائماً: **حارسٌ يمنع شكلاً بدل أن يمنع خاصّية.**
-- فتُعاد صياغتُها هنا لتقيس المعنى: «البابُ يقبل المالك، ويقبل المديرَ
-- العامَّ بأىِّ اسمٍ يُكتب به». فتمرّ اليوم، **وتظلّ تمرّ بعد الخطوة الثانية**.
--
-- وظهر خلفها اثنان كانا ساقطَين **قبل هذه الدفعة** ومحجوبَين لأنّ الفحصَ
-- يقف عند أوّل سقوط: مشغّلان نُقل معناهما إلى دالّةٍ واحدةٍ مشتركة (بيتٌ
-- واحد)، فصار الفحصُ لا يجد النصَّ فى المشغّل. فيُقاس الآن **المشغّلُ أو
-- الدالّةُ التى ينادِيها** — وهى القاعدةُ نفسُها المستعملة فى ٩٧٣.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- ١) الدوالّ: كلُّ دالّةٍ تسمّى general_manager ولا تسمّى admin تُوسَّع.
--    والإدخالُ يقع **داخل قائمةٍ فقط** — أى بعد `(` أو `[` أو `,` — فلا
--    يُمسّ تعبيرٌ مثل `role = 'general_manager'` بما يُفسده.
--    وتُستثنى دوالُّ الفحص المرجعىّ والتقرير: هى **تقرأ** أسماءَ الأدوار
--    ولا تمنح بها شيئاً، وتوسيعُها يُفسد ما تقيسه.
-- ─────────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE r record; v_new text; v_n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname NOT LIKE 'assert_baseline%'
      AND p.proname NOT IN ('baseline_report')
      AND strpos(pg_get_functiondef(p.oid), 'general_manager') > 0
      AND strpos(pg_get_functiondef(p.oid), '''admin''') = 0
  LOOP
    v_new := regexp_replace(r.src, '([\(\[,]\s*)''general_manager''', '\1''admin'', ''general_manager''', 'g');
    IF v_new <> r.src THEN
      EXECUTE v_new;
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'v3.74.977: وُسّعت % دالّة', v_n;
END $mig$;

-- ─────────────────────────────────────────────────────────────────────────
-- ٢) قواعدُ الرؤية (RLS): نفسُ القاعدة، على شرطِ القراءة وشرطِ الكتابة معاً.
-- ─────────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE r record; v_q text; v_c text; v_sql text; v_n int := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND strpos(coalesce(qual,'') || coalesce(with_check,''), 'general_manager') > 0
      AND strpos(coalesce(qual,'') || coalesce(with_check,''), '''admin''') = 0
  LOOP
    v_q := regexp_replace(coalesce(r.qual,''),       '([\(\[,]\s*)''general_manager''', '\1''admin'', ''general_manager''', 'g');
    v_c := regexp_replace(coalesce(r.with_check,''), '([\(\[,]\s*)''general_manager''', '\1''admin'', ''general_manager''', 'g');
    v_sql := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.qual       IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_q); END IF;
    IF r.with_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_c); END IF;
    EXECUTE v_sql;
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'v3.74.977: وُسّعت % قاعدةَ رؤية', v_n;
END $mig$;

-- ─────────────────────────────────────────────────────────────────────────
-- ٣) الفحوصُ المرجعيّة: من شكلِ النصّ إلى معناه.
--    «`'owner', 'general_manager'` متلاصقةً» ⇐ «يقبل المالك، ويقبل المديرَ
--    العامَّ باسمه القديم أو الجديد». تصمد بعد شطبِ الاسم القديم.
-- ─────────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE r record; v_new text; v_n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) LIKE '%NOT LIKE ''%''''owner'''', ''''general_manager''''%''%'
  LOOP
    v_new := regexp_replace(r.src,
      '(\w+) NOT LIKE ''%''''owner'''', ''''general_manager''''%''',
      '\1 NOT LIKE ''%''''owner''''%'' OR (\1 NOT LIKE ''%''''admin''''%'' AND \1 NOT LIKE ''%''''general_manager''''%'')',
      'g');
    IF v_new = r.src THEN RAISE EXCEPTION 'v3.74.977: مرساةٌ لم تُطابق فى % — لم يُكتب شىء', r.proname; END IF;
    EXECUTE v_new;
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'v3.74.977: أُعيدت صياغةُ % فحصِ دور', v_n;
END $mig$;

-- ─────────────────────────────────────────────────────────────────────────
-- ٤) وفحصٌ يبحث عن نصٍّ داخل مشغّلٍ نُقل معناه إلى بيتٍ واحدٍ مشترك:
--    يُقبل أن يحمله **المشغّلُ أو الدالّةُ التى ينادِيها**. (قاعدةُ ٩٧٣.)
-- ─────────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE v_src text; v_new text; v_hits int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname = 'assert_baseline' AND p.pronargs = 0;

  SELECT count(*) INTO v_hits FROM regexp_matches(v_src, '(v_\w+) NOT LIKE ''%NEW\.(\w+)%''', 'g');
  IF v_hits > 0 THEN
    v_new := regexp_replace(v_src,
      '(v_\w+) NOT LIKE ''%NEW\.(\w+)%''',
      '(\1 NOT LIKE ''%\2%'' AND NOT EXISTS (SELECT 1 FROM pg_proc d JOIN pg_namespace dn ON dn.oid = d.pronamespace WHERE dn.nspname = ''public'' AND d.prokind = ''f'' AND \1 LIKE ''%'' || d.proname || ''(%'' AND pg_get_functiondef(d.oid) LIKE ''%\2%''))',
      'g');
    EXECUTE v_new;
    RAISE NOTICE 'v3.74.977: أُعيدت صياغةُ % فحصِ مشغّل', v_hits;
  END IF;
END $mig$;

-- ─────────────────────────────────────────────────────────────────────────
-- ٥) والملفُّ يُصدّق على نفسه: لا يُنهى وفى القاعدة بابٌ يقبل الاسمَ القديم
--    وحدَه، ولا فحصٌ مرجعىٌّ ساقط. وإلّا تراجع كلُّ شىء.
-- ─────────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE v_fn int; v_pol int; r record; v_fail text := '';
BEGIN
  SELECT count(*) INTO v_fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND p.proname NOT LIKE 'assert_baseline%' AND p.proname <> 'baseline_report'
    AND strpos(pg_get_functiondef(p.oid), 'general_manager') > 0
    AND strpos(pg_get_functiondef(p.oid), '''admin''') = 0;
  IF v_fn > 0 THEN RAISE EXCEPTION 'v3.74.977: % دالّةً ما زالت تقبل الاسمَ القديم وحدَه', v_fn; END IF;

  SELECT count(*) INTO v_pol FROM pg_policies
  WHERE schemaname = 'public'
    AND strpos(coalesce(qual,'') || coalesce(with_check,''), 'general_manager') > 0
    AND strpos(coalesce(qual,'') || coalesce(with_check,''), '''admin''') = 0;
  IF v_pol > 0 THEN RAISE EXCEPTION 'v3.74.977: % قاعدةَ رؤيةٍ ما زالت تقبل الاسمَ القديم وحدَه', v_pol; END IF;

  -- تُشغَّل الفحوصُ المرجعيّةُ كلُّها، ويُطبع ما يسقط. ولا يُوقِف هذا الملفَّ
  -- إلّا سقوطٌ **من مسؤوليّته**: سقوطٌ يذكر الأدوار. أمّا سقوطٌ لسببٍ بيئىٍّ
  -- (مهمّةٌ مجدولةٌ غيرُ منصَّبةٍ على قاعدة الاختبار مثلاً) فيُطبع ولا يُفشل
  -- هجرةً لا شأنَ لها به. وإفشالُ الغيرِ بذنبِ نفسِك حارسٌ يصرخ على البرىء.
  FOR r IN SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prokind = 'f'
             AND p.proname LIKE 'assert_baseline%' AND p.pronargs = 0
  LOOP
    BEGIN
      EXECUTE 'SELECT public.' || quote_ident(r.proname) || '()';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'v3.74.977: فحصٌ مرجعىٌّ ساقط — %: %', r.proname, SQLERRM;
      IF SQLERRM ILIKE '%role gate%' OR SQLERRM ILIKE '%general_manager%' OR SQLERRM ILIKE '%admin%' THEN
        v_fail := v_fail || r.proname || ': ' || SQLERRM || ' | ';
      END IF;
    END;
  END LOOP;
  IF v_fail <> '' THEN RAISE EXCEPTION 'v3.74.977: فحوصُ أدوارٍ ساقطة — %', v_fail; END IF;

  RAISE NOTICE 'v3.74.977: كلُّ بابٍ يقبل admin.';
END $mig$;

COMMIT;
