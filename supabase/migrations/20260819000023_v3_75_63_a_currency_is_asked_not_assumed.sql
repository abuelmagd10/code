-- v3.75.63 — «والعملةُ تُسألُ لا تُفترَض»
-- ============================================================================
-- كانت سبعٌ وعشرون دالّةً فى القاعدةِ تفترضُ أنّ عملةَ الشركةِ «EGP» إن غابَ
-- البيان: ثمانٍ تقرأُ عملةَ الأساسِ بارتدادٍ صامتٍ لا يقعُ عمليّاً، وستٌّ
-- تسمُ مستنداً أو تحاكمُه بعملةٍ مفترَضةٍ، وثلاثَ عشرةَ تسمُ إشعاراً بها.
-- وبعدَ v3.75.62 صارَ تبديلُ عملةِ الأساسِ طريقاً معبَّداً — فوجبَ ألّا يبقى
-- فى القاعدةِ حرفُ عملةٍ واحدٌ مفترَض. **نبنى مشروعاً للاستخدامِ العالمىّ.**
--
-- العلاجُ واحدٌ موحَّد: بدلَ «إن غابَ البيانُ فافترض» صارت القاعدةُ «إن غابَ
-- البيانُ فاسأل البيتَ الواحدَ erp_company_base_currency» — الذى يرفضُ أن
-- يخترعَ عملةً أصلاً (v3.75.52). كلُّ جسدٍ أُعيدَ حرفاً بحرفٍ ولا يتغيّرُ
-- فيه إلا سطرُ الافتراضِ نفسُه — **ولا حارسَ فقدَ صرختَه**.
--
-- (١) سبعٌ وعشرون دالّةً تُشفى — الأثقلُ أوّلاً:
--     ثمانى قارئاتِ أساسٍ تنهارُ سطراهُما إلى نداءِ البيتِ الواحد،
--     وستُّ واسماتِ مستندٍ يصيرُ ارتدادُها إلى عملةِ الشركةِ لا إلى حرفٍ،
--     وثلاثَ عشرةَ مُخطِرةً كذلك.
-- (٢) فحصٌ مرجعىٌّ جديدٌ يُثبِّتُ: صفرَ حرفِ عملةٍ فى دوالِّ القاعدةِ كلِّها،
--     ونداءَ السبعِ والعشرين للبيتِ كلٌّ بوسيطِه، وقيامَ البيتِ نفسِه،
--     وبقاءَ صرخةِ حارسَى السدادِ الزائد.
-- ============================================================================

-- ═══ (١) السبعُ والعشرون تُشفى — الجسدُ حرفاً بحرفٍ إلا سطرَ الافتراض ═══

CREATE OR REPLACE FUNCTION public.apply_customer_credit_to_invoice(p_company_id uuid, p_customer_id uuid, p_invoice_id uuid, p_amount numeric, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_available_credit         numeric;
  v_invoice                  record;
  v_ar_account_id            uuid;
  v_customer_credit_acc_id   uuid;
  v_branch_id                uuid;
  v_journal_id               uuid;
  v_journal_ref_id           uuid := gen_random_uuid();  -- v3.74.205
  v_credit_ledger_id         uuid;
  v_payment_id               uuid;
  v_apply_amount             numeric;
  v_remaining_to_apply       numeric;
  v_credit_lot               record;
  v_consume_from_lot         numeric;
  v_company_base_ccy         text;
BEGIN
  -- v3.74.730 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access(p_company_id);
  v_available_credit := public.get_customer_credit_balance(p_company_id, p_customer_id);
  IF v_available_credit < 0.01 THEN
    RAISE EXCEPTION 'NO_CREDIT_AVAILABLE: Customer has no available credit balance';
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: Invoice % not found', p_invoice_id;
  END IF;

  v_apply_amount := LEAST(
    p_amount,
    v_available_credit,
    GREATEST(0, v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0) - COALESCE(v_invoice.returned_amount, 0))
  );
  IF v_apply_amount < 0.01 THEN
    RAISE EXCEPTION 'NOTHING_TO_APPLY: Invoice is already fully paid or amount is zero';
  END IF;

  SELECT id INTO v_ar_account_id FROM chart_of_accounts
  WHERE company_id = p_company_id AND is_active = true
    AND (sub_type = 'accounts_receivable' OR account_name ILIKE '%receivable%' OR account_name ILIKE '%الذمم المدينة%')
  ORDER BY CASE WHEN sub_type = 'accounts_receivable' THEN 0 ELSE 1 END LIMIT 1;
  IF v_ar_account_id IS NULL THEN
    RAISE EXCEPTION 'AR_ACCOUNT_MISSING';
  END IF;

  SELECT id INTO v_customer_credit_acc_id FROM chart_of_accounts
  WHERE company_id = p_company_id AND is_active = true
    AND (sub_type IN ('customer_credit', 'customer_advance') OR account_code = '2155'
         OR account_name ILIKE '%رصيد العملاء الدائن%' OR account_name ILIKE '%customer credit%')
  ORDER BY CASE WHEN sub_type = 'customer_credit' THEN 0 WHEN sub_type = 'customer_advance' THEN 1
                WHEN account_code = '2155' THEN 2 ELSE 3 END LIMIT 1;
  IF v_customer_credit_acc_id IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_CREDIT_ACCOUNT_MISSING';
  END IF;

  v_branch_id := v_invoice.branch_id;
  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id FROM branches WHERE company_id = p_company_id AND is_active = true
    ORDER BY is_main DESC NULLS LAST, name LIMIT 1;
  END IF;

  -- v3.75.63 — العملةُ تُسألُ من بيتِها الواحدِ ولا تُفترَض («ولا تُخترَعُ عملة»).
  v_company_base_ccy := public.erp_company_base_currency(p_company_id);

  -- v3.74.205 — reference_id is a per-call UUID, not p_invoice_id, so a
  -- second application against the same invoice does not collide with the
  -- prevent_duplicate_journal_entry_v2 unique guard. Invoice traceability
  -- stays in the description + customer_credit_ledger.source_id + the
  -- payment row's invoice_id.
  INSERT INTO journal_entries (
    company_id, branch_id, reference_type, reference_id,
    entry_date, description, status
  ) VALUES (
    p_company_id, v_branch_id, 'credit_applied', v_journal_ref_id,
    CURRENT_DATE,
    'تطبيق رصيد دائن على الفاتورة ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text),
    'draft'
  ) RETURNING id INTO v_journal_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id) VALUES
    (v_journal_id, v_customer_credit_acc_id, v_apply_amount, 0, 'تَسوية رَصيد العَميل الدائن مُقابِل الفاتورة', v_branch_id),
    (v_journal_id, v_ar_account_id, 0, v_apply_amount, 'تَخفيض الذِّمَم المَدينَة للفاتورة', v_branch_id);

  UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;

  -- v3.74.205 — FIFO consumption now includes 'partially_used' rows.
  -- Same bug class as v3.74.121/v3.74.199 — once any credit lot's status
  -- had ever been touched (trigger flips it to partially_used), the
  -- executor was skipping it and remaining_to_apply could not drain.
  v_remaining_to_apply := v_apply_amount;
  FOR v_credit_lot IN
    SELECT id, (amount - COALESCE(used_amount, 0) - COALESCE(applied_amount, 0)) AS available
    FROM customer_credits
    WHERE company_id = p_company_id AND customer_id = p_customer_id
      AND status IN ('active', 'partially_used')
      AND (amount - COALESCE(used_amount, 0) - COALESCE(applied_amount, 0)) > 0.01
    ORDER BY credit_date ASC, created_at ASC FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_to_apply <= 0.001;
    v_consume_from_lot := LEAST(v_credit_lot.available, v_remaining_to_apply);
    UPDATE customer_credits
    SET applied_amount = COALESCE(applied_amount, 0) + v_consume_from_lot,
        status = CASE
                   WHEN (amount - COALESCE(used_amount, 0) - COALESCE(applied_amount, 0) - v_consume_from_lot) < 0.01
                     THEN 'used'
                   ELSE 'partially_used'
                 END,
        updated_at = NOW()
    WHERE id = v_credit_lot.id;
    v_remaining_to_apply := v_remaining_to_apply - v_consume_from_lot;
  END LOOP;

  -- Credit ledger entry — source_id still points at the invoice for traceability.
  INSERT INTO customer_credit_ledger (
    company_id, customer_id, source_type, source_id, journal_entry_id, amount, description, created_by
  ) VALUES (
    p_company_id, p_customer_id, 'credit_applied', p_invoice_id, v_journal_id, -v_apply_amount,
    'تطبيق رصيد دائن على الفاتورة ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text), p_user_id
  ) RETURNING id INTO v_credit_ledger_id;

  -- v3.74.102 — Payment row so /payments shows the application alongside cash/bank payments
  INSERT INTO payments (
    company_id, customer_id, invoice_id, payment_date, amount, payment_method,
    reference_number, notes, account_id, journal_entry_id, branch_id, cost_center_id,
    currency_code, exchange_rate, base_currency_amount, original_currency, original_amount,
    status, created_by, created_by_user_id, unallocated_amount
  ) VALUES (
    p_company_id, p_customer_id, p_invoice_id, CURRENT_DATE, v_apply_amount, 'customer_credit',
    'CRED-' || COALESCE(v_invoice.invoice_number, SUBSTRING(p_invoice_id::text FROM 1 FOR 8)),
    'تطبيق رصيد دائن على الفاتورة ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text),
    v_customer_credit_acc_id, v_journal_id, v_branch_id, v_invoice.cost_center_id,
    v_company_base_ccy, 1, v_apply_amount, v_company_base_ccy, v_apply_amount,
    'approved', p_user_id, p_user_id, 0
  ) RETURNING id INTO v_payment_id;

  UPDATE invoices SET
    paid_amount = COALESCE(paid_amount, 0) + v_apply_amount,
    status = CASE WHEN COALESCE(paid_amount, 0) + v_apply_amount
                       >= GREATEST(0, total_amount - COALESCE(returned_amount, 0))
                  THEN 'paid' ELSE 'partially_paid' END,
    updated_at = NOW()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'applied_amount', v_apply_amount,
    'journal_entry_id', v_journal_id,
    'credit_ledger_id', v_credit_ledger_id,
    'payment_id', v_payment_id,
    'remaining_credit', v_available_credit - v_apply_amount,
    'ar_account_id', v_ar_account_id,
    'customer_credit_account', v_customer_credit_acc_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_create_payment_journal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_journal_entry_id UUID;
  v_ar_account_id    UUID;
  v_ap_account_id    UUID;
  v_account_id       UUID;
  v_branch_id        UUID;
  v_pay_ccy          TEXT;
  v_pay_rate         NUMERIC;
  v_pay_orig_amount  NUMERIC;
  v_pay_base_amount  NUMERIC;
  v_pay_rate_id      UUID;
  v_base_ccy         TEXT;
  v_cash_acc_ccy     TEXT;
  v_cash_native      NUMERIC;
  v_cash_rate        NUMERIC;
  v_cash_rate_id     UUID;
BEGIN
  IF NEW.amount < 0 THEN
    RETURN NEW;
  END IF;

  v_branch_id := NULL;
  IF NEW.invoice_id IS NOT NULL THEN
    SELECT branch_id INTO v_branch_id FROM invoices WHERE id = NEW.invoice_id LIMIT 1;
  END IF;
  IF v_branch_id IS NULL AND NEW.bill_id IS NOT NULL THEN
    SELECT branch_id INTO v_branch_id FROM bills WHERE id = NEW.bill_id LIMIT 1;
  END IF;
  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id FROM branches
    WHERE company_id = NEW.company_id AND is_active = TRUE
    ORDER BY is_main DESC NULLS LAST, name LIMIT 1;
  END IF;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'No branch found for company. Create at least one branch.';
  END IF;

  -- v3.74.219 — Resolve the payment FX context from the row.
  -- v3.75.63 — العملةُ تُسألُ من بيتِها الواحدِ ولا تُفترَض («ولا تُخترَعُ عملة»).
  v_base_ccy := public.erp_company_base_currency(NEW.company_id);
  v_pay_ccy := UPPER(COALESCE(NEW.currency_code, v_base_ccy));
  v_pay_rate := COALESCE(NULLIF(NEW.exchange_rate_used, 0), NULLIF(NEW.exchange_rate, 0), 1);
  v_pay_orig_amount := COALESCE(NEW.original_amount,
    CASE WHEN v_pay_ccy = v_base_ccy THEN NEW.amount ELSE NEW.amount / NULLIF(v_pay_rate, 0) END);
  v_pay_base_amount := COALESCE(NEW.base_currency_amount, NEW.amount);
  v_pay_rate_id := NEW.exchange_rate_id;

  IF NEW.invoice_id IS NOT NULL THEN
    SELECT id INTO v_ar_account_id FROM chart_of_accounts
    WHERE company_id = NEW.company_id
      AND (sub_type = 'accounts_receivable' OR account_name ILIKE '%receivable%')
    LIMIT 1;

    v_account_id := COALESCE(NEW.account_id, NULL);
    IF v_account_id IS NULL THEN
      SELECT id INTO v_account_id FROM chart_of_accounts
      WHERE company_id = NEW.company_id AND (sub_type = 'cash' OR sub_type = 'bank')
      LIMIT 1;
    END IF;

    IF v_ar_account_id IS NULL OR v_account_id IS NULL THEN
      RAISE WARNING 'الحسابات المطلوبة غير موجودة للدفعة';
      RETURN NEW;
    END IF;

    -- v3.74.219 — resolve the cash account's native currency so the line
    -- gets stamped with the right original_debit + rate.
    SELECT UPPER(COALESCE(original_currency, v_base_ccy))
      INTO v_cash_acc_ccy FROM chart_of_accounts WHERE id = v_account_id;
    IF v_cash_acc_ccy = v_pay_ccy THEN
      v_cash_native := v_pay_orig_amount;
      v_cash_rate := v_pay_rate;
      v_cash_rate_id := v_pay_rate_id;
    ELSIF v_cash_acc_ccy = v_base_ccy THEN
      v_cash_native := v_pay_base_amount;
      v_cash_rate := 1;
      v_cash_rate_id := NULL;
    ELSE
      v_cash_native := v_pay_base_amount;  -- best-effort; cross-currency between two non-base currencies is rare
      v_cash_rate := 1;
      v_cash_rate_id := NULL;
    END IF;

    PERFORM set_config('app.allow_direct_post', 'true', true);

    INSERT INTO journal_entries (
      company_id, branch_id, reference_type, reference_id, entry_date, description, status
    ) VALUES (
      NEW.company_id, v_branch_id, 'invoice_payment', NEW.invoice_id, NEW.payment_date, 'دفعة فاتورة', 'draft'
    ) RETURNING id INTO v_journal_entry_id;

    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount, description,
      original_debit, original_credit, original_currency, exchange_rate_used, exchange_rate_id
    ) VALUES
    (v_journal_entry_id, v_account_id, v_pay_base_amount, 0, 'نقد/بنك',
     v_cash_native, 0, v_cash_acc_ccy, v_cash_rate, v_cash_rate_id),
    (v_journal_entry_id, v_ar_account_id, 0, v_pay_base_amount, 'الذمم المدينة',
     0, v_pay_base_amount, v_base_ccy, 1, NULL);

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_entry_id;
    UPDATE payments SET journal_entry_id = v_journal_entry_id WHERE id = NEW.id;

    PERFORM set_config('app.allow_direct_post', 'false', true);
  END IF;

  IF NEW.bill_id IS NOT NULL THEN
    SELECT id INTO v_ap_account_id FROM chart_of_accounts
    WHERE company_id = NEW.company_id
      AND (sub_type = 'accounts_payable' OR account_name ILIKE '%payable%')
    LIMIT 1;

    v_account_id := COALESCE(NEW.account_id, NULL);
    IF v_account_id IS NULL THEN
      SELECT id INTO v_account_id FROM chart_of_accounts
      WHERE company_id = NEW.company_id AND (sub_type = 'cash' OR sub_type = 'bank')
      LIMIT 1;
    END IF;
    IF v_ap_account_id IS NULL OR v_account_id IS NULL THEN
      RAISE WARNING 'الحسابات المطلوبة غير موجودة للدفعة';
      RETURN NEW;
    END IF;

    SELECT UPPER(COALESCE(original_currency, v_base_ccy))
      INTO v_cash_acc_ccy FROM chart_of_accounts WHERE id = v_account_id;
    IF v_cash_acc_ccy = v_pay_ccy THEN
      v_cash_native := v_pay_orig_amount;
      v_cash_rate := v_pay_rate;
      v_cash_rate_id := v_pay_rate_id;
    ELSIF v_cash_acc_ccy = v_base_ccy THEN
      v_cash_native := v_pay_base_amount;
      v_cash_rate := 1;
      v_cash_rate_id := NULL;
    ELSE
      v_cash_native := v_pay_base_amount;
      v_cash_rate := 1;
      v_cash_rate_id := NULL;
    END IF;

    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (
      company_id, branch_id, reference_type, reference_id, entry_date, description, status
    ) VALUES (
      NEW.company_id, v_branch_id, 'bill_payment', NEW.bill_id, NEW.payment_date, 'دفعة فاتورة شراء', 'draft'
    ) RETURNING id INTO v_journal_entry_id;

    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount, description,
      original_debit, original_credit, original_currency, exchange_rate_used, exchange_rate_id
    ) VALUES
    (v_journal_entry_id, v_ap_account_id, v_pay_base_amount, 0, 'الذمم الدائنة',
     v_pay_base_amount, 0, v_base_ccy, 1, NULL),
    (v_journal_entry_id, v_account_id, 0, v_pay_base_amount, 'نقد/بنك',
     0, v_cash_native, v_cash_acc_ccy, v_cash_rate, v_cash_rate_id);

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_entry_id;
    UPDATE payments SET journal_entry_id = v_journal_entry_id WHERE id = NEW.id;
    PERFORM set_config('app.allow_direct_post', 'false', true);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.allow_direct_post', 'false', true);
  RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dispose_asset(p_asset_id uuid, p_disposal_date date, p_disposal_amount numeric, p_disposal_reason text, p_deposit_account_id uuid, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_asset RECORD;
  v_state JSONB;
  v_current_book_value DECIMAL;
  v_gain_loss DECIMAL;
  v_journal_id UUID;
  v_transaction_id UUID;
  v_company_id UUID;
  v_asset_account_id UUID;
  v_gain_loss_account_id UUID;
  v_base_ccy TEXT;
  v_role TEXT;
BEGIN
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  IF v_asset IS NULL THEN RAISE EXCEPTION 'Asset not found'; END IF;
  IF v_asset.status = 'disposed' THEN RAISE EXCEPTION 'Asset already disposed'; END IF;

  v_company_id       := v_asset.company_id;
  v_asset_account_id := v_asset.asset_account_id;

  -- v3.74.565 — SoD
  SELECT role INTO v_role FROM company_members
   WHERE company_id = v_company_id AND user_id = p_user_id LIMIT 1;
  IF NOT (COALESCE(v_role,'') IN ('owner','admin')) THEN
    IF v_asset.created_by = p_user_id THEN
      RAISE EXCEPTION 'SOD_VIOLATION: منشِئ الأصل لا يستطيع تسجيل التصرف — يحتاج مالك/مدير عام';
    END IF;
  END IF;

  -- v3.74.565 — period lock
  BEGIN
    PERFORM public.require_open_financial_period_db(v_company_id, p_disposal_date);
  EXCEPTION WHEN undefined_function THEN NULL; END;

  v_state := get_asset_current_state(p_asset_id);
  v_current_book_value := (v_state->>'book_value')::DECIMAL;
  v_gain_loss := p_disposal_amount - v_current_book_value;

  -- Gain/Loss account
  SELECT id INTO v_gain_loss_account_id FROM public.chart_of_accounts
   WHERE company_id = v_company_id
     AND (account_name ILIKE '%Gain%' OR account_name ILIKE '%Loss%' OR account_name ILIKE '%Disposal%'
          OR account_name ILIKE '%أرباح%بيع%' OR account_name ILIKE '%خسائر%بيع%' OR account_name ILIKE '%التصرف%')
   LIMIT 1;
  IF v_gain_loss_account_id IS NULL THEN
    SELECT id INTO v_gain_loss_account_id FROM public.chart_of_accounts
     WHERE company_id = v_company_id AND account_type = 'income' LIMIT 1;
    IF v_gain_loss_account_id IS NULL THEN
      SELECT id INTO v_gain_loss_account_id FROM public.chart_of_accounts
       WHERE company_id = v_company_id AND account_type = 'expense' LIMIT 1;
    END IF;
  END IF;

  -- v3.75.63 — العملةُ تُسألُ من بيتِها الواحدِ ولا تُفترَض («ولا تُخترَعُ عملة»).
  v_base_ccy := public.erp_company_base_currency(v_company_id);

  INSERT INTO public.journal_entries (
    company_id, branch_id, cost_center_id,
    entry_date, description, reference_type, reference_id,
    status
  ) VALUES (
    v_company_id, v_asset.branch_id, v_asset.cost_center_id,
    p_disposal_date,
    'تصرف فى أصل: ' || v_asset.name || ' — ' || COALESCE(p_disposal_reason, ''),
    'asset_disposal', p_asset_id,
    'draft'
  ) RETURNING id INTO v_journal_id;

  -- v3.74.565 — write IAS 21 columns
  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, description,
    debit_amount, credit_amount,
    original_debit, original_credit, original_currency,
    exchange_rate_used, branch_id, cost_center_id
  )
  SELECT
    v_journal_id, p_deposit_account_id, 'متحصلات التصرف',
    p_disposal_amount, 0,
    p_disposal_amount, 0, v_base_ccy,
    1, v_asset.branch_id, v_asset.cost_center_id
  WHERE p_disposal_amount > 0
  UNION ALL
  SELECT
    v_journal_id, v_asset_account_id, 'استبعاد القيمة الدفترية',
    0, v_current_book_value,
    0, v_current_book_value, v_base_ccy,
    1, v_asset.branch_id, v_asset.cost_center_id
  UNION ALL
  SELECT
    v_journal_id, v_gain_loss_account_id, 'ربح تصرف',
    0, v_gain_loss,
    0, v_gain_loss, v_base_ccy,
    1, v_asset.branch_id, v_asset.cost_center_id
  WHERE v_gain_loss > 0
  UNION ALL
  SELECT
    v_journal_id, v_gain_loss_account_id, 'خسارة تصرف',
    ABS(v_gain_loss), 0,
    ABS(v_gain_loss), 0, v_base_ccy,
    1, v_asset.branch_id, v_asset.cost_center_id
  WHERE v_gain_loss < 0;

  UPDATE public.journal_entries
     SET status = 'posted', posted_by = p_user_id, posted_at = NOW()
   WHERE id = v_journal_id;

  INSERT INTO public.asset_transactions (
    company_id, asset_id, transaction_type, transaction_date, amount, reference_id, details, created_by
  ) VALUES (
    v_company_id, p_asset_id, 'disposal', p_disposal_date,
    -v_current_book_value, v_journal_id,
    jsonb_build_object(
      'disposal_amount', p_disposal_amount,
      'gain_loss', v_gain_loss,
      'book_value_at_disposal', v_current_book_value,
      'disposal_reason', p_disposal_reason
    ),
    p_user_id
  ) RETURNING id INTO v_transaction_id;

  -- v3.74.565 — persist the disposal metadata on the asset
  UPDATE public.fixed_assets
     SET status              = 'disposed',
         disposal_date       = p_disposal_date,
         disposal_amount     = p_disposal_amount,
         disposal_reason     = p_disposal_reason,
         disposal_journal_id = v_journal_id,
         book_value          = 0,
         updated_at          = NOW(),
         updated_by          = p_user_id
   WHERE id = p_asset_id;

  DELETE FROM public.depreciation_schedules
   WHERE asset_id = p_asset_id AND status = 'pending';

  RETURN v_transaction_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.execute_payment_correction(p_request_id uuid, p_company_id uuid, p_executor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_req         record;
  v_original    record;
  v_orig_journal record;
  v_new_journal_id uuid := NULL;
  v_void_payment_id uuid;
  v_new_payment_id uuid := NULL;
  v_new_journal_post_id uuid := NULL;
  v_invoice     record;
  v_proposed    jsonb;
  v_new_amount  numeric;
  v_new_date    date;
  v_new_account uuid;
  v_new_method  text;
  v_new_ref     text;
  v_new_notes   text;
  v_ar_account  uuid;
  v_has_changes boolean;
  v_company_base_ccy text;
  v_has_orig_journal boolean;
  v_ledger_rec  record;
  v_ledger_undone int := 0;
  v_legacy_rolled int := 0;
  v_new_currency text;
  v_new_rate     numeric;
  v_new_base     numeric;
  v_orig_base    numeric;
  v_currency_changed    boolean;
  v_orig_currency_upper text;
BEGIN
  -- v3.74.730 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access(p_company_id);
  SELECT * INTO v_req FROM customer_refund_requests
  WHERE id = p_request_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.status <> 'approved' THEN RAISE EXCEPTION 'REQUEST_NOT_APPROVED'; END IF;
  IF v_req.source_type <> 'payment_correction' THEN RAISE EXCEPTION 'NOT_PAYMENT_CORRECTION'; END IF;
  IF v_req.original_payment_id IS NULL THEN RAISE EXCEPTION 'MISSING_ORIGINAL_PAYMENT'; END IF;

  SELECT * INTO v_original FROM payments WHERE id = v_req.original_payment_id FOR UPDATE;
  IF NOT FOUND OR v_original.voided_by_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_VOIDED_OR_MISSING';
  END IF;

  -- v3.74.546 — load base ccy up front.
  -- v3.75.63 — العملةُ تُسألُ من بيتِها الواحدِ ولا تُفترَض («ولا تُخترَعُ عملة»).
  v_company_base_ccy := public.erp_company_base_currency(p_company_id);

  v_has_orig_journal := v_original.journal_entry_id IS NOT NULL;
  IF v_has_orig_journal THEN
    SELECT * INTO v_orig_journal FROM journal_entries WHERE id = v_original.journal_entry_id;
    IF v_orig_journal.id IS NULL THEN v_has_orig_journal := false; END IF;
  END IF;

  v_orig_base := COALESCE(v_original.base_currency_amount,
                          v_original.amount * COALESCE(NULLIF(v_original.exchange_rate, 0), 1));

  IF v_has_orig_journal THEN
    INSERT INTO journal_entries (
      company_id, branch_id, cost_center_id, reference_type, reference_id,
      entry_date, description, status
    ) VALUES (
      v_orig_journal.company_id, v_orig_journal.branch_id, v_orig_journal.cost_center_id,
      'payment_reversal', v_original.id, CURRENT_DATE,
      'تَصحيح / عَكس للدَّفعَة ' || COALESCE(v_original.reference_number, v_original.id::text) || ' — ' || COALESCE(v_req.notes, ''),
      'draft'
    ) RETURNING id INTO v_new_journal_id;

    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount,
      description, branch_id, cost_center_id, original_debit, original_credit, original_currency
    )
    SELECT v_new_journal_id, account_id, credit_amount, debit_amount,
           'عَكس قَيد — ' || COALESCE(description, ''), branch_id, cost_center_id,
           original_credit, original_debit, original_currency
    FROM journal_entry_lines WHERE journal_entry_id = v_original.journal_entry_id;

    UPDATE journal_entries SET status = 'posted' WHERE id = v_new_journal_id;
  END IF;

  INSERT INTO payments (
    company_id, customer_id, invoice_id, payment_date,
    amount, payment_method, reference_number, notes,
    account_id, journal_entry_id, branch_id, cost_center_id,
    currency_code, exchange_rate, base_currency_amount,
    original_currency, original_amount,
    status, created_by, voids_payment_id, void_reason, voided_at, voided_by, unallocated_amount
  ) VALUES (
    v_original.company_id, v_original.customer_id, v_original.invoice_id, CURRENT_DATE,
    -v_original.amount, v_original.payment_method,
    'VOID-' || COALESCE(v_original.reference_number, SUBSTRING(v_original.id::text FROM 1 FOR 8)),
    'تَصحيح: ' || COALESCE(v_req.notes, '') || ' — يُلغى الدَّفعَة الأَصلية' ||
      CASE WHEN v_has_orig_journal THEN '' ELSE ' (بدون عَكس قَيد - الأَصل بدون قَيد GL)' END,
    v_original.account_id, v_new_journal_id, v_original.branch_id, v_original.cost_center_id,
    v_original.currency_code, v_original.exchange_rate, -v_orig_base,
    v_original.original_currency, -v_original.original_amount,
    'approved', p_executor_id, v_original.id, v_req.notes, NOW(), p_executor_id, 0
  ) RETURNING id INTO v_void_payment_id;

  UPDATE payments SET
    voided_by_payment_id = v_void_payment_id, voided_at = NOW(),
    voided_by = p_executor_id, void_reason = v_req.notes
  WHERE id = v_original.id;

  IF v_original.invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice FROM invoices WHERE id = v_original.invoice_id FOR UPDATE;
    IF FOUND THEN
      UPDATE invoices SET
        paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_orig_base),
        status = CASE
          WHEN GREATEST(0, COALESCE(paid_amount, 0) - v_orig_base) <= 0 THEN 'sent'
          WHEN GREATEST(0, COALESCE(paid_amount, 0) - v_orig_base)
               >= GREATEST(0, total_amount - COALESCE(returned_amount,0)) THEN 'paid'
          ELSE 'partially_paid' END,
        updated_at = NOW()
      WHERE id = v_invoice.id;
    END IF;
  END IF;

  FOR v_ledger_rec IN
    SELECT id, source_type, amount, description
    FROM customer_credit_ledger
    WHERE source_id = v_original.id
      AND customer_id = v_original.customer_id
  LOOP
    INSERT INTO customer_credit_ledger (
      company_id, customer_id, source_type, source_id, journal_entry_id, amount, description, created_by
    ) VALUES (
      v_original.company_id, v_original.customer_id, 'correction_reversal',
      p_request_id, v_new_journal_id, -v_ledger_rec.amount,
      'عَكس أَثَر "' || v_ledger_rec.source_type || '" على الرَّصيد بسَبَب تَصحيح الدَّفعَة — ' || COALESCE(v_req.notes, ''),
      p_executor_id
    );
    v_ledger_undone := v_ledger_undone + 1;

    IF v_ledger_rec.source_type = 'customer_refund' THEN
      UPDATE customer_credits cc
      SET used_amount = GREATEST(0, COALESCE(cc.used_amount, 0) - ABS(v_ledger_rec.amount)),
          status = CASE
            WHEN cc.applied_amount > 0
              AND cc.applied_amount < cc.amount
              AND GREATEST(0, COALESCE(cc.used_amount,0) - ABS(v_ledger_rec.amount)) = 0 THEN 'partially_used'
            WHEN cc.applied_amount = 0
              AND GREATEST(0, COALESCE(cc.used_amount,0) - ABS(v_ledger_rec.amount)) = 0 THEN 'active'
            ELSE cc.status
          END,
          updated_at = NOW()
      WHERE cc.customer_id = v_original.customer_id
        AND cc.company_id = v_original.company_id
        AND cc.used_amount > 0;
      GET DIAGNOSTICS v_legacy_rolled = ROW_COUNT;
    ELSIF v_ledger_rec.source_type = 'overpayment' THEN
      UPDATE customer_credits cc
      SET amount = GREATEST(0, COALESCE(cc.amount, 0) - ABS(v_ledger_rec.amount)),
          status = CASE
            WHEN GREATEST(0, COALESCE(cc.amount,0) - ABS(v_ledger_rec.amount))
                 <= COALESCE(cc.applied_amount,0) + COALESCE(cc.used_amount,0) THEN 'used'
            ELSE cc.status
          END,
          updated_at = NOW()
      WHERE cc.customer_id = v_original.customer_id
        AND cc.company_id = v_original.company_id
        AND cc.reference_id = v_original.id;
      GET DIAGNOSTICS v_legacy_rolled = ROW_COUNT;
    END IF;
  END LOOP;

  IF v_original.payment_method = 'customer_credit' AND v_ledger_undone = 0 THEN
    INSERT INTO customer_credit_ledger (
      company_id, customer_id, source_type, source_id, journal_entry_id, amount, description, created_by
    ) VALUES (
      v_original.company_id, v_original.customer_id, 'credit_applied',
      v_original.invoice_id, v_new_journal_id, v_original.amount,
      'إِلغاء تَطبيق رَصيد دائن — تَصحيح: ' || COALESCE(v_req.notes, ''), p_executor_id
    );
    v_ledger_undone := 1;
  END IF;

  v_proposed := COALESCE(v_req.metadata -> 'proposed_changes', '{}'::jsonb);
  v_has_changes := (v_proposed ? 'amount') OR (v_proposed ? 'payment_date') OR
                   (v_proposed ? 'account_id') OR (v_proposed ? 'payment_method') OR
                   (v_proposed ? 'reference_number') OR (v_proposed ? 'notes') OR
                   (v_proposed ? 'original_currency') OR (v_proposed ? 'exchange_rate');

  IF v_has_changes THEN
    v_new_amount := COALESCE((v_proposed->>'amount')::numeric, v_original.amount);
    v_new_date   := COALESCE((v_proposed->>'payment_date')::date, v_original.payment_date);
    v_new_account := COALESCE(NULLIF(v_proposed->>'account_id','')::uuid, v_original.account_id);
    v_new_method := COALESCE(NULLIF(v_proposed->>'payment_method',''), v_original.payment_method);
    v_new_ref    := COALESCE(NULLIF(v_proposed->>'reference_number',''), v_original.reference_number);
    v_new_notes  := COALESCE(NULLIF(v_proposed->>'notes',''), v_original.notes);

    -- v3.74.546 — new currency + rate logic (mirror of vendor side).
    v_new_currency := UPPER(COALESCE(NULLIF(v_proposed->>'original_currency',''),
                                     v_original.original_currency,
                                     v_original.currency_code, v_company_base_ccy));

    v_orig_currency_upper := UPPER(COALESCE(v_original.original_currency,
                                            v_original.currency_code,
                                            v_company_base_ccy));
    v_currency_changed := v_new_currency <> v_orig_currency_upper;

    IF v_new_currency = v_company_base_ccy THEN
      v_new_rate := 1;
    ELSIF v_proposed ? 'exchange_rate' AND
          (v_proposed->>'exchange_rate') IS NOT NULL AND
          (v_proposed->>'exchange_rate') <> '' THEN
      v_new_rate := (v_proposed->>'exchange_rate')::numeric;
      IF v_new_rate IS NULL OR v_new_rate <= 0 THEN v_new_rate := 1; END IF;
    ELSIF NOT v_currency_changed THEN
      v_new_rate := COALESCE(NULLIF(v_original.exchange_rate, 0), 1);
    ELSE
      v_new_rate := 1;
    END IF;

    v_new_base := ROUND(v_new_amount * v_new_rate, 4);

    IF v_original.invoice_id IS NOT NULL THEN
      SELECT id INTO v_ar_account FROM chart_of_accounts
      WHERE company_id = p_company_id AND is_active = true
        AND (sub_type = 'accounts_receivable'
             OR account_name ILIKE '%receivable%'
             OR account_name ILIKE '%الذمم المدينة%')
      ORDER BY CASE WHEN sub_type = 'accounts_receivable' THEN 0 ELSE 1 END LIMIT 1;
    END IF;

    INSERT INTO journal_entries (
      company_id, branch_id, cost_center_id, reference_type, reference_id,
      entry_date, description, status
    ) VALUES (
      v_original.company_id, v_original.branch_id, v_original.cost_center_id,
      'payment_correction_repost', p_request_id, v_new_date,
      'تَصحيح وَإِعادَة تَسجيل دَفعَة عَلى ' || COALESCE(v_original.reference_number, v_original.id::text),
      'draft'
    ) RETURNING id INTO v_new_journal_post_id;

    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount,
      description, branch_id, cost_center_id
    ) VALUES
      (v_new_journal_post_id, v_new_account, v_new_base, 0,
       'دَفعَة بَعد التَّصحيح', v_original.branch_id, v_original.cost_center_id);

    IF v_ar_account IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, debit_amount, credit_amount,
        description, branch_id, cost_center_id
      ) VALUES (
        v_new_journal_post_id, v_ar_account, 0, v_new_base,
        'سَداد فاتورَة - تَصحيح', v_original.branch_id, v_original.cost_center_id
      );
    END IF;

    UPDATE journal_entries SET status = 'posted' WHERE id = v_new_journal_post_id;

    INSERT INTO payments (
      company_id, customer_id, invoice_id, payment_date,
      amount, payment_method, reference_number, notes,
      account_id, journal_entry_id, branch_id, cost_center_id,
      currency_code, exchange_rate, base_currency_amount,
      original_currency, original_amount,
      status, created_by, unallocated_amount
    ) VALUES (
      v_original.company_id, v_original.customer_id, v_original.invoice_id, v_new_date,
      v_new_amount, v_new_method,
      COALESCE(v_new_ref, 'CORR-' || SUBSTRING(p_request_id::text FROM 1 FOR 8)),
      'تَصحيح مُعتَمَد: ' || COALESCE(v_new_notes, ''),
      v_new_account, v_new_journal_post_id, v_original.branch_id, v_original.cost_center_id,
      v_new_currency, v_new_rate, v_new_base,
      v_new_currency, v_new_amount,
      'approved', p_executor_id, 0
    ) RETURNING id INTO v_new_payment_id;

    IF v_original.invoice_id IS NOT NULL THEN
      UPDATE invoices SET
        paid_amount = COALESCE(paid_amount, 0) + v_new_base,
        status = CASE
          WHEN COALESCE(paid_amount, 0) + v_new_base
               >= GREATEST(0, total_amount - COALESCE(returned_amount, 0)) THEN 'paid'
          ELSE 'partially_paid' END,
        updated_at = NOW()
      WHERE id = v_original.invoice_id;
    END IF;
  END IF;

  UPDATE customer_refund_requests SET
    status = 'executed',
    executed_by = p_executor_id,
    executed_at = NOW(),
    reversal_payment_id = v_void_payment_id,
    reversal_journal_entry_id = v_new_journal_id,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'new_payment_id',       v_new_payment_id,
      'new_journal_entry_id', v_new_journal_post_id,
      'original_had_journal', v_has_orig_journal,
      'credit_ledger_undone', v_ledger_undone,
      'legacy_credits_rolled', v_legacy_rolled
    ),
    updated_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'original_payment_id', v_original.id,
    'reversal_payment_id', v_void_payment_id,
    'reversal_journal_entry_id', v_new_journal_id,
    'new_payment_id', v_new_payment_id,
    'new_journal_entry_id', v_new_journal_post_id,
    'original_had_journal', v_has_orig_journal,
    'credit_ledger_undone', v_ledger_undone,
    'legacy_credits_rolled', v_legacy_rolled
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.execute_vendor_payment_correction(p_request_id uuid, p_company_id uuid, p_executor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_req                 record;
  v_original            record;
  v_orig_journal        record;
  v_new_journal_id      uuid := NULL;
  v_void_payment_id     uuid;
  v_new_payment_id      uuid := NULL;
  v_new_journal_post_id uuid := NULL;
  v_bill                record;
  v_proposed            jsonb;
  v_new_amount          numeric;
  v_new_date            date;
  v_new_account         uuid;
  v_new_method          text;
  v_new_ref             text;
  v_new_notes           text;
  v_ap_account          uuid;
  v_has_changes         boolean;
  v_company_base_ccy    text;
  v_has_orig_journal    boolean;
  v_new_currency        text;
  v_new_rate            numeric;
  v_new_base            numeric;
  v_orig_base           numeric;
  v_currency_changed    boolean;
  v_orig_currency_upper text;
BEGIN
  -- v3.74.730 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access(p_company_id);
  SELECT * INTO v_req FROM vendor_payment_correction_requests
   WHERE id = p_request_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.status <> 'approved' THEN RAISE EXCEPTION 'REQUEST_NOT_APPROVED'; END IF;
  IF v_req.source_type <> 'payment_correction' THEN RAISE EXCEPTION 'NOT_PAYMENT_CORRECTION'; END IF;
  IF v_req.original_payment_id IS NULL THEN RAISE EXCEPTION 'MISSING_ORIGINAL_PAYMENT'; END IF;

  SELECT * INTO v_original FROM payments
   WHERE id = v_req.original_payment_id FOR UPDATE;
  IF NOT FOUND OR v_original.voided_by_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_VOIDED_OR_MISSING';
  END IF;

  PERFORM set_config('app.correction_bypass', 'on', true);

  -- v3.74.546 — load base ccy up front so rate logic can see it.
  -- v3.75.63 — العملةُ تُسألُ من بيتِها الواحدِ ولا تُفترَض («ولا تُخترَعُ عملة»).
  v_company_base_ccy := public.erp_company_base_currency(p_company_id);

  v_has_orig_journal := v_original.journal_entry_id IS NOT NULL;
  IF v_has_orig_journal THEN
    SELECT * INTO v_orig_journal FROM journal_entries WHERE id = v_original.journal_entry_id;
    IF v_orig_journal.id IS NULL THEN v_has_orig_journal := false; END IF;
  END IF;

  v_orig_base := COALESCE(v_original.base_currency_amount,
                          v_original.amount * COALESCE(NULLIF(v_original.exchange_rate, 0), 1));

  IF v_has_orig_journal THEN
    INSERT INTO journal_entries (
      company_id, branch_id, cost_center_id, reference_type, reference_id,
      entry_date, description, status
    ) VALUES (
      v_orig_journal.company_id, v_orig_journal.branch_id, v_orig_journal.cost_center_id,
      'payment_reversal', v_original.id, CURRENT_DATE,
      'تَصحيح / عَكس لدَفعَة مُورِّد ' || COALESCE(v_original.reference_number, v_original.id::text) || ' — ' || COALESCE(v_req.notes, ''),
      'draft'
    ) RETURNING id INTO v_new_journal_id;

    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount,
      description, branch_id, cost_center_id, original_debit, original_credit, original_currency
    )
    SELECT v_new_journal_id, account_id, credit_amount, debit_amount,
           'عَكس قَيد — ' || COALESCE(description, ''), branch_id, cost_center_id,
           original_credit, original_debit, original_currency
    FROM journal_entry_lines WHERE journal_entry_id = v_original.journal_entry_id;

    UPDATE journal_entries SET status = 'posted' WHERE id = v_new_journal_id;
  END IF;

  INSERT INTO payments (
    company_id, supplier_id, bill_id, payment_date,
    amount, payment_method, reference_number, notes,
    account_id, journal_entry_id, branch_id, cost_center_id,
    currency_code, exchange_rate, base_currency_amount,
    original_currency, original_amount,
    status, created_by, voids_payment_id, void_reason, voided_at, voided_by, unallocated_amount
  ) VALUES (
    v_original.company_id, v_original.supplier_id, v_original.bill_id, CURRENT_DATE,
    -v_original.amount, v_original.payment_method,
    'VOID-' || COALESCE(v_original.reference_number, SUBSTRING(v_original.id::text FROM 1 FOR 8)),
    'تَصحيح: ' || COALESCE(v_req.notes, '') || ' — يُلغى الدَّفعَة الأَصلية لِلمُورِّد' ||
      CASE WHEN v_has_orig_journal THEN '' ELSE ' (بدون عَكس قَيد - الأَصل بدون قَيد GL)' END,
    v_original.account_id, v_new_journal_id, v_original.branch_id, v_original.cost_center_id,
    v_original.currency_code, v_original.exchange_rate, -v_orig_base,
    v_original.original_currency, -v_original.original_amount,
    'approved', p_executor_id, v_original.id, v_req.notes, NOW(), p_executor_id, 0
  ) RETURNING id INTO v_void_payment_id;

  UPDATE payments SET
    voided_by_payment_id = v_void_payment_id, voided_at = NOW(),
    voided_by = p_executor_id, void_reason = v_req.notes
  WHERE id = v_original.id;

  IF v_original.bill_id IS NOT NULL THEN
    SELECT * INTO v_bill FROM bills WHERE id = v_original.bill_id FOR UPDATE;
    IF FOUND THEN
      UPDATE bills SET
        paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_orig_base),
        status = CASE
          WHEN GREATEST(0, COALESCE(paid_amount, 0) - v_orig_base) <= 0 THEN 'received'
          WHEN GREATEST(0, COALESCE(paid_amount, 0) - v_orig_base)
               >= GREATEST(0, total_amount - COALESCE(returned_amount,0)) THEN 'paid'
          ELSE 'partially_paid' END,
        updated_at = NOW()
      WHERE id = v_bill.id;
    END IF;
  END IF;

  v_proposed := COALESCE(v_req.metadata -> 'proposed_changes', '{}'::jsonb);
  v_has_changes := (v_proposed ? 'amount') OR (v_proposed ? 'payment_date') OR
                   (v_proposed ? 'account_id') OR (v_proposed ? 'payment_method') OR
                   (v_proposed ? 'reference_number') OR (v_proposed ? 'notes') OR
                   (v_proposed ? 'original_currency') OR (v_proposed ? 'exchange_rate');

  IF v_has_changes THEN
    v_new_amount  := COALESCE((v_proposed->>'amount')::numeric, v_original.amount);
    v_new_date    := COALESCE((v_proposed->>'payment_date')::date, v_original.payment_date);
    v_new_account := COALESCE(NULLIF(v_proposed->>'account_id','')::uuid, v_original.account_id);
    v_new_method  := COALESCE(NULLIF(v_proposed->>'payment_method',''), v_original.payment_method);
    v_new_ref     := COALESCE(NULLIF(v_proposed->>'reference_number',''), v_original.reference_number);
    v_new_notes   := COALESCE(NULLIF(v_proposed->>'notes',''), v_original.notes);

    -- v3.74.546 — new currency + rate logic (see file header).
    v_new_currency := UPPER(COALESCE(NULLIF(v_proposed->>'original_currency',''),
                                     v_original.original_currency,
                                     v_original.currency_code, v_company_base_ccy));

    v_orig_currency_upper := UPPER(COALESCE(v_original.original_currency,
                                            v_original.currency_code,
                                            v_company_base_ccy));
    v_currency_changed := v_new_currency <> v_orig_currency_upper;

    IF v_new_currency = v_company_base_ccy THEN
      -- Base ccy → parity, ignoring any inherited rate.
      v_new_rate := 1;
    ELSIF v_proposed ? 'exchange_rate' AND
          (v_proposed->>'exchange_rate') IS NOT NULL AND
          (v_proposed->>'exchange_rate') <> '' THEN
      v_new_rate := (v_proposed->>'exchange_rate')::numeric;
      IF v_new_rate IS NULL OR v_new_rate <= 0 THEN v_new_rate := 1; END IF;
    ELSIF NOT v_currency_changed THEN
      -- Same currency → keep the original rate (it still applies).
      v_new_rate := COALESCE(NULLIF(v_original.exchange_rate, 0), 1);
    ELSE
      -- Currency changed but no rate provided → parity (safest default).
      v_new_rate := 1;
    END IF;

    v_new_base := ROUND(v_new_amount * v_new_rate, 4);

    IF v_original.bill_id IS NOT NULL THEN
      SELECT id INTO v_ap_account FROM chart_of_accounts
       WHERE company_id = p_company_id AND is_active = true
         AND (sub_type = 'accounts_payable'
              OR account_code = '2110'
              OR account_name ILIKE '%payable%'
              OR account_name ILIKE '%الموردين%'
              OR account_name ILIKE '%الذمم الدائنة%')
       ORDER BY CASE WHEN account_code = '2110' THEN 0
                     WHEN sub_type = 'accounts_payable' THEN 1
                     ELSE 2 END LIMIT 1;
    END IF;

    INSERT INTO journal_entries (
      company_id, branch_id, cost_center_id, reference_type, reference_id,
      entry_date, description, status
    ) VALUES (
      v_original.company_id, v_original.branch_id, v_original.cost_center_id,
      'payment_correction_repost', p_request_id, v_new_date,
      'تَصحيح وَإِعادَة تَسجيل دَفعَة مُورِّد عَلى ' || COALESCE(v_original.reference_number, v_original.id::text),
      'draft'
    ) RETURNING id INTO v_new_journal_post_id;

    IF v_ap_account IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, debit_amount, credit_amount,
        description, branch_id, cost_center_id
      ) VALUES (
        v_new_journal_post_id, v_ap_account, v_new_base, 0,
        'سَداد فاتورَة مُورِّد - تَصحيح', v_original.branch_id, v_original.cost_center_id
      );
    END IF;

    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount,
      description, branch_id, cost_center_id
    ) VALUES
      (v_new_journal_post_id, v_new_account, 0, v_new_base,
       'دَفعَة بَعد التَّصحيح', v_original.branch_id, v_original.cost_center_id);

    UPDATE journal_entries SET status = 'posted' WHERE id = v_new_journal_post_id;

    INSERT INTO payments (
      company_id, supplier_id, bill_id, payment_date,
      amount, payment_method, reference_number, notes,
      account_id, journal_entry_id, branch_id, cost_center_id,
      currency_code, exchange_rate, base_currency_amount,
      original_currency, original_amount,
      status, created_by, unallocated_amount
    ) VALUES (
      v_original.company_id, v_original.supplier_id, v_original.bill_id, v_new_date,
      v_new_amount, v_new_method,
      COALESCE(v_new_ref, 'CORR-' || SUBSTRING(p_request_id::text FROM 1 FOR 8)),
      'تَصحيح مُعتَمَد: ' || COALESCE(v_new_notes, ''),
      v_new_account, v_new_journal_post_id, v_original.branch_id, v_original.cost_center_id,
      v_new_currency, v_new_rate, v_new_base,
      v_new_currency, v_new_amount,
      'approved', p_executor_id, 0
    ) RETURNING id INTO v_new_payment_id;

    IF v_original.bill_id IS NOT NULL THEN
      UPDATE bills SET
        paid_amount = COALESCE(paid_amount, 0) + v_new_base,
        status = CASE
          WHEN COALESCE(paid_amount, 0) + v_new_base
               >= GREATEST(0, total_amount - COALESCE(returned_amount, 0)) THEN 'paid'
          ELSE 'partially_paid' END,
        updated_at = NOW()
      WHERE id = v_original.bill_id;
    END IF;
  END IF;

  UPDATE vendor_payment_correction_requests SET
    status = 'executed',
    executed_by = p_executor_id,
    executed_at = NOW(),
    reversal_payment_id = v_void_payment_id,
    reversal_journal_entry_id = v_new_journal_id,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'new_payment_id',       v_new_payment_id,
      'new_journal_entry_id', v_new_journal_post_id,
      'original_had_journal', v_has_orig_journal
    ),
    updated_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'original_payment_id', v_original.id,
    'reversal_payment_id', v_void_payment_id,
    'reversal_journal_entry_id', v_new_journal_id,
    'new_payment_id', v_new_payment_id,
    'new_journal_entry_id', v_new_journal_post_id,
    'original_had_journal', v_has_orig_journal
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_depreciation(p_schedule_id uuid, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_schedule_id UUID;
  v_asset_id UUID;
  v_period_number INTEGER;
  v_period_date DATE;
  v_depreciation_amount DECIMAL(15,2);
  v_accumulated_depreciation DECIMAL(15,2);
  v_book_value DECIMAL(15,2);
  v_status TEXT;
  v_asset_company_id UUID;
  v_asset_name TEXT;
  v_asset_depreciation_expense_account_id UUID;
  v_asset_accumulated_depreciation_account_id UUID;
  v_asset_salvage_value DECIMAL(15,2);
  v_asset_branch_id UUID;
  v_asset_cost_center_id UUID;
  v_journal_id UUID;
  v_base_ccy TEXT;
BEGIN
  -- v3.74.747 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access_by_row('depreciation_schedules', p_schedule_id);

  SELECT id, asset_id, period_number, period_date,
         depreciation_amount, accumulated_depreciation, book_value, status
    INTO v_schedule_id, v_asset_id, v_period_number, v_period_date,
         v_depreciation_amount, v_accumulated_depreciation, v_book_value, v_status
    FROM depreciation_schedules WHERE id = p_schedule_id;

  IF v_schedule_id IS NULL THEN RAISE EXCEPTION 'Depreciation schedule not found'; END IF;
  IF v_status = 'posted' THEN RAISE EXCEPTION 'Already posted'; END IF;

  SELECT company_id, name, depreciation_expense_account_id,
         accumulated_depreciation_account_id, salvage_value,
         branch_id, cost_center_id
    INTO v_asset_company_id, v_asset_name,
         v_asset_depreciation_expense_account_id,
         v_asset_accumulated_depreciation_account_id, v_asset_salvage_value,
         v_asset_branch_id, v_asset_cost_center_id
    FROM fixed_assets WHERE id = v_asset_id;

  IF v_asset_company_id IS NULL THEN RAISE EXCEPTION 'Asset not found'; END IF;
  IF v_asset_depreciation_expense_account_id IS NULL THEN RAISE EXCEPTION 'Depreciation expense account missing'; END IF;
  IF v_asset_accumulated_depreciation_account_id IS NULL THEN RAISE EXCEPTION 'Accumulated depreciation account missing'; END IF;

  -- v3.74.564 — financial period lock
  BEGIN
    PERFORM public.require_open_financial_period_db(v_asset_company_id, v_period_date);
  EXCEPTION WHEN undefined_function THEN NULL; END;

  -- v3.75.63 — العملةُ تُسألُ من بيتِها الواحدِ ولا تُفترَض («ولا تُخترَعُ عملة»).
  v_base_ccy := public.erp_company_base_currency(v_asset_company_id);

  INSERT INTO journal_entries (
    company_id, branch_id, cost_center_id,
    entry_date, description, reference_type, reference_id, status
  ) VALUES (
    v_asset_company_id, v_asset_branch_id, v_asset_cost_center_id,
    v_period_date,
    'إهلاك أصل: ' || v_asset_name || ' - فترة ' || v_period_number,
    'depreciation', v_asset_id, 'draft'
  ) RETURNING id INTO v_journal_id;

  -- v3.74.564 — write IAS 21 columns too
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, description,
    debit_amount, credit_amount,
    original_debit, original_credit, original_currency,
    exchange_rate_used,
    branch_id, cost_center_id
  ) VALUES (
    v_journal_id, v_asset_depreciation_expense_account_id,
    'مصروف إهلاك: ' || v_asset_name,
    v_depreciation_amount, 0,
    v_depreciation_amount, 0, v_base_ccy,
    1,
    v_asset_branch_id, v_asset_cost_center_id
  ), (
    v_journal_id, v_asset_accumulated_depreciation_account_id,
    'مجمع إهلاك: ' || v_asset_name,
    0, v_depreciation_amount,
    0, v_depreciation_amount, v_base_ccy,
    1,
    v_asset_branch_id, v_asset_cost_center_id
  );

  -- v3.74.564 — post explicitly (triggers balance check)
  UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;

  UPDATE depreciation_schedules
     SET status = 'posted', journal_entry_id = v_journal_id,
         posted_by = p_user_id, posted_at = CURRENT_TIMESTAMP
   WHERE id = p_schedule_id;

  UPDATE fixed_assets
     SET accumulated_depreciation = v_accumulated_depreciation,
         book_value = v_book_value,
         status = CASE WHEN v_book_value <= v_asset_salvage_value THEN 'fully_depreciated' ELSE 'active' END,
         updated_at = CURRENT_TIMESTAMP, updated_by = p_user_id
   WHERE id = v_asset_id;

  RETURN v_journal_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_invoice_payment_atomic_v2(p_invoice_id uuid, p_company_id uuid, p_customer_id uuid, p_amount numeric, p_payment_date date, p_payment_method text, p_reference_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_account_id uuid DEFAULT NULL::uuid, p_branch_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_warehouse_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_request_hash text DEFAULT NULL::text, p_payment_currency text DEFAULT NULL::text, p_exchange_rate numeric DEFAULT NULL::numeric, p_original_amount numeric DEFAULT NULL::numeric, p_exchange_rate_id uuid DEFAULT NULL::uuid, p_rate_source text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_invoice             RECORD;
  v_payment_id          UUID;
  v_branch_id           UUID;
  v_new_paid_amount     NUMERIC;
  v_new_status          TEXT;
  v_net_invoice_amount  NUMERIC;
  v_idempotency_result  JSONB;
  v_transaction_id      UUID;
  v_payment_journal_id  UUID;
  v_result              JSONB;
  v_base_ccy            TEXT;
  v_pay_ccy             TEXT;
  v_pay_rate            NUMERIC;
  v_pay_orig_amount     NUMERIC;
  v_ref_no              TEXT;
BEGIN
  -- v3.74.730 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access(p_company_id);
  PERFORM public.require_open_financial_period_db(p_company_id, p_payment_date);

  IF p_idempotency_key IS NOT NULL THEN
    v_idempotency_result := public.check_and_claim_idempotency_key(
      p_idempotency_key, p_company_id, 'invoice_payment_v2', p_request_hash, p_user_id);
    IF v_idempotency_result IS NOT NULL AND COALESCE(v_idempotency_result->>'cached', 'false') = 'true' THEN
      RETURN COALESCE(v_idempotency_result->'response', jsonb_build_object('success', true))
        || jsonb_build_object('cached', true, 'idempotent', true);
    END IF;
  END IF;

  SELECT * INTO v_invoice FROM public.invoices
  WHERE id = p_invoice_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: Invoice % not found for company %', p_invoice_id, p_company_id
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE invoice_id = p_invoice_id AND amount = p_amount AND payment_date = p_payment_date
      AND COALESCE(reference_number, '') = COALESCE(p_reference_number, '')
      AND COALESCE(is_deleted, FALSE) = FALSE
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_PAYMENT: A payment of % on % with reference [%] already exists for invoice %',
      p_amount, p_payment_date, COALESCE(p_reference_number, ''), p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  v_branch_id := COALESCE(p_branch_id, v_invoice.branch_id);
  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id FROM public.branches
    WHERE company_id = p_company_id AND is_active = TRUE
    ORDER BY is_main DESC NULLS LAST, name LIMIT 1;
  END IF;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'NO_BRANCH: No active branch found for company %. Create at least one branch.', p_company_id
      USING ERRCODE = 'P0001';
  END IF;

  -- v3.74.219 — resolve FX context
  -- v3.75.63 — العملةُ تُسألُ من بيتِها الواحدِ ولا تُفترَض («ولا تُخترَعُ عملة»).
  v_base_ccy := public.erp_company_base_currency(p_company_id);
  v_pay_ccy := UPPER(COALESCE(p_payment_currency, v_base_ccy));
  v_pay_rate := COALESCE(NULLIF(p_exchange_rate, 0), 1);
  v_pay_orig_amount := COALESCE(p_original_amount,
    CASE WHEN v_pay_ccy = v_base_ccy THEN p_amount ELSE p_amount / NULLIF(v_pay_rate, 0) END);

  -- v3.74.219 — auto-generate reference_number if caller didn't provide one
  v_ref_no := COALESCE(NULLIF(TRIM(p_reference_number), ''),
    'TXN-' || COALESCE(v_invoice.invoice_number, SUBSTRING(p_invoice_id::text FROM 1 FOR 8))
    || '-' || to_char(NOW(), 'YYYYMMDDHH24MISS'));

  INSERT INTO public.payments (
    company_id, customer_id, invoice_id, payment_date, amount, payment_method,
    reference_number, notes, account_id, branch_id, cost_center_id, warehouse_id,
    -- v3.74.219 — FX context now persisted on the row
    currency_code, exchange_rate, exchange_rate_used, base_currency_amount,
    original_amount, original_currency, exchange_rate_id, rate_source,
    -- v3.74.219 — creator + approver from p_user_id
    created_by, created_by_user_id, approved_by, approved_at, status
  ) VALUES (
    p_company_id, p_customer_id, p_invoice_id, p_payment_date, p_amount, p_payment_method,
    v_ref_no, COALESCE(p_notes, 'دفعة على الفاتورة ' || v_invoice.invoice_number),
    p_account_id, v_branch_id, p_cost_center_id, p_warehouse_id,
    v_pay_ccy, v_pay_rate, v_pay_rate, p_amount,
    v_pay_orig_amount, v_pay_ccy, p_exchange_rate_id, COALESCE(p_rate_source, 'manual'),
    p_user_id, p_user_id,
    CASE WHEN public.erp_payment_privileged(p_company_id, p_user_id) THEN p_user_id ELSE NULL END,
    CASE WHEN public.erp_payment_privileged(p_company_id, p_user_id) THEN NOW() ELSE NULL END,
    'approved'
  ) RETURNING id INTO v_payment_id;

  SELECT journal_entry_id INTO v_payment_journal_id FROM public.payments WHERE id = v_payment_id;

  v_new_paid_amount := COALESCE(v_invoice.paid_amount, 0) + p_amount;
  v_net_invoice_amount := CASE
    WHEN COALESCE(v_invoice.returned_amount, 0) > 0 AND v_invoice.total_amount < COALESCE(v_invoice.returned_amount, 0)
      THEN v_invoice.total_amount
    ELSE GREATEST(0, v_invoice.total_amount - COALESCE(v_invoice.returned_amount, 0))
  END;
  v_new_status := CASE WHEN v_new_paid_amount >= v_net_invoice_amount THEN 'paid' ELSE 'partially_paid' END;

  UPDATE public.invoices
  SET paid_amount = v_new_paid_amount, status = v_new_status, updated_at = NOW()
  WHERE id = p_invoice_id;

  v_transaction_id := public.create_financial_operation_trace(
    p_company_id, 'invoice', p_invoice_id, 'invoice_payment',
    p_user_id, p_idempotency_key, p_request_hash,
    jsonb_build_object('payment_id', v_payment_id, 'payment_method', p_payment_method,
                       'currency_code', v_pay_ccy, 'exchange_rate', v_pay_rate),
    '[]'::JSONB
  );
  PERFORM public.link_financial_operation_trace(v_transaction_id, 'invoice', p_invoice_id, 'source', 'invoice_payment');
  PERFORM public.link_financial_operation_trace(v_transaction_id, 'payment', v_payment_id, 'payment', 'invoice_payment');
  IF v_payment_journal_id IS NOT NULL THEN
    PERFORM public.link_financial_operation_trace(v_transaction_id, 'journal_entry', v_payment_journal_id, 'journal_entry', 'invoice_payment');
  END IF;

  v_result := jsonb_build_object(
    'success', true, 'payment_id', v_payment_id,
    'journal_entry_id', v_payment_journal_id,
    'new_paid_amount', v_new_paid_amount, 'new_status', v_new_status,
    'net_invoice_amount', v_net_invoice_amount,
    'remaining', GREATEST(0, v_net_invoice_amount - v_new_paid_amount),
    'invoice_journal_created', false,
    'transaction_id', v_transaction_id,
    'source_entity', 'invoice', 'source_id', p_invoice_id,
    'event_type', 'invoice_payment',
    'currency_code', v_pay_ccy, 'exchange_rate', v_pay_rate
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.complete_idempotency_key(p_idempotency_key, p_company_id, 'invoice_payment_v2', v_result, TRUE);
  END IF;

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  IF p_idempotency_key IS NOT NULL THEN
    BEGIN
      PERFORM public.complete_idempotency_key(p_idempotency_key, p_company_id, 'invoice_payment_v2',
        jsonb_build_object('success', false, 'error', SQLERRM,
                           'source_entity', 'invoice', 'source_id', p_invoice_id,
                           'event_type', 'invoice_payment'),
        FALSE);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_fx_revaluation(p_company_id uuid, p_revaluation_date date, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_base_ccy      text;
  v_role          text;
  v_journal_id    uuid;
  v_line          record;
  v_fx_gain_acct  uuid;
  v_fx_loss_acct  uuid;
  v_total_delta   numeric := 0;
  v_lines_added   integer := 0;
BEGIN
  -- SoD
  SELECT role INTO v_role FROM public.company_members
   WHERE company_id = p_company_id AND user_id = p_user_id LIMIT 1;
  IF NOT (COALESCE(v_role,'') IN ('owner','admin')) THEN
    RAISE EXCEPTION 'SOD: FX revaluation limited to owner/general_manager/admin';
  END IF;

  -- Period lock
  BEGIN
    PERFORM public.require_open_financial_period_db(p_company_id, p_revaluation_date);
  EXCEPTION WHEN undefined_function THEN NULL; END;

  -- v3.75.63 — العملةُ تُسألُ من بيتِها الواحدِ ولا تُفترَض («ولا تُخترَعُ عملة»).
  v_base_ccy := public.erp_company_base_currency(p_company_id);

  -- Locate P&L accounts (Arabic + English name match)
  SELECT id INTO v_fx_gain_acct FROM public.chart_of_accounts
   WHERE company_id = p_company_id AND is_active = true
     AND (account_name ILIKE '%FX%gain%' OR account_name ILIKE '%unrealized%gain%'
          OR account_name ILIKE '%أرباح%عملة%' OR account_name ILIKE '%أرباح%صرف%')
   LIMIT 1;
  SELECT id INTO v_fx_loss_acct FROM public.chart_of_accounts
   WHERE company_id = p_company_id AND is_active = true
     AND (account_name ILIKE '%FX%loss%' OR account_name ILIKE '%unrealized%loss%'
          OR account_name ILIKE '%خسائر%عملة%' OR account_name ILIKE '%خسائر%صرف%')
   LIMIT 1;
  IF v_fx_gain_acct IS NULL THEN v_fx_gain_acct := v_fx_loss_acct; END IF;
  IF v_fx_loss_acct IS NULL THEN v_fx_loss_acct := v_fx_gain_acct; END IF;
  IF v_fx_gain_acct IS NULL THEN
    RAISE EXCEPTION 'FX Gain/Loss account not found. Please create one in the CoA (name containing "أرباح عملة" or "FX gain" or "خسائر عملة" or "FX loss").';
  END IF;

  -- Draft header
  INSERT INTO public.journal_entries (
    company_id, entry_date, description, reference_type, reference_id, status
  ) VALUES (
    p_company_id, p_revaluation_date,
    'إعادة تقييم أرصدة العملات الأجنبية — ' || p_revaluation_date::text,
    'fx_revaluation', p_company_id, 'draft'
  ) RETURNING id INTO v_journal_id;

  -- For each FC account, compute delta and add revaluation lines
  FOR v_line IN
    WITH bal AS (
      SELECT jel.account_id,
             SUM(COALESCE(jel.original_debit,0) - COALESCE(jel.original_credit,0)) AS native_balance,
             SUM(COALESCE(jel.debit_amount,0)   - COALESCE(jel.credit_amount,0))   AS current_base,
             MAX(COALESCE(jel.original_currency, '')) AS ccy
      FROM public.journal_entry_lines jel
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.company_id = p_company_id
       AND je.status = 'posted'
       AND (je.is_deleted IS NULL OR je.is_deleted = false)
       AND je.deleted_at IS NULL
       AND je.entry_date <= p_revaluation_date
      GROUP BY jel.account_id
    )
    SELECT bal.account_id, bal.native_balance, bal.current_base, bal.ccy,
           coa.account_type, coa.sub_type, coa.account_name,
           coa.branch_id, coa.cost_center_id
      FROM bal
      JOIN public.chart_of_accounts coa ON coa.id = bal.account_id
     WHERE bal.ccy <> '' AND UPPER(bal.ccy) <> v_base_ccy
       -- monetary only: exclude fixed assets, equity, revenue, expense
       AND coa.account_type IN ('asset','liability')
       AND coa.sub_type IN ('cash','bank','accounts_receivable','accounts_payable',
                            'other_current_asset','other_current_liability')
  LOOP
    DECLARE
      v_rate         numeric := 1;
      v_target_base  numeric;
      v_delta        numeric;
      v_gl_acct      uuid;
    BEGIN
      -- Closing rate (most recent up to revaluation date)
      SELECT rate INTO v_rate FROM public.exchange_rates
       WHERE company_id = p_company_id
         AND UPPER(COALESCE(from_currency, '')) = UPPER(v_line.ccy)
         AND UPPER(COALESCE(to_currency, ''))   = v_base_ccy
         AND rate_date <= p_revaluation_date
         AND (is_active IS NULL OR is_active = true)
       ORDER BY rate_date DESC LIMIT 1;
      IF v_rate IS NULL OR v_rate = 0 THEN v_rate := 1; END IF;

      v_target_base := ROUND(v_line.native_balance * v_rate, 4);
      v_delta       := v_target_base - v_line.current_base;

      IF ABS(v_delta) < 0.01 THEN CONTINUE; END IF;

      -- Book the delta on the FC account, opposite side to GL/loss.
      -- Gain: net asset increased (or liability decreased) → DR asset
      -- and CR gain, or DR liability and CR gain.
      IF v_delta > 0 THEN
        v_gl_acct := v_fx_gain_acct;
        INSERT INTO public.journal_entry_lines (
          journal_entry_id, account_id, description,
          debit_amount, credit_amount,
          original_debit, original_credit, original_currency,
          exchange_rate_used, branch_id, cost_center_id
        ) VALUES
          (v_journal_id, v_line.account_id, 'FX reval — ' || v_line.account_name,
           v_delta, 0, 0, 0, v_base_ccy, v_rate, v_line.branch_id, v_line.cost_center_id),
          (v_journal_id, v_gl_acct, 'FX revaluation gain — ' || v_line.account_name,
           0, v_delta, 0, 0, v_base_ccy, 1, v_line.branch_id, v_line.cost_center_id);
      ELSE
        v_gl_acct := v_fx_loss_acct;
        INSERT INTO public.journal_entry_lines (
          journal_entry_id, account_id, description,
          debit_amount, credit_amount,
          original_debit, original_credit, original_currency,
          exchange_rate_used, branch_id, cost_center_id
        ) VALUES
          (v_journal_id, v_gl_acct, 'FX revaluation loss — ' || v_line.account_name,
           ABS(v_delta), 0, 0, 0, v_base_ccy, 1, v_line.branch_id, v_line.cost_center_id),
          (v_journal_id, v_line.account_id, 'FX reval — ' || v_line.account_name,
           0, ABS(v_delta), 0, 0, v_base_ccy, v_rate, v_line.branch_id, v_line.cost_center_id);
      END IF;

      v_lines_added := v_lines_added + 1;
      v_total_delta := v_total_delta + v_delta;
    END;
  END LOOP;

  IF v_lines_added = 0 THEN
    DELETE FROM public.journal_entries WHERE id = v_journal_id;
    RETURN jsonb_build_object(
      'success', true,
      'message', 'No revaluation needed — balances already match closing rates.',
      'lines_added', 0
    );
  END IF;

  UPDATE public.journal_entries
     SET status = 'posted', posted_by = p_user_id, posted_at = NOW()
   WHERE id = v_journal_id;

  RETURN jsonb_build_object(
    'success', true,
    'journal_id', v_journal_id,
    'accounts_revalued', v_lines_added,
    'total_delta_base_ccy', ROUND(v_total_delta, 2)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_auto_invoice_from_sales_order(p_sales_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_so RECORD;
  v_invoice_id UUID;
  v_item RECORD;
  v_invoice_number TEXT;
  v_seq INTEGER;
BEGIN
  -- v3.74.749 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access_by_row('sales_orders', p_sales_order_id);

  -- 1. جلب أمر البيع
  SELECT * INTO v_so FROM sales_orders WHERE id = p_sales_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALES_ORDER_NOT_FOUND: %', p_sales_order_id;
  END IF;

  -- v3.74.782: الفاتورة تُنشأ بعد اعتماد الخصم، لا قبله.
  IF v_so.invoice_id IS NULL AND EXISTS (
    SELECT 1 FROM public.discount_approvals da
     WHERE da.document_type = 'sales_order'
       AND da.document_id = p_sales_order_id
       AND da.status = 'pending'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'skipped', 'discount_pending_approval',
      'message', 'خصم أمر البيع بانتظار اعتماد المالك — تُنشأ الفاتورة تلقائياً فور الاعتماد'
    );
  END IF;

  -- 2. التحقق من أنه لا توجد فاتورة مرتبطة بالفعل
  IF v_so.invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'invoice_id', v_so.invoice_id,
      'already_exists', true,
      'message', 'فاتورة مسودة موجودة بالفعل لهذا الأمر'
    );
  END IF;

  -- 3. توليد رقم الفاتورة
  SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(invoice_number, '[^0-9]', '', 'g') AS INTEGER)), 0) + 1
  INTO v_seq
  FROM invoices
  WHERE company_id = v_so.company_id
    AND invoice_number ~ '^[A-Z]+-[0-9]+$';

  v_invoice_number := 'INV-' || LPAD(v_seq::TEXT, 5, '0');

  -- 4. إنشاء الفاتورة Draft
  INSERT INTO invoices (
    company_id, customer_id, invoice_date, due_date,
    subtotal, tax_amount, total_amount,
    discount_type, discount_value, discount_position,
    tax_inclusive, shipping, shipping_provider_id,
    status, sales_order_id,
    branch_id, cost_center_id, warehouse_id,
    created_by_user_id, currency_code,
    original_total, invoice_number
  ) VALUES (
    v_so.company_id,
    v_so.customer_id,
    CURRENT_DATE,
    v_so.due_date,
    COALESCE(v_so.subtotal, v_so.total_amount, 0),
    COALESCE(v_so.tax_amount, 0),
    COALESCE(v_so.total_amount, v_so.total, 0),
    COALESCE(v_so.discount_type, 'percent'),
    COALESCE(v_so.discount_value, 0),
    COALESCE(v_so.discount_position, 'before_tax'),
    COALESCE(v_so.tax_inclusive, false),
    COALESCE(v_so.shipping, v_so.shipping_charge, 0),
    v_so.shipping_provider_id,
    'draft',
    v_so.id,
    v_so.branch_id,
    v_so.cost_center_id,
    v_so.warehouse_id,
    v_so.created_by_user_id,
    COALESCE(v_so.currency, public.erp_company_base_currency(v_so.company_id)),
    COALESCE(v_so.total_amount, v_so.total, 0),
    v_invoice_number
  )
  RETURNING id INTO v_invoice_id;

  -- 5. نسخ بنود أمر البيع إلى الفاتورة
  FOR v_item IN (
    SELECT * FROM sales_order_items 
    WHERE sales_order_id = p_sales_order_id
  )
  LOOP
    INSERT INTO invoice_items (
      invoice_id, product_id, description,
      quantity, unit_price, tax_rate,
      discount_percent, line_total, item_type,
      returned_quantity
    ) VALUES (
      v_invoice_id,
      v_item.product_id,
      v_item.description,
      v_item.quantity,
      v_item.unit_price,
      COALESCE(v_item.tax_rate, 0),
      COALESCE(v_item.discount_percent, 0),
      v_item.line_total,
      COALESCE(v_item.item_type, 'product'),
      0
    );
  END LOOP;

  -- 6. ربط الفاتورة بأمر البيع
  UPDATE sales_orders
  SET invoice_id = v_invoice_id,
      status = 'invoiced',
      updated_at = NOW()
  WHERE id = p_sales_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'already_exists', false
  );
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'AUTO_INVOICE_CREATION_FAILED: %', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.po_evaluate_discount_approval(p_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po record;
  v_subtotal numeric := 0;
  v_line_discount_amt numeric := 0;
  v_doc_discount_amt numeric := 0;
  v_total_discount_amt numeric := 0;
  v_last_id uuid;
  v_last_status text;
  v_last_value numeric;
  v_party_name text;
  v_requester uuid;
  v_approver_id uuid;
  v_currency text;
  v_new_approval_id uuid;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_po.status NOT IN ('draft', 'pending_approval') THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * unit_price * COALESCE(discount_percent, 0) / 100.0), 0)
  INTO v_subtotal, v_line_discount_amt
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_po_id;

  IF COALESCE(v_po.discount_value, 0) > 0 THEN
    IF COALESCE(v_po.discount_type, 'amount') = 'percent' THEN
      v_doc_discount_amt := GREATEST(v_subtotal - v_line_discount_amt, 0) * v_po.discount_value / 100.0;
    ELSE
      v_doc_discount_amt := v_po.discount_value;
    END IF;
  END IF;

  v_total_discount_amt := ROUND(v_line_discount_amt + v_doc_discount_amt, 2);

  SELECT id, status, discount_value
    INTO v_last_id, v_last_status, v_last_value
    FROM public.discount_approvals
   WHERE document_type = 'purchase_order' AND document_id = p_po_id
   ORDER BY requested_at DESC LIMIT 1;

  IF v_total_discount_amt <= 0 THEN
    IF FOUND AND v_last_status = 'pending' THEN
      UPDATE public.discount_approvals
         SET status = 'cancelled',
             decision_note = COALESCE(decision_note, 'Discount removed from the purchase order.'),
             updated_at = NOW()
       WHERE id = v_last_id;
    END IF;
    RETURN;
  END IF;

  IF FOUND AND v_last_status IN ('pending', 'approved')
     AND v_last_value = v_total_discount_amt THEN
    RETURN;
  END IF;

  IF FOUND AND v_last_status = 'pending' THEN
    UPDATE public.discount_approvals
       SET status = 'cancelled',
           decision_note = COALESCE(decision_note, 'Superseded by amended aggregated discount.'),
           updated_at = NOW()
     WHERE id = v_last_id;
  END IF;

  BEGIN
    SELECT name INTO v_party_name FROM public.suppliers WHERE id = v_po.supplier_id;
  EXCEPTION WHEN OTHERS THEN v_party_name := NULL; END;

  v_requester := v_po.created_by_user_id;
  IF v_requester IS NULL THEN RETURN; END IF;

  v_currency := COALESCE(v_po.currency, public.erp_company_base_currency(v_po.company_id));

  INSERT INTO public.discount_approvals (
    company_id, document_type, document_id, document_no,
    discount_value, discount_type, document_total, party_name,
    reason, status, requested_by, requested_at
  ) VALUES (
    v_po.company_id, 'purchase_order', v_po.id, v_po.po_number,
    v_total_discount_amt, 'amount',
    v_po.total_amount, v_party_name,
    NULL, 'pending', v_requester, NOW()
  ) RETURNING id INTO v_new_approval_id;

  FOR v_approver_id IN
    SELECT DISTINCT u FROM (
      SELECT user_id AS u FROM public.companies WHERE id = v_po.company_id
      UNION
      SELECT user_id FROM public.company_members
       WHERE company_id = v_po.company_id
         AND role IN ('owner', 'admin')
    ) approvers
    WHERE u IS NOT NULL AND u <> v_requester
  LOOP
    INSERT INTO public.notifications (
      company_id, reference_type, reference_id, created_by,
      assigned_to_user, title, message,
      priority, severity, category, channel, created_at
    ) VALUES (
      v_po.company_id, 'approval_request', v_new_approval_id, v_requester,
      v_approver_id,
      'طلب موافقة على خصم أمر شراء',
      'أمر شراء ' || v_po.po_number || ' للمورد ' || COALESCE(v_party_name, 'غير محدد') ||
      ' بإجمالى خصم ' || v_total_discount_amt::text || ' ' || v_currency ||
      ' (مجمَّع: خصم البنود + خصم المستند) — يحتاج اعتمادك من صندوق الموافقات',
      'high', 'warning', 'approvals', 'in_app', NOW()
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.so_evaluate_discount_approval(p_so_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_so record;
  v_subtotal numeric := 0;
  v_line_discount_amt numeric := 0;
  v_doc_discount_amt numeric := 0;
  v_total_discount_amt numeric := 0;
  v_last_id uuid;
  v_last_status text;
  v_last_value numeric;
  v_party_name text;
  v_requester uuid;
  v_approver_id uuid;
  v_currency text;
  v_new_approval_id uuid;
  v_so_no text;
BEGIN
  SELECT * INTO v_so FROM public.sales_orders WHERE id = p_so_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_so.status NOT IN ('draft', 'pending', 'pending_approval', 'confirmed') THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * unit_price * COALESCE(discount_percent, 0) / 100.0), 0)
  INTO v_subtotal, v_line_discount_amt
  FROM public.sales_order_items
  WHERE sales_order_id = p_so_id;

  IF COALESCE(v_so.discount_value, 0) > 0 THEN
    IF COALESCE(v_so.discount_type, 'amount') = 'percent' THEN
      v_doc_discount_amt := GREATEST(v_subtotal - v_line_discount_amt, 0) * v_so.discount_value / 100.0;
    ELSE
      v_doc_discount_amt := v_so.discount_value;
    END IF;
  END IF;

  v_total_discount_amt := ROUND(v_line_discount_amt + v_doc_discount_amt, 2);

  SELECT id, status, discount_value
    INTO v_last_id, v_last_status, v_last_value
    FROM public.discount_approvals
   WHERE document_type = 'sales_order' AND document_id = p_so_id
   ORDER BY requested_at DESC LIMIT 1;

  IF v_total_discount_amt <= 0 THEN
    IF FOUND AND v_last_status = 'pending' THEN
      UPDATE public.discount_approvals
         SET status = 'cancelled',
             decision_note = COALESCE(decision_note, 'Discount removed from the sales order.'),
             updated_at = NOW()
       WHERE id = v_last_id;
    END IF;
    -- v3.74.790 — zero-discount unblock: the employee followed the rejection
    -- hint and REMOVED the discount. A prior approval row (rejected, or the
    -- pending one just cancelled above) proves this order went through the
    -- approval gate; with no invoice yet and real items, the invoice must be
    -- born NOW or the order hangs forever. Fresh no-discount orders have no
    -- approval row and never reach this — their route creates the invoice.
    IF FOUND
       AND v_so.invoice_id IS NULL
       AND EXISTS (SELECT 1 FROM public.sales_order_items WHERE sales_order_id = p_so_id) THEN
      BEGIN
        PERFORM public.create_auto_invoice_from_sales_order(p_so_id);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'zero-discount invoice creation failed for SO %: %', p_so_id, SQLERRM;
      END;
    END IF;
    RETURN;
  END IF;

  IF FOUND AND v_last_status IN ('pending', 'approved')
     AND v_last_value = v_total_discount_amt THEN
    RETURN;
  END IF;

  IF FOUND AND v_last_status = 'pending' THEN
    UPDATE public.discount_approvals
       SET status = 'cancelled',
           decision_note = COALESCE(decision_note, 'Superseded by amended aggregated discount.'),
           updated_at = NOW()
     WHERE id = v_last_id;
  END IF;

  BEGIN
    SELECT name INTO v_party_name FROM public.customers WHERE id = v_so.customer_id;
  EXCEPTION WHEN OTHERS THEN v_party_name := NULL; END;

  v_requester := v_so.created_by_user_id;
  IF v_requester IS NULL THEN RETURN; END IF;

  v_currency := COALESCE(v_so.currency, public.erp_company_base_currency(v_so.company_id));
  v_so_no    := COALESCE(v_so.so_number, v_so.id::text);

  INSERT INTO public.discount_approvals (
    company_id, document_type, document_id, document_no,
    discount_value, discount_type, document_total, party_name,
    reason, status, requested_by, requested_at
  ) VALUES (
    v_so.company_id, 'sales_order', v_so.id, v_so_no,
    v_total_discount_amt, 'amount',
    COALESCE(NULLIF(v_so.total_amount, 0), v_so.total, 0), v_party_name,
    NULL, 'pending', v_requester, NOW()
  ) RETURNING id INTO v_new_approval_id;

  FOR v_approver_id IN
    SELECT DISTINCT u FROM (
      SELECT user_id AS u FROM public.companies WHERE id = v_so.company_id
      UNION
      SELECT user_id FROM public.company_members
       WHERE company_id = v_so.company_id
         AND role IN ('owner', 'admin')
    ) approvers
    WHERE u IS NOT NULL AND u <> v_requester
  LOOP
    INSERT INTO public.notifications (
      company_id, reference_type, reference_id, created_by,
      assigned_to_user, title, message,
      priority, severity, category, channel, created_at
    ) VALUES (
      v_so.company_id, 'approval_request', v_new_approval_id, v_requester,
      v_approver_id,
      'طلب موافقة على خصم طلب مبيعات',
      'طلب مبيعات ' || v_so_no || ' للعميل ' || COALESCE(v_party_name, 'غير محدد') ||
      ' بإجمالى خصم ' || v_total_discount_amt::text || ' ' || v_currency ||
      ' (مجمَّع: خصم البنود + خصم المستند) — يحتاج اعتمادك من صندوق الموافقات',
      'high', 'warning', 'approvals', 'in_app', NOW()
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_bill_overpayment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_bill_total NUMERIC;
  v_bill_returned NUMERIC;
  v_pending_returns NUMERIC;
  v_current_paid NUMERIC;
  v_net_available NUMERIC;
  v_alloc RECORD;
  v_bill_currency TEXT;
  v_bill_rate NUMERIC;
  v_alloc_in_bill_currency NUMERIC;
BEGIN
  -- v3.75.62 «والدفترُ يُعادُ حسابُه فى خزانتِه»: مسارُ تحويلِ العملةِ لا
  -- يُغيِّرُ مبلغَ الدفعةِ بعملةِ مستندِها، وهذا الحارسُ يُعيدُ محاكمةَ
  -- التاريخِ عندَ أىِّ تعديل — فيُفتَحُ له البابُ بالاسم، تعديلاً لا إدراجاً.
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.allow_base_currency_change', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status, 'approved') = 'pending_approval' THEN RETURN NEW; END IF;
  IF NEW.status IN ('rejected', 'cancelled') THEN RETURN NEW; END IF;

  IF NEW.bill_id IS NOT NULL THEN
    SELECT COALESCE(b.total_amount, 0), COALESCE(b.returned_amount, 0)
    INTO v_bill_total, v_bill_returned
    FROM bills b WHERE id = NEW.bill_id;

    SELECT COALESCE(SUM(pr.total_amount), 0)
    INTO v_pending_returns
    FROM purchase_returns pr
    WHERE pr.bill_id = NEW.bill_id
      AND pr.status IN ('pending_approval', 'pending_warehouse');

    SELECT COALESCE(SUM(pa.allocated_amount), 0)
    INTO v_current_paid
    FROM payment_allocations pa
    JOIN payments p ON p.id = pa.payment_id
    WHERE pa.bill_id = NEW.bill_id
      AND p.status = 'approved'
      AND COALESCE(p.is_deleted, false) = false
      AND p.voided_at IS NULL
      AND p.voids_payment_id IS NULL
      AND p.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    v_net_available := GREATEST(v_bill_total - v_bill_returned - v_pending_returns, 0);

    IF (v_current_paid + NEW.amount) > v_net_available + 0.01 THEN
      RAISE EXCEPTION 'OVERPAYMENT_BLOCKED: دفعة % تتجاوز المتبقى الصافى % (إجمالى=%، مرتجع=%، مرتجعات معلقة=%، مدفوع سابق=%)',
        NEW.amount, v_net_available - v_current_paid,
        v_bill_total, v_bill_returned, v_pending_returns, v_current_paid
        USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
  END IF;

  FOR v_alloc IN
    SELECT pa.bill_id, pa.allocated_amount
    FROM payment_allocations pa
    WHERE pa.payment_id = NEW.id
      AND pa.bill_id IS NOT NULL
  LOOP
    SELECT COALESCE(b.total_amount, 0),
           COALESCE(b.returned_amount, 0),
           UPPER(COALESCE(b.currency_code, public.erp_company_base_currency(b.company_id))),
           COALESCE(NULLIF(b.exchange_rate, 0), 1)
    INTO v_bill_total, v_bill_returned, v_bill_currency, v_bill_rate
    FROM bills b WHERE id = v_alloc.bill_id;

    SELECT COALESCE(SUM(pr.total_amount), 0)
    INTO v_pending_returns
    FROM purchase_returns pr
    WHERE pr.bill_id = v_alloc.bill_id
      AND pr.status IN ('pending_approval', 'pending_warehouse');

    SELECT COALESCE(SUM(
      pa2.allocated_amount *
      CASE
        WHEN v_bill_currency = '' OR UPPER(COALESCE(p2.currency_code, '')) = '' THEN 1
        WHEN UPPER(COALESCE(p2.currency_code, '')) = v_bill_currency THEN 1
        ELSE COALESCE(NULLIF(p2.exchange_rate, 0), 1) / v_bill_rate
      END
    ), 0)
    INTO v_current_paid
    FROM payment_allocations pa2
    JOIN payments p2 ON p2.id = pa2.payment_id
    WHERE pa2.bill_id = v_alloc.bill_id
      AND p2.status = 'approved'
      AND COALESCE(p2.is_deleted, false) = false
      AND p2.voided_at IS NULL
      AND p2.voids_payment_id IS NULL
      AND p2.id != NEW.id;

    v_alloc_in_bill_currency := v_alloc.allocated_amount *
      CASE
        WHEN v_bill_currency = '' OR UPPER(COALESCE(NEW.currency_code, '')) = '' THEN 1
        WHEN UPPER(COALESCE(NEW.currency_code, '')) = v_bill_currency THEN 1
        ELSE COALESCE(NULLIF(NEW.exchange_rate, 0), 1) / v_bill_rate
      END;

    v_net_available := GREATEST(v_bill_total - v_bill_returned - v_pending_returns, 0);

    IF (v_current_paid + v_alloc_in_bill_currency) > v_net_available + 0.01 THEN
      RAISE EXCEPTION 'OVERPAYMENT_BLOCKED: تخصيص دفعة % (بعملة الفاتورة) يتجاوز المتبقى الصافى % على الفاتورة % (إجمالى=%، مرتجع=%، مرتجعات معلقة=%، مدفوع سابق=%)',
        v_alloc_in_bill_currency,
        v_net_available - v_current_paid,
        v_alloc.bill_id,
        v_bill_total, v_bill_returned, v_pending_returns, v_current_paid
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_return_creating_overpay()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_bill_total NUMERIC;
  v_bill_returned NUMERIC;
  v_other_pending_returns NUMERIC;
  v_approved_paid NUMERIC;
  v_pending_payment NUMERIC;
  v_net_after_this_return NUMERIC;
  v_bill_currency TEXT;
  v_bill_rate NUMERIC;
BEGIN
  IF NEW.bill_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.workflow_status NOT IN ('confirmed', 'completed') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.workflow_status IS NOT DISTINCT FROM NEW.workflow_status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(b.total_amount, 0),
         COALESCE(b.returned_amount, 0),
         UPPER(COALESCE(b.currency_code, public.erp_company_base_currency(b.company_id))),
         COALESCE(NULLIF(b.exchange_rate, 0), 1)
  INTO v_bill_total, v_bill_returned, v_bill_currency, v_bill_rate
  FROM bills b WHERE id = NEW.bill_id;

  SELECT COALESCE(SUM(pr.total_amount), 0)
  INTO v_other_pending_returns
  FROM purchase_returns pr
  WHERE pr.bill_id = NEW.bill_id
    AND pr.status IN ('pending_approval', 'pending_warehouse')
    AND pr.id != NEW.id;

  SELECT COALESCE(SUM(
    pa.allocated_amount *
    CASE
      WHEN UPPER(COALESCE(p.currency_code, '')) = v_bill_currency THEN 1
      WHEN UPPER(COALESCE(p.currency_code, '')) = '' THEN 1
      ELSE COALESCE(NULLIF(p.exchange_rate, 0), 1) / v_bill_rate
    END
  ), 0)
  INTO v_approved_paid
  FROM payment_allocations pa
  JOIN payments p ON p.id = pa.payment_id
  WHERE pa.bill_id = NEW.bill_id
    AND p.status = 'approved'
    AND COALESCE(p.is_deleted, false) = false
    AND p.voided_at IS NULL
    AND p.voids_payment_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM vendor_payment_correction_requests v
      WHERE v.original_payment_id = p.id AND v.status = 'executed'
    );

  SELECT COALESCE(SUM(
    pa.allocated_amount *
    CASE
      WHEN UPPER(COALESCE(p.currency_code, '')) = v_bill_currency THEN 1
      WHEN UPPER(COALESCE(p.currency_code, '')) = '' THEN 1
      ELSE COALESCE(NULLIF(p.exchange_rate, 0), 1) / v_bill_rate
    END
  ), 0)
  INTO v_pending_payment
  FROM payment_allocations pa
  JOIN payments p ON p.id = pa.payment_id
  WHERE pa.bill_id = NEW.bill_id
    AND p.status = 'pending_approval'
    AND COALESCE(p.is_deleted, false) = false
    AND p.voided_at IS NULL
    AND p.voids_payment_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM vendor_payment_correction_requests v
      WHERE v.original_payment_id = p.id AND v.status = 'executed'
    );

  v_net_after_this_return := v_bill_total
                             - v_bill_returned
                             - COALESCE(NEW.total_amount, 0)
                             - v_other_pending_returns;

  IF (v_approved_paid + v_pending_payment) > v_net_after_this_return + 0.01 THEN
    RAISE EXCEPTION 'RETURN_WOULD_CAUSE_OVERPAY: اعتماد المرتجع % يخفض صافى الفاتورة إلى % بينما المدفوع المعتمد % + المعلق % = % — ارفض أو عدّل الدفعة المعلقة أولاً ثم أكد الإخراج',
      COALESCE(NEW.total_amount, 0),
      ROUND(v_net_after_this_return, 2),
      ROUND(v_approved_paid, 2),
      ROUND(v_pending_payment, 2),
      ROUND(v_approved_paid + v_pending_payment, 2)
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

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
        CASE WHEN v_exp_currency IS NOT NULL AND v_exp_currency <> public.erp_company_base_currency(p_company_id)
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

CREATE OR REPLACE FUNCTION public.bill_branch_manager_notify_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_supplier_name text;
  v_currency text;
  v_actor uuid;
BEGIN
  v_currency := COALESCE(NEW.currency_code, public.erp_company_base_currency(NEW.company_id));
  BEGIN
    SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = NEW.supplier_id;
  EXCEPTION WHEN OTHERS THEN v_supplier_name := NULL; END;

  v_actor := COALESCE(
    auth.uid(),
    NEW.last_edited_by_user_id,
    NEW.created_by_user_id,
    NEW.created_by
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'bill', NEW.id, v_actor,
      'نشاط فرعك: تم إنشاء فاتورة مشتريات',
      'تم إنشاء فاتورة ' || NEW.bill_number ||
      CASE WHEN v_supplier_name IS NOT NULL THEN ' من المورد ' || v_supplier_name ELSE '' END ||
      ' بقيمة ' || NEW.total_amount::text || ' ' || v_currency || ' فى فرعك.'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('paid', 'partially_paid', 'voided') THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'bill', NEW.id, v_actor,
      'نشاط فرعك: تغيّرت حالة فاتورة المورد',
      'فاتورة ' || NEW.bill_number ||
      CASE WHEN v_supplier_name IS NOT NULL THEN ' من المورد ' || v_supplier_name ELSE '' END ||
      ' أصبحت الحالة "' || NEW.status || '".'
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bill_notify_accountant_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_supplier_name text;
  v_currency text;
  v_actor uuid;
  v_accountant uuid;
  v_branch_count int;
  v_company_wide_count int;
  v_po_no text;
BEGIN
  v_actor    := COALESCE(NEW.created_by_user_id, NEW.created_by);
  v_currency := COALESCE(NEW.currency_code, public.erp_company_base_currency(NEW.company_id));

  BEGIN
    SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = NEW.supplier_id;
  EXCEPTION WHEN OTHERS THEN v_supplier_name := NULL; END;

  BEGIN
    IF NEW.purchase_order_id IS NOT NULL THEN
      SELECT po_number INTO v_po_no FROM public.purchase_orders WHERE id = NEW.purchase_order_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN v_po_no := NULL; END;

  -- محاسبو فرع الفاتورة أولاً.
  SELECT COUNT(*) INTO v_branch_count
    FROM public.company_members
   WHERE company_id = NEW.company_id
     AND role       = 'accountant'
     AND branch_id  = NEW.branch_id
     AND user_id    IS NOT NULL;

  -- فإن لم يوجد: محاسبو الشركة كلها (بلا فرعٍ فى عضويتهم).
  SELECT COUNT(*) INTO v_company_wide_count
    FROM public.company_members
   WHERE company_id = NEW.company_id
     AND role       = 'accountant'
     AND branch_id  IS NULL
     AND user_id    IS NOT NULL;

  FOR v_accountant IN
    SELECT user_id FROM public.company_members
     WHERE company_id = NEW.company_id
       AND user_id    IS NOT NULL
       AND (
         -- (١) محاسب الفرع.
         (v_branch_count > 0 AND role = 'accountant' AND branch_id = NEW.branch_id)
         OR
         -- (٢) وإلا فمحاسب الشركة كلها.
         (v_branch_count = 0 AND v_company_wide_count > 0
          AND role = 'accountant' AND branch_id IS NULL)
         OR
         -- (٣) وإلا فالمالك والمدير العام — لا محاسبُ فرعٍ آخر.
         (v_branch_count = 0 AND v_company_wide_count = 0
          AND lower(btrim(role)) IN ('owner', 'admin'))
       )
       AND (v_actor IS NULL OR user_id <> v_actor)
  LOOP
    INSERT INTO public.notifications (
      company_id, reference_type, reference_id, created_by,
      assigned_to_user, title, message,
      priority, severity, category, channel, created_at
    ) VALUES (
      NEW.company_id, 'bill', NEW.id, v_actor,
      v_accountant,
      'فاتورة مشتريات جديدة تحتاج إجراء',
      'فاتورة ' || NEW.bill_number ||
      CASE WHEN v_supplier_name IS NOT NULL THEN ' من المورد ' || v_supplier_name ELSE '' END ||
      CASE WHEN v_po_no IS NOT NULL THEN ' (من أمر شراء ' || v_po_no || ')' ELSE '' END ||
      ' بقيمة ' || NEW.total_amount::text || ' ' || v_currency ||
      ' — راجع الفاتورة وحضّر دورة الدفع.',
      'high', 'info', 'accountant_action', 'in_app', NOW()
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.invoice_branch_manager_notify_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_customer_name text; v_currency text;
BEGIN
  v_currency := COALESCE(NEW.currency_code, public.erp_company_base_currency(NEW.company_id));
  BEGIN
    SELECT name INTO v_customer_name FROM public.customers WHERE id = NEW.customer_id;
  EXCEPTION WHEN OTHERS THEN v_customer_name := NULL; END;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'invoice', NEW.id, NEW.created_by_user_id,
      'نشاط فرعك: تم إنشاء فاتورة مبيعات',
      'تم إنشاء فاتورة ' || NEW.invoice_number ||
      CASE WHEN v_customer_name IS NOT NULL THEN ' للعميل ' || v_customer_name ELSE '' END ||
      ' بقيمة ' || NEW.total_amount::text || ' ' || v_currency || ' فى فرعك.'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('paid', 'partially_paid', 'voided') THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'invoice', NEW.id, NULL,
      'نشاط فرعك: تغيّرت حالة فاتورة مبيعات',
      'فاتورة ' || NEW.invoice_number ||
      CASE WHEN v_customer_name IS NOT NULL THEN ' للعميل ' || v_customer_name ELSE '' END ||
      ' أصبحت الحالة "' || NEW.status || '".'
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.invoice_notify_accountant_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_customer_name text; v_currency text; v_actor uuid; v_accountant uuid;
  v_branch_count int; v_so_no text;
BEGIN
  v_actor    := NEW.created_by_user_id;
  v_currency := COALESCE(NEW.currency_code, public.erp_company_base_currency(NEW.company_id));

  BEGIN
    SELECT name INTO v_customer_name FROM public.customers WHERE id = NEW.customer_id;
  EXCEPTION WHEN OTHERS THEN v_customer_name := NULL; END;

  BEGIN
    IF NEW.sales_order_id IS NOT NULL THEN
      SELECT so_number INTO v_so_no FROM public.sales_orders WHERE id = NEW.sales_order_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN v_so_no := NULL; END;

  SELECT COUNT(*) INTO v_branch_count
    FROM public.company_members
   WHERE company_id = NEW.company_id
     AND role       = 'accountant'
     AND branch_id  = NEW.branch_id
     AND user_id    IS NOT NULL;

  FOR v_accountant IN
    SELECT user_id FROM public.company_members
     WHERE company_id = NEW.company_id
       AND role       = 'accountant'
       AND user_id    IS NOT NULL
       AND ((v_branch_count > 0 AND branch_id = NEW.branch_id)
             OR (v_branch_count = 0))
       AND (v_actor IS NULL OR user_id <> v_actor)
  LOOP
    INSERT INTO public.notifications (
      company_id, reference_type, reference_id, created_by,
      assigned_to_user, title, message,
      priority, severity, category, channel, created_at
    ) VALUES (
      NEW.company_id, 'invoice', NEW.id, v_actor,
      v_accountant,
      'فاتورة مبيعات جديدة تحتاج إجراء',
      'فاتورة ' || NEW.invoice_number ||
      CASE WHEN v_customer_name IS NOT NULL THEN ' للعميل ' || v_customer_name ELSE '' END ||
      CASE WHEN v_so_no IS NOT NULL THEN ' (من طلب مبيعات ' || v_so_no || ')' ELSE '' END ||
      ' بقيمة ' || NEW.total_amount::text || ' ' || v_currency ||
      ' — راجع الفاتورة وتابع التحصيل.',
      'high', 'info', 'accountant_action', 'in_app', NOW()
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.payment_branch_manager_notify_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_supplier_name text;
  v_currency text;
  v_bill_no text;
  v_is_supplier boolean;
BEGIN
  v_is_supplier := NEW.supplier_id IS NOT NULL OR NEW.bill_id IS NOT NULL;
  IF NOT v_is_supplier THEN RETURN NEW; END IF;

  v_currency := COALESCE(NEW.currency_code, public.erp_company_base_currency(NEW.company_id));
  BEGIN
    IF NEW.supplier_id IS NOT NULL THEN
      SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = NEW.supplier_id;
    END IF;
    IF NEW.bill_id IS NOT NULL THEN
      SELECT bill_number INTO v_bill_no FROM public.bills WHERE id = NEW.bill_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'payment', NEW.id, COALESCE(NEW.created_by_user_id, NEW.created_by),
      'نشاط فرعك: تم إنشاء دفعة مورد',
      'تم إنشاء دفعة بقيمة ' || NEW.amount::text || ' ' || v_currency ||
      CASE WHEN v_supplier_name IS NOT NULL THEN ' للمورد ' || v_supplier_name ELSE '' END ||
      CASE WHEN v_bill_no IS NOT NULL THEN ' على فاتورة ' || v_bill_no ELSE '' END ||
      ' فى فرعك.'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('approved', 'rejected', 'posted', 'paid') THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'payment', NEW.id,
      CASE WHEN NEW.status = 'rejected' THEN NEW.rejected_by ELSE NEW.approved_by END,
      'نشاط فرعك: تغيّرت حالة دفعة مورد',
      'دفعة بقيمة ' || NEW.amount::text || ' ' || v_currency ||
      CASE WHEN v_supplier_name IS NOT NULL THEN ' للمورد ' || v_supplier_name ELSE '' END ||
      CASE WHEN v_bill_no IS NOT NULL THEN ' على فاتورة ' || v_bill_no ELSE '' END ||
      ' أصبحت الحالة "' || NEW.status || '".'
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.payment_customer_branch_manager_notify_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_customer_name text; v_currency text; v_invoice_no text;
  v_is_customer boolean;
BEGIN
  v_is_customer := NEW.customer_id IS NOT NULL OR NEW.invoice_id IS NOT NULL;
  IF NOT v_is_customer THEN RETURN NEW; END IF;
  IF NEW.supplier_id IS NOT NULL OR NEW.bill_id IS NOT NULL THEN
    -- Ambiguous; let the supplier trigger handle it.
    RETURN NEW;
  END IF;

  v_currency := COALESCE(NEW.currency_code, public.erp_company_base_currency(NEW.company_id));
  BEGIN
    IF NEW.customer_id IS NOT NULL THEN
      SELECT name INTO v_customer_name FROM public.customers WHERE id = NEW.customer_id;
    END IF;
    IF NEW.invoice_id IS NOT NULL THEN
      SELECT invoice_number INTO v_invoice_no FROM public.invoices WHERE id = NEW.invoice_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'payment', NEW.id, COALESCE(NEW.created_by_user_id, NEW.created_by),
      'نشاط فرعك: تم تحصيل دفعة من عميل',
      'دفعة بقيمة ' || NEW.amount::text || ' ' || v_currency ||
      CASE WHEN v_customer_name IS NOT NULL THEN ' من العميل ' || v_customer_name ELSE '' END ||
      CASE WHEN v_invoice_no IS NOT NULL THEN ' على فاتورة ' || v_invoice_no ELSE '' END ||
      ' فى فرعك.'
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.payment_supplier_notify_approval_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_supplier_payment boolean;
  v_supplier_name text;
  v_requester uuid;
  v_approver_id uuid;
  v_currency text;
  v_bill_no text;
BEGIN
  v_is_supplier_payment := NEW.supplier_id IS NOT NULL OR NEW.bill_id IS NOT NULL;
  IF NOT v_is_supplier_payment THEN RETURN NEW; END IF;

  -- Only fire when entering pending_approval.
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'pending_approval' THEN RETURN NEW; END IF;

  v_requester := COALESCE(NEW.created_by_user_id, NEW.created_by);
  v_currency := COALESCE(NEW.currency_code, public.erp_company_base_currency(NEW.company_id));

  BEGIN
    IF NEW.supplier_id IS NOT NULL THEN
      SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = NEW.supplier_id;
    END IF;
    IF NEW.bill_id IS NOT NULL THEN
      SELECT bill_number INTO v_bill_no FROM public.bills WHERE id = NEW.bill_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  FOR v_approver_id IN
    SELECT DISTINCT u FROM (
      SELECT user_id AS u FROM public.companies WHERE id = NEW.company_id
      UNION
      SELECT user_id FROM public.company_members
       WHERE company_id = NEW.company_id
         AND role IN ('owner', 'admin')
    ) approvers
    WHERE u IS NOT NULL AND (v_requester IS NULL OR u <> v_requester)
  LOOP
    INSERT INTO public.notifications (
      company_id, reference_type, reference_id, created_by,
      assigned_to_user, title, message,
      priority, severity, category, channel, created_at
    ) VALUES (
      NEW.company_id, 'approval_request', NEW.id, v_requester,
      v_approver_id,
      'طلب اعتماد دفعة مورد',
      'دفعة بقيمة ' || NEW.amount::text || ' ' || v_currency ||
      CASE WHEN v_supplier_name IS NOT NULL THEN ' للمورد ' || v_supplier_name ELSE '' END ||
      CASE WHEN v_bill_no IS NOT NULL THEN ' على فاتورة ' || v_bill_no ELSE '' END ||
      ' — يحتاج اعتمادك من صندوق الموافقات قبل الترحيل.',
      'high', 'warning', 'approvals', 'in_app', NOW()
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.po_branch_manager_notify_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_supplier_name text;
  v_currency text;
BEGIN
  v_currency := COALESCE(NEW.currency, public.erp_company_base_currency(NEW.company_id));
  BEGIN
    SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = NEW.supplier_id;
  EXCEPTION WHEN OTHERS THEN v_supplier_name := NULL; END;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'purchase_order', NEW.id, NEW.created_by_user_id,
      'نشاط فرعك: تم إنشاء أمر شراء',
      'تم إنشاء أمر شراء ' || NEW.po_number ||
      CASE WHEN v_supplier_name IS NOT NULL THEN ' للمورد ' || v_supplier_name ELSE '' END ||
      ' بقيمة ' || NEW.total_amount::text || ' ' || v_currency || ' فى فرعك.'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('approved', 'rejected') THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'purchase_order', NEW.id,
      CASE NEW.status WHEN 'approved' THEN NEW.approved_by ELSE NEW.rejected_by END,
      'نشاط فرعك: ' ||
        (CASE NEW.status WHEN 'approved' THEN 'تم اعتماد أمر شراء' ELSE 'تم رفض أمر شراء' END),
      'أمر الشراء ' || NEW.po_number ||
      CASE WHEN v_supplier_name IS NOT NULL THEN ' للمورد ' || v_supplier_name ELSE '' END ||
      ' بقيمة ' || NEW.total_amount::text || ' ' || v_currency || ' ' ||
      (CASE NEW.status WHEN 'approved' THEN 'تم اعتماده' ELSE 'تم رفضه' END) || ' فى فرعك.'
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_return_branch_manager_notify_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_supplier_name text;
  v_currency text;
BEGIN
  v_currency := COALESCE(NEW.original_currency, public.erp_company_base_currency(NEW.company_id));
  BEGIN
    SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = NEW.supplier_id;
  EXCEPTION WHEN OTHERS THEN v_supplier_name := NULL; END;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'purchase_return', NEW.id, NEW.created_by,
      'نشاط فرعك: تم إنشاء مرتجع مشتريات',
      'تم إنشاء مرتجع ' || NEW.return_number ||
      CASE WHEN v_supplier_name IS NOT NULL THEN ' للمورد ' || v_supplier_name ELSE '' END ||
      ' بقيمة ' || NEW.total_amount::text || ' ' || v_currency || ' فى فرعك.'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('approved', 'rejected', 'sent_to_vendor') THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'purchase_return', NEW.id,
      CASE WHEN NEW.status = 'rejected' THEN NEW.rejected_by ELSE NEW.approved_by END,
      'نشاط فرعك: تغيّرت حالة مرتجع مشتريات',
      'المرتجع ' || NEW.return_number ||
      CASE WHEN v_supplier_name IS NOT NULL THEN ' للمورد ' || v_supplier_name ELSE '' END ||
      ' أصبحت الحالة "' || NEW.status || '".'
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_return_notify_approval_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_supplier_name text; v_requester uuid; v_approver_id uuid; v_currency text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'pending_approval' THEN RETURN NEW; END IF;

  v_requester := COALESCE(
    NEW.created_by,
    auth.uid(),
    (SELECT c.user_id FROM public.companies c WHERE c.id = NEW.company_id)
  );

  v_currency := COALESCE(NEW.original_currency, public.erp_company_base_currency(NEW.company_id));
  BEGIN
    SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = NEW.supplier_id;
  EXCEPTION WHEN OTHERS THEN v_supplier_name := NULL; END;

  IF v_requester IS NULL THEN
    RAISE WARNING 'v3.74.956: مرتجعٌ % بلا مُنشئٍ ولا مالكٍ للشركة — لم يُرسَل طلبُ الاعتماد.', NEW.return_number;
    RETURN NEW;
  END IF;

  FOR v_approver_id IN
    SELECT DISTINCT u FROM (
      SELECT user_id AS u FROM public.companies WHERE id = NEW.company_id
      UNION
      SELECT user_id FROM public.company_members
       WHERE company_id = NEW.company_id
         AND role IN ('owner', 'admin')
    ) approvers
    WHERE u IS NOT NULL AND u <> v_requester
  LOOP
    INSERT INTO public.notifications (
      company_id, reference_type, reference_id, created_by,
      assigned_to_user, title, message,
      priority, severity, category, channel, created_at
    ) VALUES (
      NEW.company_id, 'approval_request', NEW.id, v_requester,
      v_approver_id,
      'طلب اعتماد مرتجع مشتريات',
      'مرتجع ' || NEW.return_number ||
      CASE WHEN v_supplier_name IS NOT NULL THEN ' للمورد ' || v_supplier_name ELSE '' END ||
      ' بقيمة ' || NEW.total_amount::text || ' ' || v_currency ||
      ' — يحتاج اعتمادك من صندوق الموافقات.',
      'high', 'warning', 'approvals', 'in_app', NOW()
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sales_return_branch_manager_notify_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_customer_name text; v_currency text;
BEGIN
  v_currency := COALESCE(NEW.original_currency, public.erp_company_base_currency(NEW.company_id));
  BEGIN
    SELECT name INTO v_customer_name FROM public.customers WHERE id = NEW.customer_id;
  EXCEPTION WHEN OTHERS THEN v_customer_name := NULL; END;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'sales_return', NEW.id, NEW.created_by_user_id,
      'نشاط فرعك: تم إنشاء مرتجع مبيعات',
      'تم إنشاء مرتجع ' || NEW.return_number ||
      CASE WHEN v_customer_name IS NOT NULL THEN ' للعميل ' || v_customer_name ELSE '' END ||
      ' بقيمة ' || NEW.total_amount::text || ' ' || v_currency || ' فى فرعك.'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('approved', 'rejected') THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'sales_return', NEW.id,
      CASE WHEN NEW.status='rejected' THEN NEW.rejected_by ELSE NEW.approved_by END,
      'نشاط فرعك: تغيّرت حالة مرتجع مبيعات',
      'المرتجع ' || NEW.return_number ||
      CASE WHEN v_customer_name IS NOT NULL THEN ' للعميل ' || v_customer_name ELSE '' END ||
      ' أصبحت الحالة "' || NEW.status || '".'
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sales_return_notify_approval_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_customer_name text; v_requester uuid; v_approver_id uuid; v_currency text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'pending_approval' THEN RETURN NEW; END IF;
  v_requester := NEW.created_by_user_id;
  v_currency := COALESCE(NEW.original_currency, public.erp_company_base_currency(NEW.company_id));
  BEGIN
    SELECT name INTO v_customer_name FROM public.customers WHERE id = NEW.customer_id;
  EXCEPTION WHEN OTHERS THEN v_customer_name := NULL; END;

  FOR v_approver_id IN
    SELECT DISTINCT u FROM (
      SELECT user_id AS u FROM public.companies WHERE id = NEW.company_id
      UNION
      SELECT user_id FROM public.company_members
       WHERE company_id = NEW.company_id
         AND role IN ('owner', 'admin')
    ) approvers
    WHERE u IS NOT NULL AND (v_requester IS NULL OR u <> v_requester)
  LOOP
    INSERT INTO public.notifications (
      company_id, reference_type, reference_id, created_by,
      assigned_to_user, title, message,
      priority, severity, category, channel, created_at
    ) VALUES (
      NEW.company_id, 'approval_request', NEW.id, v_requester,
      v_approver_id,
      'طلب اعتماد مرتجع مبيعات',
      'مرتجع ' || NEW.return_number ||
      CASE WHEN v_customer_name IS NOT NULL THEN ' للعميل ' || v_customer_name ELSE '' END ||
      ' بقيمة ' || NEW.total_amount::text || ' ' || v_currency ||
      ' — يحتاج اعتمادك من صندوق الموافقات.',
      'high', 'warning', 'approvals', 'in_app', NOW()
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.so_branch_manager_notify_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_customer_name text; v_currency text;
BEGIN
  v_currency := COALESCE(NEW.currency, public.erp_company_base_currency(NEW.company_id));
  BEGIN
    SELECT name INTO v_customer_name FROM public.customers WHERE id = NEW.customer_id;
  EXCEPTION WHEN OTHERS THEN v_customer_name := NULL; END;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'sales_order', NEW.id, NEW.created_by_user_id,
      'نشاط فرعك: تم إنشاء طلب مبيعات',
      'تم إنشاء طلب مبيعات ' || COALESCE(NEW.so_number, NEW.id::text) ||
      CASE WHEN v_customer_name IS NOT NULL THEN ' للعميل ' || v_customer_name ELSE '' END ||
      ' بقيمة ' || NEW.total_amount::text || ' ' || v_currency || ' فى فرعك.'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('approved', 'confirmed', 'rejected', 'cancelled') THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'sales_order', NEW.id, NULL,
      'نشاط فرعك: تغيّرت حالة طلب مبيعات',
      'طلب المبيعات ' || COALESCE(NEW.so_number, NEW.id::text) ||
      CASE WHEN v_customer_name IS NOT NULL THEN ' للعميل ' || v_customer_name ELSE '' END ||
      ' أصبحت الحالة "' || NEW.status || '".'
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- ═══ (٢) الفحصُ المرجعىُّ — ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه ═══

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_63_check()
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $function$
DECLARE
  v_sites int;
  v_missing text := '';
  v_home_n int; v_home_secdef int; v_rls int; v_home_screams int;
  v_pv2 int;
  v_mute text := '';
  r record;
BEGIN
  -- (أ) صفرُ حرفِ عملةٍ فى دوالِّ public كلِّها — التعليقُ محجوبٌ قبلَ الحكم،
  --     والفحوصُ المرجعيّةُ مستثناةٌ بالاسمِ فلا يعدُّ الفحصُ نفسَه.
  SELECT count(*) INTO v_sites FROM (
    SELECT t.line
    FROM pg_proc p,
         LATERAL regexp_split_to_table(
           regexp_replace(
             regexp_replace(p.prosrc, '/\*.*?\*/', ' ', 'gs'),
             '[-]{2}[^' || chr(10) || ']*', ' ', 'g'),
           chr(10)) AS t(line)
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind IN ('f','p')
      AND p.proname NOT LIKE 'assert\_baseline\_%'
      AND t.line ~ ('''' || '(EGP|USD|SAR|EUR|GBP|AED|KWD|JOD|QAR|BHD|OMR)' || '''')
  ) s;
  IF v_sites <> 0 THEN
    RAISE EXCEPTION 'v3.75.63: % سطراً فى دوالِّ القاعدةِ يُسمّى عملةً بعينِها — والمقيسُ يومَ الشحنِ صفر. عادَ الافتراضُ خلسةً.', v_sites;
  END IF;

  -- (ب) السبعُ والعشرون تنادى البيتَ كلٌّ بوسيطِه — والذِّكرُ ليس نداءً بغيرِ وسيطِ صاحبِه.
  FOR r IN
    SELECT * FROM (VALUES
      ('apply_customer_credit_to_invoice',           'p_company_id'),
      ('auto_create_payment_journal',                'NEW.company_id'),
      ('dispose_asset',                              'v_company_id'),
      ('execute_payment_correction',                 'p_company_id'),
      ('execute_vendor_payment_correction',          'p_company_id'),
      ('post_depreciation',                          'v_asset_company_id'),
      ('run_fx_revaluation',                         'p_company_id'),
      ('create_auto_invoice_from_sales_order',       'v_so.company_id'),
      ('po_evaluate_discount_approval',              'v_po.company_id'),
      ('so_evaluate_discount_approval',              'v_so.company_id'),
      ('prevent_bill_overpayment',                   'b.company_id'),
      ('prevent_return_creating_overpay',            'b.company_id'),
      ('post_expense_atomic',                        'p_company_id'),
      ('bill_branch_manager_notify_trg',             'NEW.company_id'),
      ('bill_notify_accountant_trg',                 'NEW.company_id'),
      ('invoice_branch_manager_notify_trg',          'NEW.company_id'),
      ('invoice_notify_accountant_trg',              'NEW.company_id'),
      ('payment_branch_manager_notify_trg',          'NEW.company_id'),
      ('payment_customer_branch_manager_notify_trg', 'NEW.company_id'),
      ('payment_supplier_notify_approval_trg',       'NEW.company_id'),
      ('po_branch_manager_notify_trg',               'NEW.company_id'),
      ('purchase_return_branch_manager_notify_trg',  'NEW.company_id'),
      ('purchase_return_notify_approval_trg',        'NEW.company_id'),
      ('sales_return_branch_manager_notify_trg',     'NEW.company_id'),
      ('sales_return_notify_approval_trg',           'NEW.company_id'),
      ('so_branch_manager_notify_trg',               'NEW.company_id')
    ) AS v(fn, arg)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.fn
        AND position('erp_company_base_currency(' || r.arg || ')' IN p.prosrc) > 0
    ) THEN
      v_missing := v_missing || r.fn || ' · ';
    END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'v3.75.63: كفَّ عن نداءِ بيتِ العملةِ الواحدِ بوسيطِه: %', v_missing;
  END IF;

  -- (ب٢) ونسخةُ الدفعِ ذاتُ العشرين وسيطاً تُثبَّتُ بعددِ وسائطِها — فللاسمِ
  --      نسخةٌ قديمةٌ لا تقرأُ عملةً أصلاً ولا تشفعُ نسخةٌ لأخرى.
  SELECT count(*) INTO v_pv2 FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'process_invoice_payment_atomic_v2' AND p.pronargs = 20
    AND position('erp_company_base_currency(p_company_id)' IN p.prosrc) > 0;
  IF v_pv2 <> 1 THEN
    RAISE EXCEPTION 'v3.75.63: نسخةُ الدفعِ ذاتُ العشرين وسيطاً لا تنادى البيتَ (وُجد %).', v_pv2;
  END IF;

  -- (ج) والبيتُ نفسُه قائمٌ: توقيعٌ واحدٌ، بصلاحيّاتِ مُنادِيه، يصرخُ ولا يخترع،
  --     وجدولُ الشركاتِ محمىٌّ بحمايةِ الصفوف.
  SELECT count(*),
         count(*) FILTER (WHERE p.prosecdef),
         count(*) FILTER (WHERE position('RAISE EXCEPTION' IN p.prosrc) > 0)
    INTO v_home_n, v_home_secdef, v_home_screams
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'erp_company_base_currency';
  IF v_home_n <> 1 OR v_home_secdef <> 0 OR v_home_screams <> 1 THEN
    RAISE EXCEPTION 'v3.75.63: بيتُ العملةِ الواحدُ تبدَّل (نسخ % · كاملُ الصلاحيّات % · يصرخ %).', v_home_n, v_home_secdef, v_home_screams;
  END IF;
  SELECT count(*) INTO v_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'companies' AND c.relrowsecurity;
  IF v_rls <> 1 THEN
    RAISE EXCEPTION 'v3.75.63: حمايةُ صفوفِ جدولِ الشركاتِ رُفعت.';
  END IF;

  -- (د) ولا حارسَ فقدَ صرختَه: حارسا السدادِ الزائدِ يرفضانِ بصلاحيّاتِ مُنادِيهما،
  --     والمُخطِراتُ الثلاثَ عشرةَ ما زالت تُخطِرُ بصلاحيّاتِها الكاملةِ المحفوظة —
  --     خمسٌ تُدرِجُ الإشعارَ بيدِها وثمانٍ تنادينَ مُبلِّغَ مديرِ الفرع.
  --     (اسمُ المُبلِّغِ يُبنى وصلاً لا حرفاً واحداً: فجسدُ هذا الفحصِ بصلاحيّاتِ
  --      مُنادِيه، وذِكرُ اسمٍ بشكلِ نداءٍ فيه يُحسَبُ عندَ حارسِ الأبوابِ طرقاً —
  --      فيُقطَعُ الاسمُ كى لا يطرقَ الفحصُ باباً طرقاً كاذباً.)
  FOR r IN
    SELECT p.proname, p.prosecdef,
           (position('RAISE EXCEPTION' IN p.prosrc) > 0) AS screams,
           ((position('INSERT INTO' IN p.prosrc) > 0 AND position('notifications' IN p.prosrc) > 0)
            OR position('notify_branch_' || 'manager(' IN p.prosrc) > 0) AS notifies
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('prevent_bill_overpayment','prevent_return_creating_overpay',
        'bill_branch_manager_notify_trg','bill_notify_accountant_trg','invoice_branch_manager_notify_trg',
        'invoice_notify_accountant_trg','payment_branch_manager_notify_trg','payment_customer_branch_manager_notify_trg',
        'payment_supplier_notify_approval_trg','po_branch_manager_notify_trg','purchase_return_branch_manager_notify_trg',
        'purchase_return_notify_approval_trg','sales_return_branch_manager_notify_trg','sales_return_notify_approval_trg',
        'so_branch_manager_notify_trg')
  LOOP
    IF r.proname IN ('prevent_bill_overpayment','prevent_return_creating_overpay') THEN
      IF r.prosecdef OR NOT r.screams THEN v_mute := v_mute || r.proname || ' · '; END IF;
    ELSE
      IF NOT r.prosecdef OR NOT r.notifies THEN v_mute := v_mute || r.proname || ' · '; END IF;
    END IF;
  END LOOP;
  IF v_mute <> '' THEN
    RAISE EXCEPTION 'v3.75.63: حارسٌ فقدَ صرختَه أو تبدَّلت صلاحيّاتُه: %', v_mute;
  END IF;

  RETURN 'v3.75.63 ok — لا دالّةَ فى القاعدةِ تخترعُ عملةً، والسبعُ والعشرون تنادى البيتَ الواحدَ كلٌّ بوسيطِه، والبيتُ قائمٌ يصرخُ ولا يخترع، ولا حارسَ فقدَ صرخته';
END
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_63_check() FROM PUBLIC, anon, authenticated;
