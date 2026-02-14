-- =============================================
-- FINANCIAL STATEMENTS & REPORTS
-- Date: 2026-02-14
-- Description:
-- SQL functions for generating Trial Balance, Income Statement,
-- Balance Sheet, and Statement of Changes in Equity.
-- =============================================

-- 1. TRIAL BALANCE
-- =============================================
-- Returns all accounts with their debit/credit totals for a period.
CREATE OR REPLACE FUNCTION get_trial_balance(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  account_id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  total_debit DECIMAL(15,2),
  total_credit DECIMAL(15,2),
  balance DECIMAL(15,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    coa.id as account_id,
    coa.code as account_code,
    coa.name as account_name,
    coa.account_type,
    COALESCE(SUM(jel.debit_amount), 0) as total_debit,
    COALESCE(SUM(jel.credit_amount), 0) as total_credit,
    COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) as balance
  FROM public.chart_of_accounts coa
  LEFT JOIN public.journal_entry_lines jel ON jel.account_id = coa.id
  LEFT JOIN public.journal_entries je ON jel.journal_entry_id = je.id
  WHERE coa.company_id = p_company_id
    AND coa.is_active = TRUE
    AND (je.id IS NULL OR (
      je.entry_date BETWEEN p_start_date AND p_end_date
      AND je.status = 'posted'
    ))
  GROUP BY coa.id, coa.code, coa.name, coa.account_type
  HAVING SUM(jel.debit_amount - jel.credit_amount) != 0 OR COUNT(jel.id) > 0
  ORDER BY coa.code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. INCOME STATEMENT (P&L)
-- =============================================
-- Returns Revenue, COGS, Expenses breakdown for a period.
CREATE OR REPLACE FUNCTION get_income_statement(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  section TEXT,
  account_id UUID,
  account_code TEXT,
  account_name TEXT,
  amount DECIMAL(15,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    coa.account_type as section,
    coa.id as account_id,
    coa.code as account_code,
    coa.name as account_name,
    CASE 
      WHEN coa.account_type = 'Revenue' THEN 
        COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0)
      WHEN coa.account_type IN ('Expense', 'COGS') THEN 
        COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
      ELSE 0
    END as amount
  FROM public.chart_of_accounts coa
  LEFT JOIN public.journal_entry_lines jel ON jel.account_id = coa.id
  LEFT JOIN public.journal_entries je ON jel.journal_entry_id = je.id
  WHERE coa.company_id = p_company_id
    AND coa.account_type IN ('Revenue', 'Expense', 'COGS')
    AND coa.is_active = TRUE
    AND (je.id IS NULL OR (
      je.entry_date BETWEEN p_start_date AND p_end_date
      AND je.status = 'posted'
    ))
  GROUP BY coa.id, coa.code, coa.name, coa.account_type
  HAVING SUM(jel.debit_amount) != 0 OR SUM(jel.credit_amount) != 0
  ORDER BY 
    CASE coa.account_type
      WHEN 'Revenue' THEN 1
      WHEN 'COGS' THEN 2
      WHEN 'Expense' THEN 3
    END,
    coa.code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. BALANCE SHEET
-- =============================================
-- Returns Assets, Liabilities, Equity as of a specific date.
CREATE OR REPLACE FUNCTION get_balance_sheet(
  p_company_id UUID,
  p_as_of_date DATE
) RETURNS TABLE (
  section TEXT,
  account_id UUID,
  account_code TEXT,
  account_name TEXT,
  balance DECIMAL(15,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    coa.account_type as section,
    coa.id as account_id,
    coa.code as account_code,
    coa.name as account_name,
    CASE 
      WHEN coa.account_type = 'Asset' THEN 
        COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
      WHEN coa.account_type IN ('Liability', 'Equity') THEN 
        COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0)
      ELSE 0
    END as balance
  FROM public.chart_of_accounts coa
  LEFT JOIN public.journal_entry_lines jel ON jel.account_id = coa.id
  LEFT JOIN public.journal_entries je ON jel.journal_entry_id = je.id
  WHERE coa.company_id = p_company_id
    AND coa.account_type IN ('Asset', 'Liability', 'Equity')
    AND coa.is_active = TRUE
    AND (je.id IS NULL OR (
      je.entry_date <= p_as_of_date
      AND je.status = 'posted'
    ))
  GROUP BY coa.id, coa.code, coa.name, coa.account_type
  HAVING SUM(jel.debit_amount - jel.credit_amount) != 0
  ORDER BY 
    CASE coa.account_type
      WHEN 'Asset' THEN 1
      WHEN 'Liability' THEN 2
      WHEN 'Equity' THEN 3
    END,
    coa.code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. STATEMENT OF CHANGES IN EQUITY
-- =============================================
-- Tracks equity movements (contributions, distributions, drawings, net income).
CREATE OR REPLACE FUNCTION get_equity_statement(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  transaction_type TEXT,
  transaction_date DATE,
  reference_type TEXT,
  reference_id UUID,
  description TEXT,
  amount DECIMAL(15,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN je.reference_type = 'profit_distribution' THEN 'Distribution'
      WHEN je.reference_type = 'shareholder_drawing' THEN 'Drawing'
      WHEN je.reference_type = 'capital_contribution' THEN 'Contribution'
      ELSE 'Other'
    END as transaction_type,
    je.entry_date as transaction_date,
    je.reference_type,
    je.reference_id,
    je.description,
    SUM(jel.credit_amount - jel.debit_amount) as amount
  FROM public.journal_entries je
  JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN public.chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = p_company_id
    AND coa.account_type = 'Equity'
    AND je.entry_date BETWEEN p_start_date AND p_end_date
    AND je.status = 'posted'
  GROUP BY je.id, je.entry_date, je.reference_type, je.reference_id, je.description
  ORDER BY je.entry_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. ACCOUNT LEDGER (General Ledger Detail)
-- =============================================
-- Returns all transactions for a specific account.
CREATE OR REPLACE FUNCTION get_account_ledger(
  p_account_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  entry_date DATE,
  journal_entry_id UUID,
  description TEXT,
  reference_type TEXT,
  debit_amount DECIMAL(15,2),
  credit_amount DECIMAL(15,2),
  running_balance DECIMAL(15,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    je.entry_date,
    je.id as journal_entry_id,
    je.description,
    je.reference_type,
    jel.debit_amount,
    jel.credit_amount,
    SUM(jel.debit_amount - jel.credit_amount) OVER (ORDER BY je.entry_date, je.id) as running_balance
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON jel.journal_entry_id = je.id
  WHERE jel.account_id = p_account_id
    AND je.entry_date BETWEEN p_start_date AND p_end_date
    AND je.status = 'posted'
  ORDER BY je.entry_date, je.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. FINANCIAL SUMMARY (Dashboard KPIs)
-- =============================================
-- Returns key financial metrics for a period.
CREATE OR REPLACE FUNCTION get_financial_summary(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  total_revenue DECIMAL(15,2),
  total_cogs DECIMAL(15,2),
  gross_profit DECIMAL(15,2),
  total_expenses DECIMAL(15,2),
  net_income DECIMAL(15,2),
  total_assets DECIMAL(15,2),
  total_liabilities DECIMAL(15,2),
  total_equity DECIMAL(15,2)
) AS $$
DECLARE
  v_revenue DECIMAL(15,2);
  v_cogs DECIMAL(15,2);
  v_expenses DECIMAL(15,2);
  v_assets DECIMAL(15,2);
  v_liabilities DECIMAL(15,2);
  v_equity DECIMAL(15,2);
BEGIN
  -- Revenue
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) INTO v_revenue
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = p_company_id
    AND coa.account_type = 'Revenue'
    AND je.entry_date BETWEEN p_start_date AND p_end_date
    AND je.status = 'posted';

  -- COGS
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_cogs
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = p_company_id
    AND coa.account_type = 'COGS'
    AND je.entry_date BETWEEN p_start_date AND p_end_date
    AND je.status = 'posted';

  -- Expenses
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_expenses
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = p_company_id
    AND coa.account_type = 'Expense'
    AND je.entry_date BETWEEN p_start_date AND p_end_date
    AND je.status = 'posted';

  -- Assets (as of end date)
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_assets
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = p_company_id
    AND coa.account_type = 'Asset'
    AND je.entry_date <= p_end_date
    AND je.status = 'posted';

  -- Liabilities
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) INTO v_liabilities
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = p_company_id
    AND coa.account_type = 'Liability'
    AND je.entry_date <= p_end_date
    AND je.status = 'posted';

  -- Equity
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) INTO v_equity
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = p_company_id
    AND coa.account_type = 'Equity'
    AND je.entry_date <= p_end_date
    AND je.status = 'posted';

  RETURN QUERY SELECT 
    v_revenue,
    v_cogs,
    v_revenue - v_cogs as gross_profit,
    v_expenses,
    v_revenue - v_cogs - v_expenses as net_income,
    v_assets,
    v_liabilities,
    v_equity;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
