-- Fix 1: Multi-Currency FX Gain/Loss
-- Add exchange_rate_at_return to purchase_returns (snapshot of rate at return time)
ALTER TABLE public.purchase_returns
ADD COLUMN IF NOT EXISTS exchange_rate_at_return numeric(18, 8) DEFAULT 1.0;

COMMENT ON COLUMN public.purchase_returns.exchange_rate_at_return IS
  'Exchange rate snapshot at the time the return was created.
   Used for FX Gain/Loss calculation at warehouse confirmation.
   Compared against bills.exchange_rate (rate at invoice time).';

-- Ensure bills has exchange_rate column for comparison
ALTER TABLE public.bills
ADD COLUMN IF NOT EXISTS exchange_rate numeric(18, 8) DEFAULT 1.0;

-- Helper: get or auto-create an FX Gain/Loss account for the company
CREATE OR REPLACE FUNCTION public.get_or_create_fx_account(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fx$
DECLARE
  v_id uuid;
  v_expense_parent_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id AND sub_type = 'fx_gain_loss' AND COALESCE(is_active, true)
  LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT id INTO v_expense_parent_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id AND (account_type = 'expense' OR account_type = 'other') AND COALESCE(is_active, true)
  ORDER BY CASE WHEN account_type = 'expense' THEN 0 ELSE 1 END LIMIT 1;

  INSERT INTO chart_of_accounts (
    company_id, parent_id, account_type, sub_type, account_code,
    account_name, account_name_en, is_active, allow_journal_entries
  ) VALUES (
    p_company_id, v_expense_parent_id, 'expense', 'fx_gain_loss', 'FX-001',
    'فروق أسعار العملات الأجنبية', 'FX Gain/Loss', true, true
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$fx$;
