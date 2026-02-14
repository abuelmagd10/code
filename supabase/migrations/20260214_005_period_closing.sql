-- Migration: Period Closing System
-- Description: Adds locking mechanisms, is_closing_entry flag, and auto-closing logic.

-- 1. Add is_closing_entry to journal_entries
ALTER TABLE journal_entries 
ADD COLUMN IF NOT EXISTS is_closing_entry BOOLEAN DEFAULT FALSE;

-- 2. Trigger function to prevent modification in closed periods (Header)
CREATE OR REPLACE FUNCTION enforce_period_lock_header()
RETURNS TRIGGER AS $$
DECLARE
  v_entry_date DATE;
  v_is_closing BOOLEAN;
  v_company_id UUID;
BEGIN
  -- Determine operation values
  IF TG_OP = 'DELETE' THEN
    v_entry_date := OLD.entry_date;
    v_is_closing := OLD.is_closing_entry;
    v_company_id := OLD.company_id;
  ELSE
    v_entry_date := NEW.entry_date;
    v_is_closing := NEW.is_closing_entry;
    v_company_id := NEW.company_id;
  END IF;

  -- Bypass for Closing Entries
  IF v_is_closing THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Check for closed/locked period overlap
  IF EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE company_id = v_company_id
      AND v_entry_date BETWEEN period_start AND period_end
      AND (is_locked = TRUE OR status = 'closed')
  ) THEN
    RAISE EXCEPTION 'Action blocked: This accounting period is CLOSED or LOCKED. Date: %', v_entry_date;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 3. Apply Trigger to Header
DROP TRIGGER IF EXISTS trg_period_lock_header ON journal_entries;
CREATE TRIGGER trg_period_lock_header
  BEFORE INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock_header();

-- 4. Trigger for Lines (prevent back-door editing via lines)
CREATE OR REPLACE FUNCTION enforce_period_lock_lines()
RETURNS TRIGGER AS $$
DECLARE
  v_je_id UUID;
  v_period_locked BOOLEAN;
BEGIN
  v_je_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_entry_id ELSE NEW.journal_entry_id END;

  -- Check if parent JE belongs to a locked period
  IF EXISTS (
    SELECT 1 
    FROM journal_entries je
    JOIN accounting_periods ap ON je.company_id = ap.company_id 
      AND je.entry_date BETWEEN ap.period_start AND ap.period_end
    WHERE je.id = v_je_id
      AND (ap.is_locked = TRUE OR ap.status = 'closed')
      AND je.is_closing_entry = FALSE
  ) THEN
      RAISE EXCEPTION 'Action blocked: Cannot modify lines of a Journal Entry in a CLOSED period.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_period_lock_lines ON journal_entry_lines;
CREATE TRIGGER trg_period_lock_lines
  BEFORE INSERT OR UPDATE OR DELETE ON journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock_lines();


-- =====================================================
-- RPC Function: close_accounting_period
-- =====================================================
-- Automates the period closing process:
-- 1. Calculates Net Income (Revenue - Expense)
-- 2. Generates closing entries (zeros P&L accounts)
-- 3. Allocates Net Income/Loss to Retained Earnings
-- 4. Locks the period

CREATE OR REPLACE FUNCTION close_accounting_period(
  p_period_id UUID,
  p_closed_by UUID,
  p_retained_earnings_account_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_period RECORD;
  v_company_id UUID;
  v_je_id UUID;
  v_total_revenue NUMERIC := 0;
  v_total_expense NUMERIC := 0;
  v_net_income NUMERIC := 0;
  v_account_balance RECORD;
  v_lines_to_insert JSONB[] := ARRAY[]::JSONB[];
BEGIN
  -- Fetch period details
  SELECT * INTO v_period FROM accounting_periods WHERE id = p_period_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounting period not found.'; END IF;
  
  v_company_id := v_period.company_id;

  IF v_period.status = 'closed' THEN RAISE EXCEPTION 'Period is already closed.'; END IF;

  -- IF Retained Earnings Account is provided, perform "Zeroing Out" (Year-End Close logic)
  IF p_retained_earnings_account_id IS NOT NULL THEN
    
    -- Create Header for Closing Entry
    INSERT INTO journal_entries (
      company_id,
      entry_date, 
      description,
      reference_type,
      status,
      is_closing_entry
    ) VALUES (
      v_company_id,
      v_period.period_end, -- Closing entry is dated at end of period
      'Closing Entry - ' || v_period.period_name,
      'closing_entry',
      'posted',
      TRUE
    ) RETURNING id INTO v_je_id;

    -- A. Collect REVENUE (Income) Closing Lines
    -- Normal Balance: Credit. To close: Debit the balance.
    FOR v_account_balance IN 
      SELECT 
        jel.account_id, 
        SUM(COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0)) as balance
      FROM journal_entry_lines jel
      JOIN journal_entries je ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts coa ON jel.account_id = coa.id
      WHERE je.company_id = v_company_id
        AND je.status = 'posted'
        AND je.is_closing_entry = FALSE -- Don't sum previous closing entries if any
        AND je.entry_date BETWEEN v_period.period_start AND v_period.period_end
        AND coa.account_type = 'income'
      GROUP BY jel.account_id
      HAVING SUM(COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0)) <> 0
    LOOP
      -- Collect line to debit the revenue account to zero it
      v_lines_to_insert := array_append(v_lines_to_insert, jsonb_build_object(
        'account_id', v_account_balance.account_id,
        'debit_amount', COALESCE(v_account_balance.balance, 0),
        'credit_amount', 0,
        'description', 'Closing Revenue: ' || v_period.period_name
      ));
      
      -- Accumulate Total Revenue (Credit impact on RE)
      v_total_revenue := v_total_revenue + COALESCE(v_account_balance.balance, 0);
    END LOOP;

    -- B. Collect EXPENSE Closing Lines
    -- Normal Balance: Debit. To close: Credit the balance.
    FOR v_account_balance IN 
      SELECT 
        jel.account_id, 
        SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) as balance
      FROM journal_entry_lines jel
      JOIN journal_entries je ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts coa ON jel.account_id = coa.id
      WHERE je.company_id = v_company_id
        AND je.status = 'posted'
        AND je.is_closing_entry = FALSE
        AND je.entry_date BETWEEN v_period.period_start AND v_period.period_end
        AND coa.account_type = 'expense'
      GROUP BY jel.account_id
      HAVING SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) <> 0
    LOOP
      -- Collect line to credit the expense account to zero it
      v_lines_to_insert := array_append(v_lines_to_insert, jsonb_build_object(
        'account_id', v_account_balance.account_id,
        'debit_amount', 0,
        'credit_amount', COALESCE(v_account_balance.balance, 0),
        'description', 'Closing Expense: ' || v_period.period_name
      ));
      
      -- Accumulate Total Expense (Debit impact on RE)
      v_total_expense := v_total_expense + COALESCE(v_account_balance.balance, 0);
    END LOOP;

    -- C. Calculate Net Income and Add Retained Earnings Line
    -- Net Income = Revenue - Expense
    v_net_income := v_total_revenue - v_total_expense;

    IF v_net_income > 0 THEN
      -- Profit -> Credit Retained Earnings
      v_lines_to_insert := array_append(v_lines_to_insert, jsonb_build_object(
        'account_id', p_retained_earnings_account_id,
        'debit_amount', 0,
        'credit_amount', v_net_income,
        'description', 'Net Income Allocation'
      ));
    ELSIF v_net_income < 0 THEN
      -- Loss -> Debit Retained Earnings
      v_lines_to_insert := array_append(v_lines_to_insert, jsonb_build_object(
        'account_id', p_retained_earnings_account_id,
        'debit_amount', ABS(v_net_income),
        'credit_amount', 0,
        'description', 'Net Loss Allocation'
      ));
    END IF;

    -- D. Insert All Lines at Once (to satisfy balance trigger)
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    SELECT 
      v_je_id,
      (line->>'account_id')::uuid,
      (line->>'debit_amount')::numeric,
      (line->>'credit_amount')::numeric,
      line->>'description'
    FROM unnest(v_lines_to_insert) AS line;

  END IF;

  -- Implement Locking
  UPDATE accounting_periods 
  SET 
    status = 'closed', 
    is_locked = TRUE, 
    closed_by = p_closed_by, 
    closed_at = NOW(),
    journal_entry_id = v_je_id
  WHERE id = p_period_id;

  RETURN jsonb_build_object(
    'success', true, 
    'journal_entry_id', v_je_id,
    'net_income', v_net_income
  );
END;
$$ LANGUAGE plpgsql;
