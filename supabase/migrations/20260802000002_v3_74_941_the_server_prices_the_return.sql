-- ============================================================================
-- v3.74.941 — الخادمُ يُسعّر المرتجع، والمتصفّحُ لا يُسأل
-- ============================================================================
--
-- ما كان يحدث، مقيساً على الإنتاج لا مستنتَجاً:
--
--   process_purchase_return_atomic تقفل صفَّ bill_items بين يديها
--   (`FOR UPDATE`) ثم تسأله عن **الكمية وحدها**، وتأخذ السعرَ من المتصفح:
--
--       COALESCE((v_item->>'unit_price')::NUMERIC, 0)
--       COALESCE((v_item->>'line_total')::NUMERIC, 0)
--       COALESCE((p_purchase_return->>'total_amount')::NUMERIC, 0)
--
--   فمن يستطيع إنشاءَ مرتجعٍ يستطيع تسعيرَه بما شاء؛ والدفترُ ورصيدُ المورد
--   وائتمانُ المخزون تتبع رقمَ المتصفح. و`COALESCE(...,0)` يعنى أن سعراً
--   **غائباً** يصير صفراً بصمتٍ لا خطأً — وهذا أسوأ من الرفض.
--
-- والبرهانُ من البيانات لا من القراءة: المرتجعان الوحيدان على الإنتاج
-- **على نفس الفاتورة ونفس بندها ونفس الكمية ونفس الخصم**، ولهما قيمتان:
--
--   PRET-5689   1 × 1.00 · خصم 10٪ · نسبة المستند 0.85  ⇒  line_total 0.90
--   PRET-79328  1 × 1.00 · خصم 10٪ · نسبة المستند 0.85  ⇒  line_total 0.77
--
-- الأولُ صيغةُ ما قبل 515 (نسبةُ خصم المستند لم تُطبَّق)، والثانى صيغةُ ما
-- بعدها. مستندان لنفس البضاعة يختلفان 15٪ لأن كلاً منهما وُلد فى نسخةِ
-- متصفّحٍ مختلفة. **الرقمُ لم يكن مشتقاً من شىء.**
--
-- والعلاجُ ليس فحصاً يُضاف فوق الرقم المُرسَل، بل نزعُ سلطة إرساله:
--
--   1) بيتٌ واحدٌ للتسعير — `purchase_return_priced_line` — تناديه الدوالُ
--      الثلاث، فلا تتفرّق القاعدةُ على ثلاث نسخٍ كما تفرّقت فى الشاشة.
--   2) السعرُ والضريبةُ ونسبةُ الخصم تُؤخذ من **صفِّ الفاتورة** الذى تقفله
--      الدالةُ بالفعل، و`line_total` يُشتق، ورأسُ المستند يُحسب من بنوده.
--   3) وإن خالف المُرسَلُ المحسوبَ **يُرفع خطأٌ يذكر الرقمين معاً** (قرارُ
--      المالك، ٢ أغسطس): أىُّ اختلافٍ يعنى إما شاشةً تحسب خطأً وإما عبثاً،
--      وكلاهما يستحقّ أن يُرى لا أن يُبتلع.
--   4) و`COALESCE(...,0)` يزول من مواضع المال: الغيابُ خطأٌ لا صفر.
--
-- والصيغةُ مُصادَقٌ عليها على البيانات القائمة قبل أن تُكتب هنا: تُنتج
-- 0.77 حرفياً للمستند المُنشَأ تحت القاعدة الحالية، وتُنتج رأسَى المستندين
-- معاً بالمليم (0.77+0.11=0.88 و0.90+0.13=1.03).
--
-- ولا تمسّ هذه الهجرةُ بياناً قائماً: صفرُ انحرافٍ بين سعر المرتجع وسعر بند
-- الفاتورة فى كل الصفوف (مقيس). البابُ يُغلق، والدفترُ لا يُلمس.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- (١) نسبةُ خصم المستند — تُحسب من الفاتورة، لا تُرسَل
-- ────────────────────────────────────────────────────────────────────────────
-- v3.74.515 قرّر أن تقييم المرتجع يعكس القيمة الدفترية بعد الخصم العام،
-- وإلا خُفّض المورد والمخزون بأعلى من التكلفة المسجلة. كانت الشاشةُ تحسبها
-- وترسلها؛ وهى الآن تُحسب هنا من `bills.subtotal ÷ Σ bill_items.line_total`،
-- محدودةً بواحدٍ صحيح، ومقرَّبةً إلى ستِّ خاناتٍ كما كانت الشاشةُ تفعل تماماً
-- (`Number(ratio.toFixed(6))`) — فلا ينشأ فرقٌ من التقريب وحده.
CREATE OR REPLACE FUNCTION public.purchase_return_bill_discount_ratio(p_bill_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_bill_subtotal NUMERIC;
  v_items_base    NUMERIC;
BEGIN
  IF p_bill_id IS NULL THEN
    RETURN 1;
  END IF;

  SELECT b.subtotal INTO v_bill_subtotal FROM bills b WHERE b.id = p_bill_id;
  SELECT COALESCE(SUM(bi.line_total), 0) INTO v_items_base
    FROM bill_items bi WHERE bi.bill_id = p_bill_id;

  -- لا نسبةَ تُحسب ⇒ لا خصمَ يُطبَّق. والواحدُ هنا ليس تخميناً: هو نفسُ
  -- ما تفعله الشاشةُ حين يتعذّر الحساب، فلا يتغيّر سلوكٌ قائم.
  IF v_bill_subtotal IS NULL OR v_items_base IS NULL OR v_items_base <= 0 OR v_bill_subtotal <= 0 THEN
    RETURN 1;
  END IF;

  RETURN LEAST(ROUND(v_bill_subtotal / v_items_base, 6), 1);
END;
$function$;

REVOKE ALL ON FUNCTION public.purchase_return_bill_discount_ratio(uuid) FROM PUBLIC, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- (٢) بيتُ التسعير الواحد — بندُ المرتجع يُسعَّر ببند الفاتورة الذى يردّه
-- ────────────────────────────────────────────────────────────────────────────
-- ثلاثُ دوالَّ كانت تكرّر الصيغة، وثلاثُ مواضعَ فى الشاشة كانت تكرّرها،
-- فاختلفت. القاعدةُ من اليوم مكتوبةٌ مرةً واحدة، ومن أرادها ناداها.
CREATE OR REPLACE FUNCTION public.purchase_return_priced_line(
  p_bill_id      uuid,
  p_bill_item_id uuid,
  p_quantity     numeric
)
RETURNS TABLE(unit_price numeric, tax_rate numeric, discount_percent numeric, line_total numeric)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_bi     RECORD;
  v_ratio  NUMERIC;
  v_net    NUMERIC;
BEGIN
  IF p_bill_item_id IS NULL THEN
    RAISE EXCEPTION 'v3.74.941: سطرُ مرتجعٍ بلا bill_item_id — بندُ المرتجع يُسعَّر ببند الفاتورة الذى يردّه، ولا بندَ هنا.';
  END IF;

  SELECT bi.id, bi.bill_id, bi.unit_price, bi.tax_rate, bi.discount_percent
    INTO v_bi
    FROM bill_items bi
   WHERE bi.id = p_bill_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'v3.74.941: بندُ الفاتورة % غيرُ موجود — لا مصدرَ للسعر.', p_bill_item_id;
  END IF;

  -- بندٌ من فاتورةٍ أخرى ليس مصدرَ تسعيرٍ لهذا المرتجع (وهذا شكلُ عبثٍ
  -- بعينه: يُرسَل bill_item_id أرخصُ من فاتورةٍ أخرى).
  IF p_bill_id IS NOT NULL AND v_bi.bill_id IS DISTINCT FROM p_bill_id THEN
    RAISE EXCEPTION 'v3.74.941: بندُ الفاتورة % يتبع الفاتورة % لا الفاتورة % — لا يُسعَّر منه مرتجعُ فاتورةٍ أخرى.',
      p_bill_item_id, v_bi.bill_id, p_bill_id;
  END IF;

  IF v_bi.unit_price IS NULL THEN
    RAISE EXCEPTION 'v3.74.941: بندُ الفاتورة % بلا سعرٍ مسجَّل — الغيابُ خطأٌ لا صفر.', p_bill_item_id;
  END IF;

  v_ratio := public.purchase_return_bill_discount_ratio(v_bi.bill_id);

  unit_price       := v_bi.unit_price;
  tax_rate         := COALESCE(v_bi.tax_rate, 0);
  discount_percent := COALESCE(v_bi.discount_percent, 0);

  v_net      := COALESCE(p_quantity, 0) * unit_price * (1 - discount_percent / 100.0);
  line_total := ROUND(v_net * v_ratio, 2);

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.purchase_return_priced_line(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- (٣) والمقارنةُ التى تُنطق بالسبب — لا رفضٌ أصمّ
-- ────────────────────────────────────────────────────────────────────────────
-- «رُفض» بلا رقمين لا يُصلح شاشةً ولا يكشف عبثاً. فكلُّ رفضٍ هنا يحمل
-- ما أُرسل وما هو مسجَّل، واسمَ الحقل، ومعرِّفَ البند.
CREATE OR REPLACE FUNCTION public.assert_purchase_return_amount(
  p_field     text,
  p_sent      numeric,
  p_computed  numeric,
  p_tolerance numeric DEFAULT 0.01,
  p_context   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- لم يُرسَل شىء ⇒ لا خلافَ يُعلن عنه؛ المحسوبُ هو المكتوب.
  IF p_sent IS NULL THEN
    RETURN;
  END IF;
  IF ABS(p_sent - COALESCE(p_computed, 0)) <= p_tolerance THEN
    RETURN;
  END IF;
  RAISE EXCEPTION
    'v3.74.941: % المُرسَل (%) يخالف المحسوبَ من الفاتورة (%)%. المرتجعُ يُسعَّر من الفاتورة، ولا يُكتب رقمٌ لا تُصدّقه.',
    p_field, p_sent, p_computed, COALESCE(' — ' || p_context, '');
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_purchase_return_amount(text, numeric, numeric, numeric, text) FROM PUBLIC, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- (٤) المسارُ المفرد — process_purchase_return_atomic
-- ────────────────────────────────────────────────────────────────────────────
-- كلُّ ما عدا التسعير باقٍ كما هو حرفياً: نفسُ التوقيعِ ونفسُ الأقفالِ ونفسُ
-- فحوصِ الكميةِ والمخزونِ ونفسُ القيدِ ونفسُ إشعار الدائن ونفسُ النتيجة.
-- المتغيّرُ الوحيد: من أين يأتى الرقم.
--
-- والعملةُ الأجنبية: القاعدةُ المقيسة من الشاشة `base = original × rate`
-- (سطر 1051-1053 و745-747)، ونسبةُ ١ حين تتّحد العملتان — فالاشتقاقُ واحدٌ
-- فى الحالتين ولا يحتاج فرعاً.
CREATE OR REPLACE FUNCTION public.process_purchase_return_atomic(p_company_id uuid, p_supplier_id uuid, p_bill_id uuid, p_purchase_return jsonb, p_return_items jsonb, p_journal_entry jsonb DEFAULT NULL::jsonb, p_journal_lines jsonb DEFAULT NULL::jsonb, p_vendor_credit jsonb DEFAULT NULL::jsonb, p_vendor_credit_items jsonb DEFAULT NULL::jsonb, p_bill_update jsonb DEFAULT NULL::jsonb, p_workflow_status text DEFAULT 'pending_admin_approval'::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_pr_id           UUID;
  v_je_id           UUID;
  v_vc_id           UUID;
  v_item            JSONB;
  v_bill_item       RECORD;
  v_current_stock   NUMERIC;
  v_requested_qty   NUMERIC;
  v_product_id      UUID;
  v_bill_item_id    UUID;
  v_warehouse_id    UUID;
  v_branch_id       UUID;
  v_cost_center_id  UUID;
  v_is_pending      BOOLEAN;
  v_je_status       TEXT;
  v_result          JSONB := '{}';
  v_refund_account_id UUID;
  -- v3.74.941 — المالُ يُحسب هنا
  v_priced          RECORD;
  v_rate            NUMERIC;
  v_orig_subtotal   NUMERIC := 0;
  v_orig_tax        NUMERIC := 0;
  v_orig_total      NUMERIC := 0;
  v_subtotal        NUMERIC := 0;
  v_tax_amount      NUMERIC := 0;
  v_total_amount    NUMERIC := 0;
BEGIN
  -- v3.74.730 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access(p_company_id);
  v_warehouse_id   := NULLIF(p_purchase_return->>'warehouse_id', '')::UUID;
  v_branch_id      := NULLIF(p_purchase_return->>'branch_id', '')::UUID;
  v_cost_center_id := NULLIF(p_purchase_return->>'cost_center_id', '')::UUID;
  v_refund_account_id := NULLIF(p_purchase_return->>'refund_account_id', '')::UUID;

  v_is_pending := p_workflow_status IN ('pending_admin_approval', 'pending_approval', 'pending_warehouse');
  v_je_status := CASE WHEN v_is_pending THEN 'draft' ELSE 'posted' END;

  IF p_bill_id IS NULL THEN
    RAISE EXCEPTION 'Bill ID is required to create a purchase return';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM bills WHERE id = p_bill_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'Bill not found or does not belong to company: %', p_bill_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP
    v_bill_item_id  := NULLIF(v_item->>'bill_item_id', '')::UUID;
    v_product_id    := NULLIF(v_item->>'product_id', '')::UUID;
    v_requested_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    IF v_requested_qty <= 0 THEN CONTINUE; END IF;

    IF v_bill_item_id IS NOT NULL AND NOT v_is_pending THEN
      SELECT id, quantity, COALESCE(returned_quantity, 0) AS returned_quantity
      INTO v_bill_item FROM bill_items WHERE id = v_bill_item_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill item not found: %', v_bill_item_id;
      END IF;
      IF (v_bill_item.returned_quantity + v_requested_qty) > v_bill_item.quantity THEN
        RAISE EXCEPTION 'Cannot return % units. Available: %',
          v_requested_qty, (v_bill_item.quantity - v_bill_item.returned_quantity);
      END IF;
    END IF;

    IF v_product_id IS NOT NULL AND v_warehouse_id IS NOT NULL AND NOT v_is_pending THEN
      PERFORM pg_advisory_xact_lock(
        hashtext(p_company_id::text || v_product_id::text || v_warehouse_id::text));
      SELECT COALESCE(SUM(quantity_change), 0) INTO v_current_stock
      FROM inventory_transactions
      WHERE company_id = p_company_id AND product_id = v_product_id
        AND warehouse_id = v_warehouse_id
        AND COALESCE(is_deleted, false) = false;
      IF v_current_stock < v_requested_qty THEN
        RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
          v_product_id, v_current_stock, v_requested_qty;
      END IF;
    END IF;
  END LOOP;

  -- ══ v3.74.941 — التسعيرُ قبل الكتابة، فيولد الرأسُ صحيحاً لا يُصحَّح بعدُ ══
  -- الرأسُ كان يُكتب من رقمٍ مُرسَل ثم لا يُراجَع أبداً. صار يُحسب من بنودٍ
  -- كلُّ واحدٍ منها مُسعَّرٌ من فاتورته، فلا لحظةَ يوجد فيها صفٌّ بقيمةٍ
  -- لم تُصدَّق.
  v_rate := COALESCE(NULLIF(p_purchase_return->>'exchange_rate_used', '')::NUMERIC, 1);
  IF v_rate <= 0 THEN
    RAISE EXCEPTION 'v3.74.941: سعرُ صرفٍ غيرُ موجب (%) — لا يُحوَّل به مال.', v_rate;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP
    v_bill_item_id  := NULLIF(v_item->>'bill_item_id', '')::UUID;
    v_requested_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    IF v_requested_qty <= 0 THEN CONTINUE; END IF;

    SELECT * INTO v_priced
      FROM public.purchase_return_priced_line(p_bill_id, v_bill_item_id, v_requested_qty);

    PERFORM public.assert_purchase_return_amount(
      'unit_price', NULLIF(v_item->>'unit_price', '')::NUMERIC, v_priced.unit_price,
      0.0001, 'bill_item ' || v_bill_item_id::text);
    PERFORM public.assert_purchase_return_amount(
      'line_total', NULLIF(v_item->>'line_total', '')::NUMERIC, v_priced.line_total,
      0.01, 'bill_item ' || v_bill_item_id::text);

    v_orig_subtotal := v_orig_subtotal + v_priced.line_total;
    v_orig_tax      := v_orig_tax + ROUND(v_priced.line_total * v_priced.tax_rate / 100.0, 2);
  END LOOP;

  v_orig_total   := v_orig_subtotal + v_orig_tax;
  v_subtotal     := ROUND(v_orig_subtotal * v_rate, 4);
  v_tax_amount   := ROUND(v_orig_tax * v_rate, 4);
  v_total_amount := v_subtotal + v_tax_amount;

  PERFORM public.assert_purchase_return_amount('subtotal',     NULLIF(p_purchase_return->>'subtotal', '')::NUMERIC,     v_subtotal);
  PERFORM public.assert_purchase_return_amount('tax_amount',   NULLIF(p_purchase_return->>'tax_amount', '')::NUMERIC,   v_tax_amount);
  PERFORM public.assert_purchase_return_amount('total_amount', NULLIF(p_purchase_return->>'total_amount', '')::NUMERIC, v_total_amount);

  IF p_journal_entry IS NOT NULL THEN
    INSERT INTO journal_entries (
      company_id, branch_id, cost_center_id, reference_type, reference_id,
      entry_date, description, status
    ) VALUES (
      p_company_id, v_branch_id, v_cost_center_id,
      'purchase_return', NULL,
      (p_journal_entry->>'entry_date')::DATE,
      p_journal_entry->>'description',
      v_je_status
    ) RETURNING id INTO v_je_id;

    IF p_journal_lines IS NOT NULL AND jsonb_array_length(p_journal_lines) > 0 THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, debit_amount, credit_amount,
        description, branch_id, cost_center_id
      )
      SELECT v_je_id, (l->>'account_id')::UUID,
        COALESCE((l->>'debit_amount')::NUMERIC, 0),
        COALESCE((l->>'credit_amount')::NUMERIC, 0),
        l->>'description', v_branch_id, v_cost_center_id
      FROM jsonb_array_elements(p_journal_lines) AS l;
    END IF;
    v_result := jsonb_set(v_result, '{journal_entry_id}', to_jsonb(v_je_id));
  END IF;

  -- v3.74.173: persist refund_account_id on the row.
  INSERT INTO purchase_returns (
    company_id, supplier_id, bill_id, journal_entry_id,
    return_number, return_date, status, workflow_status, created_by,
    subtotal, tax_amount, total_amount,
    settlement_method, reason, notes,
    branch_id, cost_center_id, warehouse_id,
    original_currency, original_subtotal, original_tax_amount, original_total_amount,
    exchange_rate_used, exchange_rate_id,
    refund_account_id
  ) VALUES (
    p_company_id, p_supplier_id, p_bill_id, v_je_id,
    p_purchase_return->>'return_number',
    (p_purchase_return->>'return_date')::DATE,
    CASE WHEN v_is_pending THEN 'pending_approval' ELSE 'completed' END,
    COALESCE(NULLIF(p_workflow_status, ''), 'pending_admin_approval'),
    p_created_by,
    v_subtotal, v_tax_amount, v_total_amount,
    p_purchase_return->>'settlement_method',
    p_purchase_return->>'reason',
    p_purchase_return->>'notes',
    v_branch_id, v_cost_center_id, v_warehouse_id,
    COALESCE(NULLIF(p_purchase_return->>'original_currency', ''), 'EGP'),
    v_orig_subtotal, v_orig_tax, v_orig_total,
    v_rate,
    NULLIF(p_purchase_return->>'exchange_rate_id', '')::UUID,
    v_refund_account_id
  ) RETURNING id INTO v_pr_id;

  v_result := jsonb_set(v_result, '{purchase_return_id}', to_jsonb(v_pr_id));

  IF v_je_id IS NOT NULL THEN
    UPDATE journal_entries SET reference_id = v_pr_id WHERE id = v_je_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP
    v_product_id    := NULLIF(v_item->>'product_id', '')::UUID;
    v_bill_item_id  := NULLIF(v_item->>'bill_item_id', '')::UUID;
    v_requested_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    IF v_requested_qty <= 0 THEN CONTINUE; END IF;

    SELECT * INTO v_priced
      FROM public.purchase_return_priced_line(p_bill_id, v_bill_item_id, v_requested_qty);

    INSERT INTO purchase_return_items (
      purchase_return_id, bill_item_id, product_id,
      description, quantity, unit_price, tax_rate, discount_percent, line_total
    ) VALUES (
      v_pr_id, v_bill_item_id, v_product_id,
      v_item->>'description', v_requested_qty,
      v_priced.unit_price, v_priced.tax_rate, v_priced.discount_percent, v_priced.line_total
    );

    IF NOT v_is_pending THEN
      IF v_bill_item_id IS NOT NULL THEN
        UPDATE bill_items
        SET returned_quantity = COALESCE(returned_quantity, 0) + v_requested_qty
        WHERE id = v_bill_item_id;
      END IF;
      IF v_product_id IS NOT NULL THEN
        INSERT INTO inventory_transactions (
          company_id, product_id, transaction_type, quantity_change,
          reference_id, reference_type, journal_entry_id, notes,
          branch_id, cost_center_id, warehouse_id
        ) VALUES (
          p_company_id, v_product_id, 'purchase_return', -v_requested_qty,
          v_pr_id, 'purchase_return', v_je_id,
          'مرتجع مشتريات ' || COALESCE(p_purchase_return->>'return_number', ''),
          v_branch_id, v_cost_center_id, v_warehouse_id
        );
      END IF;
    END IF;
  END LOOP;

  IF p_vendor_credit IS NOT NULL AND NOT v_is_pending THEN
    IF EXISTS (SELECT 1 FROM vendor_credits WHERE source_purchase_return_id = v_pr_id) THEN
      RAISE EXCEPTION 'Vendor Credit already exists for this purchase return';
    END IF;
    -- v3.74.941 — إشعارُ الدائن صدى المرتجع لا مستندٌ مستقلٌّ بأرقامه:
    -- كان يأخذ إجمالياته من المتصفح أيضاً، فيمكن أن يخالف المرتجعَ الذى
    -- وُلد منه. صار يُنسخ عنه.
    INSERT INTO vendor_credits (
      company_id, supplier_id, bill_id,
      source_purchase_return_id, source_purchase_invoice_id, journal_entry_id,
      credit_number, credit_date, status,
      subtotal, tax_amount, total_amount, applied_amount,
      branch_id, cost_center_id, notes
    ) VALUES (
      p_company_id, p_supplier_id, p_bill_id,
      v_pr_id, p_bill_id, v_je_id,
      p_vendor_credit->>'credit_number',
      COALESCE((p_vendor_credit->>'credit_date')::DATE, CURRENT_DATE),
      'open',
      v_subtotal, v_tax_amount, v_total_amount,
      0, v_branch_id, v_cost_center_id,
      p_vendor_credit->>'notes'
    ) RETURNING id INTO v_vc_id;

    IF p_vendor_credit_items IS NOT NULL AND jsonb_array_length(p_vendor_credit_items) > 0 THEN
      INSERT INTO vendor_credit_items (
        vendor_credit_id, product_id, description,
        quantity, unit_price, tax_rate, discount_percent, line_total
      )
      SELECT v_vc_id, pri.product_id, pri.description,
             pri.quantity, pri.unit_price, pri.tax_rate, pri.discount_percent, pri.line_total
      FROM purchase_return_items pri
      WHERE pri.purchase_return_id = v_pr_id;
    END IF;
    v_result := jsonb_set(v_result, '{vendor_credit_id}', to_jsonb(v_vc_id));
  END IF;

  IF p_bill_update IS NOT NULL AND p_bill_id IS NOT NULL AND NOT v_is_pending THEN
    -- v3.74.941 — `total_amount` لم يعد يُكتب من الطلب. الفاتورةُ تحتفظ
    -- بإجماليها، والمرتجعُ يُسجَّل فى `returned_amount` حيث مكانه. وقِيس أن
    -- الفرعَ الذى كان يخفض الإجمالى **لا تبلغه الشاشةُ أصلاً**: قائمةُ
    -- الفواتير المعروضة للمرتجع مقصورةٌ على `receipt_status = 'received'`،
    -- وهو بعينه ما يجعل `isFinalizedBill` صحيحاً دائماً. فكان حياً فى الـAPI
    -- وحدها — أى لطلبٍ مصنوع.
    UPDATE bills SET
      returned_amount = COALESCE(NULLIF(p_bill_update->>'returned_amount', '')::NUMERIC, returned_amount),
      return_status   = COALESCE(NULLIF(p_bill_update->>'return_status', ''), return_status),
      status          = COALESCE(NULLIF(p_bill_update->>'status', ''), status),
      updated_at = NOW()
    WHERE id = p_bill_id;
  END IF;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Purchase return failed (rolled back): %', SQLERRM;
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- (٥) المسارُ متعدّدُ المخازن — process_purchase_return_multi_warehouse
-- ────────────────────────────────────────────────────────────────────────────
-- هنا طبقةٌ زائدة: إجمالى **كل مجموعة مخزن** كان يُؤخذ من `v_group` أيضاً.
-- فصار يُحسب من بنود المجموعة نفسِها، ورأسُ المستند من مجموع المجموعات —
-- فلا يبقى موضعٌ واحدٌ يقبل رقماً من الخارج.
CREATE OR REPLACE FUNCTION public.process_purchase_return_multi_warehouse(p_company_id uuid, p_supplier_id uuid, p_bill_id uuid, p_purchase_return jsonb, p_warehouse_groups jsonb, p_bill_update jsonb DEFAULT NULL::jsonb, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_pr_id          UUID;
  v_group          JSONB;
  v_alloc_id       UUID;
  v_je_id          UUID;
  v_item           JSONB;
  v_product_id     UUID;
  v_bill_item_id   UUID;
  v_requested_qty  NUMERIC;
  v_warehouse_id   UUID;
  v_branch_id      UUID;
  v_cost_center_id UUID;
  v_alloc_ids      UUID[] := ARRAY[]::UUID[];
  v_result         JSONB := '{}';
  v_group_count    INT;
  v_qty_check      RECORD;
  -- v3.74.941
  v_priced         RECORD;
  v_rate           NUMERIC;
  v_g_sub          NUMERIC;
  v_g_tax          NUMERIC;
  v_orig_subtotal  NUMERIC := 0;
  v_orig_tax       NUMERIC := 0;
  v_orig_total     NUMERIC := 0;
  v_subtotal       NUMERIC := 0;
  v_tax_amount     NUMERIC := 0;
  v_total_amount   NUMERIC := 0;
BEGIN
  -- v3.74.730 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access(p_company_id);
  IF p_bill_id IS NULL THEN
    RAISE EXCEPTION 'Bill ID is required to create a purchase return';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM bills WHERE id = p_bill_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'Bill not found or does not belong to company: %', p_bill_id;
  END IF;

  v_group_count := jsonb_array_length(p_warehouse_groups);
  IF v_group_count < 2 THEN
    RAISE EXCEPTION 'Multi-warehouse function requires at least 2 warehouse groups.';
  END IF;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_warehouse_groups) LOOP
    v_warehouse_id   := NULLIF(v_group->>'warehouse_id', '')::UUID;
    v_branch_id      := NULLIF(v_group->>'branch_id', '')::UUID;
    v_cost_center_id := NULLIF(v_group->>'cost_center_id', '')::UUID;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_group->'items') LOOP
      v_bill_item_id  := NULLIF(v_item->>'bill_item_id', '')::UUID;
      v_product_id    := NULLIF(v_item->>'product_id', '')::UUID;
      v_requested_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
      IF v_requested_qty <= 0 THEN CONTINUE; END IF;
      IF v_bill_item_id IS NOT NULL THEN
        PERFORM id FROM bill_items WHERE id = v_bill_item_id FOR UPDATE;
      END IF;
      IF v_product_id IS NOT NULL AND v_warehouse_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
          hashtext(p_company_id::text || v_product_id::text || v_warehouse_id::text)
        );
      END IF;
    END LOOP;
  END LOOP;

  WITH item_totals AS (
    SELECT
      NULLIF(itm->>'bill_item_id', '')::UUID AS bill_item_id,
      SUM((itm->>'quantity')::NUMERIC) AS total_qty
    FROM jsonb_array_elements(p_warehouse_groups) AS grp,
         jsonb_array_elements(grp->'items') AS itm
    WHERE (itm->>'quantity')::NUMERIC > 0
      AND (itm->>'bill_item_id') IS NOT NULL
    GROUP BY NULLIF(itm->>'bill_item_id', '')::UUID
  )
  SELECT bi.id, bi.quantity, COALESCE(bi.returned_quantity, 0) AS returned_quantity,
         it.total_qty
  INTO v_qty_check
  FROM item_totals it
  JOIN bill_items bi ON bi.id = it.bill_item_id
  WHERE it.total_qty > (bi.quantity - COALESCE(bi.returned_quantity, 0))
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Return quantity (%) exceeds available quantity (%) for bill item %',
      v_qty_check.total_qty,
      (v_qty_check.quantity - v_qty_check.returned_quantity),
      v_qty_check.id;
  END IF;

  -- ══ v3.74.941 — التسعيرُ قبل الكتابة ══════════════════════════════════════
  v_rate := COALESCE(NULLIF(p_purchase_return->>'exchange_rate_used', '')::NUMERIC, 1);
  IF v_rate <= 0 THEN
    RAISE EXCEPTION 'v3.74.941: سعرُ صرفٍ غيرُ موجب (%) — لا يُحوَّل به مال.', v_rate;
  END IF;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_warehouse_groups) LOOP
    v_g_sub := 0; v_g_tax := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_group->'items') LOOP
      v_bill_item_id  := NULLIF(v_item->>'bill_item_id', '')::UUID;
      v_requested_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
      IF v_requested_qty <= 0 THEN CONTINUE; END IF;

      SELECT * INTO v_priced
        FROM public.purchase_return_priced_line(p_bill_id, v_bill_item_id, v_requested_qty);

      PERFORM public.assert_purchase_return_amount(
        'unit_price', NULLIF(v_item->>'unit_price', '')::NUMERIC, v_priced.unit_price,
        0.0001, 'bill_item ' || v_bill_item_id::text);
      PERFORM public.assert_purchase_return_amount(
        'line_total', NULLIF(v_item->>'line_total', '')::NUMERIC, v_priced.line_total,
        0.01, 'bill_item ' || v_bill_item_id::text);

      v_g_sub := v_g_sub + v_priced.line_total;
      v_g_tax := v_g_tax + ROUND(v_priced.line_total * v_priced.tax_rate / 100.0, 2);
    END LOOP;

    PERFORM public.assert_purchase_return_amount(
      'group.total_amount', NULLIF(v_group->>'total_amount', '')::NUMERIC,
      ROUND((v_g_sub + v_g_tax) * v_rate, 4), 0.01,
      'warehouse ' || COALESCE(v_group->>'warehouse_id', '-'));

    v_orig_subtotal := v_orig_subtotal + v_g_sub;
    v_orig_tax      := v_orig_tax + v_g_tax;
  END LOOP;

  v_orig_total   := v_orig_subtotal + v_orig_tax;
  v_subtotal     := ROUND(v_orig_subtotal * v_rate, 4);
  v_tax_amount   := ROUND(v_orig_tax * v_rate, 4);
  v_total_amount := v_subtotal + v_tax_amount;

  PERFORM public.assert_purchase_return_amount('subtotal',     NULLIF(p_purchase_return->>'subtotal', '')::NUMERIC,     v_subtotal);
  PERFORM public.assert_purchase_return_amount('tax_amount',   NULLIF(p_purchase_return->>'tax_amount', '')::NUMERIC,   v_tax_amount);
  PERFORM public.assert_purchase_return_amount('total_amount', NULLIF(p_purchase_return->>'total_amount', '')::NUMERIC, v_total_amount);

  INSERT INTO purchase_returns (
    company_id, supplier_id, bill_id,
    return_number, return_date, status, workflow_status, created_by,
    subtotal, tax_amount, total_amount,
    settlement_method, reason, notes,
    branch_id, cost_center_id, warehouse_id,
    original_currency, original_subtotal, original_tax_amount, original_total_amount,
    exchange_rate_used, exchange_rate_id
  ) VALUES (
    p_company_id, p_supplier_id, p_bill_id,
    p_purchase_return->>'return_number',
    (p_purchase_return->>'return_date')::DATE,
    COALESCE(NULLIF(p_purchase_return->>'status', ''), 'completed'),
    'pending_approval',
    p_created_by,
    v_subtotal, v_tax_amount, v_total_amount,
    p_purchase_return->>'settlement_method',
    p_purchase_return->>'reason',
    p_purchase_return->>'notes',
    NULL, NULL, NULL,
    COALESCE(NULLIF(p_purchase_return->>'original_currency', ''), 'EGP'),
    v_orig_subtotal, v_orig_tax, v_orig_total,
    v_rate,
    NULLIF(p_purchase_return->>'exchange_rate_id', '')::UUID
  ) RETURNING id INTO v_pr_id;

  v_result := jsonb_set(v_result, '{purchase_return_id}', to_jsonb(v_pr_id));

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_warehouse_groups) LOOP
    v_warehouse_id   := NULLIF(v_group->>'warehouse_id', '')::UUID;
    v_branch_id      := NULLIF(v_group->>'branch_id', '')::UUID;
    v_cost_center_id := NULLIF(v_group->>'cost_center_id', '')::UUID;
    v_je_id          := NULL;
    v_g_sub := 0; v_g_tax := 0;

    IF (v_group->'journal_entry') IS NOT NULL THEN
      INSERT INTO journal_entries (
        company_id, branch_id, cost_center_id,
        reference_type, reference_id,
        entry_date, description, status
      ) VALUES (
        p_company_id, v_branch_id, v_cost_center_id,
        'purchase_return', v_pr_id,
        (v_group->'journal_entry'->>'entry_date')::DATE,
        v_group->'journal_entry'->>'description',
        'draft'
      ) RETURNING id INTO v_je_id;

      IF (v_group->'journal_lines') IS NOT NULL
         AND jsonb_array_length(v_group->'journal_lines') > 0 THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, debit_amount, credit_amount, description,
          branch_id, cost_center_id,
          original_debit, original_credit, original_currency,
          exchange_rate_used, exchange_rate_id
        )
        SELECT
          v_je_id,
          (l->>'account_id')::UUID,
          COALESCE((l->>'debit_amount')::NUMERIC, 0),
          COALESCE((l->>'credit_amount')::NUMERIC, 0),
          l->>'description',
          v_branch_id, v_cost_center_id,
          COALESCE((l->>'original_debit')::NUMERIC, 0),
          COALESCE((l->>'original_credit')::NUMERIC, 0),
          COALESCE(NULLIF(l->>'original_currency', ''), 'EGP'),
          COALESCE((l->>'exchange_rate_used')::NUMERIC, 1),
          NULLIF(l->>'exchange_rate_id', '')::UUID
        FROM jsonb_array_elements(v_group->'journal_lines') AS l;
      END IF;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_group->'items') LOOP
      v_bill_item_id  := NULLIF(v_item->>'bill_item_id', '')::UUID;
      v_requested_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
      IF v_requested_qty <= 0 THEN CONTINUE; END IF;
      SELECT * INTO v_priced
        FROM public.purchase_return_priced_line(p_bill_id, v_bill_item_id, v_requested_qty);
      v_g_sub := v_g_sub + v_priced.line_total;
      v_g_tax := v_g_tax + ROUND(v_priced.line_total * v_priced.tax_rate / 100.0, 2);
    END LOOP;

    INSERT INTO purchase_return_warehouse_allocations (
      company_id, purchase_return_id, warehouse_id, branch_id, cost_center_id,
      journal_entry_id, workflow_status,
      subtotal, tax_amount, total_amount
    ) VALUES (
      p_company_id, v_pr_id, v_warehouse_id, v_branch_id, v_cost_center_id,
      v_je_id, 'pending_approval',
      ROUND(v_g_sub * v_rate, 4),
      ROUND(v_g_tax * v_rate, 4),
      ROUND(v_g_sub * v_rate, 4) + ROUND(v_g_tax * v_rate, 4)
    ) RETURNING id INTO v_alloc_id;

    v_alloc_ids := array_append(v_alloc_ids, v_alloc_id);

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_group->'items') LOOP
      v_product_id    := NULLIF(v_item->>'product_id', '')::UUID;
      v_bill_item_id  := NULLIF(v_item->>'bill_item_id', '')::UUID;
      v_requested_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
      IF v_requested_qty <= 0 THEN CONTINUE; END IF;
      SELECT * INTO v_priced
        FROM public.purchase_return_priced_line(p_bill_id, v_bill_item_id, v_requested_qty);
      INSERT INTO purchase_return_items (
        purchase_return_id, bill_item_id, product_id,
        description, quantity, unit_price, tax_rate, discount_percent, line_total,
        warehouse_id, warehouse_allocation_id
      ) VALUES (
        v_pr_id, v_bill_item_id, v_product_id,
        v_item->>'description', v_requested_qty,
        v_priced.unit_price, v_priced.tax_rate, v_priced.discount_percent, v_priced.line_total,
        v_warehouse_id, v_alloc_id
      );
    END LOOP;
  END LOOP;

  v_result := jsonb_set(v_result, '{allocation_ids}', to_jsonb(v_alloc_ids));
  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Multi-warehouse purchase return failed (rolled back): %', SQLERRM;
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- (٦) إعادةُ الإرسال — resubmit_purchase_return
-- ────────────────────────────────────────────────────────────────────────────
-- كانت أخطرَ الثلاث بابين: تُحدّث إجماليات المستند من الطلب **وتحذف البنود
-- ثم تعيد كتابتها بأسعارٍ مُرسَلة** — أى أن مرتجعاً مرفوضاً يمكن أن يعود
-- بسعرٍ آخر تماماً وقد نال رفضَه على السعر الأول.
-- وكانت SECURITY DEFINER **بلا `search_path`** — أُضيف.
CREATE OR REPLACE FUNCTION public.resubmit_purchase_return(p_return_id uuid, p_user_id uuid, p_purchase_return jsonb, p_return_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_pr       RECORD;
  v_item     JSONB;
  v_priced   RECORD;
  v_qty      NUMERIC;
  v_bill_item_id UUID;
  v_rate     NUMERIC;
  v_orig_subtotal NUMERIC := 0;
  v_orig_tax      NUMERIC := 0;
  v_orig_total    NUMERIC := 0;
  v_subtotal      NUMERIC := 0;
  v_tax_amount    NUMERIC := 0;
  v_total_amount  NUMERIC := 0;
BEGIN
  -- v3.74.749 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access_by_row('purchase_returns', p_return_id);

  -- Load and lock the return
  SELECT * INTO v_pr
  FROM purchase_returns
  WHERE id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purchase return not found');
  END IF;

  -- Only the creator or admin can resubmit
  IF v_pr.created_by != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the creator can resubmit this return');
  END IF;

  -- Only allow resubmission from rejected states
  IF v_pr.workflow_status NOT IN ('rejected', 'warehouse_rejected') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Cannot resubmit: return is not in a rejected state. Current status: %s',
        v_pr.workflow_status
      )
    );
  END IF;

  -- ══ v3.74.941 — يُسعَّر من فاتورته قبل أن يُكتب شىء ══════════════════════
  v_rate := COALESCE(NULLIF(p_purchase_return->>'exchange_rate_used', '')::NUMERIC, v_pr.exchange_rate_used, 1);
  IF v_rate <= 0 THEN
    RAISE EXCEPTION 'v3.74.941: سعرُ صرفٍ غيرُ موجب (%) — لا يُحوَّل به مال.', v_rate;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    IF v_qty <= 0 THEN CONTINUE; END IF;
    v_bill_item_id := NULLIF(v_item->>'bill_item_id', '')::UUID;

    SELECT * INTO v_priced
      FROM public.purchase_return_priced_line(v_pr.bill_id, v_bill_item_id, v_qty);

    PERFORM public.assert_purchase_return_amount(
      'unit_price', NULLIF(v_item->>'unit_price', '')::NUMERIC, v_priced.unit_price,
      0.0001, 'bill_item ' || v_bill_item_id::text);
    PERFORM public.assert_purchase_return_amount(
      'line_total', NULLIF(v_item->>'line_total', '')::NUMERIC, v_priced.line_total,
      0.01, 'bill_item ' || v_bill_item_id::text);

    v_orig_subtotal := v_orig_subtotal + v_priced.line_total;
    v_orig_tax      := v_orig_tax + ROUND(v_priced.line_total * v_priced.tax_rate / 100.0, 2);
  END LOOP;

  v_orig_total   := v_orig_subtotal + v_orig_tax;
  v_subtotal     := ROUND(v_orig_subtotal * v_rate, 4);
  v_tax_amount   := ROUND(v_orig_tax * v_rate, 4);
  v_total_amount := v_subtotal + v_tax_amount;

  PERFORM public.assert_purchase_return_amount('subtotal',     NULLIF(p_purchase_return->>'subtotal', '')::NUMERIC,     v_subtotal);
  PERFORM public.assert_purchase_return_amount('tax_amount',   NULLIF(p_purchase_return->>'tax_amount', '')::NUMERIC,   v_tax_amount);
  PERFORM public.assert_purchase_return_amount('total_amount', NULLIF(p_purchase_return->>'total_amount', '')::NUMERIC, v_total_amount);

  -- Update the return record with new data, reset workflow
  UPDATE purchase_returns SET
    reason             = COALESCE(NULLIF(p_purchase_return->>'reason', ''), reason),
    notes              = COALESCE(NULLIF(p_purchase_return->>'notes', ''), notes),
    settlement_method  = COALESCE(NULLIF(p_purchase_return->>'settlement_method', ''), settlement_method),
    return_date        = COALESCE(NULLIF(p_purchase_return->>'return_date', '')::DATE, return_date),
    subtotal           = v_subtotal,
    tax_amount         = v_tax_amount,
    total_amount       = v_total_amount,
    original_subtotal  = v_orig_subtotal,
    original_tax_amount= v_orig_tax,
    original_total_amount = v_orig_total,
    exchange_rate_used = v_rate,
    -- Reset workflow
    status             = 'pending_approval',
    workflow_status    = 'pending_admin_approval',
    is_locked          = false,
    rejected_by        = NULL,
    rejected_at        = NULL,
    rejection_reason   = NULL,
    warehouse_rejected_by     = NULL,
    warehouse_rejected_at     = NULL,
    warehouse_rejection_reason = NULL,
    updated_at         = NOW()
  WHERE id = p_return_id;

  -- Replace return items
  DELETE FROM purchase_return_items WHERE purchase_return_id = p_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    IF v_qty <= 0 THEN CONTINUE; END IF;
    v_bill_item_id := NULLIF(v_item->>'bill_item_id', '')::UUID;

    SELECT * INTO v_priced
      FROM public.purchase_return_priced_line(v_pr.bill_id, v_bill_item_id, v_qty);

    INSERT INTO purchase_return_items (
      purchase_return_id, bill_item_id, product_id,
      description, quantity, unit_price, tax_rate, discount_percent, line_total
    ) VALUES (
      p_return_id,
      v_bill_item_id,
      NULLIF(v_item->>'product_id', '')::UUID,
      v_item->>'description',
      v_qty,
      v_priced.unit_price, v_priced.tax_rate, v_priced.discount_percent, v_priced.line_total
    );
  END LOOP;

  -- Audit log
  INSERT INTO audit_logs (
    company_id, user_id, action, target_table, record_id, old_data, new_data, created_at
  ) VALUES (
    v_pr.company_id, p_user_id,
    'SUBMIT',
    'purchase_returns',
    p_return_id,
    jsonb_build_object('workflow_status', v_pr.workflow_status, 'status', v_pr.status, 'total_amount', v_pr.total_amount),
    jsonb_build_object('workflow_status', 'pending_admin_approval', 'status', 'pending_approval', 'total_amount', v_total_amount),
    NOW()
  );

  RETURN jsonb_build_object(
    'success',         true,
    'purchase_return_id', p_return_id,
    'workflow_status', 'pending_admin_approval',
    'company_id',      v_pr.company_id,
    'bill_id',         v_pr.bill_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

COMMIT;
