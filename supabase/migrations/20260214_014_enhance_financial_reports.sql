-- =============================================
-- ENHANCED FINANCIAL REPORTS WITH FILTERING
-- Date: 2026-02-14
-- Description:
-- Adds branch_id and cost_center_id filtering to financial reports
-- =============================================

-- 1. ENHANCED TRIAL BALANCE
-- =============================================
CREATE OR REPLACE FUNCTION get_trial_balance(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_branch_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL
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
      AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
      AND (p_cost_center_id IS NULL OR jel.cost_center_id = p_cost_center_id)
    ))
  GROUP BY coa.id, coa.code, coa.name, coa.account_type
  HAVING SUM(jel.debit_amount - jel.credit_amount) != 0 OR COUNT(jel.id) > 0
  ORDER BY coa.code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. ENHANCED INCOME STATEMENT
-- =============================================
CREATE OR REPLACE FUNCTION get_income_statement(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_branch_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL
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
      AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
      AND (p_cost_center_id IS NULL OR jel.cost_center_id = p_cost_center_id)
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


-- 3. ENHANCED BALANCE SHEET
-- =============================================
CREATE OR REPLACE FUNCTION get_balance_sheet(
  p_company_id UUID,
  p_as_of_date DATE,
  p_branch_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL
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
      AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
      AND (p_cost_center_id IS NULL OR jel.cost_center_id = p_cost_center_id)
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


-- 4. ENHANCED FINANCIAL SUMMARY
-- =============================================
CREATE OR REPLACE FUNCTION get_financial_summary(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_branch_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL
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
    AND je.status = 'posted'
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
    AND (p_cost_center_id IS NULL OR jel.cost_center_id = p_cost_center_id);

  -- COGS
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_cogs
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = p_company_id
    AND coa.account_type = 'COGS'
    AND je.entry_date BETWEEN p_start_date AND p_end_date
    AND je.status = 'posted'
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
    AND (p_cost_center_id IS NULL OR jel.cost_center_id = p_cost_center_id);

  -- Expenses
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_expenses
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = p_company_id
    AND coa.account_type = 'Expense'
    AND je.entry_date BETWEEN p_start_date AND p_end_date
    AND je.status = 'posted'
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
    AND (p_cost_center_id IS NULL OR jel.cost_center_id = p_cost_center_id);

  -- Assets (as of end date)
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_assets
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = p_company_id
    AND coa.account_type = 'Asset'
    AND je.entry_date <= p_end_date
    AND je.status = 'posted'
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
    AND (p_cost_center_id IS NULL OR jel.cost_center_id = p_cost_center_id);

  -- Liabilities
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) INTO v_liabilities
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = p_company_id
    AND coa.account_type = 'Liability'
    AND je.entry_date <= p_end_date
    AND je.status = 'posted'
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
    AND (p_cost_center_id IS NULL OR jel.cost_center_id = p_cost_center_id);

  -- Equity
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) INTO v_equity
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = p_company_id
    AND coa.account_type = 'Equity'
    AND je.entry_date <= p_end_date
    AND je.status = 'posted'
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
    AND (p_cost_center_id IS NULL OR jel.cost_center_id = p_cost_center_id);

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
