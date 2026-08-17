-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.55 — **ومَن يُنشئُ المستندَ يُسمّى عملتَه، ولا يُجيبُ عنه افتراضٌ مكتوب**
-- ═══════════════════════════════════════════════════════════════════════════
--
-- العطبُ: **عملةُ المرتجعِ نفسِه** هى المصدرُ الذى يرثُ منه كلُّ ما بعدَه —
-- إشعارُ الدائنِ، ومُشغِّلُ v3.75.52 الذى يُصدِّقُ العملةَ المنصوصةَ فيقسمُ
-- المبلغَ على سعرِ صرف، والدفترُ. وكُتّابُ المرتجعِ الثلاثةُ كانوا يخترعون:
--
--   process_purchase_return_atomic            سطر 164   عملةُ رأسِ المرتجع
--   process_purchase_return_multi_warehouse   سطر 156   عملةُ رأسِ المرتجع
--   process_purchase_return_multi_warehouse   سطر 201   عملةُ سطرِ اليوميّة
--   post_purchase_transaction (١٢ وسيطاً)      **يسكتُ عن العمودِ** فتكتبُ
--                                             القاعدةُ له 'EGP' من افتراضٍ مكتوب
--
-- **والاختراعُ الرابعُ أخفى الثلاثةِ**: ليس فى شيفرةٍ يقرؤها قارئ، بل فى
-- قيمةٍ افتراضيّةٍ على العمود. **والسكوتُ عن عمودٍ لا يعنى صمتاً.**
--
-- والأثرُ قِيسَ قبلَ أن تُمَسَّ حرف: مرتجعان، ولا واحدَ عملتُه تخالفُ أساسَ
-- شركتِه، ولا عمودَ فارغ، ولا إشعارَ دائنٍ من مرتجع، **ولا تخصيصَ مخازنَ واحد**
-- (فطريقُ متعدّدِ المخازنِ بموضعَيه لم يُشغَّلْ قطُّ فى الإنتاج). وستّةُ سطورِ
-- يوميّةٍ لمرتجعاتٍ قُرئت بعينِها فوُجدت **فارغةَ العملةِ لا مكذوبةَ الوسم**.
-- **فلا مليمَ يتحرّكُ بهذه الدفعة** — والعطبُ ميكانيزمٌ حىٌّ لا خسارةٌ واقعة،
-- وهو حىٌّ لسبب: فى القاعدةِ شركةٌ حقيقيّةٌ أساسُها الريال.
--
-- والشاشةُ لا تُكسَر: هى ترسلُ العملةَ صراحةً وتُبدِّلُ افتراضَها إلى أساسِ
-- الشركةِ المقروءِ من صفِّها فورَ التحميل — فالـCOALESCE يأخذُ قولَها كما اليوم.
-- **الذى يتغيّرُ هو من لا يقولُ شيئاً**: كان يأخذُ «جنيهاً» مُخترَعاً، فيأخذُ
-- أساسَ شركتِه.
--
-- والثلاثةُ **بصلاحيّاتٍ كاملةٍ وتأخذُ رقمَ الشركةِ صراحةً**، فنداءُ البيتِ
-- الواحدِ **بلا منحةٍ جديدةٍ لأحد**. والبيتُ يرفعُ استثناءً إن لم يجدْ شركةً،
-- وذلك **غيرُ قابلٍ للبلوغ** هنا: assert_company_access يسبقُه فى الثلاثة،
-- و**لا شركةَ فى القاعدةِ بأساسٍ فارغ** (قِيس: صفر).
--
-- **وما لم يُمَسَّ ولماذا — معدودٌ لا مسكوتٌ عنه:**
--
--  (١) عمودُ إشعارِ الدائنِ يُترَكُ صامتاً **عن قصد**: v3.75.52 نزعَ افتراضَه،
--      و trg_fill_vendor_credit_fx يرثُ العملةَ والسعرَ من المرتجعِ صادقاً.
--      **فالصمتُ صارَ صواباً بعدَ أن صارَ الوارثُ صادقاً**، والنطقُ هنا يتجاوزُ
--      الوارثَ — وهو بعينِه العطبُ الذى أُغلقَ فى v3.75.54.
--
--  (٢) افتراضُ purchase_returns.original_currency = 'EGP' **لا يُنزَعُ اليوم**:
--      العمودُ يقبلُ الفراغ، ونزعُه يحوّلُ «جنيهاً كاذباً» إلى فراغ، والشاشةُ
--      عند القراءةِ ترتدُّ إلى 'EGP' مكتوبةً — **فتنتقلُ الكذبةُ إلى الواجهة.**
--      **ولا يُصلَحُ عطبٌ بعطبٍ آخَر.** يُنزَعُ فى دفعةٍ تاليةٍ بشاهدٍ حىٍّ بعدَ
--      أن يصيرَ كلُّ كاتبٍ ناطقاً — وهذه الدفعةُ هى التى تُصيِّرُه كذلك.
--
--  (٣) post_purchase_transaction له **نسخةٌ ثانيةٌ بثلاثةَ عشرَ وسيطاً
--      بصلاحيّاتِ مُنادِيها وبلا search_path مضبوط**. لا تُمَسُّ هنا: نداؤها
--      للبيتِ يقتضى فتحَه للمستخدِمِ المسجَّل، **وذلك قرارُ صلاحيّةٍ يُعرَضُ
--      ولا يُوسَّعُ صامتاً**. تُضافُ إلى الأربعِ الموقوفةِ على القرارِ نفسِه.
--
--  (٤) 255 سطرَ يوميّةٍ من 307 **بلا عملةٍ مطلقاً** فى القاعدةِ كلِّها — دَينٌ
--      أوسعُ من هذه الدفعة، ووسمُ سطورِ المرتجعِ وحدَها **بيتٌ ثانٍ لا سداد.**
--      **ونصفُ جراحةٍ أسوأُ من لا جراحة.** معدودٌ ويُسدَّدُ بدفعتِه.
--
-- **والقاعدةُ**: «ومَن يُنشئُ المستندَ يُسمّى عملتَه، ولا يُجيبُ عنه افتراضٌ
-- مكتوب» · «والسكوتُ عن عمودٍ لا يعنى صمتاً» · «وقيدُ الدفترِ أثقلُ من وسمِ
-- مستند» · «والصمتُ صارَ صواباً بعدَ أن صارَ الوارثُ صادقاً».
--
-- طُبِّقت على البيتَين، وتُقاسُ بالتطابقِ حرفاً بحرف.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- (١) الدالّةُ الواحدة — عملةُ رأسِ المرتجع

-- ───────────────────────────────────────────────────────────────────────────
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
  v_base            TEXT;
  v_orig_subtotal   NUMERIC := 0;
  v_orig_tax        NUMERIC := 0;
  v_orig_total      NUMERIC := 0;
  v_subtotal        NUMERIC := 0;
  v_tax_amount      NUMERIC := 0;
  v_total_amount    NUMERIC := 0;
BEGIN
  -- v3.74.730 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access(p_company_id);
  -- v3.75.55 — يُقرأُ الأساسُ مرّةً من البيتِ الواحدِ بعدَ سؤالِ الإذن، لا يُخترَع.
  v_base := public.erp_company_base_currency(p_company_id);
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
    -- v3.75.55 — **ولا تُخترَعُ عملة**: عملةُ المرتجعِ إن قالَها مُنشِئُه، وإلّا
    -- أساسُ شركتِه مقروءاً من صفِّها. وهذا الصفُّ هو **المصدرُ** الذى يرثُ منه
    -- إشعارُ الدائنِ ومُشغِّلُ v3.75.52 وكلُّ ما بعدَهما — فاختراعُ «جنيه» هنا
    -- يُوسَمُ به سلسلةٌ كاملةٌ ولا يُكشَف.
    COALESCE(NULLIF(p_purchase_return->>'original_currency', ''), v_base),
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
$function$
;

-- ───────────────────────────────────────────────────────────────────────────
-- (٢) متعدّدُ المخازن — عملةُ الرأسِ وعملةُ سطرِ اليوميّة

-- ───────────────────────────────────────────────────────────────────────────
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
  v_base           TEXT;
  v_orig_subtotal  NUMERIC := 0;
  v_orig_tax       NUMERIC := 0;
  v_orig_total     NUMERIC := 0;
  v_subtotal       NUMERIC := 0;
  v_tax_amount     NUMERIC := 0;
  v_total_amount   NUMERIC := 0;
BEGIN
  -- v3.74.730 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access(p_company_id);
  -- v3.75.55 — يُقرأُ الأساسُ مرّةً من البيتِ الواحدِ بعدَ سؤالِ الإذن، لا يُخترَع.
  v_base := public.erp_company_base_currency(p_company_id);
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
    -- v3.75.55 — **ولا تُخترَعُ عملة**: عملةُ المرتجعِ إن قالَها مُنشِئُه، وإلّا
    -- أساسُ شركتِه مقروءاً من صفِّها. وهذا الصفُّ هو **المصدرُ** الذى يرثُ منه
    -- إشعارُ الدائنِ ومُشغِّلُ v3.75.52 وكلُّ ما بعدَهما — فاختراعُ «جنيه» هنا
    -- يُوسَمُ به سلسلةٌ كاملةٌ ولا يُكشَف.
    COALESCE(NULLIF(p_purchase_return->>'original_currency', ''), v_base),
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
          -- v3.75.55 — **وقيدُ الدفترِ أثقلُ من وسمِ مستند**: سطرُ يوميّةٍ يقولُ
          -- «جنيه» فى شركةٍ أساسُها غيرُه يكذبُ على الأستاذِ نفسِه.
          COALESCE(NULLIF(l->>'original_currency', ''), v_base),
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
$function$
;

-- ───────────────────────────────────────────────────────────────────────────
-- (٣) الكاتبُ الصامت — العمودُ يُذكَرُ صراحةً فلا يُجيبُ عنه افتراض

-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_purchase_transaction(p_transaction_type text, p_company_id uuid, p_bill_id uuid DEFAULT NULL::uuid, p_bill_data jsonb DEFAULT NULL::jsonb, p_bill_items jsonb DEFAULT NULL::jsonb, p_bill_update jsonb DEFAULT NULL::jsonb, p_journal_entry jsonb DEFAULT NULL::jsonb, p_inventory_transactions jsonb DEFAULT NULL::jsonb, p_purchase_return jsonb DEFAULT NULL::jsonb, p_vendor_credit jsonb DEFAULT NULL::jsonb, p_vendor_credit_items jsonb DEFAULT NULL::jsonb, p_update_source jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result              JSONB := '{}';
  v_je_id               UUID;
  v_bill_id             UUID;
  v_pr_id               UUID;
  v_vc_id               UUID;
  item_update           JSONB;
  inv_tx                JSONB;
  v_bill_exists         BOOLEAN;
  v_base                TEXT;
BEGIN
  -- v3.74.730 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access(p_company_id);
  -- Allow direct journal_entry INSERT as posted (bypass enforce_je_integrity trigger)
  PERFORM set_config('app.allow_direct_post', 'true', true);

  -- ── POST_BILL (Receipt Approval - Inventory + Journal) ───────────────────────
  IF p_transaction_type = 'post_bill' THEN

    IF p_bill_id IS NOT NULL THEN
      SELECT EXISTS(SELECT 1 FROM bills WHERE id = p_bill_id AND company_id = p_company_id) INTO v_bill_exists;
      IF NOT v_bill_exists THEN
        RAISE EXCEPTION 'Bill not found or does not belong to company';
      END IF;
    END IF;

    -- A. Insert Inventory Transactions
    IF p_inventory_transactions IS NOT NULL AND jsonb_array_length(p_inventory_transactions) > 0 THEN
      INSERT INTO inventory_transactions (
        company_id, branch_id, warehouse_id, cost_center_id,
        product_id, transaction_type, quantity_change,
        unit_cost, total_cost, reference_id, reference_type,
        journal_entry_id, notes, transaction_date
      )
      SELECT
        p_company_id,
        NULLIF(t->>'branch_id', '')::UUID,
        NULLIF(t->>'warehouse_id', '')::UUID,
        NULLIF(t->>'cost_center_id', '')::UUID,
        NULLIF(t->>'product_id', '')::UUID,
        t->>'transaction_type',
        COALESCE((t->>'quantity_change')::NUMERIC, 0),
        NULLIF(t->>'unit_cost', '')::NUMERIC,
        NULLIF(t->>'total_cost', '')::NUMERIC,
        COALESCE(NULLIF(t->>'reference_id', '')::UUID, p_bill_id),
        COALESCE(NULLIF(t->>'reference_type', ''), 'bill'),
        NULLIF(t->>'journal_entry_id', '')::UUID,
        t->>'notes',
        COALESCE(NULLIF(t->>'transaction_date', '')::DATE, CURRENT_DATE)
      FROM jsonb_array_elements(p_inventory_transactions) AS t;
    END IF;

    -- B. Insert Journal Entry
    IF p_journal_entry IS NOT NULL THEN
      INSERT INTO journal_entries (
        company_id, branch_id, cost_center_id,
        entry_date, description, reference_type, reference_id,
        status
      ) VALUES (
        p_company_id,
        NULLIF(p_journal_entry->>'branch_id', '')::UUID,
        NULLIF(p_journal_entry->>'cost_center_id', '')::UUID,
        COALESCE(NULLIF(p_journal_entry->>'entry_date', '')::DATE, CURRENT_DATE),
        p_journal_entry->>'description',
        COALESCE(NULLIF(p_journal_entry->>'reference_type', ''), 'bill'),
        COALESCE(NULLIF(p_journal_entry->>'reference_id', '')::UUID, p_bill_id),
        COALESCE(NULLIF(p_journal_entry->>'status', ''), 'posted')
      ) RETURNING id INTO v_je_id;

      IF p_journal_entry->'lines' IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, description,
          debit_amount, credit_amount,
          branch_id, cost_center_id
        )
        SELECT
          v_je_id,
          (l->>'account_id')::UUID,
          l->>'description',
          COALESCE((l->>'debit_amount')::NUMERIC, 0),
          COALESCE((l->>'credit_amount')::NUMERIC, 0),
          NULLIF(l->>'branch_id', '')::UUID,
          NULLIF(l->>'cost_center_id', '')::UUID
        FROM jsonb_array_elements(p_journal_entry->'lines') AS l;
      END IF;

      v_result := jsonb_set(v_result, '{journal_entry_id}', to_jsonb(v_je_id));
      UPDATE bills SET updated_at = NOW() WHERE id = p_bill_id;
    END IF;

    -- C. Update Bill Status (MODIFIED to include receipt fields)
    IF p_bill_update IS NOT NULL AND p_bill_id IS NOT NULL THEN
      UPDATE bills
      SET
        status = COALESCE(NULLIF(p_bill_update->>'status', ''), status),
        receipt_status = COALESCE(NULLIF(p_bill_update->>'receipt_status', ''), receipt_status),
        received_by = COALESCE(NULLIF(p_bill_update->>'received_by', '')::uuid, received_by),
        received_at = COALESCE(NULLIF(p_bill_update->>'received_at', '')::timestamptz, received_at),
        updated_at = NOW()
      WHERE id = p_bill_id;
    END IF;

  -- ── BILL CREATION ─────────────────────────────────────────────────────────
  ELSIF p_transaction_type = 'bill' THEN

    INSERT INTO bills (
      company_id, supplier_id, branch_id, cost_center_id, warehouse_id,
      bill_number, bill_date, due_date, status,
      subtotal, tax_amount, total_amount, paid_amount, notes
    )
    SELECT
      p_company_id,
      (p_bill_data->>'supplier_id')::UUID,
      NULLIF(p_bill_data->>'branch_id', '')::UUID,
      NULLIF(p_bill_data->>'cost_center_id', '')::UUID,
      NULLIF(p_bill_data->>'warehouse_id', '')::UUID,
      p_bill_data->>'bill_number',
      (p_bill_data->>'bill_date')::DATE,
      NULLIF(p_bill_data->>'due_date', '')::DATE,
      COALESCE(NULLIF(p_bill_data->>'status', ''), 'draft'),
      COALESCE((p_bill_data->>'subtotal')::NUMERIC, 0),
      COALESCE((p_bill_data->>'tax_amount')::NUMERIC, 0),
      COALESCE((p_bill_data->>'total_amount')::NUMERIC, 0),
      0, p_bill_data->>'notes'
    RETURNING id INTO v_bill_id;

    v_result := jsonb_set(v_result, '{bill_id}', to_jsonb(v_bill_id));

    IF p_bill_items IS NOT NULL THEN
      INSERT INTO bill_items (
        bill_id, product_id, description, quantity, unit_price,
        tax_rate, discount_percent, line_total
      )
      SELECT v_bill_id,
        NULLIF(bi->>'product_id', '')::UUID, bi->>'description',
        COALESCE((bi->>'quantity')::NUMERIC, 0), COALESCE((bi->>'unit_price')::NUMERIC, 0),
        COALESCE((bi->>'tax_rate')::NUMERIC, 0), COALESCE((bi->>'discount_percent')::NUMERIC, 0),
        COALESCE((bi->>'line_total')::NUMERIC, 0)
      FROM jsonb_array_elements(p_bill_items) AS bi;
    END IF;

    IF p_journal_entry IS NOT NULL THEN
      INSERT INTO journal_entries (
        company_id, branch_id, cost_center_id,
        entry_date, description, reference_id, reference_type, status
      ) VALUES (
        p_company_id,
        NULLIF(p_journal_entry->>'branch_id', '')::UUID,
        NULLIF(p_journal_entry->>'cost_center_id', '')::UUID,
        (p_journal_entry->>'entry_date')::DATE,
        p_journal_entry->>'description',
        v_bill_id, 'bill',
        COALESCE(NULLIF(p_journal_entry->>'status', ''), 'posted')
      ) RETURNING id INTO v_je_id;

      IF p_journal_entry->'lines' IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, description, debit_amount, credit_amount
        )
        SELECT v_je_id, (jl->>'account_id')::UUID, jl->>'description',
          COALESCE((jl->>'debit_amount')::NUMERIC, 0), COALESCE((jl->>'credit_amount')::NUMERIC, 0)
        FROM jsonb_array_elements(p_journal_entry->'lines') AS jl;
      END IF;

      UPDATE bills SET updated_at = NOW() WHERE id = v_bill_id;
      v_result := jsonb_set(v_result, '{journal_entry_id}', to_jsonb(v_je_id));
    END IF;

    IF p_inventory_transactions IS NOT NULL THEN
      INSERT INTO inventory_transactions (
        company_id, product_id, transaction_type, quantity_change,
        reference_id, reference_type, journal_entry_id, notes,
        branch_id, cost_center_id, warehouse_id, transaction_date
      )
      SELECT p_company_id, NULLIF(inv_tx->>'product_id', '')::UUID,
        inv_tx->>'transaction_type', COALESCE((inv_tx->>'quantity_change')::NUMERIC, 0),
        v_bill_id, 'bill', v_je_id, inv_tx->>'notes',
        NULLIF(inv_tx->>'branch_id', '')::UUID, NULLIF(inv_tx->>'cost_center_id', '')::UUID,
        NULLIF(inv_tx->>'warehouse_id', '')::UUID,
        COALESCE((inv_tx->>'transaction_date')::DATE, CURRENT_DATE)
      FROM jsonb_array_elements(p_inventory_transactions) AS inv_tx;
    END IF;

  -- ── PURCHASE RETURN ──────────────────────────────────────────────────────
  ELSIF p_transaction_type = 'purchase_return' THEN

    IF p_journal_entry IS NOT NULL THEN
      INSERT INTO journal_entries (
        company_id, branch_id, cost_center_id,
        entry_date, description, reference_id, reference_type, status
      ) VALUES (
        p_company_id,
        NULLIF(p_journal_entry->>'branch_id', '')::UUID,
        NULLIF(p_journal_entry->>'cost_center_id', '')::UUID,
        (p_journal_entry->>'entry_date')::DATE,
        p_journal_entry->>'description',
        p_bill_id, 'purchase_return',
        COALESCE(NULLIF(p_journal_entry->>'status', ''), 'posted')
      ) RETURNING id INTO v_je_id;

      IF p_journal_entry->'lines' IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, description, debit_amount, credit_amount
        )
        SELECT v_je_id, (jl->>'account_id')::UUID, jl->>'description',
          COALESCE((jl->>'debit_amount')::NUMERIC, 0), COALESCE((jl->>'credit_amount')::NUMERIC, 0)
        FROM jsonb_array_elements(p_journal_entry->'lines') AS jl;
      END IF;

      v_result := jsonb_set(v_result, '{journal_entry_id}', to_jsonb(v_je_id));
    END IF;

    IF p_purchase_return IS NOT NULL THEN
      -- v3.75.55 — يُقرأُ الأساسُ هنا لا فى رأسِ الدالّة: فهذه الدالّةُ تخدمُ
      -- ثلاثةَ أنواعٍ من العمليّات، ولا يُوسَّعُ أثرُ جراحةٍ إلى طريقٍ لا شأنَ لها به.
      v_base := public.erp_company_base_currency(p_company_id);
      INSERT INTO purchase_returns (
        company_id, supplier_id, bill_id, journal_entry_id,
        return_number, return_date, status, subtotal, tax_amount, total_amount,
        settlement_method, reason, notes, branch_id, cost_center_id, warehouse_id,
        original_currency
      ) VALUES (
        p_company_id, NULLIF(p_purchase_return->>'supplier_id', '')::UUID,
        p_bill_id, v_je_id, p_purchase_return->>'return_number',
        (p_purchase_return->>'return_date')::DATE,
        COALESCE(NULLIF(p_purchase_return->>'status', ''), 'completed'),
        COALESCE((p_purchase_return->>'subtotal')::NUMERIC, 0),
        COALESCE((p_purchase_return->>'tax_amount')::NUMERIC, 0),
        COALESCE((p_purchase_return->>'total_amount')::NUMERIC, 0),
        p_purchase_return->>'settlement_method', p_purchase_return->>'reason',
        p_purchase_return->>'notes',
        NULLIF(p_purchase_return->>'branch_id', '')::UUID,
        NULLIF(p_purchase_return->>'cost_center_id', '')::UUID,
        NULLIF(p_purchase_return->>'warehouse_id', '')::UUID,
        -- v3.75.55 — **والسكوتُ عن عمودٍ لا يعنى صمتاً**: كان هذا الكاتبُ يُهملُ
        -- العمودَ فتكتبُ القاعدةُ له «جنيهاً» من افتراضٍ مكتوب — فالاختراعُ كان
        -- **مُخفىً فى افتراضٍ لا فى شيفرة**، ولا يراه من يقرأُ الشيفرةَ وحدَها.
        -- صار يقولُ ما يعنيه: قولَ مُنشِئِه إن قال، وإلّا أساسَ شركتِه من صفِّها.
        COALESCE(NULLIF(p_purchase_return->>'original_currency', ''), v_base)
      ) RETURNING id INTO v_pr_id;

      v_result := jsonb_set(v_result, '{purchase_return_id}', to_jsonb(v_pr_id));
      IF v_je_id IS NOT NULL THEN
        UPDATE journal_entries SET reference_id = v_pr_id WHERE id = v_je_id;
      END IF;
    END IF;

    IF p_vendor_credit IS NOT NULL THEN
      INSERT INTO vendor_credits (
        company_id, supplier_id, bill_id,
        source_purchase_return_id, source_purchase_invoice_id, journal_entry_id,
        credit_number, credit_date, status,
        subtotal, tax_amount, total_amount, applied_amount,
        branch_id, cost_center_id, warehouse_id, notes
      ) VALUES (
        p_company_id, NULLIF(p_vendor_credit->>'supplier_id', '')::UUID,
        p_bill_id, v_pr_id, p_bill_id, v_je_id,
        p_vendor_credit->>'credit_number',
        COALESCE((p_vendor_credit->>'credit_date')::DATE, CURRENT_DATE), 'open',
        COALESCE((p_vendor_credit->>'subtotal')::NUMERIC, 0),
        COALESCE((p_vendor_credit->>'tax_amount')::NUMERIC, 0),
        COALESCE((p_vendor_credit->>'total_amount')::NUMERIC, 0), 0,
        NULLIF(p_vendor_credit->>'branch_id', '')::UUID,
        NULLIF(p_vendor_credit->>'cost_center_id', '')::UUID,
        NULLIF(p_vendor_credit->>'warehouse_id', '')::UUID, p_vendor_credit->>'notes'
      ) RETURNING id INTO v_vc_id;

      IF p_vendor_credit_items IS NOT NULL THEN
        INSERT INTO vendor_credit_items (
          vendor_credit_id, product_id, description,
          quantity, unit_price, tax_rate, discount_percent, line_total
        )
        SELECT v_vc_id, NULLIF(vci->>'product_id', '')::UUID, vci->>'description',
          COALESCE((vci->>'quantity')::NUMERIC, 0), COALESCE((vci->>'unit_price')::NUMERIC, 0),
          COALESCE((vci->>'tax_rate')::NUMERIC, 0), COALESCE((vci->>'discount_percent')::NUMERIC, 0),
          COALESCE((vci->>'line_total')::NUMERIC, 0)
        FROM jsonb_array_elements(p_vendor_credit_items) AS vci;
      END IF;

      v_result := jsonb_set(v_result, '{vendor_credit_id}', to_jsonb(v_vc_id));
    END IF;

    IF p_inventory_transactions IS NOT NULL THEN
      INSERT INTO inventory_transactions (
        company_id, product_id, transaction_type, quantity_change,
        reference_id, reference_type, journal_entry_id, notes,
        branch_id, cost_center_id, warehouse_id, transaction_date
      )
      SELECT p_company_id, NULLIF(inv_tx->>'product_id', '')::UUID,
        inv_tx->>'transaction_type', COALESCE((inv_tx->>'quantity_change')::NUMERIC, 0),
        COALESCE(v_pr_id, p_bill_id), 'purchase_return', v_je_id, inv_tx->>'notes',
        NULLIF(inv_tx->>'branch_id', '')::UUID, NULLIF(inv_tx->>'cost_center_id', '')::UUID,
        NULLIF(inv_tx->>'warehouse_id', '')::UUID,
        COALESCE((inv_tx->>'transaction_date')::DATE, CURRENT_DATE)
      FROM jsonb_array_elements(p_inventory_transactions) AS inv_tx;
    END IF;

    IF p_bill_update IS NOT NULL AND p_bill_id IS NOT NULL THEN
      UPDATE bills
      SET
        returned_amount = COALESCE(NULLIF(p_bill_update->>'returned_amount', '')::NUMERIC, returned_amount),
        return_status = COALESCE(NULLIF(p_bill_update->>'return_status', ''), return_status),
        status = COALESCE(NULLIF(p_bill_update->>'status', ''), status),
        updated_at = NOW()
      WHERE id = p_bill_id;
    END IF;

    IF p_update_source->'bill_items_update' IS NOT NULL THEN
      FOR item_update IN
        SELECT * FROM jsonb_array_elements(p_update_source->'bill_items_update')
      LOOP
        UPDATE bill_items
        SET returned_quantity = COALESCE(returned_quantity, 0)
                              + COALESCE((item_update->>'returned_quantity')::NUMERIC, 0)
        WHERE id = (item_update->>'id')::UUID;
      END LOOP;
    END IF;

  END IF;

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Transaction failed: %', SQLERRM;
END;
$function$
;

-- ───────────────────────────────────────────────────────────────────────────
-- الفحصُ المرجعىُّ — خاصّيّةُ الأجسادِ الثلاثة، وقيدٌ حىٌّ على الصفوفِ كلِّها
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_55_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $chk$
DECLARE
  n          int;
  n_pr       bigint;
  n_blank    bigint;
  n_mismatch bigint;
  v_names    text[] := ARRAY['process_purchase_return_atomic',
                             'process_purchase_return_multi_warehouse',
                             'post_purchase_transaction'];
BEGIN
  -- (أ) لا جسدَ من الثلاثةِ يُسمّى عملةً بعينِها — والتعليقُ محجوبٌ قبلَ الحكم.
  --     وpost_purchase_transaction تُحاكَمُ بنسختِها ذاتِ الصلاحيّاتِ الكاملةِ
  --     وحدَها، فالأخرى مُعلَنةٌ ومؤجَّلةٌ على قرارِ صلاحيّة.
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = ANY(v_names)
    AND p.prosecdef
    AND regexp_replace(p.prosrc, '--[^\n]*', ' ', 'g') ~ '''(EGP|USD|SAR|EUR|GBP|AED|KWD|JOD|QAR|BHD|OMR)''';
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.55: % من كُتّابِ المرتجعِ عادَ يُسمّى عملةً بعينِها', n;
  END IF;

  -- (ب) وكلُّ واحدٍ منها ينادى البيتَ الواحدَ برقمِ الشركةِ الذى أُعطىَ له
  --     — **والذِّكرُ ليس نداءً**.
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = ANY(v_names)
    AND p.prosecdef
    AND p.prosrc LIKE '%erp_company_base_currency(p_company_id)%';
  IF n <> 3 THEN
    RAISE EXCEPTION 'v3.75.55: ينادى البيتَ % من ثلاثةٍ — والباقى يخترع', n;
  END IF;

  -- (ج) والثلاثةُ ما زالت بصلاحيّاتٍ كاملة — فنداؤها للبيتِ بلا منحةٍ لأحد
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = ANY(v_names) AND p.prosecdef;
  IF n <> 3 THEN
    RAISE EXCEPTION 'v3.75.55: % بصلاحيّاتٍ كاملةٍ لا ثلاثة — ونداءُ البيتِ يحتاجُ منحةً لم تُعلَن', n;
  END IF;

  -- (د) والكاتبُ الصامتُ صارَ ناطقاً: يذكرُ العمودَ صراحةً فى كتابتِه،
  --     فلا يُجيبُ عنه افتراضٌ مكتوب.
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'post_purchase_transaction' AND p.prosecdef
    AND p.prosrc LIKE '%original_currency%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'v3.75.55: post_purchase_transaction عادَ يسكتُ عن العمود — فيُجيبُ عنه الافتراض';
  END IF;

  -- (هـ) ولم يُوسَّعْ بلوغُ البيتِ الواحدِ ولا الفحصِ صامتاً
  SELECT count(*) INTO n
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name IN ('erp_company_base_currency', 'assert_baseline_v3_75_55_check')
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.55: % صلاحيّةً مفتوحةً على البيتِ أو الفحص — والتوسيعُ يُعلَنُ ولا يُدَسّ', n;
  END IF;

  -- (و) وقيدٌ حىٌّ على الصفوفِ كلِّها — **يصرخُ يومَ يقع**:
  --     لا مرتجعَ بعمودِ عملةٍ فارغ، ولا مرتجعَ يقولُ عملةً غيرَ أساسِ شركتِه
  --     **وحسابُه يقولُ إنّه بالأساس** (سعرُ صرفٍ واحدٌ وأصلُه يساوى محوَّلَه)
  --     — فذلك هو الوسمُ الكاذبُ بعينِه، لا العملةُ الأجنبيّةُ الصادقة.
  SELECT count(*),
         count(*) FILTER (WHERE pr.original_currency IS NULL OR btrim(pr.original_currency) = ''),
         count(*) FILTER (WHERE upper(btrim(coalesce(pr.original_currency,''))) <> upper(btrim(co.base_currency))
                            AND coalesce(pr.exchange_rate_used, 1) = 1
                            AND coalesce(pr.original_total_amount, pr.total_amount) = pr.total_amount)
    INTO n_pr, n_blank, n_mismatch
  FROM public.purchase_returns pr
  JOIN public.companies co ON co.id = pr.company_id;

  IF n_blank <> 0 THEN
    RAISE EXCEPTION 'v3.75.55: % مرتجعاً بعمودِ عملةٍ فارغ (من %)', n_blank, n_pr;
  END IF;
  IF n_mismatch <> 0 THEN
    RAISE EXCEPTION 'v3.75.55: % مرتجعاً يقولُ عملةً غيرَ أساسِ شركتِه وحسابُه بالأساس — وسمٌ كاذب (من %)', n_mismatch, n_pr;
  END IF;

  RETURN 'v3.75.55 ok - أجسادٌ بلا عملةٍ حرفيّة=3 · تنادى البيت=3 · بصلاحيّاتٍ كاملة=3'
         || ' · الكاتبُ الصامتُ صارَ ناطقاً=1 · بلا توسيعِ منحة=0'
         || ' · مرتجعاتٌ فى القاعدة=' || n_pr
         || ' · بعمودٍ فارغ=' || n_blank
         || ' · وسمٌ كاذب=' || n_mismatch;
END
$chk$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_55_check()  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_55_check() TO service_role;

COMMENT ON FUNCTION public.assert_baseline_v3_75_55_check() IS
  'v3.75.55 — يُثبِتُ أنّ كُتّابَ المرتجعِ الثلاثةَ بصلاحيّاتٍ كاملةٍ لا يخترعون عملةً بل يقرأونها من صفِّ الشركة، وأنّ الكاتبَ الصامتَ صارَ ينطقُ بالعمودِ فلا يُجيبُ عنه افتراضٌ مكتوب، وأنّ لا صفَّ مرتجعٍ بعمودٍ فارغٍ ولا بوسمٍ كاذب.';
