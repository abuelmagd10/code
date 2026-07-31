-- ═══════════════════════════════════════════════════════════════════
-- v3.74.910 — الدفاتر تكفّ عن قراءة عمود العرض
-- ═══════════════════════════════════════════════════════════════════
--
-- 909 حوّل **العرض** إلى المسار المخوَّل، وأبقى أربعة مواضع تقرأ
-- `products.cost_price` **لتحسب بها لا لتعرضها**، وكلها بجلسة المستخدم.
-- وهذا الإصدار يُفرغها، فيصير السحب فى 911 تغييراً فى الصلاحيات لا
-- إفساداً للدفاتر.
--
-- والقياس قبل العلاج (على الإنتاج، لا افتراضاً):
--   * `cogs_transactions` التى استعملت التكلفة الاحتياطية: **صفر**. أى أن
--     المسار الاحتياطى لم يُستعمل قطّ منذ كُتب.
--   * منتجاتٌ لها رصيدٌ بلا طبقات FIFO: **صفر**. أى لا بيع يُتوقَّع أن
--     يعجز FIFO عن تكلفته.
--   * صفوف `third_party_inventory`: ١٨، وكلها `unit_cost` = تكلفة FIFO
--     المسجَّلة فى `cogs_transactions` — ولا واحد منها من «٧٠٪ من سعر
--     البيع». أى أن الاختراع كان **قنبلةً لم تنفجر بعد**، لا سلوكاً قائماً.
--
-- ⇒ العلاج ليس بديلاً أذكى للتكلفة الاحتياطية، بل **إلغاؤها**: ما عجز
--   FIFO عن تكلفته يُرفض بصوتٍ عالٍ. رقمٌ مُختلَقٌ فى دفترٍ أسوأ من عمليةٍ
--   تتوقف وتقول لماذا.
--
-- وما فى هذه الهجرة: نقل تحويل عملة العرض إلى القاعدة. كان الكود يقرأ
-- `cost_price` لكل منتجات الشركة فى المتصفح ليضرب ويكتب — أى أن **تغيير
-- عملة الشركة كان بابَ تسريبٍ للتكلفة** بلا علاقة بالعرض. الآن الضرب
-- يقع داخل القاعدة، ولا تخرج التكلفة منها أصلاً.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════ (أ) تحويل أسعار العرض — داخل القاعدة ═══════════

CREATE OR REPLACE FUNCTION public.convert_product_display_prices(
  p_company_id uuid,
  p_rate numeric,
  p_currency text
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_rows int;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  IF p_rate IS NULL OR p_rate <= 0 THEN
    RAISE EXCEPTION 'CURRENCY_RATE_INVALID: rate % is not usable | سعر تحويل غير صالح', p_rate;
  END IF;
  IF COALESCE(btrim(p_currency), '') = '' THEN
    RAISE EXCEPTION 'CURRENCY_CODE_REQUIRED: a display currency is required | عملة العرض مطلوبة';
  END IF;

  -- نفس حساب `convertAmount` فى الواجهة: أربع منازل، تقريبٌ نصفىٌّ لأعلى.
  UPDATE products
     SET display_unit_price = round(COALESCE(original_unit_price, unit_price, 0) * p_rate, 4),
         display_cost_price = round(COALESCE(original_cost_price, cost_price, 0) * p_rate, 4),
         display_currency   = p_currency,
         display_rate       = p_rate,
         exchange_rate_used = p_rate
   WHERE company_id = p_company_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.convert_product_display_prices(uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_product_display_prices(uuid, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.convert_product_display_prices(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_product_display_prices(uuid, numeric, text) TO service_role;

COMMENT ON FUNCTION public.convert_product_display_prices(uuid, numeric, text) IS
  'v3.74.910 — يضرب أسعار العرض بسعر التحويل داخل القاعدة، فلا تخرج التكلفة إلى المتصفح لأجل عمليةٍ لا تخصها.';

-- ═══════════ (ب) لقطة الأصل قبل التحويل — داخل القاعدة ═══════════

CREATE OR REPLACE FUNCTION public.snapshot_product_original_prices(
  p_company_id uuid,
  p_currency text
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_rows int;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  IF COALESCE(btrim(p_currency), '') = '' THEN
    RAISE EXCEPTION 'CURRENCY_CODE_REQUIRED: an original currency is required | العملة الأصلية مطلوبة';
  END IF;

  -- درس 874/890: لقطةٌ لا مصدر لها بعدها — فشلها الصامت يُفقد الأصل
  -- نهائياً. وهنا تقع فى جملةٍ واحدة: إما كُتبت للجميع أو لم تُكتب لأحد.
  UPDATE products
     SET original_unit_price = COALESCE(NULLIF(original_unit_price, 0), unit_price),
         original_currency   = COALESCE(NULLIF(btrim(original_currency), ''), p_currency)
   WHERE company_id = p_company_id
     AND (original_unit_price IS NULL
          OR original_unit_price = 0
          OR COALESCE(btrim(original_currency), '') = '');

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.snapshot_product_original_prices(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.snapshot_product_original_prices(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.snapshot_product_original_prices(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_product_original_prices(uuid, text) TO service_role;

COMMENT ON FUNCTION public.snapshot_product_original_prices(uuid, text) IS
  'v3.74.910 — يحفظ السعر الأصلى وعملته قبل أول تحويل، فى جملةٍ واحدة لا فى حلقةٍ تُفشل بعضها وتنجح فى بعض.';

-- ═══════════ (ج) تكلفة بضاعة الغير من التكلفة المرحَّلة فعلاً ═══════════

CREATE OR REPLACE FUNCTION public.invoice_posted_unit_costs(p_invoice_id uuid)
 RETURNS TABLE(product_id uuid, unit_cost numeric)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT ct.product_id,
         round(SUM(ct.total_cost) / NULLIF(SUM(ct.quantity), 0), 4) AS unit_cost
    FROM cogs_transactions ct
    JOIN invoices i ON i.id = ct.source_id
   WHERE ct.source_id = p_invoice_id
     AND ct.source_type = 'invoice'
     -- العضوية **أو** ملكية الشركة المسجَّلة على السجل نفسه: مالكٌ أنشأ
     -- شركته قد لا يكون له صفٌّ فى `company_members` إطلاقاً (درس 836)،
     -- فالاكتفاء بـ`is_company_member` يحجب عنه تكلفة فاتورته هو.
     -- اصطاده البرهان: صفر صفوفٍ للمالك على قاعدة الاختبار.
     AND (EXISTS (SELECT 1 FROM company_members cm
                   WHERE cm.company_id = i.company_id AND cm.user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM companies co
                      WHERE co.id = i.company_id AND co.user_id = auth.uid()))
   GROUP BY ct.product_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.invoice_posted_unit_costs(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.invoice_posted_unit_costs(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.invoice_posted_unit_costs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_posted_unit_costs(uuid) TO service_role;

COMMENT ON FUNCTION public.invoice_posted_unit_costs(uuid) IS
  'v3.74.910 — تكلفة الوحدة كما رُحّلت فعلاً لهذه الفاتورة (من cogs_transactions، وأصلها طبقات FIFO): مصدر تكلفة بضاعة الغير بدل عمود العرض أو نسبةٍ مخترعة.';
