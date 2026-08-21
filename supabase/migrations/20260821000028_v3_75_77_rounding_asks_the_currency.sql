-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.77 — «والتقريبُ يسألُ العملةَ ولا يفترضُ خانتين»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- أينَ نحن
-- ────────
-- اتّسعَ الدفترُ فى v3.75.76 إلى أربعِ خاناتٍ فى 226 عمودَ مال. لكنَّ الاتّساعَ
-- وحدَه لا يكفى: ما زالَ **التقريبُ نفسُه** مكتوباً باليدِ فى مئاتِ المواضع،
-- وكلُّها تقولُ «خانتان» دونَ أن تسألَ العملةَ عن نفسِها. فلو دخلت شركةٌ
-- كويتيّةٌ اليومَ، لاتّسعَ لها العمودُ ثمَّ **قصَّها التقريبُ قبلَ أن تصلَه**.
--
-- المقياسُ الذى أنجبَ هذه الدفعة (2026-08-21)
-- ───────────────────────────────────────────
--   • فى دوالِّ القاعدة: **80 موضعَ ROUND(‎…, 2)** فى 52 دالّة.
--   • فى شيفرةِ التطبيق: 632 موضعَ toFixed(2)، و42 موضعَ Math.round(x*100)/100،
--     و21 موضعاً يُحوِّلُ toFixed إلى رقم.
--   • والدالّةُ التى **كان يُفترَضُ** أن تسألَ العملةَ (getCurrencyDecimals فى
--     lib/currency-service.ts) تقرأُ جدولَ `currencies` — **وهو فارغٌ فى
--     الإنتاج: صفرُ صفٍّ حتى اليوم** — فترتدُّ إلى اثنتين دائماً، لكلِّ عملة.
--     أى أنَّ `convertCurrency` تُقرِّبُ الدينارَ الكويتىَّ إلى خانتَين وهى
--     تظنُّ أنّها سألت.
--
-- ما تفعلُه هذه الدفعة
-- ────────────────────
-- تبنى **بيتَ التقريبِ الواحدَ فى القاعدة**، وتُحوِّلُ إليه أوّلَ مسارِ ترحيلٍ
-- حقيقىٍّ يملكُ عملتَه فى مداه. والباقى معدودٌ ومُسمّىً بسببِ بقائِه، لا
-- مسكوتٌ عنه.
--
--   (١) `erp_round_money(amount, currency)`: يسألُ `erp_currency_decimals`
--       (بيتُ v3.75.75)، **ويصرخُ إن لم يعرفِ العملةَ ولا يخترعُ اثنتين**،
--       ولا يُقرِّبُ أدقَّ ممّا يحفظُه الدفترُ فعلاً — وسعةُ الدفترِ تُقرَأُ من
--       **العمودِ نفسِه** لا من رقمٍ مكتوبٍ هنا، فلا تتخلّفُ عنه أبداً.
--
--   (٢) `post_expense_atomic` — أوّلُ مُحوَّل. ثلاثةُ مواضعِ تقريبٍ فيه صارت
--       تسألُ العملة: موضعانِ بعملةِ الدفترِ (لأنّهما يقرّبانِ مبلغَ الأستاذ)،
--       وواحدٌ بعملةِ المصروفِ الأصليّة (لأنّه يقرّبُ المبلغَ الأصلىّ). وهو
--       `SECURITY DEFINER` يعملُ بحقِّ مالكِه، فلا يحتاجُ البيتُ الجديدُ منحةً
--       لأحد — **البابُ يُفتَحُ لمن يطرقُه فقط**.
--
-- لماذا لا يتغيَّرُ رقمٌ واحدٌ اليوم — وهو مُقاسٌ لا مُفترَض
-- ────────────────────────────────────────────────────────
-- عملاتُ الإنتاجِ كلُّها ذاتُ خانتَين: الشركاتُ السّتُّ (خمسٌ بالجنيهِ المصرىِّ
-- وواحدةٌ بالريالِ السعودىّ)، والمصروفاتُ الثمانيةُ كلُّها بالجنيه. ولذلك
-- `erp_round_money(x, 'EGP')` يساوى `ROUND(x, 2)` حرفاً بحرف.
--
-- وهذه الهجرةُ **لا تكتفى بالقول**: تُقارِنُ الصيغتَينِ على قيمٍ حدّيّة، ثمَّ
-- تُعيدُ حسابَ مواضعِ التقريبِ الثلاثةِ **لكلِّ مصروفٍ قائمٍ فى القاعدة**
-- بالصيغةِ القديمةِ والجديدةِ وتُقارنُهما — وإن اختلفَ قرشٌ واحدٌ أُلغيت
-- الهجرةُ بأكملِها.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- (١) بيتُ التقريبِ الواحد
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.erp_round_money(p_amount numeric, p_currency text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_decimals smallint;
  v_ledger   smallint;
BEGIN
  IF p_amount IS NULL THEN
    RETURN NULL;
  END IF;

  -- يصرخُ إن لم يعرفِ العملة، ولا يرتدُّ إلى اثنتين
  v_decimals := public.erp_currency_decimals(p_currency);

  -- ولا يُقرِّبُ أدقَّ ممّا يحفظُه الدفترُ فعلاً — والسعةُ تُقرَأُ من العمودِ
  -- نفسِه، فلا يبقى رقمٌ مكتوبٌ هنا يتخلّفُ عن القاعدةِ حين تتّسع.
  SELECT ((a.atttypmod - 4) & 65535)::smallint
    INTO v_ledger
    FROM pg_attribute a
    JOIN pg_class cl ON cl.oid = a.attrelid AND cl.relkind = 'r'
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
   WHERE cl.relname = 'journal_entry_lines'
     AND a.attname = 'debit_amount'
     AND a.attnum > 0 AND NOT a.attisdropped
     AND a.atttypid = 'numeric'::regtype AND a.atttypmod > 0;

  IF v_ledger IS NULL THEN
    RAISE EXCEPTION
      'LEDGER_SCALE_UNKNOWN: تعذّرت قراءةُ سعةِ عمودِ المدينِ من القاعدة، '
      'فلا يُقرَّبُ مالٌ على تخمين.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN round(p_amount, least(v_decimals, v_ledger)::int);
END;
$function$;

COMMENT ON FUNCTION public.erp_round_money(numeric, text) IS
  'v3.75.77 — بيتُ التقريبِ الواحد: يقرّبُ المبلغَ بعددِ خاناتِ عملتِه (من erp_currency_decimals) ولا يتجاوزُ سعةَ الدفترِ المقروءةَ من العمودِ نفسِه. يصرخُ ولا يخترع.';

REVOKE EXECUTE ON FUNCTION public.erp_round_money(numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.erp_round_money(numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.erp_round_money(numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.erp_round_money(numeric, text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- (٢) أوّلُ مسارِ ترحيلٍ يُحوَّل: مواضعُ التقريبِ الثلاثةُ تسألُ العملة
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_expense_atomic(p_expense_id uuid, p_company_id uuid, p_actor_id uuid DEFAULT NULL::uuid, p_expense_account_id uuid DEFAULT NULL::uuid, p_payment_account_id uuid DEFAULT NULL::uuid, p_payment_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_exp expenses%ROWTYPE; v_expense_account uuid; v_payment_account uuid;
  v_amount_gl numeric; v_exp_currency text; v_exp_rate numeric;
  v_cash_currency text; v_cash_native numeric; v_cash_rate numeric;
  v_tax_gl numeric := 0; v_net_gl numeric; v_tax_account uuid; v_tax_native numeric := 0;
  v_base_currency text;
  v_lines jsonb;
  v_je jsonb; v_entry_id uuid; v_adopted boolean := false; v_rows integer; v_trace uuid;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  SELECT * INTO v_exp FROM expenses WHERE id = p_expense_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'EXPENSE_NOT_FOUND');
  END IF;

  IF v_exp.journal_entry_id IS NOT NULL THEN
    IF NULLIF(btrim(p_payment_reference), '') IS NOT NULL THEN
      UPDATE expenses SET payment_reference = btrim(p_payment_reference), updated_at = now()
       WHERE id = p_expense_id AND company_id = p_company_id;
    END IF;
    RETURN jsonb_build_object('success', true, 'already_posted', true,
      'expense_id', p_expense_id, 'entry_id', v_exp.journal_entry_id);
  END IF;

  v_expense_account := COALESCE(p_expense_account_id, v_exp.expense_account_id);
  v_payment_account := COALESCE(p_payment_account_id, v_exp.payment_account_id);
  IF v_expense_account IS NULL OR v_payment_account IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACCOUNTS_MISSING');
  END IF;
  IF COALESCE(v_exp.amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  v_amount_gl    := COALESCE(v_exp.base_currency_amount, v_exp.amount);
  v_exp_currency := NULLIF(upper(v_exp.currency_code::text), '');
  v_exp_rate     := COALESCE(NULLIF(v_exp.exchange_rate, 0), 1);

  -- v3.75.77 — التقريبُ يسألُ العملةَ ولا يفترضُ خانتين. وعملةُ الدفترِ
  -- تُقرَأُ من بيتِها الواحد، فإن لم تكن معروفةً صرخَ التقريبُ ولم يخترعْ.
  v_base_currency := public.erp_company_base_currency(p_company_id);

  -- v3.74.820 input VAT — ضريبة المصروف قابلة للخصم: تُثبت أصلاً ضريبياً
  -- ولا تُحمَّل مصروفاً. كان الجدول بلا حقل ضريبة أصلاً فتضخّم المصروف
  -- وضاع حق الخصم من تقرير ضريبة المدخلات.
  v_tax_native := COALESCE(v_exp.tax_amount, 0);
  IF v_tax_native > 0 THEN
    v_tax_gl := public.erp_round_money(v_amount_gl * (v_tax_native / NULLIF(v_exp.amount, 0)), v_base_currency);
    SELECT id INTO v_tax_account FROM chart_of_accounts
     WHERE company_id = p_company_id
       AND (id = v_exp.tax_account_id OR lower(COALESCE(sub_type,'')) = 'vat_input' OR account_code = '1160')
     ORDER BY (id = v_exp.tax_account_id) DESC, (lower(COALESCE(sub_type,'')) = 'vat_input') DESC
     LIMIT 1;
    IF v_tax_account IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'VAT_INPUT_ACCOUNT_MISSING');
    END IF;
  END IF;
  v_net_gl := public.erp_round_money(v_amount_gl - v_tax_gl, v_base_currency);

  SELECT NULLIF(upper(original_currency), '') INTO v_cash_currency
    FROM chart_of_accounts WHERE id = v_payment_account;

  IF v_cash_currency IS NOT NULL AND v_exp_currency IS NOT NULL AND v_cash_currency = v_exp_currency THEN
    v_cash_native := v_exp.amount; v_cash_rate := v_exp_rate;
  ELSE
    v_cash_native := v_amount_gl;  v_cash_rate := 1;
  END IF;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_expense_account,
      'debit_amount', v_net_gl, 'credit_amount', 0,
      'description', 'مصروف ' || v_exp.expense_number ||
        CASE WHEN v_exp_currency IS NOT NULL AND v_exp_currency <> public.erp_company_base_currency(p_company_id)
             THEN ' (' || v_exp_currency || ')' ELSE '' END,
      'original_debit', public.erp_round_money(v_exp.amount - v_tax_native, COALESCE(v_exp_currency, v_base_currency)), 'original_credit', 0,
      'original_currency', v_exp_currency, 'exchange_rate_used', v_exp_rate),
    jsonb_build_object('account_id', v_payment_account,
      'debit_amount', 0, 'credit_amount', v_amount_gl,
      'description', 'سداد مصروف ' || v_exp.expense_number,
      'original_debit', 0, 'original_credit', v_cash_native,
      'original_currency', COALESCE(v_cash_currency, v_exp_currency),
      'exchange_rate_used', v_cash_rate));

  IF v_tax_gl > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_tax_account, 'debit_amount', v_tax_gl, 'credit_amount', 0,
      'description', 'ضريبة مدخلات - ' || v_exp.expense_number,
      'original_debit', v_tax_native, 'original_credit', 0,
      'original_currency', v_exp_currency, 'exchange_rate_used', v_exp_rate));
  END IF;

  v_je := public.create_journal_entry_atomic(
    p_company_id, 'expense', p_expense_id, v_exp.expense_date,
    'مصروف - ' || v_exp.expense_number, v_exp.branch_id, v_exp.cost_center_id, NULL, v_lines);

  IF COALESCE((v_je->>'success')::boolean, false) THEN
    v_entry_id := (v_je->>'entry_id')::uuid;
  ELSIF (v_je->>'existing_id') IS NOT NULL THEN
    v_entry_id := (v_je->>'existing_id')::uuid; v_adopted := true;
  ELSE
    RAISE EXCEPTION 'EXPENSE_JE_FAILED: %', COALESCE(v_je->>'error', 'unknown');
  END IF;
  IF v_entry_id IS NULL THEN
    RAISE EXCEPTION 'EXPENSE_JE_FAILED: reported success without an entry id';
  END IF;

  UPDATE expenses
     SET journal_entry_id = v_entry_id, status = 'paid',
         paid_by = COALESCE(paid_by, p_actor_id), paid_at = COALESCE(paid_at, now()),
         payment_reference = COALESCE(NULLIF(btrim(p_payment_reference), ''), payment_reference),
         last_status_changed_at = now(), updated_at = now()
   WHERE id = p_expense_id AND company_id = p_company_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'EXPENSE_LINK_FAILED: % rows updated, expected 1', v_rows;
  END IF;

  BEGIN
    v_trace := public.create_financial_operation_trace(
      p_company_id, 'expense', p_expense_id, 'expense_posting', p_actor_id,
      'expense_posting:' || p_expense_id::text, NULL,
      jsonb_build_object('amount', v_amount_gl, 'tax', v_tax_gl, 'adopted_existing_entry', v_adopted),
      CASE WHEN p_actor_id IS NULL THEN jsonb_build_array('no_session_actor') ELSE NULL END);
    IF v_trace IS NOT NULL THEN
      PERFORM public.link_financial_operation_trace(v_trace,'expense',p_expense_id,'source','expense_posting');
      PERFORM public.link_financial_operation_trace(v_trace,'journal_entry',v_entry_id,'journal_entry','expense_posting');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'TRACE_FAILED expense_posting %: %', p_expense_id, SQLERRM; v_trace := NULL;
  END;

  RETURN jsonb_build_object('success', true, 'expense_id', p_expense_id,
    'entry_id', v_entry_id, 'tax', v_tax_gl, 'adopted', v_adopted, 'transaction_id', v_trace);
END; $function$
;

-- ---------------------------------------------------------------
-- post_fixed_asset_acquisition_atomic(p_asset_id uuid, p_payment_account_id uuid, p_user_id uuid)
-- ---------------------------------------------------------------;

-- ───────────────────────────────────────────────────────────────────────────
-- (٣) البرهان — ولا يُصدَّقُ قولٌ بلا قياس
-- ───────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  r record;
  v_bad int := 0;
  v_detail text := '';
  v_old numeric; v_new numeric;
  v_raised boolean;
BEGIN
  -- (أ) البيتُ الجديدُ يساوى الصيغةَ القديمةَ حرفاً بحرف لكلِّ عملةٍ بخانتَين
  FOR r IN SELECT unnest(ARRAY[
             0, 1, -1, 0.005, -0.005, 0.014999, 1.005, 2.675, 10.125, -10.125,
             99999999.994, 99999999.995, 1234.5678, -1234.5678, 0.001, 0.009
           ]) AS v LOOP
    IF public.erp_round_money(r.v, 'EGP') IS DISTINCT FROM round(r.v, 2) THEN
      v_bad := v_bad + 1;
      v_detail := v_detail || format(' EGP(%s): %s <> %s;', r.v, public.erp_round_money(r.v,'EGP'), round(r.v,2));
    END IF;
    IF public.erp_round_money(r.v, 'SAR') IS DISTINCT FROM round(r.v, 2) THEN
      v_bad := v_bad + 1;
      v_detail := v_detail || format(' SAR(%s) differs;', r.v);
    END IF;
  END LOOP;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ROUND_HOME_NOT_IDENTICAL: البيتُ الجديدُ يخالفُ الصيغةَ القديمةَ فى % موضعاً:%', v_bad, v_detail;
  END IF;

  -- (ب) وللعملةِ ذاتِ الثلاثِ خاناتٍ يُقرِّبُ ثلاثاً — وهو الدواءُ نفسُه
  IF public.erp_round_money(10.1254, 'KWD') IS DISTINCT FROM 10.125 THEN
    RAISE EXCEPTION 'ROUND_HOME_KWD: الدينارُ الكويتىُّ لم يُقرَّبْ بثلاثِ خانات (جاء %)', public.erp_round_money(10.1254,'KWD');
  END IF;
  IF public.erp_round_money(100.4, 'JPY') IS DISTINCT FROM 100 THEN
    RAISE EXCEPTION 'ROUND_HOME_JPY: الينُّ لم يُقرَّبْ بلا خانات (جاء %)', public.erp_round_money(100.4,'JPY');
  END IF;

  -- (ج) ويصرخُ ولا يخترعُ حين لا يعرفُ العملة
  v_raised := false;
  BEGIN PERFORM public.erp_round_money(1.005, 'ZZZ'); EXCEPTION WHEN OTHERS THEN v_raised := true; END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'ROUND_HOME_SILENT: قرّبَ بعملةٍ لا يعرفُها بدلاً من أن يصرخ';
  END IF;
  v_raised := false;
  BEGIN PERFORM public.erp_round_money(1.005, NULL); EXCEPTION WHEN OTHERS THEN v_raised := true; END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'ROUND_HOME_SILENT_NULL: قرّبَ بلا عملةٍ بدلاً من أن يصرخ';
  END IF;

  -- (د) ولا يتجاوزُ سعةَ الدفترِ مهما قالتِ العملة
  IF public.erp_round_money(1.00005, 'KWD') IS DISTINCT FROM round(1.00005, 3) THEN
    RAISE EXCEPTION 'ROUND_HOME_LEDGER_CLAMP: تجاوزَ سعةَ الدفتر';
  END IF;

  -- (هـ) والأهمُّ: كلُّ مصروفٍ قائمٍ فى القاعدةِ يُعطى **نفسَ الأرقامِ** بالصيغتَين
  v_bad := 0; v_detail := '';
  FOR r IN
    SELECT e.id,
           COALESCE(e.base_currency_amount, e.amount)      AS amount_gl,
           COALESCE(e.tax_amount, 0)                       AS tax_native,
           e.amount                                        AS amount_native,
           NULLIF(upper(e.currency_code::text), '')        AS exp_currency,
           public.erp_company_base_currency(e.company_id)  AS base_currency
      FROM public.expenses e
  LOOP
    IF r.base_currency IS NULL THEN
      v_bad := v_bad + 1;
      v_detail := v_detail || format(' %s: لا عملةَ للشركة;', r.id);
      CONTINUE;
    END IF;

    v_old := ROUND(r.amount_gl * (r.tax_native / NULLIF(r.amount_native, 0)), 2);
    v_new := public.erp_round_money(r.amount_gl * (r.tax_native / NULLIF(r.amount_native, 0)), r.base_currency);
    IF v_old IS DISTINCT FROM v_new THEN
      v_bad := v_bad + 1; v_detail := v_detail || format(' %s tax_gl %s<>%s;', r.id, v_old, v_new);
    END IF;

    v_old := ROUND(r.amount_gl - COALESCE(v_old, 0), 2);
    v_new := public.erp_round_money(r.amount_gl - COALESCE(v_new, 0), r.base_currency);
    IF v_old IS DISTINCT FROM v_new THEN
      v_bad := v_bad + 1; v_detail := v_detail || format(' %s net_gl %s<>%s;', r.id, v_old, v_new);
    END IF;

    v_old := ROUND(r.amount_native - r.tax_native, 2);
    v_new := public.erp_round_money(r.amount_native - r.tax_native, COALESCE(r.exp_currency, r.base_currency));
    IF v_old IS DISTINCT FROM v_new THEN
      v_bad := v_bad + 1; v_detail := v_detail || format(' %s original_debit %s<>%s;', r.id, v_old, v_new);
    END IF;
  END LOOP;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'EXPENSE_ROUNDING_CHANGED: اختلفَ % موضعاً على مصروفاتٍ قائمة:%', v_bad, v_detail;
  END IF;

  RAISE NOTICE 'تمّ: بيتُ التقريبِ قائمٌ، وأوّلُ مُحوَّلٍ يسألُ العملة، ولا رقمَ تغيَّرَ على مصروفٍ قائم.';
END
$proof$;
