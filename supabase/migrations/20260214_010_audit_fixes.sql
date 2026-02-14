-- =============================================
-- FIX: AUDIT REMEDIATION FOR FIXED ASSETS
-- Date: 2026-02-14
-- Description: 
-- 1. Helper function to check Period Locking.
-- 2. Update register_asset_addition (remove hardcoded '1110').
-- 3. Update dispose_asset (better validation).
-- =============================================

-- 1. Helper: Validate Period Open
CREATE OR REPLACE FUNCTION validate_transaction_period(p_company_id UUID, p_date DATE)
RETURNS BOOLEAN AS $$
DECLARE
  v_period RECORD;
BEGIN
  -- Check if period exists and is locked/closed
  SELECT * INTO v_period 
  FROM accounting_periods 
  WHERE company_id = p_company_id 
    AND p_date BETWEEN period_start AND period_end;
    
  IF v_period IS NOT NULL THEN
    IF v_period.is_locked = TRUE OR v_period.status = 'closed' THEN
      RAISE EXCEPTION 'Transaction blocked: Accounting period for % is CLOSED or LOCKED.', p_date;
    END IF;
  END IF;
  
  -- If no period exists, we generally allow it (or block based on strict rules? Default allow for now).
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 2. Update register_asset_addition
-- CHANGES: Added p_payment_account_id, Added Date Validation, Added Period Check
CREATE OR REPLACE FUNCTION register_asset_addition(
  p_asset_id UUID,
  p_amount DECIMAL,
  p_date DATE,
  p_description TEXT,
  p_user_id UUID,
  p_payment_account_id UUID -- NEW: Explicit Payment Account
) RETURNS UUID AS $$
DECLARE
  v_asset RECORD;
  v_journal_id UUID;
  v_transaction_id UUID;
BEGIN
  SELECT * INTO v_asset FROM fixed_assets WHERE id = p_asset_id;
  
  IF v_asset IS NULL THEN RAISE EXCEPTION 'Asset not found'; END IF;
  
  -- Validation: Date must be after purchase
  IF p_date < v_asset.purchase_date THEN
    RAISE EXCEPTION 'Addition date (%) cannot be before Asset Purchase Date (%)', p_date, v_asset.purchase_date;
  END IF;
  
  -- Validation: Period Locking
  PERFORM validate_transaction_period(v_asset.company_id, p_date);
  
  -- 1. Create Journal Entry
  INSERT INTO journal_entries (
    company_id, entry_date, description, reference_type, reference_id, status, posted_by, posted_at
  ) VALUES (
    v_asset.company_id, p_date, 'Additions to Asset: ' || v_asset.name || ' - ' || p_description, 'asset_addition', p_asset_id, 'posted', p_user_id, NOW()
  ) RETURNING id INTO v_journal_id;
  
  -- DEBIT: Asset Account
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit_amount, credit_amount)
  VALUES (v_journal_id, v_asset.asset_account_id, 'Addition: ' || v_asset.name, p_amount, 0);
  
  -- CREDIT: Payment Account (Bank/Cash/Payable)
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit_amount, credit_amount)
  VALUES (v_journal_id, p_payment_account_id, 'Payment for Addition', 0, p_amount);
  
  -- 2. Create Asset Transaction
  INSERT INTO asset_transactions (
    company_id, asset_id, transaction_type, transaction_date, amount, reference_id, reference_type, details, created_by
  ) VALUES (
    v_asset.company_id, p_asset_id, 'addition', p_date, p_amount, v_journal_id, 'journal_entry', 
    jsonb_build_object('description', p_description), p_user_id
  ) RETURNING id INTO v_transaction_id;
  
  -- 3. Update Asset
  UPDATE fixed_assets 
  SET purchase_cost = purchase_cost + p_amount,
      book_value = book_value + p_amount,
      updated_at = NOW(),
      updated_by = p_user_id
  WHERE id = p_asset_id;
  
  -- 4. Regenerate Schedules
  PERFORM regenerate_asset_schedules(p_asset_id);
  
  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Update dispose_asset
-- CHANGES: Added explicit p_gain_loss_account_id (optional), strict date checks, period check
CREATE OR REPLACE FUNCTION dispose_asset(
  p_asset_id UUID,
  p_disposal_date DATE,
  p_disposal_amount DECIMAL,
  p_disposal_reason TEXT,
  p_deposit_account_id UUID,
  p_user_id UUID,
  p_gain_loss_account_id UUID DEFAULT NULL -- NEW: Optional explicit account
) RETURNS UUID AS $$
DECLARE
  v_asset RECORD;
  v_state JSONB;
  v_current_book_value DECIMAL;
  v_gain_loss DECIMAL;
  v_journal_id UUID;
  v_transaction_id UUID;
  v_gain_loss_acc UUID;
BEGIN
  -- 1. Get Asset & Validate
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  
  IF v_asset IS NULL THEN RAISE EXCEPTION 'Asset not found'; END IF;
  IF v_asset.status = 'disposed' THEN RAISE EXCEPTION 'Asset is already disposed'; END IF;
  
  -- Validation: Date
  IF p_disposal_date < v_asset.purchase_date THEN
    RAISE EXCEPTION 'Disposal date cannot be before Purchase Date';
  END IF;

  -- Validation: Period Locking
  PERFORM validate_transaction_period(v_asset.company_id, p_disposal_date);

  -- Get Check Current Book Value
  v_state := get_asset_current_state(p_asset_id);
  v_current_book_value := (v_state->>'book_value')::DECIMAL;
  
  -- Calc Gain/Loss
  v_gain_loss := p_disposal_amount - v_current_book_value;
  
  -- Determine Gain/Loss Account
  IF p_gain_loss_account_id IS NOT NULL THEN
    v_gain_loss_acc := p_gain_loss_account_id;
  ELSE
    -- Fallback: Look for "Gain/Loss on Disposal" account
    SELECT id INTO v_gain_loss_acc FROM public.chart_of_accounts 
    WHERE company_id = v_asset.company_id 
      AND (account_name ILIKE '%Gain%' OR account_name ILIKE '%Loss%' OR account_name ILIKE '%Disposal%')
      AND is_active = true
    LIMIT 1;
    
    IF v_gain_loss_acc IS NULL THEN
        -- Last Resort: Use "Other Expenses" or similar if typically defined, or fail.
        -- Failing is better than dirty data in production.
        RAISE EXCEPTION 'Gain/Loss Account not found. Please provide one explicitly or create an account named "Gain/Loss on Disposal"';
    END IF;
  END IF;

  -- 2. Create Journal Entry (Draft -> Insert Lines -> Posted)
  INSERT INTO public.journal_entries (
    company_id, entry_date, description, reference_type, reference_id, status, posted_by, posted_at
  ) VALUES (
    v_asset.company_id, p_disposal_date, 'Disposal of Asset: ' || v_asset.name, 'asset_disposal', p_asset_id, 'draft', NULL, NULL
  ) RETURNING id INTO v_journal_id;

  -- Insert Lines (Net Method)
  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, description, debit_amount, credit_amount
  )
  SELECT 
    v_journal_id, p_deposit_account_id, 'Proceeds from disposal', p_disposal_amount, 0
  WHERE p_disposal_amount > 0
  UNION ALL
  SELECT 
    v_journal_id, v_asset.asset_account_id, 'Write-off Book Value', 0, v_current_book_value
  UNION ALL
  SELECT 
    v_journal_id, v_gain_loss_acc, 'Gain on Disposal', 0, v_gain_loss
  WHERE v_gain_loss > 0
  UNION ALL
  SELECT 
    v_journal_id, v_gain_loss_acc, 'Loss on Disposal', ABS(v_gain_loss), 0
  WHERE v_gain_loss < 0;

  -- Post Entry
  UPDATE public.journal_entries 
  SET status = 'posted', posted_by = p_user_id, posted_at = NOW()
  WHERE id = v_journal_id;

  -- 3. Asset Transaction
  INSERT INTO public.asset_transactions (
    company_id, asset_id, transaction_type, transaction_date, amount, reference_id, details, created_by
  ) VALUES (
    v_asset.company_id, p_asset_id, 'disposal', p_disposal_date, -v_current_book_value, v_journal_id, 
    jsonb_build_object(
      'disposal_amount', p_disposal_amount,
      'gain_loss', v_gain_loss,
      'book_value_at_disposal', v_current_book_value
    ),
    p_user_id
  ) RETURNING id INTO v_transaction_id;

  -- 4. Update Asset
  UPDATE public.fixed_assets
  SET 
    status = 'disposed',
    book_value = 0,
    updated_at = NOW(),
    updated_by = p_user_id
  WHERE id = p_asset_id;

  -- 5. Clear Pending Schedules
  DELETE FROM public.depreciation_schedules WHERE asset_id = p_asset_id AND status = 'pending';

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
