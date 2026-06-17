-- v3.74.205 — Same DUPLICATE_JOURNAL_VIOLATION class as v3.74.182 for
-- refunds: apply_customer_credit_to_invoice used p_invoice_id as the JE
-- reference_id, so a second credit application on the same invoice
-- collided with the unique (company, reference_type, reference_id) guard.
-- A locally-minted UUID per call keeps each application unique while
-- customer_credit_ledger.source_id, payment.invoice_id, and the JE
-- description still preserve the invoice link for traceability.
-- Also include 'partially_used' in the FIFO consumption filter (same
-- bug class as v3.74.121 / v3.74.199): once a credit row's status flips
-- to partially_used, the executor was skipping it.

CREATE OR REPLACE FUNCTION public.apply_customer_credit_to_invoice(
  p_company_id uuid,
  p_customer_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_user_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_available_credit         numeric;
  v_invoice                  record;
  v_ar_account_id            uuid;
  v_customer_credit_acc_id   uuid;
  v_branch_id                uuid;
  v_journal_id               uuid;
  v_journal_ref_id           uuid := gen_random_uuid();
  v_credit_ledger_id         uuid;
  v_payment_id               uuid;
  v_apply_amount             numeric;
  v_remaining_to_apply       numeric;
  v_credit_lot               record;
  v_consume_from_lot         numeric;
  v_company_base_ccy         text;
BEGIN
  v_available_credit := public.get_customer_credit_balance(p_company_id, p_customer_id);
  IF v_available_credit < 0.01 THEN
    RAISE EXCEPTION 'NO_CREDIT_AVAILABLE: Customer has no available credit balance';
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: Invoice % not found', p_invoice_id;
  END IF;

  v_apply_amount := LEAST(
    p_amount, v_available_credit,
    GREATEST(0, v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0) - COALESCE(v_invoice.returned_amount, 0))
  );
  IF v_apply_amount < 0.01 THEN
    RAISE EXCEPTION 'NOTHING_TO_APPLY: Invoice is already fully paid or amount is zero';
  END IF;

  SELECT id INTO v_ar_account_id FROM chart_of_accounts
  WHERE company_id = p_company_id AND is_active = true
    AND (sub_type = 'accounts_receivable' OR account_name ILIKE '%receivable%' OR account_name ILIKE '%الذمم المدينة%')
  ORDER BY CASE WHEN sub_type = 'accounts_receivable' THEN 0 ELSE 1 END LIMIT 1;
  IF v_ar_account_id IS NULL THEN RAISE EXCEPTION 'AR_ACCOUNT_MISSING'; END IF;

  SELECT id INTO v_customer_credit_acc_id FROM chart_of_accounts
  WHERE company_id = p_company_id AND is_active = true
    AND (sub_type IN ('customer_credit', 'customer_advance') OR account_code = '2155'
         OR account_name ILIKE '%رصيد العملاء الدائن%' OR account_name ILIKE '%customer credit%')
  ORDER BY CASE WHEN sub_type = 'customer_credit' THEN 0 WHEN sub_type = 'customer_advance' THEN 1
                WHEN account_code = '2155' THEN 2 ELSE 3 END LIMIT 1;
  IF v_customer_credit_acc_id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_CREDIT_ACCOUNT_MISSING'; END IF;

  v_branch_id := v_invoice.branch_id;
  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id FROM branches WHERE company_id = p_company_id AND is_active = true
    ORDER BY is_main DESC NULLS LAST, name LIMIT 1;
  END IF;

  SELECT base_currency INTO v_company_base_ccy FROM companies WHERE id = p_company_id;
  v_company_base_ccy := COALESCE(v_company_base_ccy, 'EGP');

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

  INSERT INTO customer_credit_ledger (
    company_id, customer_id, source_type, source_id, journal_entry_id, amount, description, created_by
  ) VALUES (
    p_company_id, p_customer_id, 'credit_applied', p_invoice_id, v_journal_id, -v_apply_amount,
    'تطبيق رصيد دائن على الفاتورة ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text), p_user_id
  ) RETURNING id INTO v_credit_ledger_id;

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
