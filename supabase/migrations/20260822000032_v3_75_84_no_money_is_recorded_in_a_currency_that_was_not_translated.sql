-- v3.75.84 — **ولا يُسجَّلُ مالٌ بعملةٍ لم تُترجَم.**
-- ---------------------------------------------------------------------------
-- ═══ الحادثةُ التى وُلد منها هذا القانون ═══
--
-- سُئل: أمشروعُنا مُجهَّزٌ لشركةٍ مشترياتُها استيرادٌ من الخارج؟ فقِيسَ يومَ ٢٢
-- أغسطس ٢٠٢٦، فإذا نصفُ الطريقِ مبنىٌّ والنصفُ الآخرُ غيرُ موجود:
--
--   • بنيةُ العملاتِ قائمة: ٢٦٤ سعرَ صرفٍ فى ٢٢ زوجاً، وإعادةُ تقييمٍ حقيقيّةٌ
--     تُنشئُ قيدَ مسوّدةٍ لحسابَى فروقِ العملة، ودفترٌ ثنائىُّ العملةِ فى أعمدتِه.
--   • **وأمرُ الشراءِ يقبلُ عملةً أجنبيّةً فعلاً** — فيه اختيارُ عملةٍ وسعرُ صرفٍ
--     يُجلَبُ حيّاً ويُحفَظ.
--   • **وفاتورةُ الشراءِ التى تليه لا تعرفُ العملةَ إطلاقاً**: شاشةُ إنشائِها
--     ومسارُ خادمِها فيهما **صفرُ ذكرٍ للعملة**. فالسلسلةُ مقطوعةٌ عندَ الحلقةِ
--     التى تُنشئُ الالتزامَ وتُسعِّرُ المخزون.
--
-- ═══ والخطرُ ليس النقصَ بل الصمت ═══
--
-- لو دخلت فاتورةٌ بالدولارِ بأىِّ طريق، **لسُجِّلت كأنّها بعملةِ الأساسِ ولم يصرخْ
-- أحد**: بيتُ التكلفةِ المُنزَلةِ (`fn_bill_item_landed_unit_cost`) يقرأُ قيمةَ
-- الفاتورةِ والشحنَ **بلا ضربٍ فى سعرِ صرف**، فيدخلُ الرقمُ الأجنبىُّ إلى مخزونِ
-- الوارد-أوّلاً كأنّه محلّىّ، ومنه إلى تكلفةِ المبيعاتِ ثمّ إلى الربح.
-- **ورقمٌ كاذبٌ يُصدَّقُ ويُبنى عليه قرارٌ أسوأُ من خطأٍ ظاهرٍ يُسمَع.**
--
-- ═══ فالعلاجُ الأوّلُ أن يُصيرَ الخطأُ الصامتُ مستحيلاً ═══
--
-- لا تُبنى الميزةُ هنا (العملةُ فى الفاتورةِ، والجمركُ والتخليصُ والتأمين) — تلك
-- دفعاتٌ تُقاسُ بذاتِها. **بل يُمنَعُ أن يُسجَّلَ مالٌ بعملةٍ أجنبيّةٍ بلا ترجمة.**
--
--   • عملةُ المستندِ = عملةُ الأساس  ⇐ لا شأنَ للقانونِ به.
--   • عملةٌ فارغة                     ⇐ يملؤُها بيتُها (`erp_currency_is_asked_at_birth`).
--   • **عملةٌ أجنبيّةٌ ومبلغٌ غيرُ صفر** ⇐ يجبُ سعرُ صرفٍ موجبٌ **ومبلغٌ مُترجَمٌ
--     يُطابقُ الأصلَ × السعرَ** فى حدودِ نصفِ أصغرِ وحدةٍ من عملةِ الأساس.
--
-- ═══ وقُيسَ أثرُ القانونِ قبلَ أن يُسَنّ ═══
--
-- شُغِّلَ حكمُه على كلِّ صفٍّ قائمٍ فى الجداولِ الأربعةِ قبلَ كتابةِ حرفٍ منه:
-- **صفرُ صفوفٍ يرفضُها** (٩ فواتيرِ شراء · ٢٤ فاتورةَ بيع · ٣٨ دفعة · ٨ مصروفات).
-- وفى الدفعاتِ صفّانِ بالدولارِ فعلاً (٠٫١٠ بسعرِ ٤٩٫٢٨ ⇐ ٤٫٩٣ جنيه) — **وهما
-- الشكلُ الصحيحُ بعينِه، فيمرّان**. ولولا سماحُ التقريبِ لرفضَهما القانونُ ظلماً
-- (٤٫٩٢٨ مقابل ٤٫٩٣)، **وحارسٌ يرفضُ البرىءَ يُغرى صاحبَه بتخطّيه**.
--
-- ═══ وأينَ يُطبَّق: على ما يستطيعُ أن يُترجِمَ وحدَه ═══
--
-- قِيسَ خمسةٌ وعشرون مستنداً يحملُ عملة، فإذا **أربعةٌ فقط** فيها موضعٌ للمبلغِ
-- المُترجَم: `bills` · `invoices` · `payments` · `expenses`. **والواحدُ والعشرون
-- الباقيةُ لا عمودَ ترجمةٍ فيها أصلاً** (منها أمرُ الشراءِ وأمرُ البيعِ ومرتجعُ
-- الشراءِ وقيدُ اليوميّة) — فلا يُحاكَمُ من لا يملكُ أن يمتثل، **وهى معدودةٌ
-- بأسمائِها فى الحارسِ لا مسكوتٌ عنها**.
--
-- **وبيتٌ واحدٌ لكلِّ سؤال**: `erp_currency_is_asked_at_birth` يُجيبُ «ما العملة؟»
-- وهذا يُجيبُ «أتُرجِمت؟» — سؤالانِ مختلفان، ولا يُنسَخُ أحدُهما فى الآخر.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.erp_foreign_money_is_translated()
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
  v_tol      numeric;
  v_expected numeric;
BEGIN
  IF (v_row ->> 'company_id') IS NULL THEN
    RETURN NEW;
  END IF;

  v_ccy := upper(btrim(COALESCE(v_row ->> v_ccy_col, '')));
  -- عملةٌ فارغة: بيتُها يملؤُها قبلَ هذا الحكم، ولا يُحاكَمُ فراغ.
  IF v_ccy = '' THEN
    RETURN NEW;
  END IF;

  v_home := upper(btrim(COALESCE(
    public.erp_company_base_currency((v_row ->> 'company_id')::uuid), '')));
  -- ولا عملةَ أساسٍ معروفة: لا يُحكَمُ بما لا يُقاس.
  IF v_home = '' OR v_ccy = v_home THEN
    RETURN NEW;
  END IF;

  v_amt := NULLIF(btrim(COALESCE(v_row ->> v_amt_col, '')), '')::numeric;
  -- لا مالَ يُترجَم.
  IF v_amt IS NULL OR v_amt = 0 THEN
    RETURN NEW;
  END IF;

  v_rate := NULLIF(btrim(COALESCE(v_row ->> v_rate_col, '')), '')::numeric;
  v_base := NULLIF(btrim(COALESCE(v_row ->> v_base_col, '')), '')::numeric;

  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION
      'ولا يُسجَّلُ مالٌ بعملةٍ لم تُترجَم: % فى %.% وعملةُ الأساسِ %، ولا سعرَ صرفٍ صالحٍ فى %.',
      v_ccy, TG_TABLE_NAME, v_ccy_col, v_home, v_rate_col
      USING ERRCODE = '23514';
  END IF;

  IF v_base IS NULL THEN
    RAISE EXCEPTION
      'ولا يُسجَّلُ مالٌ بعملةٍ لم تُترجَم: % فى % بمبلغِ %، ولا مبلغَ مُترجَمَ فى %.',
      v_ccy, TG_TABLE_NAME, v_amt, v_base_col
      USING ERRCODE = '23514';
  END IF;

  -- سماحُ التقريبِ من بيتِ خاناتِ العملةِ الواحد — نصفُ أصغرِ وحدةٍ لا أكثر.
  v_tol := 0.5 / power(10::numeric, public.erp_currency_decimals(v_home)) + 0.000000001;
  v_expected := v_amt * v_rate;

  IF abs(v_base - v_expected) > v_tol THEN
    RAISE EXCEPTION
      'ولا يُسجَّلُ مالٌ بعملةٍ لم تُترجَم: % × % = % والمكتوبُ فى % هو % (السماحُ %).',
      v_amt, v_rate, round(v_expected, 6), v_base_col, v_base, v_tol
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.erp_foreign_money_is_translated() IS
  'v3.75.84 — بيتُ سؤالِ «أتُرجِمت؟»: مستندٌ بعملةٍ تخالفُ عملةَ الأساسِ يجبُ أن يحملَ سعرَ صرفٍ موجبٍ ومبلغاً مُترجَماً يُطابقُ الأصلَ × السعر. ولا يُنسَخُ هذا الحكمُ فى مكانٍ آخر.';

-- والاسمُ يبدأُ بـ ac_ ليعملَ **بعدَ** ab_currency_asked_at_birth الذى يملأُ الفراغ.
DROP TRIGGER IF EXISTS ac_foreign_money_is_translated ON public.bills;
CREATE TRIGGER ac_foreign_money_is_translated
  BEFORE INSERT OR UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.erp_foreign_money_is_translated(
    'currency_code', 'exchange_rate', 'base_currency_total', 'total_amount');

DROP TRIGGER IF EXISTS ac_foreign_money_is_translated ON public.invoices;
CREATE TRIGGER ac_foreign_money_is_translated
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.erp_foreign_money_is_translated(
    'currency_code', 'exchange_rate', 'base_currency_total', 'total_amount');

DROP TRIGGER IF EXISTS ac_foreign_money_is_translated ON public.payments;
CREATE TRIGGER ac_foreign_money_is_translated
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.erp_foreign_money_is_translated(
    'currency_code', 'exchange_rate', 'base_currency_amount', 'amount');

DROP TRIGGER IF EXISTS ac_foreign_money_is_translated ON public.expenses;
CREATE TRIGGER ac_foreign_money_is_translated
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.erp_foreign_money_is_translated(
    'currency_code', 'exchange_rate', 'base_currency_amount', 'amount');
