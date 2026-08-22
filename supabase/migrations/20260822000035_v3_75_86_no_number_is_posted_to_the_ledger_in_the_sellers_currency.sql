-- v3.75.86 — **ولا يُقيَّدُ فى الدفترِ رقمٌ بعملةِ البائع.**
-- ---------------------------------------------------------------------------
-- ═══ ما قِيسَ قبلَ كتابةِ حرفٍ من هذا ═══
--
-- قِيلَ فى v3.75.84 إنَّ «فاتورةَ الشراءِ لا تعرفُ العملةَ إطلاقاً». وكانَ ذلك
-- صادقاً على ما قِيسَ يومَها — شاشةُ `bills/new` ومسارُ `api/bills` فيهما صفرُ
-- ذكرٍ للعملة — **لكنَّهما بابانِ مُقفلان**: الشاشةُ صفحةُ اعتذار، والمسارُ يردُّ
-- ٤٠٣ بنصِّه «إنشاءُ الفواتيرِ اليدوىُّ معطَّل». **وبيتُ ميلادِ الفاتورةِ واحدٌ لا
-- غير**: `app/api/purchase-orders/route.ts` — **وهو ينسخُ العملةَ والسعرَ من
-- أمرِ الشراءِ بالفعل**. فالنقصُ أضيقُ ممّا قيلَ وأدقُّ منه، **ويُسجَّلُ كما هو**.
--
-- ═══ وأينَ الصمتُ الحقيقىُّ إذن ═══
--
-- قِيسَت سلسلةُ الترحيلِ كلُّها: `prepareBillPosting` تبنى سطورَ القيدِ من قيمةِ
-- الفاتورةِ والشحنِ والضريبةِ **خاماً بلا ضربٍ فى سعرِ صرف**، والبابُ المنشورُ
-- `post_bill_receipt_atomic` **لا يكتبُ عمودَ عملةٍ واحداً** فى القيدِ ولا فى
-- سطورِه — رغمَ أنَّ الأعمدةَ موجودةٌ وجاهزة. فمئةُ دولارٍ كانت ستدخلُ الدفترَ
-- **كمئةِ جنيهٍ ولا يصرخُ أحد**.
--
-- ولم يقعْ ذلك بعدُ لأنَّ البابَ **مُقفَلٌ بصوتٍ عالٍ**: زُرعَ على الإنتاجِ فاتورةٌ
-- بالدولارِ بالشكلِ الذى يُنشئُه الكودُ اليوم فرُفضت بنصِّها — «ولا مبلغَ مُترجَمَ
-- فى base_currency_total» (قانونُ v3.75.84). **فالنقصُ منعٌ مسموعٌ لا كذبٌ صامت.**
--
-- ═══ فالعمقُ أوّلاً مرّةً أخرى ═══
--
-- لو فُتحَ بابُ الميلادِ اليومَ لعادَ الصمتُ **خطوةً واحدةً إلى الخلف**: تُولَدُ
-- الفاتورةُ صادقةً ثمّ يُقيَّدُ رقمُها بعملةِ البائعِ فى دفترِ عملةِ الأساس.
-- **فالترتيبُ نفسُه ضابط**: يُصحَّحُ الدفترُ أوّلاً، ثمّ يُفتَحُ الميلاد.
--
-- ═══ وقِيسَ أنَّها لا تُحرِّكُ رقماً اليوم ═══
--
--   • ١٤١ قيداً و٣٠٧ سطراً — **صفرٌ منها بسعرِ صرفٍ يخالفُ الواحد**.
--   • ٥٩ حركةَ مخزون — **صفرٌ منها بعملةٍ أصليّة**.
--   • ١٠ أوامرِ شراء — **صفرٌ منها بعملةٍ أجنبيّة**.
--   • وكلُّ ما هنا يعملُ **حين تخالفُ عملةُ الفاتورةِ عملةَ الأساسِ وحدَها**؛
--     والمحلّىُّ يمرُّ بالطريقِ الذى كان حرفاً بحرف.
--
-- ═══ وفرقُ التقريبِ يقعُ على الذمّةِ لا يُوزَّعُ فى صمت ═══
--
-- ضربُ كلِّ سطرٍ فى السعرِ ثمّ تقريبُه إلى خاناتِ الدفترِ قد يُخلِّفُ كسراً يجعلُ
-- المدينَ لا يُساوى الدائن، **فيرفضُ حارسُ التوازنِ القيدَ كلَّه**. فيُحسَبُ
-- الفرقُ ويُوضَعُ **كلُّه على سطرِ الذمّةِ الدائنةِ الأكبر** — سياسةٌ واحدةٌ
-- مُسمّاةٌ لا توزيعٌ خفىّ، **وكسرٌ يُخبَّأُ فى كلِّ سطرٍ أسوأُ من كسرٍ يُسمّى موضعَه**.
-- ---------------------------------------------------------------------------

-- ═════ (أ) حركةُ المخزون: والأصلُ يُحفَظُ كما يُحفَظُ المُترجَم ═════
--
-- بيتُ تكلفةِ الحركةِ يُترجِمُ منذ v3.75.85 (لأنّه ينادى بيتَ التكلفةِ المُنزَلة)،
-- **لكنّه لم يكن يحفظُ ما كانَ الرقمُ قبلَ الترجمة**. فمَن أرادَ أن يعرفَ بكم
-- اشترينا بالدولارِ لم يجدْ جواباً. والأصلُ يُشتقُّ من المُترجَمِ بالقسمةِ على
-- السعرِ نفسِه — **فلا صيغةَ ثانيةَ ولا بيتَ ثانٍ**.
CREATE OR REPLACE FUNCTION public.fn_set_purchase_movement_landed_cost()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_cost NUMERIC;
  v_rate NUMERIC;
  v_ccy  TEXT;
BEGIN
  -- يخصّ الشراء وحده. باقى الأنواع لها مصادر تكلفتها.
  IF NEW.transaction_type <> 'purchase' THEN
    RETURN NEW;
  END IF;

  IF NEW.reference_id IS NULL OR NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- نفس الدالة التى يستعملها مُشغِّل FIFO حرفياً. لا صيغة ثانية.
  BEGIN
    v_cost := public.fn_bill_item_landed_unit_cost(NEW.reference_id, NEW.product_id);
  EXCEPTION WHEN OTHERS THEN
    -- تعذّر حلّ الفاتورة (مثلاً `reference_id` يشير إلى إذن استلام لا فاتورة):
    -- تُترك القيمة كما وصلت. لا نُخمّن.
    RETURN NEW;
  END;

  IF v_cost IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.unit_cost  := v_cost;
  NEW.total_cost := ROUND(COALESCE(NEW.quantity_change, 0) * v_cost, 6);

  -- v3.75.86 — وبكم اشتريناه بعملةِ البائع؟ سؤالٌ لا بدّ له من جواب.
  SELECT upper(btrim(COALESCE(b.currency_code, ''))),
         CASE WHEN COALESCE(b.exchange_rate, 1) > 0 THEN COALESCE(b.exchange_rate, 1) ELSE 1 END
    INTO v_ccy, v_rate
  FROM public.bills b
  WHERE b.id = NEW.reference_id;

  IF v_ccy IS NULL OR v_ccy = '' OR v_rate IS NULL OR v_rate <= 0 THEN
    RETURN NEW;
  END IF;

  NEW.original_currency   := v_ccy;
  NEW.exchange_rate_used  := v_rate;
  NEW.original_unit_cost  := ROUND(v_cost / v_rate, 6);
  NEW.original_total_cost := ROUND(COALESCE(NEW.quantity_change, 0) * (v_cost / v_rate), 6);

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_set_purchase_movement_landed_cost() IS
  'v3.75.86 — تكلفةُ حركةِ الشراءِ من بيتِ التكلفةِ المُنزَلةِ حرفياً (مُترجَمةً منذ v3.75.85)، ومعها أصلُها بعملةِ البائعِ والسعرُ المستعمَل — مشتقّاً من المُترجَمِ لا محسوباً بصيغةٍ ثانية.';

-- ═════ (ب) بابُ الترحيل: الدفترُ يُترجِمُ ويحفظُ أصلَه ═════
--
-- **ولا يُصلَحُ قيدٌ بعدَ أن يُكتَب**: القيدُ المُقيَّدُ وسطورُه محميّانِ من التعديل
-- بحرّاسٍ قائمين، وحارسُ التوازنِ يحكمُ فورَ انتهاءِ جملةِ الإدخال. فيُحسَبُ كلُّ
-- شىءٍ **قبلَ** الكتابة: الأصلُ والمُترجَمُ وكسرُ التقريبِ وموضعُه — **جملةُ إدخالٍ
-- واحدةٌ تُولَدُ متوازنةً، لا كتابةٌ ثمّ ترقيع**.
CREATE OR REPLACE FUNCTION public.post_bill_receipt_atomic(p_company_id uuid, p_bill_id uuid, p_bill_update jsonb DEFAULT NULL::jsonb, p_journal_entry jsonb DEFAULT NULL::jsonb, p_inventory_transactions jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result JSONB := '{}'::JSONB;
  v_journal_entry_id UUID;
  v_receipt_status TEXT;
  -- v3.75.86 — عملةُ الفاتورةِ وسعرُها وعملةُ الدفتر.
  v_ccy     TEXT;
  v_home    TEXT;
  v_rate    NUMERIC := 1;
  v_foreign BOOLEAN := false;
  v_odr     NUMERIC := 0;
  v_ocr     NUMERIC := 0;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  PERFORM set_config('app.allow_direct_post', 'true', true);

  SELECT COALESCE(b.receipt_status, 'pending')
    INTO v_receipt_status
    FROM public.bills b
   WHERE b.id = p_bill_id
     AND b.company_id = p_company_id
   FOR UPDATE;

  IF v_receipt_status IS NULL THEN
    RAISE EXCEPTION 'Bill not found or does not belong to company';
  END IF;

  IF v_receipt_status = 'rejected' THEN
    RAISE EXCEPTION 'v3.74.955: هذا المستندُ مرفوضٌ من الاستلام — لا يُقيَّد ولا تدخل بضاعتُه. حدّث الصفحة.';
  END IF;

  IF p_journal_entry IS NOT NULL
     AND public.get_journal_entry_id_for_bill_receipt(p_company_id, p_bill_id) IS NOT NULL THEN
    RAISE EXCEPTION 'v3.74.955: هذا المستندُ له قيدٌ مُقيَّدٌ سلفاً — لا يُقيَّد مرتين. حدّث الصفحة.';
  END IF;

  -- تُقرَأُ العملةُ مرّةً واحدةً من الفاتورةِ نفسِها، وعملةُ الأساسِ من بيتِها
  -- الواحد. **ولا يُترجَمُ إلّا ما يخالفُ عملةَ الدفتر.**
  SELECT upper(btrim(COALESCE(b.currency_code, ''))),
         CASE WHEN COALESCE(b.exchange_rate, 1) > 0 THEN COALESCE(b.exchange_rate, 1) ELSE 1 END
    INTO v_ccy, v_rate
    FROM public.bills b
   WHERE b.id = p_bill_id;

  v_home := upper(btrim(COALESCE(public.erp_company_base_currency(p_company_id), '')));
  v_foreign := (COALESCE(v_ccy, '') <> '' AND v_home <> '' AND v_ccy <> v_home AND COALESCE(v_rate, 0) > 0);

  IF p_journal_entry IS NOT NULL THEN
    IF v_foreign AND p_journal_entry->'lines' IS NOT NULL THEN
      SELECT COALESCE(SUM(COALESCE((line->>'debit_amount')::NUMERIC, 0)), 0),
             COALESCE(SUM(COALESCE((line->>'credit_amount')::NUMERIC, 0)), 0)
        INTO v_odr, v_ocr
        FROM jsonb_array_elements(p_journal_entry->'lines') AS line;
    END IF;

    INSERT INTO public.journal_entries (
      company_id, branch_id, cost_center_id, entry_date, description,
      reference_type, reference_id, status,
      original_currency, exchange_rate, original_total_debit, original_total_credit
    ) VALUES (
      p_company_id,
      NULLIF(p_journal_entry->>'branch_id', '')::UUID,
      NULLIF(p_journal_entry->>'cost_center_id', '')::UUID,
      COALESCE(NULLIF(p_journal_entry->>'entry_date', '')::DATE, CURRENT_DATE),
      p_journal_entry->>'description',
      COALESCE(NULLIF(p_journal_entry->>'reference_type', ''), 'bill'),
      COALESCE(NULLIF(p_journal_entry->>'reference_id', '')::UUID, p_bill_id),
      COALESCE(NULLIF(p_journal_entry->>'status', ''), 'posted'),
      CASE WHEN v_foreign THEN v_ccy ELSE NULL END,
      CASE WHEN v_foreign THEN v_rate ELSE 1 END,
      CASE WHEN v_foreign THEN v_odr ELSE NULL END,
      CASE WHEN v_foreign THEN v_ocr ELSE NULL END
    )
    RETURNING id INTO v_journal_entry_id;

    IF p_journal_entry->'lines' IS NOT NULL THEN
      -- جملةٌ واحدة: تُضرَبُ السطورُ فى السعرِ وتُقرَّب، ويُحسَبُ كسرُ الجانبَين،
      -- ويُوضَعُ كلُّه على سطرِ الدائنِ الأكبرِ **قبلَ أن يُكتَبَ حرف**.
      WITH src AS (
        SELECT (row_number() OVER ())::int AS ord,
               line,
               COALESCE((line->>'debit_amount')::NUMERIC, 0)  AS od,
               COALESCE((line->>'credit_amount')::NUMERIC, 0) AS oc,
               CASE WHEN v_foreign
                    THEN ROUND(COALESCE((line->>'debit_amount')::NUMERIC, 0) * v_rate, 4)
                    ELSE COALESCE((line->>'debit_amount')::NUMERIC, 0) END AS d,
               CASE WHEN v_foreign
                    THEN ROUND(COALESCE((line->>'credit_amount')::NUMERIC, 0) * v_rate, 4)
                    ELSE COALESCE((line->>'credit_amount')::NUMERIC, 0) END AS c
          FROM jsonb_array_elements(p_journal_entry->'lines') AS line
      ),
      residue AS (SELECT COALESCE(SUM(d), 0) - COALESCE(SUM(c), 0) AS r FROM src),
      carrier AS (SELECT ord FROM src WHERE c > 0 ORDER BY c DESC, ord LIMIT 1)
      INSERT INTO public.journal_entry_lines (
        journal_entry_id, account_id, description, debit_amount, credit_amount,
        branch_id, cost_center_id,
        original_debit, original_credit, original_currency, exchange_rate_used
      )
      SELECT
        v_journal_entry_id,
        (src.line->>'account_id')::UUID,
        src.line->>'description',
        src.d,
        src.c + CASE WHEN src.ord = (SELECT ord FROM carrier)
                     THEN (SELECT r FROM residue) ELSE 0 END,
        NULLIF(src.line->>'branch_id', '')::UUID,
        NULLIF(src.line->>'cost_center_id', '')::UUID,
        CASE WHEN v_foreign THEN src.od ELSE NULL END,
        CASE WHEN v_foreign THEN src.oc ELSE NULL END,
        CASE WHEN v_foreign THEN v_ccy ELSE NULL END,
        CASE WHEN v_foreign THEN v_rate ELSE 1 END
      FROM src;
    END IF;

    v_result := jsonb_set(v_result, '{journal_entry_id}', to_jsonb(v_journal_entry_id), true);
  END IF;

  IF p_inventory_transactions IS NOT NULL AND jsonb_array_length(p_inventory_transactions) > 0 THEN
    INSERT INTO public.inventory_transactions (
      company_id, product_id, transaction_type, quantity_change, unit_cost, total_cost,
      reference_id, reference_type, journal_entry_id, notes, branch_id, cost_center_id,
      warehouse_id, original_currency, original_unit_cost, original_total_cost, exchange_rate_used
    )
    SELECT
      p_company_id,
      NULLIF(tx->>'product_id', '')::UUID,
      tx->>'transaction_type',
      COALESCE((tx->>'quantity_change')::INTEGER, 0),
      NULLIF(tx->>'unit_cost', '')::NUMERIC,
      NULLIF(tx->>'total_cost', '')::NUMERIC,
      COALESCE(NULLIF(tx->>'reference_id', '')::UUID, p_bill_id),
      COALESCE(NULLIF(tx->>'reference_type', ''), 'bill'),
      COALESCE(NULLIF(tx->>'journal_entry_id', '')::UUID, v_journal_entry_id),
      tx->>'notes',
      NULLIF(tx->>'branch_id', '')::UUID,
      NULLIF(tx->>'cost_center_id', '')::UUID,
      NULLIF(tx->>'warehouse_id', '')::UUID,
      NULLIF(tx->>'original_currency', ''),
      NULLIF(tx->>'original_unit_cost', '')::NUMERIC,
      NULLIF(tx->>'original_total_cost', '')::NUMERIC,
      COALESCE(NULLIF(tx->>'exchange_rate_used', '')::NUMERIC, 1)
    FROM jsonb_array_elements(p_inventory_transactions) AS tx;

    v_result := jsonb_set(
      v_result, '{inventory_transaction_count}',
      to_jsonb(COALESCE(jsonb_array_length(p_inventory_transactions), 0)), true);
  END IF;

  IF p_bill_update IS NOT NULL THEN
    UPDATE public.bills
    SET
      status = COALESCE(NULLIF(p_bill_update->>'status', ''), status),
      receipt_status = COALESCE(NULLIF(p_bill_update->>'receipt_status', ''), receipt_status),
      received_by = COALESCE(NULLIF(p_bill_update->>'received_by', '')::UUID, received_by),
      received_at = COALESCE(NULLIF(p_bill_update->>'received_at', '')::TIMESTAMPTZ, received_at),
      updated_at = NOW()
    WHERE id = p_bill_id
      AND company_id = p_company_id;
  END IF;

  PERFORM set_config('app.allow_direct_post', 'false', true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.allow_direct_post', 'false', true);
  IF SQLERRM LIKE '%v3.74.955%' THEN
    RAISE;
  END IF;
  RAISE EXCEPTION 'Bill receipt posting failed: %', SQLERRM;
END;
$function$;

COMMENT ON FUNCTION public.post_bill_receipt_atomic(uuid, uuid, jsonb, jsonb, jsonb) IS
  'v3.75.86 — بابُ ترحيلِ فاتورةِ الشراء: يقرأُ عملةَ الفاتورةِ وسعرَها من الفاتورةِ نفسِها وعملةَ الأساسِ من بيتِها، فإن خالفتاها تُرجِمت سطورُ القيدِ وحُفظَ أصلُها بعملةِ البائع، وكسرُ التقريبِ يقعُ على سطرِ الذمّةِ الدائنةِ الأكبرِ فى جملةِ الإدخالِ نفسِها.';
