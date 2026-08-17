-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.53 — «وفحصٌ يسألُ عن أساسٍ ليس أساسَ صاحبِه لا يفحصُ شيئاً»
--
-- بعدَ v3.75.52 صارَ للقاعدةِ بيتٌ واحدٌ تُقرأُ منه عملةُ الشركة، وبقى فى
-- أجسادِ دوالِّها ٣٧ موضعاً تُسمّى عملةً بعينِها. وقُرئتِ المواضعُ بالعينِ
-- واحداً واحداً — **فلا يُحكَمُ على موضعٍ لم يُقرَأ** — فتبيّنَ أنّها ثلاثةُ
-- أصناف، وأنّ **تصنيفَ الحارسِ الآلىَّ أخطأ فى واحدٍ منها**:
--
--   (١) **قرارٌ يختارُ ما يُفحَص**: `ic_fx_amount_accuracy` — وهو المُسدَّدُ هنا.
--   (٢) **قيمةٌ تُكتَبُ فى صفّ**: سبعةُ كُتّابٍ يملأون عملةً أهملَها المُنادِى.
--   (٣) **نصُّ وصفٍ يُعرَض**: `post_expense_atomic` كان مصنَّفاً «قرارَ مالٍ»
--       عندَ الحارس، وقراءتُه بالعينِ تقولُ إنّه **يُلحقُ اسمَ العملةِ بوصفِ
--       سطرِ اليوميّة** لا يحسبُ به شيئاً. والتصنيفُ الآلىُّ كان يُحسَبُ من
--       **سطرٍ واحدٍ يُعرَضُ نموذجاً** لا من كلِّ موضعٍ على حِدَة — فصُحِّحَ
--       الحارسُ فى هذه الدفعة ليصنِّفَ كلَّ موضعٍ بسطرِه.
--
-- ═══ والعطبُ المُسدَّدُ هنا: نقطةٌ عمياءُ فى مراجعةٍ ماليّة ═══
--
-- `ic_fx_amount_accuracy` تُبلِّغُ عن مدفوعاتٍ اختلفَ فيها `base_currency_amount`
-- عن (`original_amount` × سعرِ الصرف) — أى **عن خطأِ تحويلٍ فى المال**. وكانت
-- تختارُ الصفوفَ التى تفحصُها بشرطٍ مكتوبٍ حرفاً:
--
--     AND COALESCE(p.original_currency, 'EGP') <> 'EGP'
--
-- أى «كلُّ ما ليس بالجنيه». فلشركةٍ أساسُها الريالُ يقعُ عطبانِ متقابلان:
--   • **مدفوعاتُها بالجنيه — وهى الأجنبيّةُ عندها فعلاً — تُستثنى من الفحص**،
--     فلا يُراجَعُ تحويلُها أبداً. **وهذه هى النقطةُ العمياء.**
--   • ومدفوعاتُها بالريالِ — وهى أساسُها — تُعَدُّ أجنبيّةً فتُراجَعُ بلا معنى.
--
-- **والفحصُ الذى يسألُ عن أساسٍ ليس أساسَ صاحبِه لا يفحصُ شيئاً**، ويُطمئنُ
-- بلا حقّ — **والطمأنينةُ الكاذبةُ أسوأُ من الغياب**.
--
-- ═══ وأثرُ اليومِ مقيسٌ لا مُقدَّر ═══
--
-- الشركاتُ الستُّ: خمسٌ أساسُها الجنيه — فشرطُها لا يتغيّرُ حرفاً — وواحدةٌ
-- أساسُها الريالُ ولا مدفوعاتَ لها. **فلا صفَّ واحدٌ يتغيّرُ حكمُه اليوم**،
-- والمكسبُ يقعُ يومَ تتحرّكُ تلك الشركة، وقبلَ أن تتحرّك.
--
-- ولا تُمَسُّ صلاحيّةٌ: الدالّةُ **بصلاحيّاتٍ كاملة**، فنداؤها للبيتِ الواحدِ
-- يجرى بصلاحيّاتِ مالكِها — **فلا يحتاجُ منحةً لأحد**. وهذا بعينُه سببُ
-- اقتصارِ هذه الدفعةِ عليها: الكُتّابُ الأربعةُ الباقون **بصلاحيّاتِ مُنادِيهم**،
-- فنداؤهم للبيتِ يحتاجُ أن يبلغَه المستخدِمُ المسجَّل — **وذلك قرارُ صلاحيّةٍ
-- يُعرَضُ ويُوافَقُ عليه، لا يُوسَّعُ صامتاً فى دفعةِ إصلاح**.
--
-- ولا يُبدَّلُ سلوكُ الفراغ: رقمُ شركةٍ فارغٌ كان يُعيدُ لا شىءَ فيبقى كذلك
-- **بعودةٍ مُعلَنةٍ مكتوبة**، فلا تنكسرُ شاشةُ مراجعةٍ تُنادِى بلا شركة.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ic_fx_amount_accuracy(p_company_id uuid)
RETURNS TABLE(severity text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE r record; v_base text;
BEGIN
  -- ولا شركةَ ⇒ لا شىءَ يُفحَص. وهذا السلوكُ كما كان قبلَ هذه الدفعةِ حرفاً،
  -- ويُكتَبُ صراحةً هنا لئلّا يصيرَ رفضاً يكسرُ شاشةً تُنادِى بلا شركة.
  IF p_company_id IS NULL THEN RETURN; END IF;

  -- **والأساسُ يُقرأُ من صاحبِه**: لا نصٌّ مكتوبٌ يقولُ إنّ الأساسَ جنيه.
  v_base := public.erp_company_base_currency(p_company_id);

  FOR r IN
    SELECT p.id, p.amount, p.base_currency_amount, p.exchange_rate, p.original_amount,
           p.original_currency, p.currency_code, p.invoice_id,
           ROUND(p.base_currency_amount
                 - (COALESCE(p.original_amount, p.amount) * COALESCE(p.exchange_rate, 1)), 2) AS diff
    FROM payments p
    WHERE p.company_id = p_company_id
      AND p.is_deleted = false
      AND p.base_currency_amount IS NOT NULL
      AND p.exchange_rate IS NOT NULL
      AND p.exchange_rate > 0
      AND upper(btrim(COALESCE(p.original_currency, v_base))) <> v_base
      AND ABS(p.base_currency_amount
              - (COALESCE(p.original_amount, p.amount) * p.exchange_rate)) > 0.05
    LIMIT 20
  LOOP
    severity := 'high';
    detail := jsonb_build_object('payment_id', r.id, 'amount', r.amount,
      'base_currency_amount', r.base_currency_amount, 'exchange_rate', r.exchange_rate,
      'original_amount', r.original_amount, 'original_currency', r.original_currency,
      'base_currency', v_base,
      'difference', r.diff,
      'hint','base_currency_amount diverges from (original_amount × exchange_rate). FX conversion error.');
    RETURN NEXT;
  END LOOP;
END $function$;

COMMENT ON FUNCTION public.ic_fx_amount_accuracy(uuid) IS
  'يراجعُ دقّةَ تحويلِ المدفوعات: يُبلِّغُ عن صفٍّ اختلفَ مبلغُه الأساسىُّ عن (الأصلىِّ × السعر). ويختارُ ما يفحصُه بأساسِ الشركةِ المقروءِ من صفِّها لا بعملةٍ مكتوبةٍ حرفاً — فالفحصُ الذى يسألُ عن أساسٍ ليس أساسَ صاحبِه لا يفحصُ شيئاً.';

-- ───────────────────────────────────────────────────────────────────────────
-- الفحصُ المرجعىُّ — يقيسُ الاتّجاهَين ولا يدَّعى برهاناً لم يجرِ
--
-- ولا يُغرَسُ صفُّ دفعةٍ عن قصدٍ مكتوب: جدولُ المدفوعاتِ عليه خمسةَ عشرَ
-- مُشغِّلاً قبلَ الإدخال، منها ما يسألُ عن قفلِ الفترةِ وعن موافقاتٍ — فغرسُه
-- يجعلُ الفحصَ رهينةَ حالِ الفترةِ لا حالِ القاعدة. **فيُقاسُ القرارُ نفسُه**:
-- شرطُ الاختيارِ يُحسَبُ على الصفوفِ الحيّةِ بأساسَين، ويجبُ أن يتحرّكَ العددُ
-- مع الأساسِ — وذلك هو الخاصّيّةُ بعينِها، لا صورتُها.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_53_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $chk$
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

  -- (د) ولم يُوسَّعْ بلوغُ البيتِ الواحدِ صامتاً فى هذه الدفعة
  SELECT count(*) INTO n
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name IN ('erp_company_base_currency', 'assert_baseline_v3_75_53_check')
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.53: % صلاحيّةً مفتوحةً على البيتِ الواحدِ أو الفحص — والتوسيعُ يُعلَنُ ولا يُدَسّ', n;
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
$chk$;

COMMENT ON FUNCTION public.assert_baseline_v3_75_53_check() IS
  'يقيسُ فى كلِّ دفعةٍ أنّ شرطَ اختيارِ ic_fx_amount_accuracy يتبعُ أساسَ الشركةِ لا نصّاً مكتوباً: يُحسَبُ العددُ على الصفوفِ الحيّةِ بأساسِها وبأساسٍ آخَر، فلو لم يتحرّكْ فالشرطُ مجمَّد.';

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_53_check()  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_53_check() TO service_role;

-- ولا تُدَّعى دفعةٌ لم تُقَسْ
SELECT public.assert_baseline_v3_75_53_check();
SELECT public.assert_baseline_v3_75_52_check();
SELECT public.assert_baseline_v3_75_51_check();
