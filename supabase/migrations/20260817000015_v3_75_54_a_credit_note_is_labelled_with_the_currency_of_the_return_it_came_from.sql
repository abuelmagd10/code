-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.54 — «وإشعارُ الدائنِ يُوسَمُ بعملةِ المرتجعِ الذى وُلدَ منه»
--
-- `confirm_purchase_return_delivery` تُنشئُ إشعارَ دائنٍ للمورّدِ عندَ اعتمادِ
-- مرتجعِ الشراء، وكانت تكتبُ عملتَه هكذا:
--
--     COALESCE(v_pr.original_currency, 'EGP')
--
-- **فإن كان عمودُ المرتجعِ فارغاً اختُرِعتِ العملةُ جنيهاً.** وهذا ليس وسماً
-- بريئاً، لأنّ مُشغِّلَ v3.75.52 على `vendor_credits` **يُصدِّقُ المُنادِى**:
-- عملةٌ غيرُ أساسِ الشركةِ تُؤخَذُ كما قيلت (وهذا صحيحٌ فى نفسِه). فلشركةٍ
-- أساسُها الريالُ يجرى الآتى: يُكتَبُ «جنيه» اختراعاً، **فيراه المُشغِّلُ عملةً
-- أجنبيّةً فيُصدِّقُها**، فيصيرُ إشعارُ الدائنِ موسوماً بالجنيهِ بسعرِ ١ **وهو
-- فى الحقيقةِ بالريال** — رقمٌ صحيحٌ بوسمٍ كاذبٍ فى دفترِ مورّد.
--
-- **ولا يُصلَحُ عطبٌ بعطبٍ آخَر**: الطبقتانِ سليمتانِ كلٌّ على حدة — الخطأُ
-- أنّ الأولى تخترعُ فتُغذِّى الثانيةَ كذباً. فتُصلَحُ عندَ المنبع:
--
--     COALESCE(NULLIF(btrim(v_pr.original_currency), ''),
--              public.erp_company_base_currency(v_pr.company_id))
--
-- **والدالّةُ بصلاحيّاتٍ كاملة**، فنداؤها للبيتِ الواحدِ يجرى بصلاحيّاتِ
-- مالكِها — **بلا منحةٍ لأحد**. ولم يُمَسَّ حرفٌ آخَرُ من جسدِها: لا منطقُ
-- المخزون، ولا الأقفال، ولا تحديثُ الفاتورة، ولا القيد.
--
-- ═══ وأثرُ اليومِ صفرٌ مقيس ═══
--
-- مرتجعاتُ الشراءِ فى القاعدة: **٢**، ولا واحدَ منها بعمودِ عملةٍ فارغ (العمودُ
-- ما زال يحملُ افتراضاً مكتوباً — وهو أحدُ الثلاثينَ الباقيةِ فى الدَّين).
-- وإشعاراتُ الدائنِ المولودةُ من مرتجعٍ: **٠**. **فلا صفَّ يتغيّرُ حكمُه اليوم**،
-- ولخمسِ شركاتٍ أساسُها الجنيهُ النتيجةُ حرفاً بحرفٍ كما كانت.
--
-- ═══ ولا يُدَّعى برهانٌ لم يجرِ ═══
--
-- لا تُشغَّلُ الدالّةُ حيّاً فى الفحص، وسببُه مكتوب: تحتاجُ مرتجعاً فى حالةِ
-- «بانتظارِ الاعتماد» ببنودٍ ومخزونٍ كافٍ وفاتورةٍ مرتبطة، فغرسُ ذلك يجعلُ
-- الفحصَ رهينةَ حالِ المخزونِ والفترةِ لا حالِ القاعدة. **فيُقاسُ ما يُقاسُ**:
-- خاصّيّةُ الجسد (لا عملةَ حرفيّةً، ونداءُ البيتِ برقمِ شركةِ الصفّ، وبصلاحيّاتٍ
-- كاملة)، **ومعها قيدٌ حىٌّ على الصفوفِ كلِّها**: لا إشعارَ دائنٍ مولودٍ من
-- مرتجعٍ يُوسَمُ بعملةٍ غيرِ عملةِ مرتجعِه. وهو اليومَ صفرٌ، ويصرخُ يومَ يقع.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirm_purchase_return_delivery(p_purchase_return_id uuid, p_confirmed_by uuid, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_pr            RECORD;
  v_item          RECORD;
  v_bill_item     RECORD;
  v_current_stock NUMERIC;
  v_new_returned  NUMERIC;
  v_bill_total    NUMERIC;
  v_bill_st       TEXT;
  v_vc_id         UUID;
  v_result        JSONB := '{}';
BEGIN
  -- v3.74.748 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access_by_row('purchase_returns', p_purchase_return_id);

  SELECT pr.* INTO v_pr FROM purchase_returns pr WHERE pr.id = p_purchase_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase return not found: %', p_purchase_return_id; END IF;
  IF v_pr.workflow_status != 'pending_approval' THEN
    RAISE EXCEPTION 'Return is not pending approval. Current status: %', v_pr.workflow_status;
  END IF;

  FOR v_item IN SELECT pri.* FROM purchase_return_items pri WHERE pri.purchase_return_id = p_purchase_return_id AND pri.quantity > 0 LOOP
    IF v_item.bill_item_id IS NOT NULL THEN
      SELECT id, quantity, COALESCE(returned_quantity, 0) AS returned_quantity INTO v_bill_item
      FROM bill_items WHERE id = v_item.bill_item_id FOR UPDATE;
      IF (v_bill_item.returned_quantity + v_item.quantity) > v_bill_item.quantity THEN
        RAISE EXCEPTION 'Return quantity exceeds bill item quantity for item %', v_item.bill_item_id;
      END IF;
    END IF;
    IF v_item.product_id IS NOT NULL AND v_pr.warehouse_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext(v_pr.company_id::text || v_item.product_id::text || v_pr.warehouse_id::text));
      SELECT COALESCE(SUM(quantity_change), 0) INTO v_current_stock
      FROM inventory_transactions
      WHERE company_id = v_pr.company_id AND product_id = v_item.product_id AND warehouse_id = v_pr.warehouse_id AND COALESCE(is_deleted, false) = false;
      IF v_current_stock < v_item.quantity THEN
        RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Required: %', v_item.product_id, v_current_stock, v_item.quantity;
      END IF;
    END IF;
  END LOOP;

  FOR v_item IN SELECT pri.* FROM purchase_return_items pri WHERE pri.purchase_return_id = p_purchase_return_id AND pri.quantity > 0 LOOP
    IF v_item.product_id IS NOT NULL THEN
      INSERT INTO inventory_transactions (company_id, product_id, transaction_type, quantity_change, reference_id, reference_type, journal_entry_id, notes, branch_id, cost_center_id, warehouse_id, transaction_date)
      VALUES (v_pr.company_id, v_item.product_id, 'purchase_return', -v_item.quantity, v_pr.id, 'purchase_return', v_pr.journal_entry_id,
        'مرتجع مشتريات ' || v_pr.return_number, v_pr.branch_id, v_pr.cost_center_id, v_pr.warehouse_id, v_pr.return_date);
    END IF;
    IF v_item.bill_item_id IS NOT NULL THEN
      UPDATE bill_items SET returned_quantity = COALESCE(returned_quantity, 0) + v_item.quantity WHERE id = v_item.bill_item_id;
    END IF;
  END LOOP;

  IF v_pr.bill_id IS NOT NULL THEN
    SELECT returned_amount, total_amount, status INTO v_new_returned, v_bill_total, v_bill_st FROM bills WHERE id = v_pr.bill_id;
    v_new_returned := COALESCE(v_new_returned, 0) + v_pr.total_amount;
    IF v_bill_st IN ('paid', 'partially_paid') THEN
      UPDATE bills SET returned_amount = v_new_returned,
        return_status = CASE WHEN v_new_returned >= v_bill_total THEN 'full' ELSE 'partial' END, updated_at = NOW()
      WHERE id = v_pr.bill_id;
    ELSE
      UPDATE bills SET returned_amount = v_new_returned,
        return_status = CASE WHEN v_new_returned >= v_bill_total THEN 'full' ELSE 'partial' END,
        status = CASE WHEN (v_bill_total - v_pr.total_amount) <= 0 THEN 'fully_returned' ELSE v_bill_st END,
        total_amount = GREATEST(v_bill_total - v_pr.total_amount, 0), updated_at = NOW()
      WHERE id = v_pr.bill_id;
    END IF;
  END IF;

  IF v_pr.journal_entry_id IS NOT NULL THEN
    UPDATE journal_entries SET status = 'posted', validation_status = 'valid', updated_at = NOW()
    WHERE id = v_pr.journal_entry_id AND status = 'draft';
  END IF;

  IF v_pr.settlement_method = 'debit_note' AND v_pr.total_amount > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM vendor_credits WHERE source_purchase_return_id = v_pr.id) THEN
      INSERT INTO vendor_credits (company_id, supplier_id, bill_id, source_purchase_return_id, source_purchase_invoice_id, journal_entry_id, credit_number, credit_date, status, subtotal, tax_amount, total_amount, applied_amount, branch_id, cost_center_id, warehouse_id, notes, original_currency, exchange_rate_used)
      VALUES (v_pr.company_id, v_pr.supplier_id, v_pr.bill_id, v_pr.id, v_pr.bill_id, v_pr.journal_entry_id,
        'VC-' || REPLACE(v_pr.return_number, 'PRET-', ''), v_pr.return_date, 'open',
        v_pr.subtotal, v_pr.tax_amount, v_pr.total_amount, 0,
        v_pr.branch_id, v_pr.cost_center_id, v_pr.warehouse_id,
        'إشعار دائن - اعتماد مرتجع ' || v_pr.return_number,
        -- v3.75.54 — **ولا تُخترَعُ عملة**: عملةُ المرتجعِ إن قالَها، وإلّا أساسُ
        -- شركتِه مقروءاً من صفِّها. واختراعُ «جنيه» هنا يُصدِّقُه مُشغِّلُ
        -- v3.75.52 فيصيرُ وسماً كاذباً لا يُكشَف.
        COALESCE(NULLIF(btrim(v_pr.original_currency), ''),
                 public.erp_company_base_currency(v_pr.company_id)),
        COALESCE(v_pr.exchange_rate_used, 1))
      RETURNING id INTO v_vc_id;
      INSERT INTO vendor_credit_items (vendor_credit_id, product_id, description, quantity, unit_price, tax_rate, discount_percent, line_total)
      SELECT v_vc_id, pri.product_id, pri.description, pri.quantity, pri.unit_price, pri.tax_rate, pri.discount_percent, pri.line_total
      FROM purchase_return_items pri WHERE pri.purchase_return_id = v_pr.id;
    END IF;
  END IF;

  UPDATE purchase_returns SET workflow_status = 'confirmed', confirmed_by = p_confirmed_by, confirmed_at = NOW(), confirmation_notes = p_notes
  WHERE id = p_purchase_return_id;

  v_result := jsonb_build_object('purchase_return_id', p_purchase_return_id, 'workflow_status', 'confirmed');
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Confirm delivery failed (rolled back): %', SQLERRM;
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- الفحصُ المرجعىُّ — خاصّيّةُ الجسدِ، وقيدٌ حىٌّ على الصفوفِ كلِّها
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_54_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $chk$
DECLARE
  n         int;
  n_vc      bigint;
  n_bad     bigint;
  n_returns bigint;
BEGIN
  -- (أ) الجسدُ لا يُسمّى عملةً بعينِها — والتعليقُ محجوبٌ قبلَ الحكم
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'confirm_purchase_return_delivery'
    AND regexp_replace(p.prosrc, '--[^\n]*', ' ', 'g') ~ '''(EGP|USD|SAR|EUR|GBP|AED|KWD|JOD|QAR|BHD|OMR)''';
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.54: confirm_purchase_return_delivery عادت تُسمّى عملةً بعينِها';
  END IF;

  -- (ب) وتنادى البيتَ الواحدَ برقمِ شركةِ الصفِّ — والذِّكرُ ليس نداءً
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'confirm_purchase_return_delivery'
    AND p.prosrc LIKE '%erp_company_base_currency(v_pr.company_id)%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'v3.75.54: لا تنادى البيتَ الواحدَ برقمِ شركةِ الصفّ';
  END IF;

  -- (ج) وما زالت بصلاحيّاتٍ كاملة — فنداؤها للبيتِ لا يحتاجُ منحةً لأحد
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'confirm_purchase_return_delivery' AND p.prosecdef;
  IF n <> 1 THEN
    RAISE EXCEPTION 'v3.75.54: صارت بصلاحيّاتِ مُنادِيها — فنداؤها للبيتِ يحتاجُ منحةً لم تُعلَن';
  END IF;

  -- (د) ولم يُوسَّعْ بلوغُ البيتِ الواحدِ صامتاً
  SELECT count(*) INTO n
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name IN ('erp_company_base_currency', 'assert_baseline_v3_75_54_check')
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.54: % صلاحيّةً مفتوحةً على البيتِ الواحدِ أو الفحص — والتوسيعُ يُعلَنُ ولا يُدَسّ', n;
  END IF;

  -- (هـ) وقيدٌ حىٌّ على الصفوفِ كلِّها: لا إشعارَ دائنٍ مولودٍ من مرتجعٍ
  --      يُوسَمُ بعملةٍ غيرِ عملةِ مرتجعِه. **ومعدودٌ لا مسكوتٌ عنه.**
  SELECT count(*),
         count(*) FILTER (WHERE upper(btrim(coalesce(vc.original_currency, ''))) IS DISTINCT FROM
                                upper(btrim(coalesce(pr.original_currency, ''))))
    INTO n_vc, n_bad
  FROM public.vendor_credits vc
  JOIN public.purchase_returns pr ON pr.id = vc.source_purchase_return_id;

  IF n_bad <> 0 THEN
    RAISE EXCEPTION 'v3.75.54: % إشعارَ دائنٍ موسومٌ بعملةٍ غيرِ عملةِ مرتجعِه (من %)', n_bad, n_vc;
  END IF;

  SELECT count(*) INTO n_returns FROM public.purchase_returns;

  RETURN 'v3.75.54 ok - جسدٌ بلا عملةٍ حرفيّة=1 · ينادى البيت=1 · بصلاحيّاتٍ كاملة=1 · بلا توسيعِ منحة=0'
         || ' · إشعاراتُ دائنٍ من مرتجع=' || n_vc || ' · موسومةٌ بغيرِ عملةِ مرتجعِها=' || n_bad
         || ' · مرتجعاتٌ فى القاعدة=' || n_returns;
END
$chk$;

COMMENT ON FUNCTION public.assert_baseline_v3_75_54_check() IS
  'يقيسُ فى كلِّ دفعةٍ أنّ منشئَ إشعارِ الدائنِ لا يخترعُ عملةً بل يقرأُ أساسَ شركةِ الصفّ، ومعه قيدٌ حىٌّ: لا إشعارَ دائنٍ مولودٍ من مرتجعٍ يُوسَمُ بعملةٍ غيرِ عملةِ مرتجعِه.';

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_54_check()  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_54_check() TO service_role;

-- ولا تُدَّعى دفعةٌ لم تُقَسْ
SELECT public.assert_baseline_v3_75_54_check();
SELECT public.assert_baseline_v3_75_53_check();
SELECT public.assert_baseline_v3_75_52_check();
