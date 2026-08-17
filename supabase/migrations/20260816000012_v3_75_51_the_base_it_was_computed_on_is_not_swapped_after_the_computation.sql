-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.51 — «والأساسُ الذى حُسبَ عليه لا يُبدَّلُ بعدَ الحساب»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ العطبُ كما قِيس، لا كما يُخشى ═══
--
-- `companies.base_currency` هى **الأساسُ الذى حُسبت عليه كلُّ المبالغِ المحفوظة**:
-- `base_currency_amount` فى المدفوعاتِ والمصروفات، و`base_currency_total` فى
-- الفواتيرِ والمشتريات، و`exchange_rate_used` فى سطورِ اليوميّة، وأسعارُ الصرفِ
-- كلُّها **مُوجَّهةٌ إلى تلك العملةِ بعينِها**.
--
-- وقِيست الحمايةُ فى القاعدةِ فلم يكن ثمَّ شىء:
--
--     قيدُ تحقُّقٍ على العملةِ ...........................  لا شىء
--     حارسٌ يمنعُ تبديلَها بعدَ وجودِ الحركة ..........  لا شىء
--     والمُشغِّلُ الوحيدُ الذى يستجيبُ للتبديل .........  sync_invited_users_currency
--                                                       **يُوزِّعُه ولا يسألُ عنه**
--
-- وشاشةُ الإعداداتِ تسمحُ بالتبديل، وتحذيرُها **نصٌّ على الشاشةِ لا مانعٌ فى
-- القاعدة**. فضغطةٌ واحدةٌ تجعلُ كلَّ رقمٍ محفوظٍ فى دفترِ شركةٍ محسوباً على أساسٍ
-- **لم يعُدْ موجوداً** — والميزانيّةُ تُطبَعُ كما هى وأرقامُها كذب. **ولا خطأَ
-- يظهر، ولا رقمٌ يصرخ.**
--
-- ═══ والحكمُ بالأثرِ لا بالاسم ═══
--
-- لا يُمنَعُ التبديلُ لأنّه تبديل — بل **إن كان هناك ما حُسبَ سلفاً**. فتُسألُ
-- سبعةُ جداولِ الحركة (اليوميّة · الفواتير · المشتريات · المدفوعات · المصروفات ·
-- أوامرُ الشراء · أوامرُ البيع)، **وتُسمّى الشاهدَ بعددِه** فى الرفض.
--
-- **وشركةٌ لم تُسجِّلْ حركةً واحدةً تُبدِّلُ عملتَها بحرّيّة** — فمن اختارَ خطأً
-- يومَ التسجيلِ يُصلحُه، **وحارسٌ يصرخ على البرىء يُطفأ**. وهذا مقيسٌ لا مُدَّعى:
-- البرهانُ الحىُّ يُبدِّلُ عملةَ شركةٍ بلا حركةٍ **فيجبُ أن ينجح**.
--
-- ═══ ولا يُغلَقُ بابٌ يمرُّ منه عمل ═══
--
-- التحويلُ الحقيقىُّ (إعادةُ حسابِ كلِّ المبالغِ وإعادةُ تسعيرِ الأسعار) عملٌ
-- مشروعٌ لم يُبنَ بعد. فلا يُسَدُّ طريقُه: **بابٌ مُعلَنٌ بالاسم**
-- `app.allow_base_currency_change` يفتحُه مسارُ التحويلِ لنفسِه ويغلقُه، على نهجِ
-- `app.allow_direct_post` القائمِ فى المشروع. **ولا تُرفَعُ الحمايةُ عن الجدولِ
-- كلِّه**، ولا يُعطَّلُ مُشغِّل.
--
-- ═══ والفحصُ المرجعىُّ يُشغِّلُ الفخَّ لا يوصفُه ═══
--
-- `assert_baseline_v3_75_51_check()` **يُجرِّبُ التبديلَ فعلاً** فى كلِّ دفعة، فى
-- معاملاتٍ فرعيّةٍ تُلغى كلُّها:
--
--     (أ) شركةٌ لها حركة ......  يجبُ أن يُرفَض
--     (ب) شركةٌ بلا حركة ......  يجبُ أن ينجح
--     (ج) وبالبابِ المُعلَن ...  يجبُ أن ينجحَ ولو كانت لها حركة
--
-- فلو نامَ الحارسُ سقطَ (أ)، ولو صرخَ على البرىءِ سقطَ (ب)، ولو سُدَّ بابُ
-- التحويلِ سقطَ (ج). **وفخٌّ لا يُشغَّل ليس فخّاً.**
--
-- ═══ ولا يُمَسُّ صفٌّ واحد ═══
--
-- لا عملةَ تتغيّرُ هنا، ولا مبلغَ يُعادُ حسابُه، ولا قيدَ يُنشأُ أو يُحذَف. يُولَدُ
-- مانعٌ فقط. وكلُّ ما يُزرَعُ فى البرهانِ يُلغى: لا صفَّ يبقى.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.erp_base_currency_change_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $guard$
DECLARE
  v_witness text := '';
  n bigint;
BEGIN
  -- **ولا يُغلَقُ بابٌ يمرُّ منه عمل**: مسارُ تحويلٍ مُعلَنٌ يفتحُ لنفسِه بالاسم.
  IF coalesce(current_setting('app.allow_base_currency_change', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO n FROM public.journal_entries WHERE company_id = NEW.id;
  IF n > 0 THEN v_witness := v_witness || format('قيود اليوميّة: %s · ', n); END IF;
  SELECT count(*) INTO n FROM public.invoices        WHERE company_id = NEW.id;
  IF n > 0 THEN v_witness := v_witness || format('فواتير بيع: %s · ', n); END IF;
  SELECT count(*) INTO n FROM public.bills           WHERE company_id = NEW.id;
  IF n > 0 THEN v_witness := v_witness || format('فواتير شراء: %s · ', n); END IF;
  SELECT count(*) INTO n FROM public.payments        WHERE company_id = NEW.id;
  IF n > 0 THEN v_witness := v_witness || format('مدفوعات: %s · ', n); END IF;
  SELECT count(*) INTO n FROM public.expenses        WHERE company_id = NEW.id;
  IF n > 0 THEN v_witness := v_witness || format('مصروفات: %s · ', n); END IF;
  SELECT count(*) INTO n FROM public.purchase_orders WHERE company_id = NEW.id;
  IF n > 0 THEN v_witness := v_witness || format('أوامر شراء: %s · ', n); END IF;
  SELECT count(*) INTO n FROM public.sales_orders    WHERE company_id = NEW.id;
  IF n > 0 THEN v_witness := v_witness || format('أوامر بيع: %s · ', n); END IF;

  IF v_witness <> '' THEN
    RAISE EXCEPTION
      'لا يمكن تغييرُ العملةِ الأساسيّةِ من % إلى %: للشركةِ حركةٌ ماليّةٌ محفوظةٌ سلفاً (%)',
      OLD.base_currency, NEW.base_currency, rtrim(v_witness, ' · ')
      USING HINT =
        'العملةُ الأساسيّةُ هى الأساسُ الذى حُسبت عليه كلُّ المبالغِ المحفوظة، '
        || 'وأسعارُ الصرفِ كلُّها مُوجَّهةٌ إليها. فتبديلُها بلا إعادةِ حسابٍ يجعلُ كلَّ '
        || 'رقمٍ محفوظٍ محسوباً على أساسٍ لا وجودَ له. والطريقُ مسارُ تحويلٍ يُعيدُ '
        || 'حسابَ المبالغِ ويُعيدُ تسعيرَ الأسعارِ ويُسجِّلُ ما فعل.';
  END IF;

  RETURN NEW;
END
$guard$;

DROP TRIGGER IF EXISTS trg_companies_base_currency_change_guard ON public.companies;
CREATE TRIGGER trg_companies_base_currency_change_guard
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  WHEN (OLD.base_currency IS DISTINCT FROM NEW.base_currency)
  EXECUTE FUNCTION public.erp_base_currency_change_guard();

-- ═══ البرهانُ الحىّ — بعدَ ولادةِ المانعِ لا قبلَها ═══
DO $proof$
DECLARE
  v_busy uuid; v_free uuid;
  v_refused text := 'NOT_RUN';
  v_free_ok text := 'NOT_RUN';
  v_door    text := 'NOT_RUN';
BEGIN
  SELECT c.id INTO v_busy FROM public.companies c
   WHERE EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.company_id = c.id)
   ORDER BY c.created_at LIMIT 1;

  SELECT c.id INTO v_free FROM public.companies c
   WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.company_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.invoices i        WHERE i.company_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.bills b           WHERE b.company_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.payments p        WHERE p.company_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.expenses e        WHERE e.company_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.purchase_orders o WHERE o.company_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.sales_orders s    WHERE s.company_id = c.id)
   ORDER BY c.created_at LIMIT 1;

  -- (أ) شركةٌ لها حركة ⇒ يُرفَض
  IF v_busy IS NOT NULL THEN
    BEGIN
      UPDATE public.companies SET base_currency = 'ZZZ' WHERE id = v_busy;
      RAISE EXCEPTION 'PROBE_NOT_REFUSED';
    EXCEPTION WHEN OTHERS THEN
      v_refused := CASE WHEN SQLERRM = 'PROBE_NOT_REFUSED' THEN 'SLEPT' ELSE 'REFUSED' END;
    END;
  END IF;

  -- (ب) شركةٌ بلا حركة ⇒ ينجح — **وحارسٌ يصرخ على البرىء يُطفأ**
  IF v_free IS NOT NULL THEN
    BEGIN
      UPDATE public.companies SET base_currency = 'ZZZ' WHERE id = v_free;
      RAISE EXCEPTION 'PROBE_OK';
    EXCEPTION WHEN OTHERS THEN
      v_free_ok := CASE WHEN SQLERRM = 'PROBE_OK' THEN 'ALLOWED' ELSE 'BLOCKED:' || SQLERRM END;
    END;
  END IF;

  -- (ج) وبالبابِ المُعلَن ⇒ ينجحُ ولو كانت لها حركة
  IF v_busy IS NOT NULL THEN
    BEGIN
      PERFORM set_config('app.allow_base_currency_change', 'true', true);
      UPDATE public.companies SET base_currency = 'ZZZ' WHERE id = v_busy;
      RAISE EXCEPTION 'PROBE_OK';
    EXCEPTION WHEN OTHERS THEN
      v_door := CASE WHEN SQLERRM = 'PROBE_OK' THEN 'OPEN' ELSE 'WALLED:' || SQLERRM END;
    END;
    PERFORM set_config('app.allow_base_currency_change', 'false', true);
  END IF;

  IF v_busy IS NULL OR v_free IS NULL THEN
    RAISE NOTICE 'v3.75.51: a subject is missing on this house (busy=% free=%) - that leg of the proof is not claimed.',
      v_busy IS NOT NULL, v_free IS NOT NULL;
  END IF;

  IF v_busy IS NOT NULL AND v_refused <> 'REFUSED' THEN
    RAISE EXCEPTION 'v3.75.51: the guard slept - a company with a ledger changed its base currency (%).', v_refused;
  END IF;
  IF v_free IS NOT NULL AND v_free_ok <> 'ALLOWED' THEN
    RAISE EXCEPTION 'v3.75.51: the guard shouts at the innocent - a company with no movement was blocked (%).', v_free_ok;
  END IF;
  IF v_busy IS NOT NULL AND v_door <> 'OPEN' THEN
    RAISE EXCEPTION 'v3.75.51: the declared conversion door is walled (%).', v_door;
  END IF;

  RAISE NOTICE 'v3.75.51 proof: refused=% innocent=% door=%', v_refused, v_free_ok, v_door;
END
$proof$;

-- ═══ الفحصُ المرجعىُّ — يُشغِّلُ الفخَّ فى كلِّ دفعة ═══
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_51_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $check$
DECLARE
  v_busy uuid; v_free uuid;
  v_refused text := 'NOT_RUN';
  v_free_ok text := 'NOT_RUN';
  v_door    text := 'NOT_RUN';
  v_def text;
BEGIN
  -- (١) المانعُ قائمٌ وحىٌّ ومُعلَّقٌ على التبديلِ وحدَه
  SELECT pg_get_triggerdef(t.oid) INTO v_def
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'companies'
     AND t.tgname = 'trg_companies_base_currency_change_guard'
     AND NOT t.tgisinternal AND t.tgenabled <> 'D';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'v3.75.51 (1): the base-currency guard is missing or disabled on companies.';
  END IF;
  IF v_def !~ 'BEFORE UPDATE' OR v_def !~ 'base_currency' THEN
    RAISE EXCEPTION 'v3.75.51 (1): the guard no longer fires BEFORE UPDATE on a base_currency change: %', v_def;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'erp_base_currency_change_guard'
       AND p.prosecdef AND pg_get_userbyid(p.proowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION 'v3.75.51 (1): the guard body is not a definer owned by postgres.';
  END IF;

  SELECT c.id INTO v_busy FROM public.companies c
   WHERE EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.company_id = c.id)
   ORDER BY c.created_at LIMIT 1;
  SELECT c.id INTO v_free FROM public.companies c
   WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.company_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.invoices i        WHERE i.company_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.bills b           WHERE b.company_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.payments p        WHERE p.company_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.expenses e        WHERE e.company_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.purchase_orders o WHERE o.company_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.sales_orders s    WHERE s.company_id = c.id)
   ORDER BY c.created_at LIMIT 1;

  -- (٢) الفخُّ يُشغَّلُ فعلاً، وكلُّ محاولةٍ فى معاملةٍ فرعيّةٍ تُلغى
  IF v_busy IS NOT NULL THEN
    BEGIN
      UPDATE public.companies SET base_currency = 'ZZZ' WHERE id = v_busy;
      RAISE EXCEPTION 'PROBE_NOT_REFUSED';
    EXCEPTION WHEN OTHERS THEN
      v_refused := CASE WHEN SQLERRM = 'PROBE_NOT_REFUSED' THEN 'SLEPT' ELSE 'REFUSED' END;
    END;
    IF v_refused <> 'REFUSED' THEN
      RAISE EXCEPTION 'v3.75.51 (2): the guard slept - a company with a ledger changed its base currency.';
    END IF;
  END IF;

  IF v_free IS NOT NULL THEN
    BEGIN
      UPDATE public.companies SET base_currency = 'ZZZ' WHERE id = v_free;
      RAISE EXCEPTION 'PROBE_OK';
    EXCEPTION WHEN OTHERS THEN
      v_free_ok := CASE WHEN SQLERRM = 'PROBE_OK' THEN 'ALLOWED' ELSE 'BLOCKED' END;
    END;
    IF v_free_ok <> 'ALLOWED' THEN
      RAISE EXCEPTION 'v3.75.51 (3): the guard shouts at the innocent - a company with no movement cannot fix its currency.';
    END IF;
  END IF;

  IF v_busy IS NOT NULL THEN
    BEGIN
      PERFORM set_config('app.allow_base_currency_change', 'true', true);
      UPDATE public.companies SET base_currency = 'ZZZ' WHERE id = v_busy;
      RAISE EXCEPTION 'PROBE_OK';
    EXCEPTION WHEN OTHERS THEN
      v_door := CASE WHEN SQLERRM = 'PROBE_OK' THEN 'OPEN' ELSE 'WALLED' END;
    END;
    PERFORM set_config('app.allow_base_currency_change', 'false', true);
    IF v_door <> 'OPEN' THEN
      RAISE EXCEPTION 'v3.75.51 (4): the declared conversion door is walled - and a door that work passes through is not closed.';
    END IF;
  END IF;

  RETURN format(
    'v3.75.51 ok - the base a ledger was computed on cannot be swapped: refused=%s innocent=%s declared-door=%s '
    || '(each attempt was a real UPDATE in a rolled-back subtransaction; a missing subject is declared, not claimed).',
    v_refused, v_free_ok, v_door);
END
$check$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_51_check() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erp_base_currency_change_guard() FROM PUBLIC, anon, authenticated;

-- **ومن يُبدِّلْ حالاً فليُنادِ كلَّ فحصٍ يُسمّى ذلك الحال**
SELECT public.assert_baseline_v3_75_51_check();
SELECT public.assert_baseline_v3_75_25_check();
SELECT public.assert_baseline_v3_75_29_check();
