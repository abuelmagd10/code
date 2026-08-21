-- =====================================================================
-- v3.75.79 — «والوعاءُ يتّسعُ لما تحملُه العملة»
--
-- الدفعةُ الخامسةُ من خطّةِ الخاناتِ العشريّة.
--
-- ما سبق:
--   v3.75.75 — للعملةِ بيتٌ واحدٌ يعرفُ عددَ خاناتِها.
--   v3.75.76 — واتّسعَ الدفترُ إلى أربعِ خاناتٍ (226 عمودَ مال).
--   v3.75.77 — وصارَ للتقريبِ بيتٌ فى القاعدةِ وبيتٌ فى الشيفرة (3 مواضع).
--   v3.75.78 — وحُوِّلَتْ تسعةُ مواضعَ فى خمسِ دوالٍّ تكتبُ فى الدفتر،
--              **وامتنعَتْ عن post_payroll_atomic عمداً** لأنَّ أوعيتَه
--              المحلّيّةَ تقصُّ ما يُقرَّبُ — ومن ذلك الامتناعِ وُلِدَتْ هذه.
--
-- **العيبُ الذى تُعالجُه**: متغيّرٌ محلّىٌّ مُعلَنٌ NUMERIC(‎…,2) يقصُّ المالَ
-- إلى خانتَين **بعدَ** أن يُقرِّبَه البيتُ صحيحاً. فلو دخلت شركةٌ كويتيّةٌ
-- اتّسعَ لها العمودُ (v3.75.76) وسألَ التقريبُ عملتَها (v3.75.77/78) ثمَّ
-- **قصَّها الوعاءُ فى الطريق**. وأخطرُ منه: لو اتّسعَ طرفُ المَدينِ وبقىَ
-- الدائنُ محبوساً بخانتَين لنشأَ **قيدٌ غيرُ متوازن**.
--
-- ولذلك تتّسعُ الأوعيةُ **كلُّها معاً فى الدالّةِ الواحدة**، لا نصفُها:
--
--   • post_payroll_atomic         — سبعةُ أوعية + موضعَا تقريب
--     (المَدينُ والدائنُ يتّسعانِ فى النَّفَسِ الواحد، فلا يختلُّ توازن)
--   • plw_create_labour_payment   — ثلاثةُ أوعية + موضعُ تقريب
--   • plw_approve_labour_payment  — وعاءٌ + موضعَا تقريبٍ فى المقارنة
--   • commission_attach_to_payroll_atomic — وعاءٌ + تقريبٌ صريحٌ للمُبلَّغ
--   • plw_submit_labour_payment   — وعاءٌ (توسيعٌ فقط: مجموعُ عمودٍ مخزَّنٍ
--     دقيقٌ بذاتِه فلا يحتاجُ تقريباً — والوعاءُ وحدَه كان الجانى)
--
--   الجملة: **13 وعاءً يتّسع، و5 مواضعِ تقريبٍ تُحوَّل، فى 5 دوالّ**.
--
-- ولا حاجةَ لمنحةٍ جديدة: الخمسُ كلُّها SECURITY DEFINER مملوكةٌ لـ postgres
-- (قانونُ v3.75.25/29/61).
--
-- **واستُثنِىَ ثلاثةٌ بقياسٍ لا بسهو**:
--
--   (١) approve_shareholder_drawing (وعاءٌ) و convert_purchase_request_to_po
--       (ثلاثةُ أوعية): **نصُّهما المخزَّنُ فى القاعدةِ بنهاياتِ أسطرٍ CRLF**
--       بينما مرآةُ الدوالِّ فى المستودعِ مُسوّاةٌ إلى LF. فالمرساةُ المأخوذةُ
--       من المرآةِ لا تُطابقُ نصَّ القاعدةِ حرفاً بحرف — **فرفضتِ الهجرةُ أن
--       تلمسَهما، وهذا هو القانونُ يعملُ لا يُخالَف**. وهذا انحرافٌ لم يُلحَظْ
--       من قبلُ لأنَّ حارسَ المرآةِ يُسوّى نهاياتِ الأسطرِ قبلَ المقارنة.
--       وتسويةُ نهاياتِ الأسطرِ داخلَ جسدِ دالّةٍ تغييرٌ لا يُقاسُ بلا فحصِ كلِّ
--       نصٍّ مقتبَسٍ فيها — فله دفعتُه وحدَه.
--
--   (٢) validate_three_way_matching (وعاءٌ): وعاؤها ليس مالاً محسوباً بل
--       **عتبةٌ مكتوبة** (`0.01`) تفترضُ خانتَين. وتوسيعُ وعاءِ عتبةٍ زينةٌ لا
--       علاج — فالعيبُ فى الرقمِ لا فى الوعاء. وهى فئةٌ ثالثةٌ تُسمَّى اليومَ
--       وتُعَدُّ وتُثبَّت: **73 عتبةً مكتوبةً فى 52 دالّة**.
--
-- ولا يتغيَّرُ رقمٌ واحدٌ اليوم — **مقيسٌ لا مفترَض**: مُسِحَتْ كلُّ الأعمدةِ
-- التى تُغذّى هذه الأوعية (323 قيمةً حقيقيّةً قِيسَتْ على الإنتاج) فلم يحملْ **ولا واحدٌ**
-- أكثرَ من خانتَين، وكذلك القيمُ المشتقّةُ (تكلفةُ التحويل، ضريبةُ الطلب).
-- والبرهانُ أسفلَه يُعيدُ القياسَ داخلَ المعاملةِ ويُجهضُها على أوّلِ فرق.
--
-- لا جدولَ يُعدَّل، ولا صفَّ يُحذَفُ أو يُكتَب، ولا إعادةَ ملءٍ لأىِّ عمود.
-- =====================================================================

-- ── (١) بصمةُ ما قبلَ الجراحة: النصُّ والمالكُ والصلاحيّةُ ونوعُ التنفيذ ──
DROP TABLE IF EXISTS _v37579_before_fn;
CREATE TEMP TABLE _v37579_before_fn ON COMMIT DROP AS
SELECT p.oid                                             AS oid,
       p.proname::text                                   AS proname,
       pg_get_functiondef(p.oid)                         AS def,
       p.prosecdef                                       AS secdef,
       pg_get_userbyid(p.proowner)::text                 AS owner,
       COALESCE(p.proacl::text, '(default)')             AS acl,
       array_to_string(p.proconfig, ' ; ')               AS settings,
       p.provolatile::text                               AS volatility,
       pg_get_function_identity_arguments(p.oid)         AS args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ($erb$commission_attach_to_payroll_atomic$erb$, $erb$plw_approve_labour_payment$erb$, $erb$plw_create_labour_payment$erb$, $erb$plw_submit_labour_payment$erb$, $erb$post_payroll_atomic$erb$);

-- ── (٢) بصمةُ ما قبلَ الجراحة: مجاميعُ المالِ فى الجداولِ التى تمسُّها ──
DROP TABLE IF EXISTS _v37579_before_sums;
CREATE TEMP TABLE _v37579_before_sums ON COMMIT DROP AS
SELECT 'payslips' AS t, count(*) AS n,
       COALESCE(sum(COALESCE(net_salary,0)+COALESCE(base_salary,0)+COALESCE(allowances,0)
                   +COALESCE(bonuses,0)+COALESCE(sales_bonus,0)+COALESCE(commission,0)
                   +COALESCE(advances,0)+COALESCE(insurance,0)+COALESCE(deductions,0)),0) AS s
  FROM public.payslips
UNION ALL SELECT 'shareholder_drawings', count(*), COALESCE(sum(COALESCE(amount,0)+COALESCE(base_amount,0)),0) FROM public.shareholder_drawings
UNION ALL SELECT 'production_labour_payments', count(*), COALESCE(sum(COALESCE(total_amount,0)+COALESCE(estimated_amount,0)),0) FROM public.production_labour_payments
UNION ALL SELECT 'production_labour_payment_lines', count(*), COALESCE(sum(amount),0) FROM public.production_labour_payment_lines
UNION ALL SELECT 'purchase_orders', count(*), COALESCE(sum(COALESCE(subtotal,0)+COALESCE(tax_amount,0)+COALESCE(total_amount,0)),0) FROM public.purchase_orders
UNION ALL SELECT 'commission_ledger', count(*), COALESCE(sum(amount),0) FROM public.commission_ledger
UNION ALL SELECT 'journal_entry_lines', count(*), COALESCE(sum(debit_amount),0) + COALESCE(sum(credit_amount),0) FROM public.journal_entry_lines;


-- ── (٣) المراسى: كلُّ استبدالٍ بنصِّه، ومعه عددُ المرّاتِ الذى يجبُ أن يُطابقَه ──
DROP TABLE IF EXISTS _v37579_edits;
CREATE TEMP TABLE _v37579_edits (
  fn text, ord int, tag text, before_txt text, after_txt text, times int
) ON COMMIT DROP;

INSERT INTO _v37579_edits (fn, ord, tag, before_txt, after_txt, times) VALUES
  ($erb$commission_attach_to_payroll_atomic$erb$, 1, $erb$widen$erb$, $erb$  v_total NUMERIC(15,2) := 0;
$erb$, $erb$  v_total NUMERIC(18,4) := 0;
  v_base_ccy TEXT;
$erb$, 1),
  ($erb$commission_attach_to_payroll_atomic$erb$, 2, $erb$assign$erb$, $erb$BEGIN
  PERFORM public.assert_company_access(p_company_id);
$erb$, $erb$BEGIN
  PERFORM public.assert_company_access(p_company_id);
  -- v3.75.79 — العملةُ التى يُقرَّبُ بها هذا المستند: تُقرَأُ مرّةً من البيتِ الواحد.
  v_base_ccy := public.erp_company_base_currency(p_company_id);
$erb$, 1),
  ($erb$commission_attach_to_payroll_atomic$erb$, 3, $erb$report$erb$, $erb$    'employeesUpdated', v_updated, 'totalCommissionAdded', v_total,
$erb$, $erb$    'employeesUpdated', v_updated,
    'totalCommissionAdded', public.erp_round_money(v_total, v_base_ccy),
$erb$, 1),
  ($erb$plw_approve_labour_payment$erb$, 1, $erb$widen$erb$, $erb$DECLARE v_p RECORD; v_role TEXT; v_uid UUID := auth.uid(); v_sum NUMERIC(15,2);
$erb$, $erb$DECLARE v_p RECORD; v_role TEXT; v_uid UUID := auth.uid(); v_sum NUMERIC(18,4);
  v_base_ccy TEXT;
$erb$, 1),
  ($erb$plw_approve_labour_payment$erb$, 2, $erb$assign$erb$, $erb$BEGIN
  PERFORM public.assert_company_access(p_company_id);
$erb$, $erb$BEGIN
  PERFORM public.assert_company_access(p_company_id);
  -- v3.75.79 — العملةُ التى يُقرَّبُ بها هذا المستند: تُقرَأُ مرّةً من البيتِ الواحد.
  v_base_ccy := public.erp_company_base_currency(p_company_id);
$erb$, 1),
  ($erb$plw_approve_labour_payment$erb$, 3, $erb$compare$erb$, $erb$  IF ROUND(v_sum,2) <> ROUND(v_p.total_amount,2) THEN
$erb$, $erb$  IF public.erp_round_money(v_sum, v_base_ccy)
     <> public.erp_round_money(v_p.total_amount, v_base_ccy) THEN
$erb$, 1),
  ($erb$plw_create_labour_payment$erb$, 1, $erb$widen$erb$, $erb$  v_branch UUID; v_total NUMERIC(15,2) := 0; v_id UUID; v_line JSONB;
  v_est NUMERIC(15,2) := 0; v_conv NUMERIC(15,2);
$erb$, $erb$  v_branch UUID; v_total NUMERIC(18,4) := 0; v_id UUID; v_line JSONB;
  v_est NUMERIC(18,4) := 0; v_conv NUMERIC(18,4);
  v_base_ccy TEXT;
$erb$, 1),
  ($erb$plw_create_labour_payment$erb$, 2, $erb$assign$erb$, $erb$BEGIN
  PERFORM public.assert_company_access(p_company_id);
$erb$, $erb$BEGIN
  PERFORM public.assert_company_access(p_company_id);
  -- v3.75.79 — العملةُ التى يُقرَّبُ بها هذا المستند: تُقرَأُ مرّةً من البيتِ الواحد.
  v_base_ccy := public.erp_company_base_currency(p_company_id);
$erb$, 1),
  ($erb$plw_create_labour_payment$erb$, 3, $erb$round$erb$, $erb$  v_est := ROUND(v_conv, 2);
$erb$, $erb$  v_est := public.erp_round_money(v_conv, v_base_ccy);
$erb$, 1),
  ($erb$plw_submit_labour_payment$erb$, 1, $erb$widen$erb$, $erb$DECLARE v_p RECORD; v_role TEXT; v_lines INTEGER; v_sum NUMERIC(15,2);
$erb$, $erb$DECLARE v_p RECORD; v_role TEXT; v_lines INTEGER; v_sum NUMERIC(18,4);
$erb$, 1),
  ($erb$post_payroll_atomic$erb$, 1, $erb$widen1$erb$, $erb$  v_net NUMERIC(15,2):=0; v_gross NUMERIC(15,2):=0; v_advances NUMERIC(15,2):=0;
  v_insurance NUMERIC(15,2):=0; v_other_deductions NUMERIC(15,2):=0;
$erb$, $erb$  v_net NUMERIC(18,4):=0; v_gross NUMERIC(18,4):=0; v_advances NUMERIC(18,4):=0;
  v_insurance NUMERIC(18,4):=0; v_other_deductions NUMERIC(18,4):=0;
$erb$, 1),
  ($erb$post_payroll_atomic$erb$, 2, $erb$widen2$erb$, $erb$  v_accrued_bonus NUMERIC(15,2) := 0;
  v_bonus_liab_acct UUID; v_diff NUMERIC(15,2);
$erb$, $erb$  v_accrued_bonus NUMERIC(18,4) := 0;
  v_bonus_liab_acct UUID; v_diff NUMERIC(18,4);
  v_base_ccy TEXT;
$erb$, 1),
  ($erb$post_payroll_atomic$erb$, 3, $erb$assign$erb$, $erb$BEGIN
  PERFORM public.assert_company_access(p_company_id);
$erb$, $erb$BEGIN
  PERFORM public.assert_company_access(p_company_id);
  -- v3.75.79 — العملةُ التى يُقرَّبُ بها هذا المستند: تُقرَأُ مرّةً من البيتِ الواحد.
  v_base_ccy := public.erp_company_base_currency(p_company_id);
$erb$, 1),
  ($erb$post_payroll_atomic$erb$, 4, $erb$diff$erb$, $erb$  v_diff := ROUND(v_gross - (v_net+v_advances+v_insurance+v_other_deductions), 2);
$erb$, $erb$  v_diff := public.erp_round_money(
    v_gross - (v_net+v_advances+v_insurance+v_other_deductions), v_base_ccy);
$erb$, 1),
  ($erb$post_payroll_atomic$erb$, 5, $erb$branch_gross$erb$, $erb$    VALUES (v_entry_id, p_expense_account_id, ROUND(v_branch.branch_gross,2), 0,
$erb$, $erb$    VALUES (v_entry_id, p_expense_account_id,
            public.erp_round_money(v_branch.branch_gross, v_base_ccy), 0,
$erb$, 1);

-- ── (٤) الجراحة: يُقرأُ نصُّ الدالّةِ من القاعدةِ ثمَّ يُعادُ بناؤه ──
DO $mig$
DECLARE
  r          record;
  e          record;
  v_def      text;
  v_cnt      int;
  v_applied  int := 0;
BEGIN
  FOR r IN SELECT * FROM _v37579_before_fn ORDER BY proname LOOP
    v_def := r.def;
    FOR e IN SELECT * FROM _v37579_edits WHERE fn = r.proname ORDER BY ord LOOP
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

  SELECT count(*) INTO v_cnt FROM _v37579_edits;
  IF v_applied <> v_cnt OR v_applied <> 15 THEN
    RAISE EXCEPTION 'EDITS_SKIPPED: طُبِّقَ % من % مرساة (والمُعلَنُ 15).', v_applied, v_cnt
      USING ERRCODE = 'P0001';
  END IF;
  RAISE NOTICE 'v3.75.79: طُبِّقَتْ % مرساةً على 5 دوالّ.', v_applied;
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
  v_narrow   int;
  v_sites    int;
  v_calls    int;
  v_raised   boolean;
  v_detail   text;
  v_checked  bigint := 0;
BEGIN
  -- ── (أ) لم يتغيّرْ رقمٌ واحد: كلُّ قيمةٍ حقيقيّةٍ تُغذّى وعاءً اتّسعَ اليومَ ──
  --     تُقاسُ: هل كانت أصلاً بخانتَين؟ فإن كانت، فالوعاءُ الأوسعُ لا يُغيِّرُها.
  FOR r IN
    WITH vals AS (
      SELECT c.base_currency AS ccy, ps.net_salary AS v, 'payslips.net_salary' AS src, 'exact' AS law
        FROM public.payslips ps JOIN public.companies c ON c.id = ps.company_id
      UNION ALL SELECT c.base_currency, ps.base_salary, 'payslips.base_salary', 'exact'
        FROM public.payslips ps JOIN public.companies c ON c.id = ps.company_id
      UNION ALL SELECT c.base_currency, ps.allowances, 'payslips.allowances', 'exact'
        FROM public.payslips ps JOIN public.companies c ON c.id = ps.company_id
      UNION ALL SELECT c.base_currency, ps.bonuses, 'payslips.bonuses', 'exact'
        FROM public.payslips ps JOIN public.companies c ON c.id = ps.company_id
      UNION ALL SELECT c.base_currency, ps.sales_bonus, 'payslips.sales_bonus', 'exact'
        FROM public.payslips ps JOIN public.companies c ON c.id = ps.company_id
      UNION ALL SELECT c.base_currency, ps.commission, 'payslips.commission', 'exact'
        FROM public.payslips ps JOIN public.companies c ON c.id = ps.company_id
      UNION ALL SELECT c.base_currency, ps.advances, 'payslips.advances', 'exact'
        FROM public.payslips ps JOIN public.companies c ON c.id = ps.company_id
      UNION ALL SELECT c.base_currency, ps.commission_advance_deducted, 'payslips.commission_advance_deducted', 'exact'
        FROM public.payslips ps JOIN public.companies c ON c.id = ps.company_id
      UNION ALL SELECT c.base_currency, ps.insurance, 'payslips.insurance', 'exact'
        FROM public.payslips ps JOIN public.companies c ON c.id = ps.company_id
      UNION ALL SELECT c.base_currency, ps.deductions, 'payslips.deductions', 'exact'
        FROM public.payslips ps JOIN public.companies c ON c.id = ps.company_id
      UNION ALL SELECT c.base_currency, sd.amount, 'shareholder_drawings.amount', 'rounded'
        FROM public.shareholder_drawings sd JOIN public.companies c ON c.id = sd.company_id
      UNION ALL SELECT c.base_currency, sd.base_amount, 'shareholder_drawings.base_amount', 'rounded'
        FROM public.shareholder_drawings sd JOIN public.companies c ON c.id = sd.company_id
      UNION ALL SELECT c.base_currency, cl.amount, 'commission_ledger.amount', 'rounded'
        FROM public.commission_ledger cl JOIN public.companies c ON c.id = cl.company_id
      UNION ALL SELECT c.base_currency, pl.amount, 'production_labour_payment_lines.amount', 'exact'
        FROM public.production_labour_payment_lines pl
        JOIN public.production_labour_payments pp ON pp.id = pl.payment_id
        JOIN public.companies c ON c.id = pp.company_id
      UNION ALL SELECT c.base_currency, pp.total_amount, 'production_labour_payments.total_amount', 'rounded'
        FROM public.production_labour_payments pp JOIN public.companies c ON c.id = pp.company_id
      UNION ALL SELECT c.base_currency, pp.estimated_amount, 'production_labour_payments.estimated_amount', 'rounded'
        FROM public.production_labour_payments pp JOIN public.companies c ON c.id = pp.company_id
      -- والقيمُ المشتقّةُ التى كان الوعاءُ يقصُّها صامتاً
      UNION ALL SELECT COALESCE(NULLIF(btrim(pr.currency), ''), c.base_currency),
                       pri.estimated_total, 'purchase_request_items.estimated_total', 'rounded'
        FROM public.purchase_request_items pri
        JOIN public.purchase_requests pr ON pr.id = pri.purchase_request_id
        JOIN public.companies c ON c.id = pr.company_id
      UNION ALL SELECT COALESCE(NULLIF(btrim(pr.currency), ''), c.base_currency),
                       pri.estimated_total * 0.15, 'purchase_request_items.derived_tax', 'rounded'
        FROM public.purchase_request_items pri
        JOIN public.purchase_requests pr ON pr.id = pri.purchase_request_id
        JOIN public.companies c ON c.id = pr.company_id
      UNION ALL SELECT c.base_currency,
                       (COALESCE(o.labor_time_minutes,0)/60.0) * COALESCE(w.labor_cost_rate,0),
                       'manufacturing.derived_conversion_cost', 'double'
        FROM public.manufacturing_production_order_operations o
        JOIN public.manufacturing_work_centers w ON w.id = o.work_center_id
        JOIN public.manufacturing_production_orders po ON po.id = o.production_order_id
        JOIN public.companies c ON c.id = po.company_id
    )
    SELECT src, ccy, v, law,
           round(v, 2)                              AS narrow_way,
           public.erp_round_money(v, ccy)           AS wide_way,
           public.erp_round_money(round(v, 4), ccy) AS double_way
      FROM vals
     WHERE v IS NOT NULL AND ccy IS NOT NULL AND btrim(ccy) <> ''
  LOOP
    v_checked := v_checked + 1;

    -- **لكلِّ مصدرٍ قانونُه، لا قانونٌ واحدٌ يُلبَسُ للجميع**: يُقارَنُ ما كانت
    -- الشيفرةُ القديمةُ تُنتِجُه بما تُنتِجُه الجديدةُ لهذا المصدرِ بعينِه.
    IF r.law = 'exact' THEN
      -- وعاءٌ اتّسعَ ولم يحلَّ محلَّ قَصِّه تقريبٌ صريح: القديمُ round(v,2)
      -- والجديدُ v نفسُها. فلا يتساويانِ إلّا إن كانت القيمةُ أصلاً بخانتَين.
      -- ولا يكفى أن تُقارَنَ صيغتا التقريب: بعملةٍ ذاتِ خانتَين هما متطابقتانِ
      -- دائماً، فتمرُّ قيمةٌ ثلاثيّةُ الخاناتِ وقد كان الوعاءُ يبترُها فعلاً.
      IF r.v IS DISTINCT FROM r.narrow_way THEN
        RAISE EXCEPTION
          'VALUE_WOULD_CHANGE: % بعملة % — القيمةُ % تحملُ أكثرَ من خانتَين، وكان الوعاءُ الضيّقُ يقصُّها إلى %. توسيعُه يُغيِّرُ رقماً قائماً — الهجرةُ تُجهَض.',
          r.src, r.ccy, r.v, r.narrow_way USING ERRCODE = 'P0001';
      END IF;

    ELSIF r.law = 'rounded' THEN
      -- قَصُّ الوعاءِ حلَّ محلَّه تقريبٌ صريح: يُشترَطُ أن يُعطِىَ الرقمَ نفسَه.
      IF r.narrow_way IS DISTINCT FROM r.wide_way THEN
        RAISE EXCEPTION
          'ROUND_HOME_DIFFERS: % بعملة % — القيمةُ % كانت % وصارت %. الهجرةُ تُجهَض.',
          r.src, r.ccy, r.v, r.narrow_way, r.wide_way USING ERRCODE = 'P0001';
      END IF;

    ELSIF r.law = 'double' THEN
      -- **تقريبٌ مرّتَين**: كان الوعاءُ (15,2) يقصُّ أوّلاً ثمَّ يُقرِّبُ ROUND،
      -- وصارَ الوعاءُ (18,4) يقصُّ إلى أربعٍ ثمَّ يُقرِّبُ البيت. وقد يفترقانِ
      -- عندَ حدٍّ يعبرُه التقريبُ الأوّلُ ولا يعبرُه المباشر.
      IF r.narrow_way IS DISTINCT FROM r.double_way THEN
        RAISE EXCEPTION
          'DOUBLE_ROUNDING_DIFFERS: % بعملة % — القيمةُ % كانت % وصارت %. الهجرةُ تُجهَض.',
          r.src, r.ccy, r.v, r.narrow_way, r.double_way USING ERRCODE = 'P0001';
      END IF;

    ELSE
      RAISE EXCEPTION 'LAW_UNKNOWN: مصدرٌ % بلا قانونٍ مُعلَن (%).', r.src, r.law
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  IF v_checked = 0 THEN
    RAISE EXCEPTION 'PROOF_EMPTY: لم تُقَسْ ولا قيمةٌ واحدة — برهانٌ فارغٌ لا يُقبَل.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── (ب) وحدودُ التقريبِ تُختبَرُ بكلِّ عملةٍ حيّةٍ فى القاعدة ──
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

  -- ── (ج) وأنَّ العلاجَ علاجٌ فعلاً ──
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

  -- ── (هـ) ولا وعاءَ ضيّقٌ بقىَ فى السبع، ولا تقريبٌ يدوىّ، والنداءُ كما أُعلن ──
  FOR r IN SELECT t.nm, t.want_calls, t.want_widen
             FROM (VALUES ($erb$commission_attach_to_payroll_atomic$erb$::text, 1::int, 1::int), ($erb$plw_approve_labour_payment$erb$::text, 2::int, 1::int), ($erb$plw_create_labour_payment$erb$::text, 1::int, 3::int), ($erb$plw_submit_labour_payment$erb$::text, 0::int, 1::int), ($erb$post_payroll_atomic$erb$::text, 2::int, 7::int)) AS t(nm, want_calls, want_widen) LOOP
    SELECT (SELECT count(*) FROM regexp_matches(pg_get_functiondef(p.oid),
                                                'numeric\s*\(\s*\d+\s*,\s*2\s*\)', 'gi')),
           (SELECT count(*) FROM regexp_matches(pg_get_functiondef(p.oid),
                                                'round\s*\([^;]{0,120}?,\s*2\s*\)', 'gi')),
           (length(pg_get_functiondef(p.oid))
             - length(replace(pg_get_functiondef(p.oid), 'erp_round_money', '')))
             / length('erp_round_money')
      INTO v_narrow, v_sites, v_calls
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.nm;
    IF v_narrow IS NULL THEN
      RAISE EXCEPTION 'FUNCTION_MISSING: % اختفت بعدَ الجراحة.', r.nm USING ERRCODE = 'P0001';
    END IF;
    IF v_narrow <> 0 THEN
      RAISE EXCEPTION 'NARROW_VESSEL_LEFT: بقىَ % وعاءً بخانتَين فى %.', v_narrow, r.nm
        USING ERRCODE = 'P0001';
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
      FROM _v37579_before_fn b
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

  SELECT count(*) INTO v_n FROM _v37579_before_fn;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'BEFORE_FINGERPRINT_INCOMPLETE: بُصِمَتْ % دالّةً لا 5.', v_n
      USING ERRCODE = 'P0001';
  END IF;

  -- ── (ز) ولم يُمَسَّ صفٌّ واحد: الأعدادُ والمجاميعُ كما كانت ──
  SELECT count(*) INTO v_bad FROM (
    SELECT b.t
      FROM _v37579_before_sums b
      JOIN (
        SELECT 'payslips' AS t, count(*) AS n,
               COALESCE(sum(COALESCE(net_salary,0)+COALESCE(base_salary,0)+COALESCE(allowances,0)
                           +COALESCE(bonuses,0)+COALESCE(sales_bonus,0)+COALESCE(commission,0)
                           +COALESCE(advances,0)+COALESCE(insurance,0)+COALESCE(deductions,0)),0) AS s
          FROM public.payslips
        UNION ALL SELECT 'shareholder_drawings', count(*), COALESCE(sum(COALESCE(amount,0)+COALESCE(base_amount,0)),0) FROM public.shareholder_drawings
        UNION ALL SELECT 'production_labour_payments', count(*), COALESCE(sum(COALESCE(total_amount,0)+COALESCE(estimated_amount,0)),0) FROM public.production_labour_payments
        UNION ALL SELECT 'production_labour_payment_lines', count(*), COALESCE(sum(amount),0) FROM public.production_labour_payment_lines
        UNION ALL SELECT 'purchase_orders', count(*), COALESCE(sum(COALESCE(subtotal,0)+COALESCE(tax_amount,0)+COALESCE(total_amount,0)),0) FROM public.purchase_orders
        UNION ALL SELECT 'commission_ledger', count(*), COALESCE(sum(amount),0) FROM public.commission_ledger
        UNION ALL SELECT 'journal_entry_lines', count(*), COALESCE(sum(debit_amount),0) + COALESCE(sum(credit_amount),0) FROM public.journal_entry_lines
      ) a ON a.t = b.t
     WHERE a.n IS DISTINCT FROM b.n OR a.s IS DISTINCT FROM b.s
  ) d;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'DATA_TOUCHED: تبدّلَ % جدولاً — الهجرةُ لا تكتبُ صفّاً.', v_bad
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE 'v3.75.79 مبرهَنة: % قيمةَ مالٍ حقيقيّةٍ قِيسَتْ فتطابقتِ الصيغتان؛ 13 وعاءً اتّسع و5 موضعاً حُوِّلَ فى 5 دوالّ؛ ولا مالكَ ولا صلاحيّةَ ولا صفَّ تبدّل.', v_checked;
END $proof$;
