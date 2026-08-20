-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.75 — «وللعملةِ بيتٌ يقولُ كم خانةً لها»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ما كان قائماً
-- ─────────────
-- سُئلَ النظامُ: كم خانةً عشريّةً للدينارِ الكويتى؟ فلم يكن فى المشروعِ كلِّه
-- مَن يُجيب:
--
--   • جدولُ `currencies` فى الإنتاج **فارغٌ تماماً — صفرُ صفّ**. وهو مربوطٌ
--     بشركةٍ أصلاً (`company_id`)، أى أنّه «عملاتُ هذه الشركة» لا «كم خانةً
--     لهذه العملةِ فى الدنيا» — وهذان سؤالانِ مختلفان.
--   • فالدالّةُ الوحيدةُ التى تسأل (`getCurrencyDecimals` فى الشيفرة) ترتدُّ
--     دائماً إلى اثنتين، لكلِّ عملةٍ بلا استثناء.
--   • والمعرفةُ الصحيحةُ موجودةٌ فى `lib/currency-utils.ts` — لكنّها تُقرأُ
--     **للعرضِ فقط**، ولا تصلُ إلى حسابٍ ولا تخزين. وكانت ناقصةً اثنتَى عشرةَ
--     عملةً من أربعٍ وعشرينَ تعرضُها شاشةُ التسجيل، **وفيها خطأٌ مقيس**:
--     الليرةُ اللبنانيّةُ مكتوبةٌ بلا خانات والمعيارُ الدولىُّ يقولُ خانتان.
--
-- وجردانِ مكتوبانِ باليدِ يتناقضانِ حتماً. فالعلاجُ ليس تصحيحَ الرقم، بل أن
-- يكونَ للسؤالِ بيتٌ واحدٌ يُسأل.
--
-- العلاجُ الواحد
-- ──────────────
-- جدولٌ مرجعىٌّ عامٌّ (لا يخصُّ شركةً بعينِها) يحملُ الوحدةَ الصغرى لكلِّ
-- عملةٍ يعرضُها المشروعُ على عميل، منقولةً من المعيارِ الدولىِّ ISO 4217،
-- ودالّةٌ واحدةٌ تقرؤه وتصرخُ إن سُئلت عن عملةٍ لا تعرفُها — **فلا تخترعُ
-- اثنتين كما كان يحدث**.
--
-- ولمَ لم يُملَأْ `currencies` بدلاً من جدولٍ جديد؟ لأنّه يُجيبُ سؤالاً آخر:
-- أىُّ العملاتِ مُفعَّلةٌ لهذه الشركة. وخلطُ السؤالَينِ فى بيتٍ واحدٍ يجعلُ
-- «كم خانةً للدينار» جواباً يختلفُ من شركةٍ إلى شركة — وهو لا يختلف.
--
-- ولا مِنحةَ تنفيذٍ لأحدٍ غيرِ مفتاحِ الخدمة
-- ─────────────────────────────────────────
-- الدالّةُ لا يُنادِيها اليومَ سطرٌ واحدٌ فى التطبيق — البابُ يُفتَحُ حينَ
-- يوجدُ من يطرقُه، لا قبل. وهذا درسُ v3.75.74 بعينِه: منحةٌ بلا مُنادٍ زينةٌ
-- على بابٍ لا يُفتَح، وقوانينُ v3.75.25/29/61 ترفضُها. فحينَ تنتقلُ مساراتُ
-- الحسابِ إلى نداءِ هذا البيتِ (دفعةُ توحيدِ التقريب) تُمنَحُ حينَها لا الآن.
--
-- ما لا يتغيَّر
-- ────────────
-- لا رقمَ واحدٌ يتغيَّر. هذه الهجرةُ تُضيفُ بيتاً ودالّةً لا ينادِيهما بعدُ
-- أحد؛ لا تمسُّ صفّاً قائماً، ولا عموداً، ولا حساباً. وأثرُها على كلِّ مسارٍ
-- يعملُ اليوم: لا شىء.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.currency_minor_units (
  code        text        PRIMARY KEY,
  decimals    smallint    NOT NULL,
  source      text        NOT NULL DEFAULT 'ISO 4217',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT currency_minor_units_code_shape CHECK (code ~ '^[A-Z]{3}$'),
  CONSTRAINT currency_minor_units_decimals_range CHECK (decimals BETWEEN 0 AND 4)
);

COMMENT ON TABLE public.currency_minor_units IS
  'v3.75.75 — البيتُ الواحدُ لعددِ الخاناتِ العشريّةِ لكلِّ عملة (ISO 4217). حقيقةٌ عامّةٌ لا تخصُّ شركة، ولذلك بلا company_id.';

ALTER TABLE public.currency_minor_units ENABLE ROW LEVEL SECURITY;

-- قراءةٌ للمستخدِمِ المسجَّلِ وحدَه. ولا زائرَ يبلغُها: شاشةُ التسجيلِ تقعُ
-- قبلَ الدخولِ وتقرأُ جردَ الشيفرةِ لا القاعدة، فلا حاجةَ لفتحِ بابٍ للزائر.
DROP POLICY IF EXISTS currency_minor_units_read ON public.currency_minor_units;
CREATE POLICY currency_minor_units_read
  ON public.currency_minor_units
  FOR SELECT
  TO authenticated
  USING (true);

-- ولا بابَ كتابةٍ لأحدٍ من التطبيق: مرجعٌ يُحدَّثُ بهجرةٍ لا بشاشة.
REVOKE ALL ON public.currency_minor_units FROM PUBLIC;
REVOKE ALL ON public.currency_minor_units FROM anon;
REVOKE ALL ON public.currency_minor_units FROM authenticated;
GRANT SELECT ON public.currency_minor_units TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.currency_minor_units TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- البذرة: الأربعُ والعشرونَ عملةً التى يعرضُها المشروعُ على عميل، بأعدادِ
-- خاناتِها فى المعيارِ الدولىِّ ISO 4217. الثمانى غيرُ ذاتِ الخانتَينِ مُعلَّمةٌ
-- بتعليقِها لأنّها هى سببُ هذه الدفعةِ كلِّها.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.currency_minor_units (code, decimals) VALUES
  ('EGP', 2), ('USD', 2), ('EUR', 2), ('GBP', 2),
  ('SAR', 2), ('AED', 2), ('QAR', 2),
  ('KWD', 3),   -- ثلاثُ خانات (الفلس الكويتى)
  ('BHD', 3),   -- ثلاثُ خانات
  ('OMR', 3),   -- ثلاثُ خانات (البيسة العمانيّة)
  ('JOD', 3),   -- ثلاثُ خانات
  ('TND', 3),   -- ثلاثُ خانات
  ('IQD', 3),   -- ثلاثُ خانات
  ('LYD', 3),   -- ثلاثُ خانات
  ('JPY', 0),   -- بلا خانات
  ('LBP', 2),   -- المعيارُ يقولُ خانتان — وجردُ الشيفرةِ كان يقولُ صفراً
  ('MAD', 2), ('DZD', 2), ('SYP', 2), ('YER', 2), ('SDG', 2),
  ('TRY', 2), ('INR', 2), ('CNY', 2)
ON CONFLICT (code) DO UPDATE
  SET decimals = EXCLUDED.decimals,
      source = EXCLUDED.source,
      updated_at = now();

-- ───────────────────────────────────────────────────────────────────────────
-- الدالّةُ التى تُسأل — وتصرخُ ولا تخترع
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.erp_currency_decimals(p_code text)
 RETURNS smallint
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_code text := upper(btrim(COALESCE(p_code, '')));
  v_decimals smallint;
BEGIN
  IF v_code = '' THEN
    RAISE EXCEPTION
      'CURRENCY_DECIMALS_UNKNOWN: سُئلتُ عن عددِ خاناتِ عملةٍ بلا اسم. '
      'العملةُ تُقرَأُ من صاحبِها ولا تُترَكُ فارغة.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT decimals INTO v_decimals
    FROM public.currency_minor_units
   WHERE code = v_code;

  IF v_decimals IS NULL THEN
    RAISE EXCEPTION
      'CURRENCY_DECIMALS_UNKNOWN: لا أعرفُ عددَ خاناتِ [%]. '
      'تُضافُ العملةُ إلى public.currency_minor_units بعددِ وحدتِها الصغرى '
      'من ISO 4217 — ولا يُفترَضُ لها رقمٌ هنا.', v_code
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_decimals;
END;
$function$;

COMMENT ON FUNCTION public.erp_currency_decimals(text) IS
  'v3.75.75 — البيتُ الواحد: كم خانةً عشريّةً لهذه العملة؟ يصرخُ إن لم يعرفْ ولا يرتدُّ إلى اثنتين.';

-- «ولا زينةَ على بابٍ لا يُفتَح» (v3.75.25/29/61، ودرسُ v3.75.74):
-- لا مُنادىَ لها اليومَ فى التطبيق، فلا تُمنَحُ لعمومِ الأدوارِ ولا للزائرِ
-- ولا للمستخدِمِ المسجَّل. تُمنَحُ حينَ يوجدُ من يطرقُها.
REVOKE EXECUTE ON FUNCTION public.erp_currency_decimals(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.erp_currency_decimals(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.erp_currency_decimals(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.erp_currency_decimals(text) TO service_role;
