-- v3.75.88 — **ولا سعرانِ لسؤالٍ واحد.**
-- ---------------------------------------------------------------------------
-- ═══ العطبُ الذى نطاردُه، مقيساً على الإنتاجِ لا مُفترَضاً ═══
--
-- ثلاثةُ جداولَ — ولا رابعَ لها فى القاعدةِ كلِّها — تحملُ **عمودَىْ سعرِ صرفٍ
-- اسماً لسؤالٍ واحد**:
--
--     bills     ·  exchange_rate  و  exchange_rate_used   (كلاهما افتراضُه ١)
--     invoices  ·  exchange_rate  و  exchange_rate_used   (كلاهما افتراضُه ١)
--     payments  ·  exchange_rate  و  exchange_rate_used   (كلاهما افتراضُه ١)
--
-- **وبيتانِ لسؤالٍ واحدٍ هو العطبُ نفسُه** — لا احتمالُ عطب. وقد نطقَ العطبُ
-- بالفعلِ على الإنتاج: دفعةٌ واحدةٌ (٥ يوليو ٢٠٢٦ · إلغاءُ دفعةٍ بالدولار)
-- تحملُ `exchange_rate = 49.28` و`exchange_rate_used = 1` — **الرقمُ الافتراضىّ**.
-- ومالُها صادقٌ (‏0.10- دولار × 49.28 = 4.93-) فالكذبُ ليس فى المال، بل فى
-- **الاسمِ الثانى الجالسِ بجوارِه**.
--
-- ═══ وأيُّ الاسمَينِ هو البيتُ؟ ═══
--
-- **`exchange_rate`** — وهذا مقيسٌ من ثلاثةِ اتّجاهاتٍ لا من ذوق:
--
--   ‏(١) **عشرةُ أبوابٍ فى القاعدةِ تُدخِلُ صفّاً فى `payments`، تسعةٌ منها تكتبُ
--       `exchange_rate` ولا تكتبُ الاسمَ الثانىَ إطلاقاً.**
--   ‏(٢) **والقوانينُ الأربعةُ (v3.75.84 → v3.75.87) كلُّها تقرأُ `exchange_rate`**:
--       هو الوسيطُ الثانى فى `ac_foreign_money_is_translated` وفى
--       `abb_foreign_money_is_translated_at_birth` على الجداولِ الثلاثة.
--   ‏(٣) **والمالُ نفسُه يُحاكَمُ عليه**: `base_currency_*` يُقاسُ ضدَّ
--       `amount × exchange_rate` لا ضدَّ الاسمِ الثانى — **فالبيتُ هو ما يمتحنُه
--       القانونُ، والظلُّ ما لا يمتحنُه قانونٌ أبداً**.
--
-- ═══ فصارَ الاسمُ الثانى ظلّاً لا بيتاً ═══
--
-- بيتٌ واحدٌ فى القاعدةِ يُشغَّلُ قبلَ الملءِ وقبلَ القاضى، فلا يخرجُ صفٌّ من
-- الجداولِ الثلاثةِ **أبداً** وفيه جوابانِ لسؤالٍ واحد.
--
-- ═══ وثلاثةُ أشياءَ لا يفعلُها هذا البيتُ عمداً ═══
--
--   ‏(١) **لا يخترعُ سعرَ صرف**: إن سكتَ الاثنانِ معاً تُركَ الصفُّ كما هو
--       **ليرفضَه القاضى بصوتٍ عالٍ** إن كانَ يستحقُّ الرفض.
--   ‏(٢) **ولا يُتلِفُ سعراً صالحاً**: البيتُ يغلبُ الظلَّ **دائماً**، فلا فرعَ
--       واحدَ فى هذا البيتِ يستطيعُ أن يمحوَ رقماً صحيحاً — **وفرعٌ يستطيعُ
--       الإتلافَ يُتلِفُ يوماً**.
--   ‏(٣) **ولا يترُكُ صفّاً بلا سعرٍ لو كانَ الظلُّ وحدَه ناطقاً**: بيتٌ غائبٌ
--       أو غيرُ موجبٍ وظلٌّ موجب ⇐ **يتبنّى البيتُ ما نطقَ به الظلُّ** ثمّ
--       يتساويان. إنقاذٌ لا اختراع.
--
-- ═══ والترتيبُ نفسُه قانون ═══
--
-- أربعةُ مُشغِّلاتٍ على المستندِ الواحدِ الآن، **وترتيبُها هو معناها**:
--
--     ab_currency_asked_at_birth                  ⇐ ما العملة؟
--     aba_one_rate_per_question                   ⇐ وما السعر؟ **جوابٌ واحد**
--     abb_foreign_money_is_translated_at_birth    ⇐ فتُملأُ الترجمةُ من ذلك السعر
--     ac_foreign_money_is_translated              ⇐ ثمّ يُحاكَمُ المكتوب
--
-- **ومَن يُوحِّدُ السعرَ بعدَ أن يُملأَ به المبلغُ يُوحِّدُه بعدَ فوات.** والاسمُ
-- `aba_` مُختارٌ ليقعَ بينَ `ab_` و`abb_`، **وقِيسَ ذلك من القاعدةِ نفسِها**
-- (ترتيبُها `en_US.UTF-8`) لا افتراضاً، والحارسُ يُعيدُ قياسَه فى كلِّ إصدار.
--
-- ═══ وقِيسَ أثرُ الإصلاحِ على الصفوفِ القائمةِ بالزرعِ ثمّ الإلغاء ═══
--
-- ٩ فواتيرِ شراء · ٢٤ فاتورةَ بيع · ٣٨ دفعة. **والمختلفُ سعراهُ: صفٌّ واحد**
-- (الدفعةُ المذكورةُ أعلاه). وزُرعَ التصحيحُ على الإنتاجِ ثمّ أُلغِى فكانَ كلُّ
-- رقمٍ مقيسٍ **متطابقاً حرفاً بحرف**: ١٤١ قيداً · ٣٠٧ سطراً · ٢٩٢٧٩٤٫٦٧ مديناً
-- ودائناً · مدفوعُ الفواتيرِ ٦٠٣٠٤٫٤٥ · مدفوعُ فواتيرِ البيعِ ٢٢٣٠٨٫٧٩ ·
-- ٣٨ دفعةً بمجموعِ ٨٣٥٧٨٫٩٨ وأساسِ ٧٠٨٧٨٫٩٨ · صفرُ رصيدِ عميل · ٦٨٣ إشعاراً.
-- **لم يتحرّكْ رقمٌ واحد** — تحرّكَ الظلُّ وحدَه ليطابقَ بيتَه.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.erp_one_rate_per_question()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_row        jsonb := to_jsonb(NEW);
  v_home_col   text  := TG_ARGV[0];   -- البيتُ: ما تقرؤُه القوانينُ ويُحاكَمُ عليه المال
  v_shadow_col text  := TG_ARGV[1];   -- الظلُّ: الاسمُ الثانى لنفسِ السؤال
  v_home       numeric;
  v_shadow     numeric;
BEGIN
  v_home   := NULLIF(v_row ->> v_home_col,   '')::numeric;
  v_shadow := NULLIF(v_row ->> v_shadow_col, '')::numeric;

  -- ‏(١) البيتُ غائبٌ أو غيرُ موجب، والظلُّ وحدَه ناطقٌ بسعرٍ صالح:
  --     يتبنّى البيتُ ما نطقَ به الظلُّ ثمّ يتساويان — **إنقاذٌ لا اختراع**.
  IF (v_home IS NULL OR v_home <= 0) AND (v_shadow IS NOT NULL AND v_shadow > 0) THEN
    NEW := jsonb_populate_record(
             NEW,
             jsonb_build_object(v_home_col, v_shadow, v_shadow_col, v_shadow)
           );
    RETURN NEW;
  END IF;

  -- ‏(٢) الاثنانِ صامتان: **لا يُخترَعُ سعرٌ لينجوَ صفّ** — يُترَكُ للقاضى.
  IF v_home IS NULL THEN
    RETURN NEW;
  END IF;

  -- ‏(٣) جوابٌ واحدٌ بالفعل: لا يُكتَبُ حرف.
  IF v_shadow IS NOT DISTINCT FROM v_home THEN
    RETURN NEW;
  END IF;

  -- ‏(٤) وإلّا: **البيتُ يغلبُ الظلَّ دائماً** — لا فرعَ يستطيعُ إتلافَ سعرٍ صالح.
  NEW := jsonb_populate_record(NEW, jsonb_build_object(v_shadow_col, v_home));
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.erp_one_rate_per_question() IS
  'v3.75.88 — ولا سعرانِ لسؤالٍ واحد: يجعلُ الاسمَ الثانىَ لسعرِ الصرفِ ظلّاً '
  'لبيتِه على bills/invoices/payments. البيتُ يغلبُ الظلَّ دائماً؛ ولا يُخترَعُ '
  'سعرٌ؛ ولا يُتلَفُ سعرٌ صالح.';

-- ‏(١) لا بابَ يُفتَحُ لم يُطلَبْ فتحُه — درسُ v3.75.84، **فى الهجرةِ نفسِها**.
REVOKE ALL ON FUNCTION public.erp_one_rate_per_question() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_one_rate_per_question() FROM anon;
REVOKE ALL ON FUNCTION public.erp_one_rate_per_question() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.erp_one_rate_per_question() TO postgres;
GRANT EXECUTE ON FUNCTION public.erp_one_rate_per_question() TO service_role;

-- ‏(٢) والمُشغِّلاتُ على الجداولِ الثلاثةِ وحدَها — **لا رابعَ لها فى القاعدة**.
DROP TRIGGER IF EXISTS aba_one_rate_per_question ON public.bills;
CREATE TRIGGER aba_one_rate_per_question
  BEFORE INSERT OR UPDATE ON public.bills
  FOR EACH ROW
  EXECUTE FUNCTION public.erp_one_rate_per_question('exchange_rate', 'exchange_rate_used');

DROP TRIGGER IF EXISTS aba_one_rate_per_question ON public.invoices;
CREATE TRIGGER aba_one_rate_per_question
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.erp_one_rate_per_question('exchange_rate', 'exchange_rate_used');

DROP TRIGGER IF EXISTS aba_one_rate_per_question ON public.payments;
CREATE TRIGGER aba_one_rate_per_question
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.erp_one_rate_per_question('exchange_rate', 'exchange_rate_used');

-- ‏(٣) وما مضى يُصحَّحُ مرّةً واحدة — **الظلُّ يتبعُ بيتَه، ولا رقمَ مالٍ يتحرّك**.
--     زُرعَ هذا بعينِه على الإنتاجِ ثمّ أُلغِى، فكانت كلُّ الأرقامِ المقيسةِ
--     متطابقةً حرفاً بحرف (القيودُ · السطورُ · المدينُ · الدائنُ · المدفوعُ ·
--     الدفعاتُ · الأرصدةُ · الإشعارات).
UPDATE public.bills
   SET exchange_rate_used = exchange_rate
 WHERE exchange_rate_used IS DISTINCT FROM exchange_rate;

UPDATE public.invoices
   SET exchange_rate_used = exchange_rate
 WHERE exchange_rate_used IS DISTINCT FROM exchange_rate;

UPDATE public.payments
   SET exchange_rate_used = exchange_rate
 WHERE exchange_rate_used IS DISTINCT FROM exchange_rate;
