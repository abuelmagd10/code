-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.56 — **والبيتُ يُحرَسُ بخاصّيّتِه لا بإغلاقِه**
-- ═══════════════════════════════════════════════════════════════════════════
--
-- v3.75.52 أغلقَ البيتَ الواحدَ `erp_company_base_currency` أمامَ المستخدِمِ
-- المسجَّلِ **تحوّطاً بالمبدأ**، لا سدّاً لثغرةٍ مقيسة. وورَّثتِ الدفعاتُ الثلاثُ
-- بعدَه التوكيدَ نفسَه، فصارَ فى **أربعةِ فحوصٍ حيّة**. وذلك الإغلاقُ يمنعُ خمسةَ
-- كُتّابٍ بصلاحيّاتِ مُنادِيهم من أن يقرأوا الأساسَ بدَلَ أن يخترعوه.
--
-- **والقياسُ قلبَ السؤال**:
--
--   البيتُ الواحد ...............  بصلاحيّاتِ مُنادِيه (لا كاملة)
--   حمايةُ الصفوفِ على companies   مفعَّلة · ثلاثُ سياساتِ قراءة: مالكٌ أو عضو
--   والمستخدِمُ المسجَّل ..........  **يقرأُ الجدولَ وعمودَ base_currency أصلاً**
--
-- فالبيتُ **بصلاحيّاتِ مُنادِيه**: من ناداه جرى بحقِّه هو، فحمايةُ الصفوفِ تحكمُه
-- بالضبطِ كما تحكمُ القراءةَ المباشرةَ التى يملكُها اليومَ بلا منحةٍ منّا.
-- **فالمنحةُ لا تُوسِّعُ معلومةً واحدة.** وشركةٌ لا يراها: تُعيدُ القراءةُ لا صفّاً
-- فيرفعُ البيتُ استثناءَه — وهو جوابُ الانتقاءِ الفارغِ نفسُه، **فلا يُولَدُ
-- كاشفُ وجود**.
--
-- **ولا يُنزَعُ توكيدٌ صامتاً، ولا يُستثنى فحصٌ ليمرَّ منح.** فالأربعةُ يُبدَّلُ
-- سؤالُها إلى شرطٍ **أقوى**، بيتُه واحدٌ يُنادَى لا أربعُ نسخٍ منه:
--
--   كان:  البيتُ مُغلَقٌ أمام PUBLIC وanon وauthenticated
--   يصير: بصلاحيّاتِ مُنادِيه · وجدولُه محمىٌّ بحمايةِ الصفوف · ولا يبلغُه زائر
--
-- **والحكمُ بالأثرِ لا بالاسم**: الإغلاقُ اسم، وحمايةُ الصفوفِ أثر. والشرطُ
-- الجديدُ يصرخُ لو صارَ البيتُ بصلاحيّاتٍ كاملة، أو رُفعتِ الحمايةُ عن صفوفِ
-- الشركات — **وكلاهما عطبٌ حقيقىٌّ لا يراه شرطُ الإغلاق**.
--
-- **وترتيبٌ يحمى الشجرةَ مهما حدث**: الشرطُ الجديدُ صادقٌ **قبلَ المنحِ وبعدَه**،
-- فالفحوصُ تُعادُ صياغتُها أوّلاً ثمّ تُكتَبُ المنحة — ولا لحظةَ تكونُ فيها
-- القاعدةُ فى حالٍ يرفضُها فحص.
--
-- **وما لم يُمَسَّ**: لا كاتبَ واحدٌ يُعادُ صياغتُه هنا. الخمسةُ يأتون فى دفعاتٍ
-- تاليةٍ مقيسة، ثمّ يُنزَعُ الافتراضُ المكتوبُ عن عمودِ المرتجع. **ولا يُخلَطُ
-- قرارُ صلاحيّةٍ بجراحةِ شيفرة.** ولا يتحرّكُ مُثبَّتٌ واحد: «بلا قفل ١٠٠»
-- و«بلا طارق ١٢١» يحاكمانِ دوالَّ الصلاحيّاتِ الكاملةِ وحدَها، والبيتُ ليس منها.
--
-- و`search_path` غيرُ المضبوطِ فى نسخةِ post_purchase_transaction ذاتِ الثلاثةَ
-- عشرَ وسيطاً **عطبُ أمانٍ مستقلٌّ يُسدَّدُ بدفعتِه — ولا يُخلَطُ عطبٌ بعطب**.
--
-- طُبِّقت على البيتَين، وتُقاسُ بالتطابقِ حرفاً بحرف.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- البيتُ الواحدُ للتوكيد — يُنادَى من الأربعةِ ولا يُنسَخ
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_56_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $chk$
DECLARE
  n_invoker int;
  n_rls     int;
  n_open    int;
  n_self    int;
  n_auth    int;
BEGIN
  -- (أ) البيتُ الواحدُ **بصلاحيّاتِ مُنادِيه** — فمن ناداه جرى بحقِّه هو لا بحقِّ
  --     سواه، وحمايةُ الصفوفِ تحكمُه كما تحكمُ قراءتَه المباشرةَ من الجدول.
  SELECT count(*) INTO n_invoker
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'erp_company_base_currency'
    AND NOT p.prosecdef;
  IF n_invoker <> 1 THEN
    RAISE EXCEPTION 'v3.75.56: البيتُ الواحدُ ليس بصلاحيّاتِ مُنادِيه — فمنحُه لمستخدِمٍ يفتحُ له صفوفَ غيرِه';
  END IF;

  -- (ب) وجدولُ الشركاتِ محمىٌّ بحمايةِ الصفوف — **وهى الحارسُ الحقيقىُّ لا المنحة**
  SELECT count(*) INTO n_rls
  FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relname = 'companies' AND c.relrowsecurity;
  IF n_rls <> 1 THEN
    RAISE EXCEPTION 'v3.75.56: رُفعت حمايةُ الصفوفِ عن companies — فالبيتُ الممنوحُ يصيرُ باباً مفتوحاً';
  END IF;

  -- (ج) ولا يبلغُه زائرٌ ولا عمومُ الأدوار — **والمسجَّلُ وحدَه معلَنٌ ومقصود**
  SELECT count(*) INTO n_open
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'erp_company_base_currency'
    AND grantee IN ('PUBLIC', 'anon');
  IF n_open <> 0 THEN
    RAISE EXCEPTION 'v3.75.56: % صلاحيّةً على البيتِ لزائرٍ أو لعمومِ الأدوار', n_open;
  END IF;

  -- (د) ولا يُمنَحُ هذا الفحصُ نفسُه لأحدٍ سوى مفتاحِ الخدمة
  SELECT count(*) INTO n_self
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'assert_baseline_v3_75_56_check'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF n_self <> 0 THEN
    RAISE EXCEPTION 'v3.75.56: % صلاحيّةً مفتوحةً على هذا الفحصِ نفسِه', n_self;
  END IF;

  -- **ومعدودٌ لا مسكوتٌ عنه**: منحةُ المستخدِمِ المسجَّلِ تُعَدُّ وتُعرَض، ولا تُشترَطُ
  -- بعدُ — فلا كاتبَ يعتمدُ عليها اليوم. وأوّلُ دفعةٍ يعتمدُ فيها كاتبٌ عليها
  -- **تُثبِّتُها**، فمكسبٌ لا يُثبَّتُ يُلتَفُّ عليه.
  SELECT count(*) INTO n_auth
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'erp_company_base_currency'
    AND grantee = 'authenticated';

  RETURN 'v3.75.56 ok - بصلاحيّاتِ مُنادِيه=' || n_invoker
         || ' · حمايةُ صفوفِ الشركات=' || n_rls
         || ' · لزائرٍ أو لعموم=' || n_open
         || ' · الفحصُ مغلَق=' || n_self
         || ' · وللمستخدِمِ المسجَّل=' || n_auth || ' (معلَنٌ ومقصود)';
END
$chk$;

-- ───────────────────────────────────────────────────────────────────────────
-- فحصُ v3.75.52 — سؤالُه بُدِّلَ إلى الأقوى، وما سواه كما هو

-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_52_check()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_co        uuid;
  v_base      text;
  v_marker    text := 'AAA';   -- ليست عملةً حقيقيّةً: علامةٌ للاختبار، فلا يُسمّى فى الفحصِ اسمُ عملةٍ حقيقيّة
  v_foreign   text := 'BBB';
  v_cust      uuid;
  v_credit    uuid;
  v_ccy       text;
  v_amt       numeric;
  r_invent    text := 'NOT RUN';
  r_innocent  text := 'NOT RUN';
  r_own       text := 'NOT RUN';
  r_inherit   text := 'NOT RUN';
  n           int;
BEGIN
  -- (أ) البيتُ الواحدُ يرفضُ أن يخترعَ عملةً لشركةٍ لا وجودَ لها
  BEGIN
    PERFORM public.erp_company_base_currency('00000000-0000-0000-0000-000000000000'::uuid);
    r_invent := 'INVENTED';
  EXCEPTION WHEN sqlstate '23503' THEN
    r_invent := 'REFUSED';
  END;
  IF r_invent <> 'REFUSED' THEN
    RAISE EXCEPTION 'v3.75.52: البيتُ الواحدُ اخترعَ عملةً لشركةٍ لا وجودَ لها (%)', r_invent;
  END IF;

  -- (ب) ولا يقرأُ بلا رقمِ شركة
  BEGIN
    PERFORM public.erp_company_base_currency(NULL::uuid);
    RAISE EXCEPTION 'v3.75.52: البيتُ الواحدُ قرأَ عملةً بلا رقمِ شركة';
  EXCEPTION WHEN sqlstate '22004' THEN NULL;
  END;

  -- (ج) الأعمدةُ الثلاثةُ بلا قيمةٍ افتراضيّةٍ تُسمّى عملةً
  SELECT count(*) INTO n
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('customer_credits', 'customer_credit_ledger', 'vendor_credits')
    AND column_name = 'original_currency'
    AND column_default IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.52: % عموداً من الثلاثةِ عادَ يحملُ قيمةً افتراضيّةً — والصمتُ لا يُمكِنُ تمييزُه من الاختيار', n;
  END IF;

  -- (د) والأعمدةُ الثلاثةُ ما زالت تقبلُ الفراغَ — فنزعُ الافتراضِ لا يكسرُ إدخالاً
  SELECT count(*) INTO n
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('customer_credits', 'customer_credit_ledger', 'vendor_credits')
    AND column_name = 'original_currency'
    AND is_nullable = 'NO';
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.52: % عموداً صارَ إلزامىّاً بلا افتراض — وهذا يكسرُ من أهملَ العمود', n;
  END IF;

  -- (هـ) ورقمُ الشركةِ إلزامىٌّ فى الثلاثة، فرفضُ البيتِ الواحدِ لا يكسرُ مساراً كان يعمل
  SELECT count(*) INTO n
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('customer_credits', 'customer_credit_ledger', 'vendor_credits')
    AND column_name = 'company_id'
    AND is_nullable = 'NO';
  IF n <> 3 THEN
    RAISE EXCEPTION 'v3.75.52: رقمُ الشركةِ إلزامىٌّ فى % جدولاً لا ثلاثة', n;
  END IF;

  -- (و) الأجسادُ الثلاثةُ لا تُسمّى عملةً حرفاً
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('fill_customer_credit_fx_from_source',
                      'fill_customer_credit_ledger_fx_from_source',
                      'fill_vendor_credit_fx_from_source')
    AND p.prosrc ~ '''(EGP|USD|SAR|EUR|GBP|AED|KWD|JOD|QAR|BHD|OMR)''';
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.52: % من المُشغِّلاتِ الثلاثةِ عادَ يُسمّى عملةً بعينِها', n;
  END IF;

  -- (ز) والثلاثةُ تنادى البيتَ الواحدَ فعلاً — والذِّكرُ ليس نداءً، فيُقاسُ بالاعتمادِ فى الكتالوج
  SELECT count(DISTINCT p.proname) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('fill_customer_credit_fx_from_source',
                      'fill_customer_credit_ledger_fx_from_source',
                      'fill_vendor_credit_fx_from_source')
    AND p.prosrc LIKE '%erp_company_base_currency(NEW.company_id)%';
  IF n <> 3 THEN
    RAISE EXCEPTION 'v3.75.52: % من الثلاثةِ ينادى البيتَ الواحدَ لا ثلاثة', n;
  END IF;

  -- ═══ البرهانُ الحىُّ: غرسٌ حقيقىٌّ يُلغى ═══
  SELECT c.id, upper(btrim(c.base_currency)) INTO v_co, v_base
  FROM public.companies c
  ORDER BY (SELECT count(*) FROM public.journal_entries je WHERE je.company_id = c.id) DESC, c.id
  LIMIT 1;

  IF v_co IS NULL THEN
    RAISE EXCEPTION 'v3.75.52: لا شركةَ فى القاعدةِ ليُغرَسَ عليها البرهان — وبحثٌ لا يجد ليس دليلَ نجاح';
  END IF;

  BEGIN
    INSERT INTO public.customers (company_id, name)
    VALUES (v_co, 'فحص مرجعى v3.75.52 — يُلغى')
    RETURNING id INTO v_cust;

    -- (١) البرىءُ لا يُصرَخُ عليه: أهملَ العملةَ ولا مستندَ مصدر ⇒ عملةُ شركتِه ومبلغُه كما هو
    INSERT INTO public.customer_credits (company_id, customer_id, credit_number, credit_date, amount)
    VALUES (v_co, v_cust, 'CHK-3-75-52-A', current_date, 100)
    RETURNING original_currency, original_amount INTO v_ccy, v_amt;
    r_innocent := CASE WHEN v_ccy = v_base AND v_amt = 100 THEN 'BASE'
                       ELSE 'BROKEN(' || COALESCE(v_ccy, 'فراغ') || '/' || COALESCE(v_amt::text, 'فراغ') || ')' END;

    -- (٢) شركةٌ أساسُها ليس الجنيه: تُبدَّلُ عملتُها بالبابِ المُعلَنِ (v3.75.51) ثمّ يُغرَس
    PERFORM set_config('app.allow_base_currency_change', 'true', true);
    UPDATE public.companies SET base_currency = v_marker WHERE id = v_co;
    PERFORM set_config('app.allow_base_currency_change', 'false', true);

    INSERT INTO public.customer_credits (company_id, customer_id, credit_number, credit_date, amount)
    VALUES (v_co, v_cust, 'CHK-3-75-52-B', current_date, 200)
    RETURNING original_currency, original_amount INTO v_ccy, v_amt;
    r_own := CASE WHEN v_ccy = v_marker AND v_amt = 200 THEN 'OWN_BASE'
                  ELSE 'BROKEN(' || COALESCE(v_ccy, 'فراغ') || '/' || COALESCE(v_amt::text, 'فراغ') || ')' END;

    -- (٣) والوسمُ يُطابقُ الحساب: ائتمانٌ بعملةٍ أجنبيّةٍ بسعرِ ٤، وسطرُ دفترٍ يرثُ منه ولم يقُلْ عملة
    INSERT INTO public.customer_credits (company_id, customer_id, credit_number, credit_date, amount,
                                         original_currency, exchange_rate_used)
    VALUES (v_co, v_cust, 'CHK-3-75-52-C', current_date, 400, v_foreign, 4)
    RETURNING id INTO v_credit;

    INSERT INTO public.customer_credit_ledger (company_id, customer_id, source_type, source_id, amount)
    VALUES (v_co, v_cust, 'manual_credit', v_credit, 400)
    RETURNING original_currency, original_amount INTO v_ccy, v_amt;
    r_inherit := CASE WHEN v_ccy = v_foreign AND v_amt = 100 THEN 'LABEL_MATCHES_MATH'
                      WHEN v_ccy <> v_foreign AND v_amt = 100 THEN 'MISLABELLED(' || COALESCE(v_ccy, 'فراغ') || ')'
                      ELSE 'BROKEN(' || COALESCE(v_ccy, 'فراغ') || '/' || COALESCE(v_amt::text, 'فراغ') || ')' END;

    RAISE EXCEPTION 'ROLLBACK_PROOF %|%|%', r_innocent, r_own, r_inherit;
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'ROLLBACK_PROOF %' THEN
        r_innocent := split_part(substr(SQLERRM, 16), '|', 1);
        r_own      := split_part(substr(SQLERRM, 16), '|', 2);
        r_inherit  := split_part(substr(SQLERRM, 16), '|', 3);
      ELSE
        RAISE;
      END IF;
  END;

  IF r_innocent <> 'BASE' THEN
    RAISE EXCEPTION 'v3.75.52: البرىءُ صُرِخَ عليه — أهملَ العملةَ فلم يأخذْ عملةَ شركتِه (%)', r_innocent;
  END IF;
  IF r_own <> 'OWN_BASE' THEN
    RAISE EXCEPTION 'v3.75.52: شركةٌ أساسُها ليس الجنيهَ كُتبَ لها غيرُ أساسِها (%)', r_own;
  END IF;
  IF r_inherit <> 'LABEL_MATCHES_MATH' THEN
    RAISE EXCEPTION 'v3.75.52: وُسِمَ مبلغٌ بعملةٍ لم يُحسَبْ بها (%)', r_inherit;
  END IF;

  -- (ح) **والحكمُ بالأثرِ لا بالاسم**: البيتُ الواحدُ لم يعُدْ يُحرَسُ بإغلاقِه
  --     بل بخاصّيّتِه — بصلاحيّاتِ مُنادِيه، وجدولُه محمىٌّ بحمايةِ الصفوف، ولا
  --     يبلغُه زائر. وذلك شرطٌ **أقوى**: يصرخُ لو صارَ بصلاحيّاتٍ كاملةٍ أو
  --     رُفعتِ الحمايةُ عن صفوفِ الشركات، وكلاهما عطبٌ لا يراه شرطُ الإغلاق.
  PERFORM public.assert_baseline_v3_75_56_check();

  -- (ح٢) ولا يُمنَحُ هذا الفحصُ نفسُه لأحدٍ سوى مفتاحِ الخدمة
  SELECT count(*) INTO n
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'assert_baseline_v3_75_52_check'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.52: % صلاحيّةً مفتوحةً على هذا الفحصِ نفسِه — والتوسيعُ يُعلَنُ ولا يُدَسّ', n;
  END IF;

  RETURN 'v3.75.52 ok - البيتُ الواحدُ يرفضُ الاختراع=' || r_invent ||
         ' · البرىء=' || r_innocent ||
         ' · أساسُ صاحبِه=' || r_own ||
         ' · الوسمُ يُطابقُ الحساب=' || r_inherit ||
         ' · أعمدةٌ بلا افتراضٍ مكتوب=3 · أجسادٌ بلا عملةٍ حرفيّة=3';
END
$function$
;

-- ───────────────────────────────────────────────────────────────────────────
-- فحصُ v3.75.53 — سؤالُه بُدِّلَ إلى الأقوى، وما سواه كما هو

-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_53_check()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_co      uuid;
  v_base    text;
  v_marker  text := 'AAA';   -- ليست عملةً حقيقيّةً: علامةٌ للقياس، فلا يُسمّى فى الفحصِ اسمُ عملةٍ حقيقيّة
  n         int;
  n_base    bigint;
  n_marker  bigint;
  n_rows    bigint;
  r_null    text := 'NOT RUN';
  r_follows text := 'NOT RUN';
BEGIN
  -- (أ) الجسدُ لا يُسمّى عملةً بعينِها — والتعليقُ محجوبٌ قبلَ الحكم
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'ic_fx_amount_accuracy'
    AND regexp_replace(p.prosrc, '--[^\n]*', ' ', 'g') ~ '''(EGP|USD|SAR|EUR|GBP|AED|KWD|JOD|QAR|BHD|OMR)''';
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.53: ic_fx_amount_accuracy عادَ يُسمّى عملةً بعينِها';
  END IF;

  -- (ب) وينادى البيتَ الواحدَ فعلاً — والذِّكرُ ليس نداءً
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'ic_fx_amount_accuracy'
    AND p.prosrc LIKE '%erp_company_base_currency(p_company_id)%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'v3.75.53: ic_fx_amount_accuracy لا ينادى البيتَ الواحد';
  END IF;

  -- (ج) وما زالت بصلاحيّاتٍ كاملة — فنداؤها للبيتِ لا يحتاجُ منحةً لأحد
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'ic_fx_amount_accuracy' AND p.prosecdef;
  IF n <> 1 THEN
    RAISE EXCEPTION 'v3.75.53: ic_fx_amount_accuracy صارت بصلاحيّاتِ مُنادِيها — فنداؤها للبيتِ يحتاجُ منحةً لم تُعلَن';
  END IF;

  -- (د) **والحكمُ بالأثرِ لا بالاسم**: البيتُ الواحدُ لم يعُدْ يُحرَسُ بإغلاقِه
  --     بل بخاصّيّتِه — بصلاحيّاتِ مُنادِيه، وجدولُه محمىٌّ بحمايةِ الصفوف، ولا
  --     يبلغُه زائر. وذلك شرطٌ **أقوى**: يصرخُ لو صارَ بصلاحيّاتٍ كاملةٍ أو
  --     رُفعتِ الحمايةُ عن صفوفِ الشركات، وكلاهما عطبٌ لا يراه شرطُ الإغلاق.
  PERFORM public.assert_baseline_v3_75_56_check();

  -- (د٢) ولا يُمنَحُ هذا الفحصُ نفسُه لأحدٍ سوى مفتاحِ الخدمة
  SELECT count(*) INTO n
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'assert_baseline_v3_75_53_check'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.53: % صلاحيّةً مفتوحةً على هذا الفحصِ نفسِه — والتوسيعُ يُعلَنُ ولا يُدَسّ', n;
  END IF;

  -- (هـ) ورقمُ شركةٍ فارغٌ يُعيدُ لا شىءَ ولا يرفع — فلا تنكسرُ شاشةٌ تُنادِى بلا شركة
  SELECT count(*) INTO n_rows FROM public.ic_fx_amount_accuracy(NULL::uuid);
  r_null := CASE WHEN n_rows = 0 THEN 'EMPTY' ELSE 'ROWS(' || n_rows || ')' END;

  -- ═══ القياسُ الحىُّ: شرطُ الاختيارِ يتبعُ الأساسَ لا نصّاً مكتوباً ═══
  SELECT c.id, upper(btrim(c.base_currency)) INTO v_co, v_base
  FROM public.companies c
  ORDER BY (SELECT count(*) FROM public.payments p WHERE p.company_id = c.id AND p.is_deleted = false) DESC, c.id
  LIMIT 1;

  IF v_co IS NULL THEN
    RAISE EXCEPTION 'v3.75.53: لا شركةَ فى القاعدةِ ليُقاسَ عليها الشرط';
  END IF;

  SELECT count(*) INTO n_base
  FROM public.payments p
  WHERE p.company_id = v_co AND p.is_deleted = false
    AND upper(btrim(COALESCE(p.original_currency, v_base))) <> v_base;

  SELECT count(*) INTO n_marker
  FROM public.payments p
  WHERE p.company_id = v_co AND p.is_deleted = false
    AND upper(btrim(COALESCE(p.original_currency, v_marker))) <> v_marker;

  SELECT count(*) INTO n_rows
  FROM public.payments p
  WHERE p.company_id = v_co AND p.is_deleted = false;

  -- بأساسٍ لا تستعملُه الشركةُ يصيرُ كلُّ صفٍّ أجنبيّاً، وبأساسِها الحقيقىِّ
  -- يصيرُ الأجنبىُّ وحدَه أجنبيّاً. **فلو كان الشرطُ نصّاً مكتوباً لما تحرّك.**
  r_follows := CASE
    WHEN n_rows = 0 THEN 'NO_ROWS'
    WHEN n_marker = n_rows AND n_base < n_rows THEN 'FOLLOWS_BASE'
    WHEN n_marker = n_base THEN 'FROZEN'
    ELSE 'UNEXPECTED(' || n_base || '/' || n_marker || '/' || n_rows || ')'
  END;

  IF r_null <> 'EMPTY' THEN
    RAISE EXCEPTION 'v3.75.53: رقمُ شركةٍ فارغٌ لم يُعِدْ لا شىء (%)', r_null;
  END IF;
  IF r_follows = 'FROZEN' THEN
    RAISE EXCEPTION 'v3.75.53: شرطُ الاختيارِ لا يتبعُ الأساسَ — عددُ الأجنبىِّ لم يتحرّكْ بتبديلِ الأساس (%)', n_base;
  END IF;
  IF r_follows LIKE 'UNEXPECTED%' THEN
    RAISE EXCEPTION 'v3.75.53: قياسٌ لم يُفهَم — %', r_follows;
  END IF;

  RETURN 'v3.75.53 ok - جسدٌ بلا عملةٍ حرفيّة=1 · ينادى البيت=1 · بصلاحيّاتٍ كاملة=1 · بلا توسيعِ منحة=0'
         || ' · شركةٌ فارغة=' || r_null
         || ' · الشرطُ يتبعُ الأساس=' || r_follows
         || ' (صفوفُ الشركة=' || n_rows || ' · أجنبىٌّ بأساسِها=' || n_base || ' · بأساسٍ آخَر=' || n_marker || ')';
END
$function$
;

-- ───────────────────────────────────────────────────────────────────────────
-- فحصُ v3.75.54 — سؤالُه بُدِّلَ إلى الأقوى، وما سواه كما هو

-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_54_check()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  n         int;
  n_vc      bigint;
  n_bad     bigint;
  n_returns bigint;
BEGIN
  -- (أ) الجسدُ لا يُسمّى عملةً بعينِها — والتعليقُ محجوبٌ قبلَ الحكم
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'confirm_purchase_return_delivery'
    AND regexp_replace(p.prosrc, '--[^\n]*', ' ', 'g') ~ '''(EGP|USD|SAR|EUR|GBP|AED|KWD|JOD|QAR|BHD|OMR)''';
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.54: confirm_purchase_return_delivery عادت تُسمّى عملةً بعينِها';
  END IF;

  -- (ب) وتنادى البيتَ الواحدَ برقمِ شركةِ الصفِّ — والذِّكرُ ليس نداءً
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'confirm_purchase_return_delivery'
    AND p.prosrc LIKE '%erp_company_base_currency(v_pr.company_id)%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'v3.75.54: لا تنادى البيتَ الواحدَ برقمِ شركةِ الصفّ';
  END IF;

  -- (ج) وما زالت بصلاحيّاتٍ كاملة — فنداؤها للبيتِ لا يحتاجُ منحةً لأحد
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'confirm_purchase_return_delivery' AND p.prosecdef;
  IF n <> 1 THEN
    RAISE EXCEPTION 'v3.75.54: صارت بصلاحيّاتِ مُنادِيها — فنداؤها للبيتِ يحتاجُ منحةً لم تُعلَن';
  END IF;

  -- (د) **والحكمُ بالأثرِ لا بالاسم**: البيتُ الواحدُ لم يعُدْ يُحرَسُ بإغلاقِه
  --     بل بخاصّيّتِه — بصلاحيّاتِ مُنادِيه، وجدولُه محمىٌّ بحمايةِ الصفوف، ولا
  --     يبلغُه زائر. وذلك شرطٌ **أقوى**: يصرخُ لو صارَ بصلاحيّاتٍ كاملةٍ أو
  --     رُفعتِ الحمايةُ عن صفوفِ الشركات، وكلاهما عطبٌ لا يراه شرطُ الإغلاق.
  PERFORM public.assert_baseline_v3_75_56_check();

  -- (د٢) ولا يُمنَحُ هذا الفحصُ نفسُه لأحدٍ سوى مفتاحِ الخدمة
  SELECT count(*) INTO n
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'assert_baseline_v3_75_54_check'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.54: % صلاحيّةً مفتوحةً على هذا الفحصِ نفسِه — والتوسيعُ يُعلَنُ ولا يُدَسّ', n;
  END IF;

  -- (هـ) وقيدٌ حىٌّ على الصفوفِ كلِّها: لا إشعارَ دائنٍ مولودٍ من مرتجعٍ
  --      يُوسَمُ بعملةٍ غيرِ عملةِ مرتجعِه. **ومعدودٌ لا مسكوتٌ عنه.**
  SELECT count(*),
         count(*) FILTER (WHERE upper(btrim(coalesce(vc.original_currency, ''))) IS DISTINCT FROM
                                upper(btrim(coalesce(pr.original_currency, ''))))
    INTO n_vc, n_bad
  FROM public.vendor_credits vc
  JOIN public.purchase_returns pr ON pr.id = vc.source_purchase_return_id;

  IF n_bad <> 0 THEN
    RAISE EXCEPTION 'v3.75.54: % إشعارَ دائنٍ موسومٌ بعملةٍ غيرِ عملةِ مرتجعِه (من %)', n_bad, n_vc;
  END IF;

  SELECT count(*) INTO n_returns FROM public.purchase_returns;

  RETURN 'v3.75.54 ok - جسدٌ بلا عملةٍ حرفيّة=1 · ينادى البيت=1 · بصلاحيّاتٍ كاملة=1 · بلا توسيعِ منحة=0'
         || ' · إشعاراتُ دائنٍ من مرتجع=' || n_vc || ' · موسومةٌ بغيرِ عملةِ مرتجعِها=' || n_bad
         || ' · مرتجعاتٌ فى القاعدة=' || n_returns;
END
$function$
;

-- ───────────────────────────────────────────────────────────────────────────
-- فحصُ v3.75.55 — سؤالُه بُدِّلَ إلى الأقوى، وما سواه كما هو

-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_55_check()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  n          int;
  n_pr       bigint;
  n_blank    bigint;
  n_mismatch bigint;
  v_names    text[] := ARRAY['process_purchase_return_atomic',
                             'process_purchase_return_multi_warehouse',
                             'post_purchase_transaction'];
BEGIN
  -- (أ) لا جسدَ من الثلاثةِ يُسمّى عملةً بعينِها — والتعليقُ محجوبٌ قبلَ الحكم.
  --     وpost_purchase_transaction تُحاكَمُ بنسختِها ذاتِ الصلاحيّاتِ الكاملةِ
  --     وحدَها، فالأخرى مُعلَنةٌ ومؤجَّلةٌ على قرارِ صلاحيّة.
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = ANY(v_names)
    AND p.prosecdef
    AND regexp_replace(p.prosrc, '--[^\n]*', ' ', 'g') ~ '''(EGP|USD|SAR|EUR|GBP|AED|KWD|JOD|QAR|BHD|OMR)''';
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.55: % من كُتّابِ المرتجعِ عادَ يُسمّى عملةً بعينِها', n;
  END IF;

  -- (ب) وكلُّ واحدٍ منها ينادى البيتَ الواحدَ برقمِ الشركةِ الذى أُعطىَ له
  --     — **والذِّكرُ ليس نداءً**.
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = ANY(v_names)
    AND p.prosecdef
    AND p.prosrc LIKE '%erp_company_base_currency(p_company_id)%';
  IF n <> 3 THEN
    RAISE EXCEPTION 'v3.75.55: ينادى البيتَ % من ثلاثةٍ — والباقى يخترع', n;
  END IF;

  -- (ج) والثلاثةُ ما زالت بصلاحيّاتٍ كاملة — فنداؤها للبيتِ بلا منحةٍ لأحد
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = ANY(v_names) AND p.prosecdef;
  IF n <> 3 THEN
    RAISE EXCEPTION 'v3.75.55: % بصلاحيّاتٍ كاملةٍ لا ثلاثة — ونداءُ البيتِ يحتاجُ منحةً لم تُعلَن', n;
  END IF;

  -- (د) والكاتبُ الصامتُ صارَ ناطقاً: يذكرُ العمودَ صراحةً فى كتابتِه،
  --     فلا يُجيبُ عنه افتراضٌ مكتوب.
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'post_purchase_transaction' AND p.prosecdef
    AND p.prosrc LIKE '%original_currency%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'v3.75.55: post_purchase_transaction عادَ يسكتُ عن العمود — فيُجيبُ عنه الافتراض';
  END IF;

  -- (هـ) **والحكمُ بالأثرِ لا بالاسم**: البيتُ الواحدُ لم يعُدْ يُحرَسُ بإغلاقِه
  --     بل بخاصّيّتِه — بصلاحيّاتِ مُنادِيه، وجدولُه محمىٌّ بحمايةِ الصفوف، ولا
  --     يبلغُه زائر. وذلك شرطٌ **أقوى**: يصرخُ لو صارَ بصلاحيّاتٍ كاملةٍ أو
  --     رُفعتِ الحمايةُ عن صفوفِ الشركات، وكلاهما عطبٌ لا يراه شرطُ الإغلاق.
  PERFORM public.assert_baseline_v3_75_56_check();

  -- (هـ٢) ولا يُمنَحُ هذا الفحصُ نفسُه لأحدٍ سوى مفتاحِ الخدمة
  SELECT count(*) INTO n
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'assert_baseline_v3_75_55_check'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.55: % صلاحيّةً مفتوحةً على هذا الفحصِ نفسِه — والتوسيعُ يُعلَنُ ولا يُدَسّ', n;
  END IF;

  -- (و) وقيدٌ حىٌّ على الصفوفِ كلِّها — **يصرخُ يومَ يقع**:
  --     لا مرتجعَ بعمودِ عملةٍ فارغ، ولا مرتجعَ يقولُ عملةً غيرَ أساسِ شركتِه
  --     **وحسابُه يقولُ إنّه بالأساس** (سعرُ صرفٍ واحدٌ وأصلُه يساوى محوَّلَه)
  --     — فذلك هو الوسمُ الكاذبُ بعينِه، لا العملةُ الأجنبيّةُ الصادقة.
  SELECT count(*),
         count(*) FILTER (WHERE pr.original_currency IS NULL OR btrim(pr.original_currency) = ''),
         count(*) FILTER (WHERE upper(btrim(coalesce(pr.original_currency,''))) <> upper(btrim(co.base_currency))
                            AND coalesce(pr.exchange_rate_used, 1) = 1
                            AND coalesce(pr.original_total_amount, pr.total_amount) = pr.total_amount)
    INTO n_pr, n_blank, n_mismatch
  FROM public.purchase_returns pr
  JOIN public.companies co ON co.id = pr.company_id;

  IF n_blank <> 0 THEN
    RAISE EXCEPTION 'v3.75.55: % مرتجعاً بعمودِ عملةٍ فارغ (من %)', n_blank, n_pr;
  END IF;
  IF n_mismatch <> 0 THEN
    RAISE EXCEPTION 'v3.75.55: % مرتجعاً يقولُ عملةً غيرَ أساسِ شركتِه وحسابُه بالأساس — وسمٌ كاذب (من %)', n_mismatch, n_pr;
  END IF;

  RETURN 'v3.75.55 ok - أجسادٌ بلا عملةٍ حرفيّة=3 · تنادى البيت=3 · بصلاحيّاتٍ كاملة=3'
         || ' · الكاتبُ الصامتُ صارَ ناطقاً=1 · بلا توسيعِ منحة=0'
         || ' · مرتجعاتٌ فى القاعدة=' || n_pr
         || ' · بعمودٍ فارغ=' || n_blank
         || ' · وسمٌ كاذب=' || n_mismatch;
END
$function$
;

-- ───────────────────────────────────────────────────────────────────────────
-- المنحةُ المُعلَنة — تُكتَبُ آخِراً، والشرطُ الجديدُ صادقٌ قبلَها وبعدَها
-- ───────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.erp_company_base_currency(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_56_check()  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_56_check() TO service_role;

COMMENT ON FUNCTION public.assert_baseline_v3_75_56_check() IS
  'v3.75.56 — يُثبِتُ أنّ البيتَ الواحدَ للعملةِ الأساسيّةِ محروسٌ بخاصّيّتِه لا بإغلاقِه: بصلاحيّاتِ مُنادِيه، وجدولُ الشركاتِ محمىٌّ بحمايةِ الصفوف، ولا يبلغُه زائرٌ ولا عمومُ الأدوار. ويعدُّ منحةَ المستخدِمِ المسجَّلِ ولا يسكتُ عنها.';
