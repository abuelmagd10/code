-- =============================================
-- Equity System - Atomic RPC Functions
-- =============================================
-- Professional ERP-grade atomic transactions for dividend distribution and payment
-- =============================================

-- =============================================
-- FUNCTION 1: Get Retained Earnings Balance
-- =============================================
CREATE OR REPLACE FUNCTION get_retained_earnings_balance(p_company_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_balance DECIMAL := 0;
  v_retained_earnings_account_id UUID;
BEGIN
  -- Find retained earnings account (code 3200)
  SELECT id INTO v_retained_earnings_account_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id AND account_code = '3200'
  LIMIT 1;

  IF v_retained_earnings_account_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Calculate balance from journal entries (Credit - Debit for equity accounts)
  SELECT COALESCE(SUM(credit_amount) - SUM(debit_amount), 0) INTO v_balance
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.account_id = v_retained_earnings_account_id
    AND je.company_id = p_company_id
    AND COALESCE(je.status, 'posted') != 'cancelled';

  RETURN v_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- FUNCTION 2: Distribute Dividends (Atomic)
-- Declaration: Dr. Retained Earnings | Cr. Dividends Payable
-- =============================================
CREATE OR REPLACE FUNCTION distribute_dividends_atomic(
  p_company_id UUID,
  p_total_amount DECIMAL,
  p_distribution_date DATE,
  p_shareholders JSONB,
  p_retained_earnings_account_id UUID,
  p_dividends_payable_account_id UUID,
  p_branch_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL,
  p_fiscal_year INTEGER DEFAULT NULL,
  p_fiscal_period TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_distribution_id UUID;
  v_journal_entry_id UUID;
  v_shareholder JSONB;
  v_available_retained_earnings DECIMAL;
  v_line_id UUID;
BEGIN
  -- 1. Check retained earnings sufficiency
  v_available_retained_earnings := get_retained_earnings_balance(p_company_id);
  
  IF v_available_retained_earnings < p_total_amount THEN
    RAISE EXCEPTION 'Insufficient retained earnings. Available: %, Requested: %', 
      v_available_retained_earnings, p_total_amount;
  END IF;

  -- 2. Create distribution header
  INSERT INTO profit_distributions (
    company_id, distribution_date, total_profit, status,
    fiscal_year, fiscal_period, available_retained_earnings,
    branch_id, cost_center_id, approved_by, approved_at
  ) VALUES (
    p_company_id, p_distribution_date, p_total_amount, 'approved',
    p_fiscal_year, p_fiscal_period, v_available_retained_earnings,
    p_branch_id, p_cost_center_id, p_user_id, NOW()
  ) RETURNING id INTO v_distribution_id;

  -- 3. Create distribution lines for each shareholder
  FOR v_shareholder IN SELECT * FROM jsonb_array_elements(p_shareholders)
  LOOP
    INSERT INTO profit_distribution_lines (
      distribution_id, shareholder_id, percentage_at_distribution, amount, status, paid_amount
    ) VALUES (
      v_distribution_id,
      (v_shareholder->>'id')::UUID,
      (v_shareholder->>'percentage')::DECIMAL,
      (v_shareholder->>'amount')::DECIMAL,
      'pending',
      0
    );
  END LOOP;

  -- 4. Create journal entry
  INSERT INTO journal_entries (
    company_id, reference_type, reference_id, entry_date, description,
    branch_id, cost_center_id, status
  ) VALUES (
    p_company_id, 'profit_distribution', v_distribution_id, p_distribution_date,
    'توزيع أرباح - ' || p_total_amount::TEXT || ' - Dividend Declaration',
    p_branch_id, p_cost_center_id, 'posted'
  ) RETURNING id INTO v_journal_entry_id;

  -- 5. Create journal entry lines (Dr. Retained Earnings | Cr. Dividends Payable)
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES
    (v_journal_entry_id, p_retained_earnings_account_id, p_total_amount, 0, 'من حـ/ الأرباح المحتجزة'),
    (v_journal_entry_id, p_dividends_payable_account_id, 0, p_total_amount, 'إلى حـ/ الأرباح الموزعة المستحقة');

  -- 6. Update distribution with journal entry link
  UPDATE profit_distributions SET journal_entry_id = v_journal_entry_id WHERE id = v_distribution_id;

  RETURN jsonb_build_object(
    'success', true,
    'distribution_id', v_distribution_id,
    'journal_entry_id', v_journal_entry_id,
    'available_retained_earnings', v_available_retained_earnings
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Dividend distribution failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- FUNCTION 3: Pay Dividend to Shareholder (Atomic)
-- Payment: Dr. Dividends Payable | Cr. Cash/Bank
-- =============================================
CREATE OR REPLACE FUNCTION pay_dividend_atomic(
  p_company_id UUID,
  p_distribution_line_id UUID,
  p_amount DECIMAL,
  p_payment_date DATE,
  p_payment_account_id UUID,
  p_dividends_payable_account_id UUID,
  p_payment_method TEXT DEFAULT 'cash',
  p_reference_number TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_payment_id UUID;
  v_journal_entry_id UUID;
  v_shareholder_id UUID;
  v_shareholder_name TEXT;
  v_distribution_id UUID;
  v_line_amount DECIMAL;
  v_line_paid_amount DECIMAL;
  v_remaining_amount DECIMAL;
  v_new_paid_amount DECIMAL;
  v_new_line_status TEXT;
  v_all_lines_paid BOOLEAN;
BEGIN
  -- 1. Get distribution line details
  SELECT
    pdl.shareholder_id, pdl.distribution_id, pdl.amount, COALESCE(pdl.paid_amount, 0),
    s.name
  INTO v_shareholder_id, v_distribution_id, v_line_amount, v_line_paid_amount, v_shareholder_name
  FROM profit_distribution_lines pdl
  JOIN shareholders s ON s.id = pdl.shareholder_id
  WHERE pdl.id = p_distribution_line_id;

  IF v_shareholder_id IS NULL THEN
    RAISE EXCEPTION 'Distribution line not found: %', p_distribution_line_id;
  END IF;

  -- 2. Calculate remaining amount
  v_remaining_amount := v_line_amount - v_line_paid_amount;

  IF p_amount > v_remaining_amount THEN
    RAISE EXCEPTION 'Payment amount (%) exceeds remaining amount (%)', p_amount, v_remaining_amount;
  END IF;

  -- 3. Create dividend payment record
  INSERT INTO dividend_payments (
    company_id, distribution_line_id, shareholder_id, payment_date, amount,
    payment_account_id, payment_method, reference_number, status,
    created_by, branch_id, cost_center_id, notes
  ) VALUES (
    p_company_id, p_distribution_line_id, v_shareholder_id, p_payment_date, p_amount,
    p_payment_account_id, p_payment_method, p_reference_number, 'posted',
    p_user_id, p_branch_id, p_cost_center_id, p_notes
  ) RETURNING id INTO v_payment_id;

  -- 4. Create journal entry (Dr. Dividends Payable | Cr. Cash/Bank)
  INSERT INTO journal_entries (
    company_id, reference_type, reference_id, entry_date, description,
    branch_id, cost_center_id, status
  ) VALUES (
    p_company_id, 'dividend_payment', v_payment_id, p_payment_date,
    'صرف أرباح - ' || v_shareholder_name || ' - ' || p_amount::TEXT,
    p_branch_id, p_cost_center_id, 'posted'
  ) RETURNING id INTO v_journal_entry_id;

  -- 5. Create journal entry lines
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES
    (v_journal_entry_id, p_dividends_payable_account_id, p_amount, 0, 'من حـ/ الأرباح الموزعة المستحقة'),
    (v_journal_entry_id, p_payment_account_id, 0, p_amount, 'إلى حـ/ الصندوق أو البنك');

  -- 6. Update payment with journal entry link
  UPDATE dividend_payments SET journal_entry_id = v_journal_entry_id WHERE id = v_payment_id;

  -- 7. Update distribution line paid_amount and status
  v_new_paid_amount := v_line_paid_amount + p_amount;
  IF v_new_paid_amount >= v_line_amount THEN
    v_new_line_status := 'paid';
  ELSE
    v_new_line_status := 'partially_paid';
  END IF;

  UPDATE profit_distribution_lines
  SET paid_amount = v_new_paid_amount, status = v_new_line_status
  WHERE id = p_distribution_line_id;

  -- 8. Check if all lines are paid and update distribution status
  SELECT NOT EXISTS (
    SELECT 1 FROM profit_distribution_lines
    WHERE distribution_id = v_distribution_id AND status != 'paid'
  ) INTO v_all_lines_paid;

  IF v_all_lines_paid THEN
    UPDATE profit_distributions SET status = 'paid' WHERE id = v_distribution_id;
  ELSE
    UPDATE profit_distributions SET status = 'partially_paid' WHERE id = v_distribution_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'journal_entry_id', v_journal_entry_id,
    'line_paid_amount', v_new_paid_amount,
    'line_status', v_new_line_status
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Dividend payment failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- FUNCTION 4: Record Shareholder Drawing (Atomic)
-- Drawing: Dr. Drawings Account | Cr. Cash/Bank
-- =============================================
CREATE OR REPLACE FUNCTION record_shareholder_drawing_atomic(
  p_company_id UUID,
  p_shareholder_id UUID,
  p_amount DECIMAL,
  p_drawing_date DATE,
  p_payment_account_id UUID,
  p_drawings_account_id UUID,
  p_description TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_drawing_id UUID;
  v_journal_entry_id UUID;
  v_shareholder_name TEXT;
BEGIN
  -- 1. Get shareholder name
  SELECT name INTO v_shareholder_name
  FROM shareholders WHERE id = p_shareholder_id AND company_id = p_company_id;

  IF v_shareholder_name IS NULL THEN
    RAISE EXCEPTION 'Shareholder not found: %', p_shareholder_id;
  END IF;

  -- 2. Create drawing record
  INSERT INTO shareholder_drawings (
    company_id, shareholder_id, drawing_date, amount,
    payment_account_id, description, status,
    created_by, branch_id, cost_center_id
  ) VALUES (
    p_company_id, p_shareholder_id, p_drawing_date, p_amount,
    p_payment_account_id, COALESCE(p_description, 'سحب شخصي'), 'posted',
    p_user_id, p_branch_id, p_cost_center_id
  ) RETURNING id INTO v_drawing_id;

  -- 3. Create journal entry (Dr. Drawings | Cr. Cash/Bank)
  INSERT INTO journal_entries (
    company_id, reference_type, reference_id, entry_date, description,
    branch_id, cost_center_id, status
  ) VALUES (
    p_company_id, 'shareholder_drawing', v_drawing_id, p_drawing_date,
    'سحب شخصي - ' || v_shareholder_name || ' - ' || p_amount::TEXT,
    p_branch_id, p_cost_center_id, 'posted'
  ) RETURNING id INTO v_journal_entry_id;

  -- 4. Create journal entry lines
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES
    (v_journal_entry_id, p_drawings_account_id, p_amount, 0, 'من حـ/ السحوبات الشخصية - ' || v_shareholder_name),
    (v_journal_entry_id, p_payment_account_id, 0, p_amount, 'إلى حـ/ الصندوق أو البنك');

  -- 5. Update drawing with journal entry link
  UPDATE shareholder_drawings SET journal_entry_id = v_journal_entry_id WHERE id = v_drawing_id;

  RETURN jsonb_build_object(
    'success', true,
    'drawing_id', v_drawing_id,
    'journal_entry_id', v_journal_entry_id
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Shareholder drawing failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- FUNCTION 5: Get Pending Dividends for Shareholder
-- =============================================
CREATE OR REPLACE FUNCTION get_pending_dividends(p_company_id UUID, p_shareholder_id UUID DEFAULT NULL)
RETURNS TABLE (
  distribution_id UUID,
  distribution_date DATE,
  line_id UUID,
  shareholder_id UUID,
  shareholder_name TEXT,
  total_amount DECIMAL,
  paid_amount DECIMAL,
  remaining_amount DECIMAL,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pd.id as distribution_id,
    pd.distribution_date,
    pdl.id as line_id,
    pdl.shareholder_id,
    s.name as shareholder_name,
    pdl.amount as total_amount,
    COALESCE(pdl.paid_amount, 0) as paid_amount,
    (pdl.amount - COALESCE(pdl.paid_amount, 0)) as remaining_amount,
    pdl.status
  FROM profit_distributions pd
  JOIN profit_distribution_lines pdl ON pdl.distribution_id = pd.id
  JOIN shareholders s ON s.id = pdl.shareholder_id
  WHERE pd.company_id = p_company_id
    AND pd.status IN ('approved', 'partially_paid')
    AND pdl.status IN ('pending', 'partially_paid')
    AND (p_shareholder_id IS NULL OR pdl.shareholder_id = p_shareholder_id)
  ORDER BY pd.distribution_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

