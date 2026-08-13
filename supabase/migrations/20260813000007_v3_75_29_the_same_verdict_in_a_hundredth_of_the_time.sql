-- =============================================================================
-- v3.75.29 — **والحكمُ نفسُه فى جزءٍ من مئةٍ من الزمن**
-- =============================================================================
--
-- دفعةٌ **لا تغيّرُ حكماً واحداً**. تسدِّدُ دَيناً كُتب بخطِّ v3.75.27 نفسِها:
--
--   > «ولا تُعادُ هنا لأنّ `assert_baseline_v3_75_24_check()` وحدَه يستغرقُ
--   >  ٣٧ ثانية — **دَينٌ مُعلَنٌ يُسدَّدُ فى دفعتِه، بالبيتِ الواحدِ الذى وُلد هنا**.»
--
-- **ودَينٌ يُكتَبُ ولا يُسدَّدُ يصيرُ عادة.**
--
-- أين كان الثِّقَل
-- ---------------
-- فى الفحصَينِ بندٌ واحدٌ يسألُ سؤالاً واحداً: **أىُّ دالّةٍ تطرقُها سياسةُ
-- حمايةٍ على جدولٍ يبلغُه الزائرُ ثمّ هى مغلقةٌ فى وجهِه؟** وكان يُجيبُ بمقابلةِ
-- **كلِّ دالّةٍ بكلِّ سياسة** ببصمةٍ نصّيّة — ٧٩٣ سياسةً × أكثرَ من ألفِ دالّة،
-- أى قرابةَ **مليونِ مطابقةٍ نصّيّة** فى كلِّ فحص. فقِيس: **٢٩٫٦٧ ثانية** على
-- الإنتاج و**٣٥٫٥٤** على بيتِ الاختبار، **لكلِّ فحصٍ على حدة**.
--
-- والعلاج: البيتُ الذى وُلد فى v3.75.27
-- ------------------------------------
-- `policy_knocked_function_names(true)` يستخرجُ الأسماءَ من نصوصِ السياسات
-- **مرّةً واحدة**، ثمّ تُقارَنُ بالتساوى. **ولا يُبنى بيتٌ ثانٍ** — هو البيتُ
-- نفسُه الذى يناديه فحصُ v3.75.27 وهجرتُه.
--
-- **ولا يُقبَلُ تسريعٌ يغيّرُ الحكم** — والبرهانُ بالزرعِ لا بالوصف
-- ---------------------------------------------------------------
-- لا يكفى أن يمرَّ الشكلانِ على قاعدةٍ سليمة: **فحصٌ لا يفحصُ شيئاً يمرُّ أيضاً**.
-- فزُرعت أعطابٌ **داخلَ معاملاتٍ أُلغيت**، وقُوبل الشكلانِ حرفاً بحرف:
--
--   • **على السليم** (لا شىءَ مزروع): الشكلانِ يعطيانِ **٣٦ اسماً بعينِها**
--     وصفرَ فرقٍ فى الاتّجاهَين — على الإنتاجِ وبيتِ الاختبارِ معاً.
--   • **بابٌ واحدٌ مزروع** (`can_access_bill_items`): الشكلانِ سمّياه بعينِه.
--     الإنتاج: القديمُ **٢٩٫٦٧ ثانية**، الجديدُ **٠٫١٠** — الحكمُ واحد.
--     الاختبار: القديمُ **٣٥٫٥٤**، الجديدُ **٠٫٢٩** — الحكمُ واحد.
--   • **بابانِ مزروعان**: الشكلانِ سمّياهما **بالترتيبِ نفسِه**.
--   • **وبابٌ لا تطرقُه سياسةٌ** أُغلق عمداً (`find_user_by_login`):
--     **لم يذكرْه أىٌّ من الشكلَين** — فلا إنذارَ كاذبٌ يُولَد.
--
-- **وحارسٌ يصرخ على البرىء يُطفأ**، **وحارسٌ لا يصرخ على المذنبِ ليس حارساً** —
-- وقد جُرِّبَ الاثنانِ لا واحد.
--
-- وما لا تفعلُه هذه الدفعة
-- ------------------------
-- **لا تُغيّرُ سقفاً، ولا تُضيفُ بنداً، ولا تحذفُ بنداً.** كلُّ بندٍ آخرَ فى
-- الفحصَين **منقولٌ حرفاً بحرف**. ولا هجرةَ تمسُّ منحةً، ولا صفَّ بياناتٍ يُلمَس،
-- ولا شاشةَ تتغيّر.
--
-- **ودَينٌ يُكشَفُ يُسمَّى**: سقفُ `_24_` ما زال **١٣٥** وسقفُ `_25_` **٦٥**،
-- والواقعُ اليومَ **٣٥**. فهما سقفانِ لا يحرسانِ شيئاً بعدَ أن حرسَ `_27_` (٣٨)
-- و`_28_` (٣٦) أدقَّ منهما. **وسقفٌ لا يمنعُ شيئاً يُطمئنُ ولا يحرس** — ويُخفَضُ
-- فى دفعتِه، لأنّ خفضَه **تغييرُ حكمٍ** لا تسريع، ولا يُخلَطُ بهذه.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_24_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_missing TEXT;
  v_open    INT;
  v_ceiling CONSTANT INT := 135;
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

-- =============================================================================
-- الفحصُ المرجعىُّ — **وحارسٌ بطىءٌ يُغرى بتخطّيه**.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_29_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  t0        timestamptz;
  v_secs    numeric;
  v_budget  CONSTANT numeric := 10;   -- ثوانٍ. المقيسُ اليومَ أقلُّ من ٢، والفسحةُ واسعةٌ عمداً
  v_bad     TEXT;
BEGIN
  -- (١) **ولا يعودُ الشكلُ البطىءُ صامتاً**: يُقاسُ زمنُ الفحصَينِ حيّاً.
  --     **وحارسٌ بطىءٌ يُغرى بتخطّيه**، والبطءُ يعودُ بسطرٍ واحدٍ منسىّ.
  t0 := clock_timestamp();
  PERFORM public.assert_baseline_v3_75_24_check();
  PERFORM public.assert_baseline_v3_75_25_check();
  v_secs := extract(epoch FROM clock_timestamp() - t0);

  IF v_secs > v_budget THEN
    RAISE EXCEPTION
      'v3.75.29: عادَ الفحصانِ إلى البطء: % ثانية (الميزانيّة % ثانية). عادَ الشكلُ الذى يقابلُ كلَّ دالّةٍ بكلِّ سياسة؟',
      round(v_secs, 2), v_budget;
  END IF;

  -- (٢) **ولا بيتَ ثانٍ**: كلاهما ينادى البيتَ الواحد. فلو أعادَ أحدُهما كتابةَ
  --     السؤالِ بيدِه لعادَ الفمانِ يقولانِ فى الأمرِ الواحدِ قولَين.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('assert_baseline_v3_75_24_check', 'assert_baseline_v3_75_25_check')
     AND p.prosrc NOT LIKE '%policy_knocked_function_names%';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.29: فحصٌ لا ينادى البيتَ الواحدَ بل يكتبُ السؤالَ بيدِه: %', v_bad;
  END IF;

  -- (٣) **والبيتُ يقولُ شيئاً**: لو أعادَ فراغاً لَمرَّ البندانِ صامتَين
  --     **وهما لا يفحصانِ شيئاً**. **والطمأنينةُ الكاذبة أسوأُ من الغياب.**
  IF COALESCE(array_length(public.policy_knocked_function_names(true), 1), 0) < 1 THEN
    RAISE EXCEPTION 'v3.75.29: البيتُ الواحدُ لا يعرفُ اسماً واحداً — فحصٌ صامتٌ لا سليم.';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_29_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_29_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_29_check() FROM authenticated;

-- **ولا يقالُ تمَّ قبلَ أن يُقاس.**
SELECT public.assert_baseline_v3_75_29_check();
SELECT public.assert_baseline_v3_75_28_check();
SELECT public.assert_baseline_v3_75_27_check();
