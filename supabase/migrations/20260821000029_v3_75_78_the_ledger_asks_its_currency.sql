-- =====================================================================
-- v3.75.78 — «وما يُكتَبُ فى الدفترِ يسألُ عملتَه»
--
-- الدفعةُ الرابعةُ من خطّةِ الخاناتِ العشريّة.
--
-- ما سبق:
--   v3.75.75 — للعملةِ بيتٌ واحدٌ يعرفُ عددَ خاناتِها.
--   v3.75.76 — واتّسعَ الدفترُ إلى أربعِ خاناتٍ ليحملَ ما تحملُه العملة.
--   v3.75.77 — وصارَ للتقريبِ بيتٌ فى القاعدةِ وبيتٌ فى الشيفرة، وحُوِّلَ أوّلُ
--               مسارِ ترحيلٍ حقيقىّ (post_expense_atomic، ثلاثةُ مواضع).
--
-- وهذه الدفعةُ تُحوِّلُ **تسعةَ مواضع** فى **خمسِ دوالّ**، اختيرَتْ بقاعدةٍ
-- واحدةٍ صريحة: أن يكونَ الموضعُ (أ) مالاً، (ب) له عملةٌ يمكنُ تسميتُها من
-- داخلِ الدالّةِ نفسِها، (ج) ولا يعودُ فيُقَصُّ بعدَ التقريبِ فى وعاءٍ أضيقَ
-- منه. فما اختلَّ فيه شرطٌ لم يُلمَسْ، وسُمِّىَ بدلَ أن يُخبَّأ.
--
--   • confirm_purchase_return_delivery_v2 — أربعةُ مواضع (عملةُ الدفتر)
--   • plw_pay_labour_payment              — موضعٌ واحد   (عملةُ الدفتر)
--   • run_fx_revaluation                  — موضعٌ واحد   (عملةُ الدفتر، وكانت
--                                            مقروءةً فى الدالّةِ سلفاً)
--   • process_purchase_return_atomic      — موضعٌ واحد   (عملةُ المستندِ الأصلىّ)
--   • process_purchase_return_multi_warehouse — موضعان   (عملةُ المستندِ الأصلىّ)
--
-- **ولم يُلمَسْ post_payroll_atomic وفيه موضعان** — وهذا سببُه، لا سهوٌ عنه:
--   متغيّراتُه المحلّيّةُ مُعلَنةٌ NUMERIC(15,2)، فلو قُرِّبَ المبلغُ بثلاثِ
--   خاناتٍ لعملةٍ ثلاثيّةٍ لعادَ الوعاءُ فقَصَّه إلى خانتين. وأسوأُ من ذلك:
--   لو حُوِّلَ طرفُ المَدينِ وحدَه لبقىَ الدائنُ محبوساً فى خانتين، فينشأُ قيدٌ
--   غيرُ متوازنٍ لشركةٍ كويتيّة. فنصفُ العلاجِ هنا أذى، لا تأجيل.
--   هذه فئةُ عيبٍ جديدةٌ مكتشَفةٌ اليوم — «أوعيةٌ محلّيّةٌ مُعلَنةٌ بخانتين» —
--   ولها دفعتُها المقيسةُ وحدَها.
--
-- ولا يحتاجُ البيتُ إذناً جديداً لأحد: الدوالُّ الخمسُ كلُّها SECURITY DEFINER
-- مملوكةٌ لـ postgres، فتُنادِيه بصلاحيّةِ مالكِها — بابٌ يُفتَحُ لمن يطرقُه
-- ولا أحدَ سواه (قانونُ v3.75.25/29/61).
--
-- **كيف تعملُ هذه الهجرة**: لا تُعيدُ كتابةَ نصِّ الدوالِّ من جديد — فنسخُ
-- عشراتِ الكيلوباياتِ باليدِ بابُ خطأٍ صامت. بل تقرأُ نصَّ كلِّ دالّةٍ من
-- القاعدةِ نفسِها، وتُطبِّقُ عليه مراسىَ محدّدةً مكتوبةً أدناه، **وتشترطُ أن
-- تُطابقَ كلُّ مرساةٍ عددَ المرّاتِ المُعلَنَ بالضبط** — لا أقلَّ ولا أكثر.
-- فإن تغيّرَ نصُّ دالّةٍ فى القاعدةِ عمّا جُرِّبَ عليه، لم تُطابقِ المرساةُ
-- فتُجهَضُ الهجرةُ كلُّها بدلَ أن تُعدِّلَ ما لم تره.
--
-- ولا يتغيّرُ رقمٌ واحدٌ اليوم — **وهذا مقيسٌ لا مفترَض**: كلُّ عملةٍ حيّةٍ فى
-- الإنتاجِ ذاتُ خانتين (خمسُ شركاتٍ بالجنيهِ وواحدةٌ بالريال، ومرتجعاتُ الشراءِ
-- كلُّها بالجنيه)، والبرهانُ أسفلَه يُعيدُ حسابَ **كلِّ** قيمةِ مالٍ حقيقيّةٍ
-- تمرُّ بهذه المواضعِ التسعةِ بالصيغتين ويقارنُهما. قرشٌ واحدٌ يُجهضُ الهجرةَ.
--
-- لا جدولَ يُعدَّل، ولا صفَّ يُحذَفُ أو يُكتَب، ولا إعادةَ ملءٍ لأىِّ عمود.
-- =====================================================================

-- ── (١) بصمةُ ما قبلَ الجراحة: النصُّ والمالكُ والصلاحيّةُ ونوعُ التنفيذ ──
DROP TABLE IF EXISTS _v37578_before_fn;
CREATE TEMP TABLE _v37578_before_fn ON COMMIT DROP AS
SELECT p.oid                                             AS oid,
       p.proname::text                                   AS proname,
       pg_get_functiondef(p.oid)                         AS def,
       p.prosecdef                                       AS secdef,
       pg_get_userbyid(p.proowner)::text                  AS owner,
       COALESCE(p.proacl::text, '(default)')             AS acl,
       array_to_string(p.proconfig, ' ; ')               AS settings,
       p.provolatile::text                               AS volatility,
       pg_get_function_identity_arguments(p.oid)         AS args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ($erb$confirm_purchase_return_delivery_v2$erb$, $erb$plw_pay_labour_payment$erb$, $erb$run_fx_revaluation$erb$, $erb$process_purchase_return_atomic$erb$, $erb$process_purchase_return_multi_warehouse$erb$);

-- ── (٢) بصمةُ ما قبلَ الجراحة: مجاميعُ المالِ فى الجداولِ التى تمسُّها ──
DROP TABLE IF EXISTS _v37578_before_sums;
CREATE TEMP TABLE _v37578_before_sums ON COMMIT DROP AS
SELECT 'purchase_returns' AS t, count(*) AS n, COALESCE(sum(subtotal),0) + COALESCE(sum(tax_amount),0) + COALESCE(sum(total_amount),0) AS s FROM public.purchase_returns
UNION ALL SELECT 'purchase_return_items', count(*), COALESCE(sum(line_total),0) FROM public.purchase_return_items
UNION ALL SELECT 'vendor_credits', count(*), COALESCE(sum(subtotal),0) + COALESCE(sum(tax_amount),0) + COALESCE(sum(total_amount),0) FROM public.vendor_credits
UNION ALL SELECT 'vendor_credit_items', count(*), COALESCE(sum(line_total),0) FROM public.vendor_credit_items
UNION ALL SELECT 'production_labour_payments', count(*), COALESCE(sum(total_amount),0) + COALESCE(sum(estimated_amount),0) FROM public.production_labour_payments
UNION ALL SELECT 'purchase_return_warehouse_allocations', count(*), COALESCE(sum(subtotal),0) + COALESCE(sum(tax_amount),0) + COALESCE(sum(total_amount),0) FROM public.purchase_return_warehouse_allocations
UNION ALL SELECT 'journal_entry_lines', count(*), COALESCE(sum(debit_amount),0) + COALESCE(sum(credit_amount),0) FROM public.journal_entry_lines;


-- ── (٣) المراسى: كلُّ استبدالٍ بنصِّه، ومعه عددُ المرّاتِ الذى يجبُ أن يُطابقَه ──
DROP TABLE IF EXISTS _v37578_edits;
CREATE TEMP TABLE _v37578_edits (
  fn text, ord int, tag text, before_txt text, after_txt text, times int
) ON COMMIT DROP;

INSERT INTO _v37578_edits (fn, ord, tag, before_txt, after_txt, times) VALUES
  ($erb$confirm_purchase_return_delivery_v2$erb$, 1, $erb$declare$erb$, $erb$  v_refund_executed BOOLEAN := false;
BEGIN
$erb$, $erb$  v_refund_executed BOOLEAN := false;
  v_base_ccy TEXT;
BEGIN
$erb$, 1),
  ($erb$confirm_purchase_return_delivery_v2$erb$, 2, $erb$assign$erb$, $erb$  v_company_id := v_pr.company_id;
  v_supplier_id := v_pr.supplier_id;
$erb$, $erb$  v_company_id := v_pr.company_id;
  -- v3.75.78 — العملةُ التى يُقرَّبُ بها هذا المستند: تُقرَأُ مرّةً من البيتِ الواحد.
  v_base_ccy := public.erp_company_base_currency(v_company_id);
  v_supplier_id := v_pr.supplier_id;
$erb$, 1),
  ($erb$confirm_purchase_return_delivery_v2$erb$, 3, $erb$cost_gap$erb$, $erb$ROUND(v_fifo_cost - COALESCE(v_pr.subtotal, 0), 2)$erb$, $erb$public.erp_round_money(v_fifo_cost - COALESCE(v_pr.subtotal, 0), v_base_ccy)$erb$, 1),
  ($erb$confirm_purchase_return_delivery_v2$erb$, 4, $erb$vc_sub$erb$, $erb$ROUND(COALESCE(v_pr.subtotal, 0) * v_vc_ratio, 2)$erb$, $erb$public.erp_round_money(COALESCE(v_pr.subtotal, 0) * v_vc_ratio, v_base_ccy)$erb$, 1),
  ($erb$confirm_purchase_return_delivery_v2$erb$, 5, $erb$vc_tax$erb$, $erb$ROUND(COALESCE(v_pr.tax_amount, 0) * v_vc_ratio, 2)$erb$, $erb$public.erp_round_money(COALESCE(v_pr.tax_amount, 0) * v_vc_ratio, v_base_ccy)$erb$, 1),
  ($erb$confirm_purchase_return_delivery_v2$erb$, 6, $erb$vc_item$erb$, $erb$ROUND(COALESCE(pri.line_total, 0) * v_vc_ratio, 2)$erb$, $erb$public.erp_round_money(COALESCE(pri.line_total, 0) * v_vc_ratio, v_base_ccy)$erb$, 1),
  ($erb$plw_pay_labour_payment$erb$, 1, $erb$declare$erb$, $erb$  v_member_branch UUID; v_order_no TEXT;
BEGIN
$erb$, $erb$  v_member_branch UUID; v_order_no TEXT;
  v_base_ccy TEXT;
BEGIN
$erb$, 1),
  ($erb$plw_pay_labour_payment$erb$, 2, $erb$assign$erb$, $erb$  PERFORM public.assert_company_access(p_company_id);
  v_role := public.plw_caller_role(p_company_id);
$erb$, $erb$  PERFORM public.assert_company_access(p_company_id);
  -- v3.75.78 — العملةُ التى يُقرَّبُ بها هذا المستند: تُقرَأُ مرّةً من البيتِ الواحد.
  v_base_ccy := public.erp_company_base_currency(p_company_id);
  v_role := public.plw_caller_role(p_company_id);
$erb$, 1),
  ($erb$plw_pay_labour_payment$erb$, 3, $erb$variance$erb$, $erb$ROUND(v_p.total_amount - v_p.estimated_amount, 2)$erb$, $erb$public.erp_round_money(v_p.total_amount - v_p.estimated_amount, v_base_ccy)$erb$, 1),
  ($erb$run_fx_revaluation$erb$, 1, $erb$total_delta$erb$, $erb$ROUND(v_total_delta, 2)$erb$, $erb$public.erp_round_money(v_total_delta, v_base_ccy)$erb$, 1),
  ($erb$process_purchase_return_atomic$erb$, 1, $erb$declare$erb$, $erb$  v_rate            NUMERIC;
  v_base            TEXT;
$erb$, $erb$  v_rate            NUMERIC;
  v_base            TEXT;
  v_orig_ccy        TEXT;
$erb$, 1),
  ($erb$process_purchase_return_atomic$erb$, 2, $erb$assign$erb$, $erb$    RAISE EXCEPTION 'v3.74.941: سعرُ صرفٍ غيرُ موجب (%) — لا يُحوَّل به مال.', v_rate;
  END IF;
$erb$, $erb$    RAISE EXCEPTION 'v3.74.941: سعرُ صرفٍ غيرُ موجب (%) — لا يُحوَّل به مال.', v_rate;
  END IF;
  -- v3.75.78 — عملةُ المستندِ الأصلىِّ تُقرَأُ مرّةً واحدة، ويُقرَّبُ بها ما يُحسَبُ بها.
  v_orig_ccy := COALESCE(NULLIF(p_purchase_return->>'original_currency', ''), v_base);
$erb$, 1),
  ($erb$process_purchase_return_atomic$erb$, 3, $erb$line_tax$erb$, $erb$ROUND(v_priced.line_total * v_priced.tax_rate / 100.0, 2)$erb$, $erb$public.erp_round_money(v_priced.line_total * v_priced.tax_rate / 100.0, v_orig_ccy)$erb$, 1),
  ($erb$process_purchase_return_atomic$erb$, 4, $erb$reuse$erb$, $erb$    COALESCE(NULLIF(p_purchase_return->>'original_currency', ''), v_base),
$erb$, $erb$    v_orig_ccy,
$erb$, 1),
  ($erb$process_purchase_return_multi_warehouse$erb$, 1, $erb$declare$erb$, $erb$  v_rate           NUMERIC;
  v_g_sub          NUMERIC;
$erb$, $erb$  v_rate           NUMERIC;
  v_orig_ccy       TEXT;
  v_g_sub          NUMERIC;
$erb$, 1),
  ($erb$process_purchase_return_multi_warehouse$erb$, 2, $erb$assign$erb$, $erb$    RAISE EXCEPTION 'v3.74.941: سعرُ صرفٍ غيرُ موجب (%) — لا يُحوَّل به مال.', v_rate;
  END IF;
$erb$, $erb$    RAISE EXCEPTION 'v3.74.941: سعرُ صرفٍ غيرُ موجب (%) — لا يُحوَّل به مال.', v_rate;
  END IF;
  -- v3.75.78 — عملةُ المستندِ الأصلىِّ تُقرَأُ مرّةً واحدة، ويُقرَّبُ بها ما يُحسَبُ بها.
  v_orig_ccy := COALESCE(NULLIF(p_purchase_return->>'original_currency', ''), v_base);
$erb$, 1),
  ($erb$process_purchase_return_multi_warehouse$erb$, 3, $erb$line_tax$erb$, $erb$ROUND(v_priced.line_total * v_priced.tax_rate / 100.0, 2)$erb$, $erb$public.erp_round_money(v_priced.line_total * v_priced.tax_rate / 100.0, v_orig_ccy)$erb$, 2),
  ($erb$process_purchase_return_multi_warehouse$erb$, 4, $erb$reuse$erb$, $erb$    COALESCE(NULLIF(p_purchase_return->>'original_currency', ''), v_base),
$erb$, $erb$    v_orig_ccy,
$erb$, 1);

-- ── (٤) الجراحة: يُقرأُ نصُّ الدالّةِ من القاعدةِ ثمَّ يُعادُ بناؤه ──
DO $mig$
DECLARE
  r          record;
  e          record;
  v_def      text;
  v_cnt      int;
  v_sites    int;
  v_calls    int;
  v_want     int;
  v_applied  int := 0;
BEGIN
  FOR r IN SELECT * FROM _v37578_before_fn ORDER BY proname LOOP
    v_def := r.def;

    FOR e IN SELECT * FROM _v37578_edits WHERE fn = r.proname ORDER BY ord LOOP
      v_cnt := (length(v_def) - length(replace(v_def, e.before_txt, '')))
               / length(e.before_txt);
      IF v_cnt <> e.times THEN
        RAISE EXCEPTION
          'ANCHOR_MISMATCH: [%/%] وُجِدَتِ المرساةُ % مرّةً والمطلوبُ % — الهجرةُ تُجهَض ولا تُعدِّلُ ما لم ترَه.',
          r.proname, e.tag, v_cnt, e.times USING ERRCODE = 'P0001';
      END IF;
      v_def := replace(v_def, e.before_txt, e.after_txt);
      v_applied := v_applied + 1;
    END LOOP;

    IF v_def = r.def THEN
      RAISE EXCEPTION 'NO_CHANGE: % لم يتغيّرْ نصُّها — مرساةٌ بلا أثر.', r.proname
        USING ERRCODE = 'P0001';
    END IF;

    EXECUTE v_def;
  END LOOP;

  SELECT count(*) INTO v_cnt FROM _v37578_edits;
  IF v_applied <> v_cnt THEN
    RAISE EXCEPTION 'EDITS_SKIPPED: طُبِّقَ % من % مرساة.', v_applied, v_cnt
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE 'v3.75.78: طُبِّقَتْ % مرساةً على 5 دوالّ.', v_applied;
END $mig$;

-- ═════════════════════════════════════════════════════════════════════
-- (٥) البرهانُ داخلَ معاملةِ الهجرةِ نفسِها — وأىُّ إخفاقٍ يُجهضُها كلَّها
-- ═════════════════════════════════════════════════════════════════════
DO $proof$
DECLARE
  r          record;
  v_bad      bigint;
  v_n        bigint;
  v_ccy      text;
  v_old      numeric;
  v_new      numeric;
  v_sites    int;
  v_calls    int;
  v_raised   boolean;
  v_detail   text;
  v_checked  bigint := 0;
BEGIN
  -- ── (أ) لم يتغيّرْ رقمٌ واحدٌ: تُعادُ الصيغتانِ على كلِّ قيمةِ مالٍ حقيقيّةٍ ──
  --     تمرُّ بالمواضعِ التسعة، بعملةِ صاحبِها الحقيقيّةِ لا بعملةٍ مفترَضة.
  FOR r IN
    WITH vals AS (
      SELECT c.base_currency AS ccy, pr.subtotal AS v, 'purchase_returns.subtotal' AS src
        FROM public.purchase_returns pr JOIN public.companies c ON c.id = pr.company_id
      UNION ALL SELECT c.base_currency, pr.tax_amount, 'purchase_returns.tax_amount'
        FROM public.purchase_returns pr JOIN public.companies c ON c.id = pr.company_id
      UNION ALL SELECT c.base_currency, pr.total_amount, 'purchase_returns.total_amount'
        FROM public.purchase_returns pr JOIN public.companies c ON c.id = pr.company_id
      UNION ALL SELECT c.base_currency, pri.line_total, 'purchase_return_items.line_total'
        FROM public.purchase_return_items pri
        JOIN public.purchase_returns pr ON pr.id = pri.purchase_return_id
        JOIN public.companies c ON c.id = pr.company_id
      UNION ALL SELECT c.base_currency, vc.subtotal, 'vendor_credits.subtotal'
        FROM public.vendor_credits vc JOIN public.companies c ON c.id = vc.company_id
      UNION ALL SELECT c.base_currency, vc.tax_amount, 'vendor_credits.tax_amount'
        FROM public.vendor_credits vc JOIN public.companies c ON c.id = vc.company_id
      UNION ALL SELECT c.base_currency, vci.line_total, 'vendor_credit_items.line_total'
        FROM public.vendor_credit_items vci
        JOIN public.vendor_credits vc ON vc.id = vci.vendor_credit_id
        JOIN public.companies c ON c.id = vc.company_id
      UNION ALL SELECT c.base_currency, flc.total_cost, 'fifo_lot_consumptions.total_cost'
        FROM public.fifo_lot_consumptions flc JOIN public.companies c ON c.id = flc.company_id
      UNION ALL SELECT c.base_currency, plp.total_amount, 'production_labour_payments.total_amount'
        FROM public.production_labour_payments plp JOIN public.companies c ON c.id = plp.company_id
      UNION ALL SELECT c.base_currency, plp.estimated_amount, 'production_labour_payments.estimated_amount'
        FROM public.production_labour_payments plp JOIN public.companies c ON c.id = plp.company_id
      UNION ALL SELECT c.base_currency, plp.total_amount - COALESCE(plp.estimated_amount, 0), 'plw.variance'
        FROM public.production_labour_payments plp JOIN public.companies c ON c.id = plp.company_id
      UNION ALL SELECT c.base_currency, jel.debit_amount, 'journal_entry_lines.debit_amount'
        FROM public.journal_entry_lines jel
        JOIN public.journal_entries je ON je.id = jel.journal_entry_id
        JOIN public.companies c ON c.id = je.company_id
      UNION ALL SELECT c.base_currency, jel.credit_amount, 'journal_entry_lines.credit_amount'
        FROM public.journal_entry_lines jel
        JOIN public.journal_entries je ON je.id = jel.journal_entry_id
        JOIN public.companies c ON c.id = je.company_id
      UNION ALL SELECT COALESCE(NULLIF(btrim(pr.original_currency), ''), c.base_currency),
                       bi.line_total * COALESCE(bi.tax_rate, 0) / 100.0, 'bill_items.line_tax'
        FROM public.bill_items bi
        JOIN public.bills b ON b.id = bi.bill_id
        JOIN public.companies c ON c.id = b.company_id
        LEFT JOIN public.purchase_returns pr ON pr.bill_id = b.id
      UNION ALL SELECT COALESCE(NULLIF(btrim(pr.original_currency), ''), c.base_currency),
                       pr.original_tax_amount, 'purchase_returns.original_tax_amount'
        FROM public.purchase_returns pr JOIN public.companies c ON c.id = pr.company_id
    )
    SELECT src, ccy, v, round(v, 2) AS old_way, public.erp_round_money(v, ccy) AS new_way
      FROM vals
     WHERE v IS NOT NULL AND ccy IS NOT NULL AND btrim(ccy) <> ''
  LOOP
    v_checked := v_checked + 1;
    IF r.old_way IS DISTINCT FROM r.new_way THEN
      RAISE EXCEPTION
        'MONEY_VALUE_CHANGED: % بعملة % — القيمةُ % كانت % وصارت %. الهجرةُ تُجهَض.',
        r.src, r.ccy, r.v, r.old_way, r.new_way USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  IF v_checked = 0 THEN
    RAISE EXCEPTION 'PROOF_EMPTY: لم تُقَسْ ولا قيمةٌ واحدة — برهانٌ فارغٌ لا يُقبَل.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── (ب) وحدودُ التقريبِ نفسُها تُختبَرُ بكلِّ عملةٍ حيّةٍ فى القاعدة ──
  FOR v_ccy IN SELECT DISTINCT upper(btrim(base_currency)) FROM public.companies
                WHERE base_currency IS NOT NULL AND btrim(base_currency) <> ''
  LOOP
    FOREACH v_old IN ARRAY ARRAY[
      0, 0.001, 0.004, 0.005, 0.006, 0.009, 0.01, 0.014, 0.015,
      1.005, 2.675, 10.125, 99.994, 99.995, 1234.5678, -2.675
    ]::numeric[]
    LOOP
      v_new := public.erp_round_money(v_old, v_ccy);
      IF v_new IS DISTINCT FROM round(v_old, 2) THEN
        RAISE EXCEPTION
          'ROUND_HOME_NOT_IDENTICAL: بعملة % القيمةُ % — القديمُ % والجديدُ %.',
          v_ccy, v_old, round(v_old, 2), v_new USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END LOOP;

  -- ── (ج) وأنَّ العلاجَ علاجٌ فعلاً: عملةٌ ثلاثيّةٌ وأخرى بلا كسور ──
  IF public.erp_round_money(10.1254, 'KWD') IS DISTINCT FROM 10.125 THEN
    RAISE EXCEPTION 'CURE_NOT_PROVEN: الدينارُ الكويتىُّ لا يُقرَّبُ لثلاثِ خانات (%).',
      public.erp_round_money(10.1254, 'KWD') USING ERRCODE = 'P0001';
  END IF;
  IF public.erp_round_money(1234.56, 'JPY') IS DISTINCT FROM 1235 THEN
    RAISE EXCEPTION 'CURE_NOT_PROVEN: الينُّ لا يُقرَّبُ بلا كسور (%).',
      public.erp_round_money(1234.56, 'JPY') USING ERRCODE = 'P0001';
  END IF;

  -- ── (د) وأنَّه يصرخُ ولا يخترعُ حين لا يعرفُ العملة ──
  v_raised := false;
  BEGIN PERFORM public.erp_round_money(1, 'ZZZ');
  EXCEPTION WHEN OTHERS THEN v_raised := true; END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'HOME_INVENTS: البيتُ لم يصرخْ أمامَ عملةٍ مجهولة.' USING ERRCODE = 'P0001';
  END IF;
  v_raised := false;
  BEGIN PERFORM public.erp_round_money(1, '');
  EXCEPTION WHEN OTHERS THEN v_raised := true; END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'HOME_INVENTS: البيتُ لم يصرخْ أمامَ عملةٍ فارغة.' USING ERRCODE = 'P0001';
  END IF;

  -- ── (هـ) وأنَّ الدوالَّ الخمسَ حُوِّلَتْ فعلاً: لا ROUND(…,2) ولها مُنادٍ ──
  FOR r IN SELECT t.nm, t.want_calls FROM (VALUES ($erb$confirm_purchase_return_delivery_v2$erb$::text, 4::int), ($erb$plw_pay_labour_payment$erb$::text, 1::int), ($erb$run_fx_revaluation$erb$::text, 1::int), ($erb$process_purchase_return_atomic$erb$::text, 1::int), ($erb$process_purchase_return_multi_warehouse$erb$::text, 2::int)) AS t(nm, want_calls) LOOP
    SELECT (SELECT count(*) FROM regexp_matches(pg_get_functiondef(p.oid),
                                                'round\s*\([^;]{0,120}?,\s*2\s*\)', 'gi')),
           (length(pg_get_functiondef(p.oid))
             - length(replace(pg_get_functiondef(p.oid), 'erp_round_money', '')))
             / length('erp_round_money')
      INTO v_sites, v_calls
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.nm;
    IF v_sites IS NULL THEN
      RAISE EXCEPTION 'FUNCTION_MISSING: % اختفت بعدَ الجراحة.', r.nm USING ERRCODE = 'P0001';
    END IF;
    IF v_sites <> 0 THEN
      RAISE EXCEPTION 'HAND_ROUNDING_LEFT: بقىَ % موضعَ ROUND(…,2) فى %.', v_sites, r.nm
        USING ERRCODE = 'P0001';
    END IF;
    IF v_calls <> r.want_calls THEN
      RAISE EXCEPTION 'CALLER_COUNT_CHANGED: % ينادى البيتَ % مرّةً والمتوقَّعُ %.',
        r.nm, v_calls, r.want_calls USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- ── (و) ولم يتبدّلْ مالكٌ ولا صلاحيّةٌ ولا نوعُ تنفيذٍ ولا مسارُ بحثٍ ولا توقيع ──
  FOR r IN
    SELECT b.proname, b.secdef AS old_secdef, b.owner AS old_owner, b.acl AS old_acl,
           b.settings AS old_settings, b.volatility AS old_vol, b.args AS old_args,
           p.prosecdef AS new_secdef, pg_get_userbyid(p.proowner)::text AS new_owner,
           COALESCE(p.proacl::text, '(default)') AS new_acl,
           array_to_string(p.proconfig, ' ; ') AS new_settings,
           p.provolatile::text AS new_vol,
           pg_get_function_identity_arguments(p.oid) AS new_args
      FROM _v37578_before_fn b
      JOIN pg_proc p ON p.oid = b.oid
  LOOP
    v_detail := '';
    IF r.old_secdef   IS DISTINCT FROM r.new_secdef   THEN v_detail := v_detail || ' secdef'; END IF;
    IF r.old_owner    IS DISTINCT FROM r.new_owner    THEN v_detail := v_detail || ' owner'; END IF;
    IF r.old_acl      IS DISTINCT FROM r.new_acl      THEN v_detail := v_detail || ' acl(' || r.old_acl || ' -> ' || r.new_acl || ')'; END IF;
    IF r.old_settings IS DISTINCT FROM r.new_settings THEN v_detail := v_detail || ' search_path'; END IF;
    IF r.old_vol      IS DISTINCT FROM r.new_vol      THEN v_detail := v_detail || ' volatility'; END IF;
    IF r.old_args     IS DISTINCT FROM r.new_args     THEN v_detail := v_detail || ' signature'; END IF;
    IF v_detail <> '' THEN
      RAISE EXCEPTION 'FUNCTION_ATTRIBUTE_CHANGED: % —%.', r.proname, v_detail USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM _v37578_before_fn;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'BEFORE_FINGERPRINT_INCOMPLETE: بُصِمَتْ % دالّةً لا 5.', v_n
      USING ERRCODE = 'P0001';
  END IF;

  -- ── (ز) ولم يُمَسَّ صفٌّ واحد: الأعدادُ والمجاميعُ كما كانت ──
  SELECT count(*) INTO v_bad FROM (
    SELECT b.t
      FROM _v37578_before_sums b
      JOIN (
        SELECT 'purchase_returns' AS t, count(*) AS n, COALESCE(sum(subtotal),0) + COALESCE(sum(tax_amount),0) + COALESCE(sum(total_amount),0) AS s FROM public.purchase_returns
        UNION ALL SELECT 'purchase_return_items', count(*), COALESCE(sum(line_total),0) FROM public.purchase_return_items
        UNION ALL SELECT 'vendor_credits', count(*), COALESCE(sum(subtotal),0) + COALESCE(sum(tax_amount),0) + COALESCE(sum(total_amount),0) FROM public.vendor_credits
        UNION ALL SELECT 'vendor_credit_items', count(*), COALESCE(sum(line_total),0) FROM public.vendor_credit_items
        UNION ALL SELECT 'production_labour_payments', count(*), COALESCE(sum(total_amount),0) + COALESCE(sum(estimated_amount),0) FROM public.production_labour_payments
        UNION ALL SELECT 'purchase_return_warehouse_allocations', count(*), COALESCE(sum(subtotal),0) + COALESCE(sum(tax_amount),0) + COALESCE(sum(total_amount),0) FROM public.purchase_return_warehouse_allocations
        UNION ALL SELECT 'journal_entry_lines', count(*), COALESCE(sum(debit_amount),0) + COALESCE(sum(credit_amount),0) FROM public.journal_entry_lines
      ) a ON a.t = b.t
     WHERE a.n IS DISTINCT FROM b.n OR a.s IS DISTINCT FROM b.s
  ) d;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'DATA_TOUCHED: تبدّلَ % جدولاً — الهجرةُ لا تكتبُ صفّاً.', v_bad
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE 'v3.75.78 مبرهَنة: % قيمةَ مالٍ حقيقيّةٍ أُعيدَ حسابُها بالصيغتين فتطابقتا؛ 9 مواضعَ حُوِّلَتْ فى 5 دوالّ؛ ولا مالكَ ولا صلاحيّةَ ولا صفَّ تبدّل.', v_checked;
END $proof$;
