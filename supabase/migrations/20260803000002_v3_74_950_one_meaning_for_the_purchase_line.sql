-- ════════════════════════════════════════════════════════════════════════════
-- v3.74.950 — معنًى واحدٌ لسعر بند الشراء
-- ════════════════════════════════════════════════════════════════════════════
-- القياسُ الذى سبق هذه الهجرة (٣ أغسطس ٢٠٢٦، قاعدةُ الإنتاج):
--
--   line_total كان يُكتب من المتصفح، فحمل **خمسةَ تعريفاتٍ مختلفة** باختلاف
--   أسبوع الكتابة:
--     BILL-0001 (٢ يوليو)  ٤٫٥٠     صافٍ بعد الخصم، بلا ضريبة
--     BILL-0002 (١٨ يوليو) ٢٢٫٨٠    بالضريبة مضافةً
--     BILL-0003 (١٩ يوليو) ١٨٫٠٠    مستندٌ شاملُ الضريبة والضريبةُ بداخله
--     BILL-0004 (٢٤ يوليو) ٣٣٫٣٣    مستندٌ شاملُ الضريبة والضريبةُ منزوعة
--     BILL-0007 (٣١ يوليو) ١٠٢٦٫٠٠  بالضريبة مضافةً ثانيةً
--
--   والرأسُ بالمقابل منضبط: أُعيد حسابُ subtotal و tax_amount و total_amount
--   لكلِّ مستندِ شراءٍ حىٍّ من صيغةٍ واحدة، فتطابقت **١٧ من ١٧ إلى القرش**.
--   فالتعريفُ أدناه ليس اختراعاً: هو التعريفُ الذى يستعمله الرأسُ منذ البداية.
--
--   والضررُ مقيسٌ لا متوهَّم: purchase_return_bill_discount_ratio (٩٤١) تقسم
--   bills.subtotal على مجموع line_total. ولأنّ المقام كان مشوَّشاً، كانت
--   ثلاثُ فواتيرَ من ثمانٍ تُقيّد مرتجعَها **ناقصاً ١٢٫٢٨٪ بالضبط**:
--     BILL-0002  ٠٫٧٨٩٤٧٤ بدل ٠٫٩٠٠٠٠٠
--     BILL-0003  ٠٫٧٨٩٤١٨ بدل ٠٫٨٩٩٨٧٩
--     BILL-0007  ٠٫٨٣٣٣٣٣ بدل ٠٫٩٥٠٠٠٠
--   ولا مرتجعَ قائماً على أىٍّ من الثلاث، فالتصحيحُ لم يمسّ رقماً مقيَّداً.
--
-- والترتيبُ هو ترتيبُنا المعتاد: يُؤمَّن المستندُ أولاً ثم يُحجب المال.
-- ولذلك **لا يرفض** هذا الإصدار ما يُرسله المتصفح — بل يحسبه الخادمُ ويكتبه،
-- ويسجّل كلَّ اختلافٍ فى دفترٍ يُقاس. فإذا سكت الدفترُ عُلم أنّ ٩٥١ (إسكاتُ
-- المتصفح) قد تمّ، وعندها فقط يُسحب الإذن فى ٩٥٢. ورفضٌ اليوم يعطّل وحدةَ
-- المشتريات كلَّها قبل أن يُصلَح المتصفح.
--
-- ما جرى على الإنتاج مع هذه الهجرة (٣ أغسطس ٢٠٢٦):
--   • صُحِّح ٥ بنودِ فواتير و٧ بنودِ أوامرِ شراء، وسُجّل كلُّ تصحيحٍ برقميه.
--   • بقيت رؤوسُ المستندات كما هى: ٨/٨ فواتير و٩/٩ أوامر تطابقت بعد التصحيح.
--   • لم تُنشأ إشعاراتٌ ولا قيودٌ ولا حركاتُ مخزونٍ ولا طلباتُ اعتمادِ خصم.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- (١) البيتُ الواحد للصيغة — تُكتب مرةً، ومن أرادها ناداها
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_line_net(
  p_quantity numeric, p_unit_price numeric, p_discount_percent numeric,
  p_tax_rate numeric, p_tax_inclusive boolean)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $function$
DECLARE
  v_qty numeric := COALESCE(p_quantity, 0);
  v_disc numeric := COALESCE(p_discount_percent, 0);
  v_rate numeric := COALESCE(p_tax_rate, 0);
  v_gross numeric;
BEGIN
  -- الغيابُ خطأٌ لا صفر (٩٤١): سعرٌ غائبٌ لا يُسعَّر به بند.
  IF p_unit_price IS NULL THEN
    RAISE EXCEPTION 'v3.74.950: بندُ شراءٍ بلا سعرِ وحدة — الغيابُ خطأٌ لا صفر.';
  END IF;
  IF v_rate <= -100 THEN
    RAISE EXCEPTION 'v3.74.950: نسبةُ ضريبةٍ مستحيلة (%) — لا يُقسم عليها.', v_rate;
  END IF;
  v_gross := v_qty * p_unit_price * (1 - v_disc / 100.0);
  -- مستندٌ شاملُ الضريبة: السعرُ المكتوبُ يحوى الضريبةَ، فتُنزع ليبقى الصافى.
  IF COALESCE(p_tax_inclusive, false) THEN
    RETURN ROUND(v_gross / (1 + v_rate / 100.0), 2);
  END IF;
  RETURN ROUND(v_gross, 2);
END;
$function$;

COMMENT ON FUNCTION public.purchase_line_net(numeric, numeric, numeric, numeric, boolean) IS
  'v3.74.950 — صافى بند الشراء قبل خصم الرأس وقبل الضريبة. هو التعريفُ الذى يبنى عليه رأسُ المستند subtotal.';

-- ────────────────────────────────────────────────────────────────────────────
-- (٢) قارئٌ ضيّق: هل المستندُ شاملُ الضريبة؟ — بيانٌ لا مال
-- ────────────────────────────────────────────────────────────────────────────
-- قد يمرّ كاتبٌ من سياسةِ الإدراج دون أن يملك SELECT على الرأس، فيصير
-- القارئُ صامتاً — **والصمتُ ليس براءة**. فهذه دالةٌ بصلاحية المُعرِّف،
-- لا تُخرج إلا رايةً منطقية، ولا تكتب حرفاً، وترفع حين لا تجد أباً.
CREATE OR REPLACE FUNCTION public.purchase_doc_tax_inclusive(p_kind text, p_doc_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog' AS $function$
DECLARE
  v_found boolean;
  v_ti boolean;
BEGIN
  IF p_doc_id IS NULL THEN
    RAISE EXCEPTION 'v3.74.950: بندُ شراءٍ بلا مستندٍ أب — لا يُسعَّر بندٌ بلا رأس.';
  END IF;
  IF p_kind = 'bill' THEN
    SELECT true, COALESCE(b.tax_inclusive, false) INTO v_found, v_ti FROM bills b WHERE b.id = p_doc_id;
  ELSIF p_kind = 'purchase_order' THEN
    SELECT true, COALESCE(po.tax_inclusive, false) INTO v_found, v_ti FROM purchase_orders po WHERE po.id = p_doc_id;
  ELSE
    RAISE EXCEPTION 'v3.74.950: نوعُ مستندٍ غيرُ معروف: %', p_kind;
  END IF;
  IF NOT COALESCE(v_found, false) THEN
    RAISE EXCEPTION 'v3.74.950: المستندُ % (%) غيرُ موجود — بندٌ يتيمٌ لا يُسعَّر.', p_doc_id, p_kind;
  END IF;
  RETURN v_ti;
END;
$function$;

REVOKE ALL ON FUNCTION public.purchase_doc_tax_inclusive(text, uuid) FROM PUBLIC, anon;

-- ────────────────────────────────────────────────────────────────────────────
-- (٣) دفترُ الاختلاف — لأنّ ما لا يُقاس لا يُغلق
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_pricing_divergence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_table text NOT NULL,
  row_id uuid,
  doc_id uuid,
  op text NOT NULL,
  submitted numeric,
  computed numeric,
  actor uuid,
  note text
);

CREATE INDEX IF NOT EXISTS idx_purchase_pricing_divergence_at
  ON public.purchase_pricing_divergence (occurred_at DESC);

ALTER TABLE public.purchase_pricing_divergence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.purchase_pricing_divergence FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.purchase_pricing_divergence TO service_role;

COMMENT ON TABLE public.purchase_pricing_divergence IS
  'v3.74.950 — كلُّ رقمِ بندٍ أرسله المتصفحُ وخالف ما حسبه الخادم. سكونُه شرطُ سحب الإذن فى ٩٥٢.';

-- ────────────────────────────────────────────────────────────────────────────
-- (٤) المُشغِّل — الخادمُ يكتب الرقم، ويسجّل ما خالفه
-- ────────────────────────────────────────────────────────────────────────────
-- بصلاحية المُعرِّف، ومداها ضيّقٌ بنصّه: لا تكتب هذه الدالةُ فى جدولِ عملٍ
-- واحد. تعدّل NEW (وهذا خارجَ السياسات أصلاً)، وتُدرج فى دفتر الاختلاف.
-- فليست باباً أوسعَ ممّا تُغلق.
CREATE OR REPLACE FUNCTION public.purchase_item_price_the_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog' AS $function$
DECLARE
  v_kind text;
  v_doc_id uuid;
  v_ti boolean;
  v_computed numeric;
  v_submitted numeric := NEW.line_total;
  v_log boolean;
BEGIN
  IF TG_TABLE_NAME = 'bill_items' THEN
    v_kind := 'bill'; v_doc_id := NEW.bill_id;
  ELSIF TG_TABLE_NAME = 'purchase_order_items' THEN
    v_kind := 'purchase_order'; v_doc_id := NEW.purchase_order_id;
  ELSE
    RAISE EXCEPTION 'v3.74.950: المُشغِّلُ رُكِّب على جدولٍ لا يعرفه: %', TG_TABLE_NAME;
  END IF;

  v_ti := public.purchase_doc_tax_inclusive(v_kind, v_doc_id);
  v_computed := public.purchase_line_net(NEW.quantity, NEW.unit_price, NEW.discount_percent, NEW.tax_rate, v_ti);

  -- لا يُسجَّل إلا اختلافٌ **أرسله كاتب**: من يعدّل الكميةَ وحدها يصير
  -- NEW.line_total = OLD.line_total، والإجمالىُّ يتغيّر بحقٍّ لأنّ الكميةَ
  -- تغيّرت — فتسجيلُه صياحٌ على برىء، ودفترٌ يصيح لا يسكت أبداً، ولو لم
  -- يسكت ما جاز سحبُ الإذن فى ٩٥٢.
  IF TG_OP = 'INSERT' THEN
    v_log := (v_submitted IS NULL) OR (ABS(v_submitted - v_computed) > 0.005);
  ELSE
    v_log := (NEW.line_total IS DISTINCT FROM OLD.line_total)
             AND ((v_submitted IS NULL) OR (ABS(v_submitted - v_computed) > 0.005));
  END IF;

  IF v_log THEN
    BEGIN
      INSERT INTO public.purchase_pricing_divergence
        (source_table, row_id, doc_id, op, submitted, computed, actor, note)
      VALUES (TG_TABLE_NAME, NEW.id, v_doc_id, TG_OP, v_submitted, v_computed, auth.uid(), 'v3.74.950');
    EXCEPTION WHEN OTHERS THEN
      -- دفترٌ يعجز عن الكتابة لا يوقف فاتورة. والعجزُ يظهر فى صمت الدفتر.
      NULL;
    END;
  END IF;

  NEW.line_total := v_computed;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bill_items_price_the_line ON public.bill_items;
CREATE TRIGGER trg_bill_items_price_the_line
  BEFORE INSERT OR UPDATE ON public.bill_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_item_price_the_line();

DROP TRIGGER IF EXISTS trg_purchase_order_items_price_the_line ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_price_the_line
  BEFORE INSERT OR UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_item_price_the_line();
