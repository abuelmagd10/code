-- =============================================================================
-- v3.74.896 — توحيد post_expense_atomic على نسخة الإنتاج (محو انحراف قاعدة الاختبار)
-- =============================================================================
-- اكتُشف أثناء تنفيذ م٥ من جدول الاختبار الحى (مصروف بضريبة): بصمة الدالة
-- على قاعدة الاختبار تخالف الإنتاج. الفرق تجميلى فقط — نسخة الإنتاج تلحق
-- رمز العملة بوصف سطر المصروف وتحمل التعليق الأطول — والمحاسبة متطابقة
-- (المصروف بالصافى · الضريبة إلى 1160/vat_input · الدائن بالإجمالى).
-- هذا الملف يثبّت نسخة الإنتاج نصاً على القاعدتين، كما فُعل مع دوال
-- إشعار الدائن فى 894 — محو الانحراف لا ترقيعه.
--
-- برهنة م٥ نفسها (معاملة ملغاة على قاعدة الاختبار، بمسار الواجهة نفسه:
-- إدراج المصروف ثم post_expense_atomic كما يفعل /api/expenses/[id]/post):
--   مصروف 114.00 بضريبة 14.00 ⇒ القيد posted والمصروف paid ·
--   مدين 5240 = 100.00 (بالصافى) · مدين 1160 = 14.00 · دائن 1110 = 114.00
-- والشطر الثالث من م٥ («يظهر فى تقرير ضريبة المدخلات») كان مكسوراً على
-- مستوى التقرير لا القيد — عولج فى app/api/vat-input/route.ts بهذا الإصدار.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.post_expense_atomic(p_expense_id uuid, p_company_id uuid, p_actor_id uuid DEFAULT NULL::uuid, p_expense_account_id uuid DEFAULT NULL::uuid, p_payment_account_id uuid DEFAULT NULL::uuid, p_payment_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp expenses%ROWTYPE; v_expense_account uuid; v_payment_account uuid;
  v_amount_gl numeric; v_exp_currency text; v_exp_rate numeric;
  v_cash_currency text; v_cash_native numeric; v_cash_rate numeric;
  v_tax_gl numeric := 0; v_net_gl numeric; v_tax_account uuid; v_tax_native numeric := 0;
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

  -- v3.74.820 input VAT — ضريبة المصروف قابلة للخصم: تُثبت أصلاً ضريبياً
  -- ولا تُحمَّل مصروفاً. كان الجدول بلا حقل ضريبة أصلاً فتضخّم المصروف
  -- وضاع حق الخصم من تقرير ضريبة المدخلات.
  v_tax_native := COALESCE(v_exp.tax_amount, 0);
  IF v_tax_native > 0 THEN
    v_tax_gl := ROUND(v_amount_gl * (v_tax_native / NULLIF(v_exp.amount, 0)), 2);
    SELECT id INTO v_tax_account FROM chart_of_accounts
     WHERE company_id = p_company_id
       AND (id = v_exp.tax_account_id OR lower(COALESCE(sub_type,'')) = 'vat_input' OR account_code = '1160')
     ORDER BY (id = v_exp.tax_account_id) DESC, (lower(COALESCE(sub_type,'')) = 'vat_input') DESC
     LIMIT 1;
    IF v_tax_account IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'VAT_INPUT_ACCOUNT_MISSING');
    END IF;
  END IF;
  v_net_gl := ROUND(v_amount_gl - v_tax_gl, 2);

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
        CASE WHEN v_exp_currency IS NOT NULL AND v_exp_currency <> 'EGP'
             THEN ' (' || v_exp_currency || ')' ELSE '' END,
      'original_debit', ROUND(v_exp.amount - v_tax_native, 2), 'original_credit', 0,
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
END; $function$;
