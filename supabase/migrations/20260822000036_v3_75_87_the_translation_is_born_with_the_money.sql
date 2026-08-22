-- v3.75.87 — **وتُولَدُ الترجمةُ مع المال.**
-- ---------------------------------------------------------------------------
-- ═══ البابُ الأخيرُ فى السلسلة ═══
--
-- صارَ رأسُ الفاتورةِ صادقاً (v3.75.84)، وعمقُها (v3.75.85)، ودفترُها (v3.75.86).
-- **وظلَّ البابُ مُقفَلاً**: مَن يرفعُ أمرَ شراءٍ بالدولارِ لا تُولَدُ فاتورتُه
-- أصلاً، لأنَّ بيتَ الميلادِ يكتبُ العملةَ والسعرَ **ولا يكتبُ المبلغَ المُترجَم**،
-- فيرفضُها قانونُ v3.75.84 عندَ ميلادِها. **والمنعُ المسموعُ كانَ صواباً حتى
-- يصيرَ ما خلفَ البابِ صادقاً — وقد صار.**
--
-- ═══ ولماذا فى القاعدةِ لا فى الشيفرة ═══
--
-- قِيسَ مَن يكتبُ المبلغَ المُترجَمَ اليوم، فإذا **ثلاثةُ مواضعَ فى الشيفرةِ كلٌّ
-- يضربُ بيدِه** (شاشةُ فاتورةِ البيع · شاشةُ المصروف · مسارُ ردِّ العميل)،
-- **وفاتورةُ الشراءِ لا موضعَ لها**. فلو أُضيفَ موضعٌ رابعٌ لصارت أربعةَ بيوتٍ
-- لضربةٍ واحدة، **وكلُّ بيتٍ يُنسى يوماً**.
--
-- فالجوابُ بيتٌ واحدٌ فى القاعدةِ يملأُ الفراغَ لكلِّ مستندِ مالٍ يستطيعُ الترجمة،
-- **ولا يمسُّ ما كتبَه المُنادى**: مَن كتبَ رقماً حُوكِمَ عليه، ومَن سكتَ مُلئَ
-- فراغُه من سعرِ مستندِه نفسِه. والشيفرةُ القائمةُ تعملُ كما هى حرفاً بحرف.
--
-- ═══ وثلاثةُ أشياءَ لا يفعلُها هذا البيتُ عمداً ═══
--
--   ‏(١) **لا يلمسُ مستنداً بعملةِ الأساس** — لا شأنَ للترجمةِ به أصلاً.
--   ‏(٢) **ولا يخترعُ سعرَ صرفٍ لينجىَ صفّاً**: سعرٌ غائبٌ أو غيرُ موجبٍ يُترَكُ
--       كما هو **ليرفضَه القاضى بصوتٍ عالٍ** — فبابٌ يُفتَحُ بسعرٍ مُخترَعٍ أسوأُ
--       من بابٍ مُقفَل.
--   ‏(٣) **ولا يُصحِّحُ قولَ المُنادى صامتاً**: مبلغٌ مُترجَمٌ مكتوبٌ يبقى كما
--       كُتِبَ ويُحاكَم — **وحارسٌ يُصلحُ ما يُحاكِمُه لا يُمسكُ أحداً أبداً**.
--
-- ═══ والتقريبُ من بيتِ خاناتِ العملةِ لا بيد ═══
--
-- يُقرَّبُ المحصولُ إلى خاناتِ عملةِ الأساسِ من `erp_currency_decimals`، فيقعُ
-- داخلَ سماحِ القاضى بالضرورةِ لا بالمصادفة.
--
-- ═══ والترتيبُ ضابطٌ لا تفصيل ═══
--
-- ثلاثةُ مُشغِّلاتٍ على المستندِ الواحد، وترتيبُها هو معناها:
--   `ab_currency_asked_at_birth`            ⇐ ما العملة؟
--   `abb_foreign_money_is_translated_at_birth` ⇐ فتُملأُ الترجمةُ إن سُكتَ عنها.
--   `ac_foreign_money_is_translated`        ⇐ ثمّ يُحاكَمُ المكتوب.
-- والاسمُ الأوسطُ مُختارٌ ليقعَ بينَهما فى الترتيبِ الأبجدىِّ **بأىِّ ترتيبِ مقارنةٍ
-- كان**، والحارسُ يقيسُ ذلك من القاعدةِ نفسِها ولا يفترضُه.
--
-- ═══ وقِيسَ أنَّها لا تُغيّرُ صفّاً قائماً ═══
--
-- المستنداتُ الأربعةُ التى تستطيعُ الترجمة: ٩ فواتيرِ شراء · ٢٤ فاتورةَ بيع ·
-- ٣٨ دفعة · ٨ مصروفات. **وصفوفٌ بعملةٍ أجنبيّةٍ بلا مبلغٍ مُترجَم: صفرٌ فى
-- الأربعةِ جميعاً.** فالبيتُ لا يجدُ فراغاً واحداً يملؤُه اليوم.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.erp_foreign_money_is_translated_at_birth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_row      jsonb := to_jsonb(NEW);
  v_ccy_col  text  := TG_ARGV[0];
  v_rate_col text  := TG_ARGV[1];
  v_base_col text  := TG_ARGV[2];
  v_amt_col  text  := TG_ARGV[3];
  v_home     text;
  v_ccy      text;
  v_rate     numeric;
  v_base     numeric;
  v_amt      numeric;
BEGIN
  IF (v_row ->> 'company_id') IS NULL THEN
    RETURN NEW;
  END IF;

  v_ccy := upper(btrim(COALESCE(v_row ->> v_ccy_col, '')));
  -- عملةٌ فارغة: بيتُها يملؤُها قبلَ هذا، ولا يُترجَمُ فراغ.
  IF v_ccy = '' THEN
    RETURN NEW;
  END IF;

  v_home := upper(btrim(COALESCE(
    public.erp_company_base_currency((v_row ->> 'company_id')::uuid), '')));
  -- (١) لا شأنَ للترجمةِ بمستندٍ بعملةِ الأساس.
  IF v_home = '' OR v_ccy = v_home THEN
    RETURN NEW;
  END IF;

  v_amt := NULLIF(btrim(COALESCE(v_row ->> v_amt_col, '')), '')::numeric;
  IF v_amt IS NULL OR v_amt = 0 THEN
    RETURN NEW;
  END IF;

  v_base := NULLIF(btrim(COALESCE(v_row ->> v_base_col, '')), '')::numeric;
  -- (٣) ولا يُصحَّحُ قولُ المُنادى صامتاً: المكتوبُ يبقى ويُحاكَم.
  IF v_base IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_rate := NULLIF(btrim(COALESCE(v_row ->> v_rate_col, '')), '')::numeric;
  -- (٢) ولا يُخترَعُ سعرٌ لينجىَ صفّاً — يُترَكُ ليرفضَه القاضى بصوتٍ عالٍ.
  IF v_rate IS NULL OR v_rate <= 0 THEN
    RETURN NEW;
  END IF;

  -- والتقريبُ من بيتِ خاناتِ العملةِ الواحد، فيقعُ داخلَ سماحِ القاضى بالضرورة.
  NEW := jsonb_populate_record(NEW, jsonb_build_object(
    v_base_col, round(v_amt * v_rate, public.erp_currency_decimals(v_home))));

  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.erp_foreign_money_is_translated_at_birth() IS
  'v3.75.87 — بيتُ سؤالِ «فليُترجَمْ إن سُكتَ عنه»: مستندٌ بعملةٍ أجنبيّةٍ بلا مبلغٍ مُترجَمٍ يُملأُ فراغُه من سعرِ مستندِه نفسِه مُقرَّباً بخاناتِ عملةِ الأساس. لا يلمسُ عملةَ الأساس، ولا يخترعُ سعراً، ولا يُصحِّحُ رقماً كتبَه المُنادى.';

-- والاسمُ abb_ يقعُ بينَ ab_ (ما العملة؟) وac_ (أتُرجِمت؟) فى أىِّ ترتيبِ مقارنة.
DROP TRIGGER IF EXISTS abb_foreign_money_is_translated_at_birth ON public.bills;
CREATE TRIGGER abb_foreign_money_is_translated_at_birth
  BEFORE INSERT OR UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.erp_foreign_money_is_translated_at_birth(
    'currency_code', 'exchange_rate', 'base_currency_total', 'total_amount');

DROP TRIGGER IF EXISTS abb_foreign_money_is_translated_at_birth ON public.invoices;
CREATE TRIGGER abb_foreign_money_is_translated_at_birth
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.erp_foreign_money_is_translated_at_birth(
    'currency_code', 'exchange_rate', 'base_currency_total', 'total_amount');

DROP TRIGGER IF EXISTS abb_foreign_money_is_translated_at_birth ON public.payments;
CREATE TRIGGER abb_foreign_money_is_translated_at_birth
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.erp_foreign_money_is_translated_at_birth(
    'currency_code', 'exchange_rate', 'base_currency_amount', 'amount');

DROP TRIGGER IF EXISTS abb_foreign_money_is_translated_at_birth ON public.expenses;
CREATE TRIGGER abb_foreign_money_is_translated_at_birth
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.erp_foreign_money_is_translated_at_birth(
    'currency_code', 'exchange_rate', 'base_currency_amount', 'amount');

-- **ولا يُفتَحُ بابٌ لم يُطلَبْ فتحُه** (درسُ v3.75.84): الدالّةُ الجديدةُ تُولَدُ
-- بمنحةِ تنفيذٍ للجميعِ ولكلِّ مستخدِمٍ مسجَّل، وهى مُشغِّلٌ لا ينادِيه إنسان.
-- فتُسوَّى بأختَيها بالضبط — لا أوسعَ ولا أضيق — **فى الهجرةِ نفسِها لا بعدَها**.
REVOKE ALL ON FUNCTION public.erp_foreign_money_is_translated_at_birth() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_foreign_money_is_translated_at_birth() FROM anon;
REVOKE ALL ON FUNCTION public.erp_foreign_money_is_translated_at_birth() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.erp_foreign_money_is_translated_at_birth() TO service_role;
