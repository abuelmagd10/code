-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.52 — «ولا تُخترَعُ عملةٌ، بل تُقرأُ من صاحبِها»
--
-- عُثِرَ على ثلاثةِ مُشغِّلاتٍ تقرِّرُ «هل هذا هو الأساس؟» **بمقارنةِ النصِّ
-- بالجنيهِ المصرىِّ مكتوباً حرفاً**، ولا تسألُ صفَّ الشركةِ عن عملتِها:
--
--     fill_customer_credit_fx_from_source          (٣ مواضع)
--     fill_customer_credit_ledger_fx_from_source   (٣ مواضع)
--     fill_vendor_credit_fx_from_source            (٥ مواضع)
--
-- وهذه ليست تسمية: **هى قرارُ مالٍ**. فالسطرُ
--     CASE WHEN v_currency = 'EGP' THEN NEW.amount ELSE ROUND(NEW.amount / v_rate) END
-- يقسمُ المبلغَ على سعرِ صرفٍ **بناءً على أنّ العملةَ ليست الجنيه**. فشركةٌ
-- أساسُها الريالُ يُعَدُّ مالُها الأصلىُّ أجنبيّاً فيُقسَمُ على سعر، وشركةٌ
-- أساسُها الجنيهُ ومستندُها بالدولارِ يُقسَمُ مبلغُها **ويبقى وسمُها «جنيه»**.
--
-- وأخطرُ من ذلك أنّ العمودَ نفسَه كان يحملُ قيمةً افتراضيّةً مكتوبةً
-- («EGP»). فمن أهملَ العمودَ لم يُكتَبْ عندَه فراغٌ بل كُتبَ «جنيه» — **فصارَ
-- الصمتُ لا يُمكِنُ تمييزُه عن الاختيار**، والمُشغِّلُ الذى كُتبَ ليملأَ
-- الفراغَ (COALESCE(NEW.original_currency, v_currency)) **لا يعملُ أبداً**،
-- فيبقى الوسمُ «جنيه» والحسابُ بسعرِ عملةٍ أخرى. **وشرطٌ لا يُشغَّلُ أبداً
-- ليس شرطاً بل طمأنينةٌ كاذبة.**
--
-- والأثرُ المقيسُ اليوم: صفوفُ ائتمانِ العملاءِ ودفترِه **صفر**، وائتمانُ
-- المورّدِ صفّانِ كلاهما بالجنيهِ بسعرِ ١ ومبلغُهما الأصلىُّ مساوٍ — **فلا
-- مليمَ يتحرّكُ بهذه الدفعة**، والعطبُ ميكانيزمٌ حىٌّ لا خسارةٌ واقعة.
--
-- والعلاجُ جذرىٌّ لا مسكّن:
--   (١) بيتٌ واحدٌ يُسألُ عن عملةِ الشركة: erp_company_base_currency(uuid)
--       **ويرفضُ أن يخترعَ** — لا شركةَ ⇒ استثناء، لا «جنيه» صامت.
--   (٢) تُنزَعُ القيمةُ الافتراضيّةُ المكتوبةُ من الأعمدةِ الثلاثةِ التى
--       تملكُها هذه المُشغِّلات، فيصيرُ الصمتُ فراغاً **يُمكِنُ تمييزُه**.
--   (٣) تُعادُ صياغةُ الثلاثةِ فتقرأَ الأساسَ من صفِّ الشركة، **ولا يُوسَمُ
--       مبلغٌ بعملةٍ لم يُحسَبْ بها**.
--
-- ولا يُمَسُّ عمودٌ آخَرُ من الثلاثينَ الباقية، **ولا يُبدَّلُ نصٌّ إلى نصّ**:
-- الباقى دَينٌ مكتوبٌ يُثبِّتُه حارسُ المستودعِ ويُسدَّدُ على دفعاتٍ مقيسة.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- (١) البيتُ الواحد — ويرفضُ أن يخترع
--
-- بصلاحيّاتِ مُنادِيه (SECURITY INVOKER) عن قصد: حمايةُ الصفوفِ تحرسُه،
-- ولا يصيرُ باباً بصلاحيّاتٍ كاملةٍ يُضافُ إلى دَينِ «بلا قفل».
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.erp_company_base_currency(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $home$
DECLARE v_base text;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'لا تُقرأُ عملةٌ أساسيّةٌ بلا رقمِ شركة — ولا تُخترَعُ عملة'
      USING ERRCODE = '22004';
  END IF;

  SELECT upper(btrim(base_currency)) INTO v_base
  FROM public.companies WHERE id = p_company_id;

  IF v_base IS NULL OR v_base = '' THEN
    RAISE EXCEPTION 'لا شركةَ بالرقم % أو عملتُها الأساسيّةُ فارغة — ولا تُخترَعُ عملة', p_company_id
      USING ERRCODE = '23503';
  END IF;

  RETURN v_base;
END
$home$;

COMMENT ON FUNCTION public.erp_company_base_currency(uuid) IS
  'البيتُ الواحدُ لعملةِ الشركةِ الأساسيّة: تُقرأُ من companies.base_currency ولا تُخترَع. يرفعُ استثناءً إن لم توجدِ الشركة — فالطمأنينةُ الكاذبةُ أسوأُ من الغياب.';

-- ───────────────────────────────────────────────────────────────────────────
-- (٢) الصمتُ يصيرُ فراغاً يُمكِنُ تمييزُه
--
-- الأعمدةُ الثلاثةُ كلُّها تقبلُ الفراغَ سلفاً (NULL)، فنزعُ الافتراضِ لا
-- يكسرُ إدخالاً كان يعمل: من كتبَ العملةَ يبقى كما هو، ومن أهملَها يملأُ
-- له المُشغِّلُ من مستندِه أو من عملةِ شركتِه.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.customer_credits       ALTER COLUMN original_currency DROP DEFAULT;
ALTER TABLE public.customer_credit_ledger ALTER COLUMN original_currency DROP DEFAULT;
ALTER TABLE public.vendor_credits         ALTER COLUMN original_currency DROP DEFAULT;

-- ───────────────────────────────────────────────────────────────────────────
-- (٣) الثلاثةُ تُعادُ صياغتُها — والحكمُ بالأثرِ لا بالاسم
--
-- ثلاثةُ طرقٍ لا طريقان، ومُميَّزةٌ بعضُها من بعضٍ الآن أنّ الصمتَ فراغ:
--   (أ) قال المُنادِى عملةً غيرَ الأساس  ⇒ يُصدَّقُ كما كان.
--   (ب) قال الأساسَ صراحةً               ⇒ فهو الأساس، ولا يُقسَمُ مبلغٌ على سعر.
--   (ج) لم يقُلْ شيئاً (فراغ)            ⇒ يُورَثُ من المستندِ المصدر: العملةُ
--       والسعرُ **معاً**، فيُوسَمُ المبلغُ بما حُسبَ به لا بغيرِه.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fill_customer_credit_fx_from_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base     text;
  v_currency text;
  v_rate     numeric(18,8);
  v_rate_id  uuid;
BEGIN
  v_base := public.erp_company_base_currency(NEW.company_id);

  -- (أ) عملةٌ غيرُ الأساسِ قالَها المُنادِى: تُصدَّق
  IF NEW.original_currency IS NOT NULL
     AND btrim(NEW.original_currency) <> ''
     AND upper(btrim(NEW.original_currency)) <> v_base THEN
    NEW.original_currency   := upper(btrim(NEW.original_currency));
    NEW.exchange_rate_used  := COALESCE(NEW.exchange_rate_used, 1);
    NEW.original_amount     := COALESCE(NEW.original_amount, NEW.amount);
    RETURN NEW;
  END IF;

  -- (ب) الأساسُ قالَه المُنادِى صراحةً: لا سعرَ يُقسَمُ عليه
  IF NEW.original_currency IS NOT NULL AND btrim(NEW.original_currency) <> '' THEN
    NEW.original_currency   := v_base;
    NEW.exchange_rate_used  := COALESCE(NEW.exchange_rate_used, 1);
    NEW.original_amount     := COALESCE(NEW.original_amount, NEW.amount);
    RETURN NEW;
  END IF;

  -- (ج) الفراغُ: يُورَثُ من المستندِ المصدر
  IF NEW.reference_type IN ('payment', 'overpayment', 'customer_payment') THEN
    SELECT currency_code, exchange_rate, exchange_rate_id
    INTO v_currency, v_rate, v_rate_id
    FROM payments WHERE id = NEW.reference_id;
  ELSIF NEW.reference_type IN ('sales_return', 'refund') THEN
    SELECT original_currency, exchange_rate_used, exchange_rate_id
    INTO v_currency, v_rate, v_rate_id
    FROM sales_returns WHERE id = NEW.reference_id;
  END IF;

  v_currency := upper(COALESCE(NULLIF(btrim(v_currency), ''), v_base));
  v_rate     := COALESCE(NULLIF(v_rate, 0), 1);

  NEW.original_currency  := v_currency;
  NEW.exchange_rate_used := COALESCE(NEW.exchange_rate_used, v_rate);
  NEW.exchange_rate_id   := COALESCE(NEW.exchange_rate_id, v_rate_id);
  NEW.original_amount    := COALESCE(
    NEW.original_amount,
    CASE WHEN v_currency = v_base THEN NEW.amount
         ELSE ROUND(NEW.amount / NULLIF(v_rate, 0), 4) END
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fill_customer_credit_ledger_fx_from_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base     text;
  v_currency text;
  v_rate     numeric(18,8);
  v_rate_id  uuid;
BEGIN
  v_base := public.erp_company_base_currency(NEW.company_id);

  IF NEW.original_currency IS NOT NULL
     AND btrim(NEW.original_currency) <> ''
     AND upper(btrim(NEW.original_currency)) <> v_base THEN
    NEW.original_currency   := upper(btrim(NEW.original_currency));
    NEW.exchange_rate_used  := COALESCE(NEW.exchange_rate_used, 1);
    NEW.original_amount     := COALESCE(NEW.original_amount, NEW.amount);
    RETURN NEW;
  END IF;

  IF NEW.original_currency IS NOT NULL AND btrim(NEW.original_currency) <> '' THEN
    NEW.original_currency   := v_base;
    NEW.exchange_rate_used  := COALESCE(NEW.exchange_rate_used, 1);
    NEW.original_amount     := COALESCE(NEW.original_amount, NEW.amount);
    RETURN NEW;
  END IF;

  SELECT original_currency, exchange_rate_used, exchange_rate_id
  INTO v_currency, v_rate, v_rate_id
  FROM customer_credits WHERE id = NEW.source_id;

  v_currency := upper(COALESCE(NULLIF(btrim(v_currency), ''), v_base));
  v_rate     := COALESCE(NULLIF(v_rate, 0), 1);

  NEW.original_currency  := v_currency;
  NEW.exchange_rate_used := COALESCE(NEW.exchange_rate_used, v_rate);
  NEW.exchange_rate_id   := COALESCE(NEW.exchange_rate_id, v_rate_id);
  NEW.original_amount    := COALESCE(
    NEW.original_amount,
    CASE WHEN v_currency = v_base THEN NEW.amount
         ELSE ROUND(NEW.amount / NULLIF(v_rate, 0), 4) END
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fill_vendor_credit_fx_from_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base     text;
  v_currency text;
  v_rate     numeric(18,8);
  v_rate_id  uuid;
BEGIN
  v_base := public.erp_company_base_currency(NEW.company_id);

  IF NEW.original_currency IS NOT NULL
     AND btrim(NEW.original_currency) <> ''
     AND upper(btrim(NEW.original_currency)) <> v_base THEN
    NEW.original_currency      := upper(btrim(NEW.original_currency));
    NEW.exchange_rate_used     := COALESCE(NEW.exchange_rate_used, 1);
    NEW.original_total_amount  := COALESCE(NEW.original_total_amount, NEW.total_amount);
    NEW.original_subtotal      := COALESCE(NEW.original_subtotal, NEW.subtotal);
    NEW.original_tax_amount    := COALESCE(NEW.original_tax_amount, NEW.tax_amount);
    RETURN NEW;
  END IF;

  IF NEW.original_currency IS NOT NULL AND btrim(NEW.original_currency) <> '' THEN
    NEW.original_currency      := v_base;
    NEW.exchange_rate_used     := COALESCE(NEW.exchange_rate_used, 1);
    NEW.original_total_amount  := COALESCE(NEW.original_total_amount, NEW.total_amount);
    NEW.original_subtotal      := COALESCE(NEW.original_subtotal, NEW.subtotal);
    NEW.original_tax_amount    := COALESCE(NEW.original_tax_amount, NEW.tax_amount);
    RETURN NEW;
  END IF;

  IF NEW.source_purchase_return_id IS NOT NULL THEN
    SELECT original_currency, exchange_rate_used, exchange_rate_id
    INTO v_currency, v_rate, v_rate_id
    FROM purchase_returns WHERE id = NEW.source_purchase_return_id;
  END IF;
  IF v_currency IS NULL AND NEW.bill_id IS NOT NULL THEN
    SELECT currency_code, exchange_rate, NULL::uuid
    INTO v_currency, v_rate, v_rate_id
    FROM bills WHERE id = NEW.bill_id;
  END IF;

  v_currency := upper(COALESCE(NULLIF(btrim(v_currency), ''), v_base));
  v_rate     := COALESCE(NULLIF(v_rate, 0), 1);

  NEW.original_currency  := v_currency;
  NEW.exchange_rate_used := COALESCE(NEW.exchange_rate_used, v_rate);
  NEW.exchange_rate_id   := COALESCE(NEW.exchange_rate_id, v_rate_id);
  NEW.original_subtotal  := COALESCE(NEW.original_subtotal,
    CASE WHEN v_currency = v_base THEN NEW.subtotal
         ELSE ROUND(NEW.subtotal / NULLIF(v_rate, 0), 4) END);
  NEW.original_tax_amount := COALESCE(NEW.original_tax_amount,
    CASE WHEN v_currency = v_base THEN NEW.tax_amount
         ELSE ROUND(NEW.tax_amount / NULLIF(v_rate, 0), 4) END);
  NEW.original_total_amount := COALESCE(NEW.original_total_amount,
    CASE WHEN v_currency = v_base THEN NEW.total_amount
         ELSE ROUND(NEW.total_amount / NULLIF(v_rate, 0), 4) END);

  RETURN NEW;
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- (٤) الفحصُ المرجعىُّ — يُجرِّبُ ولا يوصف
--
-- يغرسُ صفوفاً حقيقيّةً فى معاملةٍ فرعيّةٍ تُلغى، ويُبدِّلُ عملةَ شركةٍ
-- بالبابِ المُعلَنِ الذى وُلدَ فى v3.75.51 (فيُقاسُ البابانِ معاً).
--
-- ولا يُغرَسُ ائتمانُ المورّدِ عن قصدٍ مكتوب: مُشغِّلاتُه الأربعةُ تُنشئُ
-- قيداً وتسألُ عن قفلِ الفترة، فغرسُه يجعلُ الفحصَ رهينةَ حالِ الفترةِ لا
-- حالِ القاعدة. فتُقاسُ خاصّيّتُه: جسدُه لا يُسمّى عملةً حرفاً، وعمودُه بلا
-- افتراضٍ مكتوب، وشكلُه واحدٌ مع أخَوَيه المغروسَين. **ومعلومٌ يُعلَنُ لا
-- يُسكَتُ عنه.**
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_52_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $chk$
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

  -- (ح) ولا يُمنَحُ البيتُ الواحدُ ولا الفحصُ لأحدٍ سوى مفتاحِ الخدمة
  SELECT count(*) INTO n
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name IN ('erp_company_base_currency', 'assert_baseline_v3_75_52_check')
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.52: % صلاحيّةً مفتوحةً على البيتِ الواحدِ أو الفحص', n;
  END IF;

  RETURN 'v3.75.52 ok - البيتُ الواحدُ يرفضُ الاختراع=' || r_invent ||
         ' · البرىء=' || r_innocent ||
         ' · أساسُ صاحبِه=' || r_own ||
         ' · الوسمُ يُطابقُ الحساب=' || r_inherit ||
         ' · أعمدةٌ بلا افتراضٍ مكتوب=3 · أجسادٌ بلا عملةٍ حرفيّة=3';
END
$chk$;

COMMENT ON FUNCTION public.assert_baseline_v3_75_52_check() IS
  'يُجرِّبُ الفخَّ فى كلِّ دفعة: يغرسُ ائتماناً وسطرَ دفترٍ حقيقيَّين فى معاملةٍ فرعيّةٍ تُلغى، ويُبدِّلُ عملةَ شركةٍ بالبابِ المُعلَنِ ليُثبتَ أنّ العملةَ تُقرأُ من صاحبِها لا تُخترَع.';

REVOKE ALL ON FUNCTION public.erp_company_base_currency(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_52_check()      FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_company_base_currency(uuid)    TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_52_check()   TO service_role;

-- ولا تُدَّعى دفعةٌ لم تُقَسْ: يُنادى الفحصُ الجديدُ الآن، ومعه اثنانِ من القدامى
SELECT public.assert_baseline_v3_75_52_check();
SELECT public.assert_baseline_v3_75_51_check();
SELECT public.assert_baseline_v3_75_25_check();
